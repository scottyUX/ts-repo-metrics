// Which code files a validated row's fix changes that none of its proving tests can reach. A file is
// reached when an import chain leads to it from a FAIL_TO_PASS / ABSENT_TO_PASS test file, through
// files in the repository; everything changed and not reached is untested. A static
// over-approximation of what the tests load, not coverage: see "Output" in
// docs/CSE115A_BENCHMARK_VALIDATION.md. Pure apart from `read`, so tests hand in file contents.

import { posix } from "node:path";

/** Extensions of files that count as code. Everything else in a patch (css, md, json, lockfiles…) is not listed. */
export const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".py"];

/** Reads a repo-relative path on the post-fix tree; null when there is no such file. */
export type ReadFile = (repoRelativePath: string) => Promise<string | null>;

/** Whether a path is a code file (declaration files are not). */
export function isCodeFile(path: string): boolean {
  if (/\.d\.[mc]?ts$/.test(path)) return false;
  return CODE_EXTENSIONS.includes(posix.extname(path));
}

/** A repo-relative path, normalized; null when it leaves the repository. */
function inRepo(path: string): string | null {
  const normalized = posix.normalize(path).replace(/^\.\//, "");
  if (normalized === "." || normalized.startsWith("../") || normalized === ".." || posix.isAbsolute(normalized)) return null;
  return normalized;
}

/** JS/TS source with `//` and `/* *\/` comments removed; string and template literals are kept. */
export function stripJsComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      // Keep line breaks so nothing on separate lines is joined.
      out += source.slice(i, end < 0 ? source.length : end + 2).replace(/[^\n]/g, "");
      i = end < 0 ? source.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && !(c !== "`" && source[j] === "\n")) j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const JS_IMPORTS = [
  // import x from "a"; import { a, b } from "a"; import * as a from "a"; import type { T } from "a"; import "a"
  /\bimport\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  // export * from "a"; export * as a from "a"; export { a } from "a"; export type { T } from "a"
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  // import("a"), with a plain string literal only
  /\bimport\s*\(\s*(?:["']([^"'\n]+)["']|`([^`$]+)`)\s*\)/g,
  // require("a")
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

/** The module specifiers a JS/TS (or .vue / .svelte) file imports, comments ignored. */
export function jsImportSpecifiers(source: string): string[] {
  const code = stripJsComments(source);
  const specs = new Set<string>();
  for (const pattern of JS_IMPORTS) {
    for (const match of code.matchAll(pattern)) {
      const spec = match[1] ?? match[2];
      if (spec) specs.add(spec);
    }
  }
  return [...specs];
}

/** A Python import: `level` dots (0 = absolute), the module, and the names `from … import` lists. */
export type PythonImport = { level: number; module: string; names: string[] };

/** The imports a Python file makes, `#` comments ignored. */
export function pythonImports(source: string): PythonImport[] {
  const code = source
    .split("\n").map((line) => line.replace(/#.*$/, "")).join("\n")
    // `from a import (x,\n y)` → one line; backslash continuations too.
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => `(${inner.replace(/\s*\n\s*/g, " ")})`)
    .replace(/\\\n/g, " ");
  const imports: PythonImport[] = [];
  for (const line of code.split("\n")) {
    const from = /^\s*from\s+(\.*)([\w.]*)\s+import\s+\(?([^)]*)\)?\s*$/.exec(line);
    if (from) {
      const names = from[3].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter((n) => /^\w+$/.test(n));
      imports.push({ level: from[1].length, module: from[2], names });
      continue;
    }
    const plain = /^\s*import\s+(.+)$/.exec(line);
    if (plain) {
      for (const part of plain[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[\w.]+$/.test(name)) imports.push({ level: 0, module: name, names: [] });
      }
    }
  }
  return imports;
}

type TsConfig = {
  dir: string;
  baseUrl: string | null;
  paths: Record<string, string[]>;
  /** `compilerOptions.outDir`, repo-relative; null when the config declares none. */
  outDir: string | null;
  /** Where outDir's files come from: `rootDir`, else the single top folder of `include`, else the config's folder. */
  rootDir: string;
};

/** `dir` with no "." for the repo root. */
function parentOf(path: string): string {
  const dir = posix.dirname(path);
  return dir === "." ? "" : dir;
}

/** The one top folder every `include` entry starts with (`["src"]`, `["src/**\/*"]` → `src`), or null. */
function includeTopFolder(include: unknown): string | null {
  if (!Array.isArray(include) || include.length === 0) return null;
  const tops = new Set(include.map((entry) => (typeof entry === "string" ? posix.normalize(entry).split("/")[0] : "")));
  const [top] = tops;
  return tops.size === 1 && top && top !== "." && top !== ".." && !/[*?{[]/.test(top) ? top : null;
}

/** JSON with comments and trailing commas, or null when it does not parse. */
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsComments(text).replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}

/** Resolves imports against the post-fix tree, caching every read. */
class Resolver {
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly configs = new Map<string, Promise<TsConfig | null>>();

  constructor(private readonly readFile: ReadFile, private readonly packageDir: string) {}

  read(path: string): Promise<string | null> {
    let hit = this.cache.get(path);
    if (!hit) {
      hit = this.readFile(path);
      this.cache.set(path, hit);
    }
    return hit;
  }

  private async exists(path: string): Promise<boolean> {
    return (await this.read(path)) != null;
  }

  /** The first of `candidates` that is a file, or null. */
  private async first(candidates: Array<string | null>): Promise<string | null> {
    for (const candidate of candidates) if (candidate && (await this.exists(candidate))) return candidate;
    return null;
  }

  /** The tsconfig.json (else jsconfig.json) in `dir` itself, or null. */
  private async configAt(dir: string): Promise<TsConfig | null> {
    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const text = await this.read(dir ? `${dir}/${name}` : name);
      if (text == null) continue;
      const json = parseJsonc(text) as { compilerOptions?: Record<string, unknown>; include?: unknown } | null;
      const options = json?.compilerOptions ?? {};
      const at = (value: unknown) => (typeof value === "string" ? inRepo(posix.join(dir || ".", value)) ?? "" : null);
      const paths: Record<string, string[]> = {};
      if (options.paths && typeof options.paths === "object") {
        for (const [key, targets] of Object.entries(options.paths as Record<string, unknown>)) {
          if (Array.isArray(targets)) paths[key] = targets.filter((t): t is string => typeof t === "string");
        }
      }
      const top = includeTopFolder(json?.include);
      return {
        dir, baseUrl: at(options.baseUrl), paths, outDir: at(options.outDir),
        rootDir: at(options.rootDir) ?? (top ? at(top)! : dir),
      };
    }
    return null;
  }

  /** The nearest tsconfig.json / jsconfig.json at or above `dir`. */
  private configFor(dir: string): Promise<TsConfig | null> {
    let found = this.configs.get(dir);
    if (!found) {
      found = (async () => (await this.configAt(dir)) ?? (dir ? this.configFor(parentOf(dir)) : null))();
      this.configs.set(dir, found);
    }
    return found;
  }

  /** The nearest folder at or above `dir` with a package.json; the repo root when there is none. */
  private async packageFolder(dir: string): Promise<string> {
    for (let d = dir; ; d = parentOf(d)) {
      if (await this.exists(d ? `${d}/package.json` : "package.json")) return d;
      if (!d) return "";
    }
  }

  /**
   * A relative import that names build output (`../dist/auth/a.controller.js`, absent from the
   * tree) mapped back to its source: under the outDir of the nearest config at or above the
   * importer's package folder, to the same path under that config's rootDir; with no outDir
   * declared, `dist/` or `build/` of the package folder to its `src/`. Null when nothing matches.
   */
  private async fromBuildOutput(importer: string, path: string): Promise<string | null> {
    const pkg = await this.packageFolder(parentOf(importer));
    const under = (dir: string) => (dir ? path.startsWith(`${dir}/`) : true) && path !== dir;
    const config = await this.configFor(pkg);
    if (config?.outDir != null) {
      if (config.outDir === config.dir || !under(config.outDir)) return null;
      const rest = config.outDir ? path.slice(config.outDir.length + 1) : path;
      return this.jsFile(inRepo(posix.join(config.rootDir || ".", rest)));
    }
    for (const out of ["dist", "build"]) {
      const outDir = pkg ? `${pkg}/${out}` : out;
      if (under(outDir)) return this.jsFile(inRepo(posix.join(pkg || ".", "src", path.slice(outDir.length + 1))));
    }
    return null;
  }

  /** `base` as a file: as is, with each code extension, `.js` → `.ts`/`.tsx`, then `base/index.<ext>`. */
  private async jsFile(base: string | null): Promise<string | null> {
    if (!base) return null;
    const compiled: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
    const ext = posix.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    return this.first([
      isCodeFile(base) ? base : null,
      ...CODE_EXTENSIONS.map((e) => base + e),
      ...(compiled[ext] ?? []).map((e) => stem + e),
      ...CODE_EXTENSIONS.map((e) => `${base}/index${e}`),
    ]);
  }

  /** The repo file a JS/TS import names, or null for a package or anything unresolved. */
  async resolveJs(importer: string, specifier: string): Promise<string | null> {
    const spec = specifier.split("?")[0];
    const dir = posix.dirname(importer) === "." ? "" : posix.dirname(importer);
    if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
      const path = inRepo(posix.join(dir || ".", spec));
      return (await this.jsFile(path)) ?? (path ? this.fromBuildOutput(importer, path) : null);
    }
    const config = await this.configFor(dir);
    if (!config) return null;
    const root = config.baseUrl ?? config.dir;
    for (const [key, targets] of Object.entries(config.paths)) {
      let wildcard: string | null = null;
      if (key === spec) wildcard = "";
      else if (key.endsWith("*") && key.indexOf("*") === key.length - 1 && spec.startsWith(key.slice(0, -1))) wildcard = spec.slice(key.length - 1);
      if (wildcard == null) continue;
      for (const target of targets) {
        const hit = await this.jsFile(inRepo(posix.join(root, target.replace("*", wildcard))));
        if (hit) return hit;
      }
    }
    if (config.baseUrl != null) return this.jsFile(inRepo(posix.join(config.baseUrl, spec)));
    return null;
  }

  /** `a/b` as a module under `root`: `a/b.py` or `a/b/__init__.py`. */
  private moduleFile(root: string, modulePath: string): Promise<string | null> {
    const base = inRepo(posix.join(root || ".", modulePath));
    return this.first(base ? [`${base}.py`, `${base}/__init__.py`] : []);
  }

  /** The roots an absolute module is looked up under: the importer's folder and each ancestor, packageDir, the repo root. */
  private pythonRoots(importer: string): string[] {
    const roots: string[] = [];
    let dir = posix.dirname(importer) === "." ? "" : posix.dirname(importer);
    for (;;) {
      roots.push(dir);
      if (!dir) break;
      dir = posix.dirname(dir) === "." ? "" : posix.dirname(dir);
    }
    roots.push(this.packageDir, "");
    return [...new Set(roots)];
  }

  /**
   * The repo files a Python import loads: the module (first root that has it), each listed name as
   * a submodule, and the `__init__.py` of every package on the way, since importing `a.b` runs `a`.
   */
  async resolvePython(importer: string, imp: PythonImport): Promise<string[]> {
    const modulePath = imp.module.split(".").filter(Boolean).join("/");
    let roots: string[];
    if (imp.level > 0) {
      let pkg = posix.dirname(importer) === "." ? "" : posix.dirname(importer);
      for (let up = 1; up < imp.level; up++) {
        if (!pkg) return [];
        pkg = posix.dirname(pkg) === "." ? "" : posix.dirname(pkg);
      }
      roots = [pkg];
    } else {
      roots = this.pythonRoots(importer);
    }
    for (const root of roots) {
      const found: string[] = [];
      const hit = modulePath ? await this.moduleFile(root, modulePath) : await this.first([inRepo(posix.join(root || ".", "__init__.py"))]);
      if (hit) found.push(hit);
      for (const name of imp.names) {
        const sub = await this.moduleFile(root, modulePath ? `${modulePath}/${name}` : name);
        if (sub) found.push(sub);
      }
      if (!found.length) continue;
      const parts = modulePath ? modulePath.split("/") : [];
      for (let n = 1; n < parts.length; n++) {
        const init = inRepo(posix.join(root || ".", ...parts.slice(0, n), "__init__.py"));
        if (init && (await this.exists(init))) found.push(init);
      }
      return found;
    }
    return [];
  }
}

export type UntestedFilesInput = {
  /** Code files the source patch adds or modifies (new path for renames; deletions excluded). */
  changedFiles: string[];
  /** Files of the FAIL_TO_PASS and ABSENT_TO_PASS ids. */
  provingTestFiles: string[];
  /** Reads the post-fix tree (base + test_patch + patch). */
  read: ReadFile;
  /** The result's package_dir ("" for the root). */
  packageDir: string;
};

/** Changed code files no proving test file reaches by imports; sorted, repo-relative. */
export async function untestedFiles(input: UntestedFilesInput): Promise<string[]> {
  const changed = [...new Set(input.changedFiles.filter(isCodeFile))];
  if (!changed.length) return [];
  const resolver = new Resolver(input.read, input.packageDir);
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const file of input.provingTestFiles) {
    const path = inRepo(file);
    if (path && !reached.has(path)) {
      reached.add(path);
      queue.push(path);
    }
  }
  while (queue.length) {
    const file = queue.shift()!;
    if (!isCodeFile(file)) continue;
    const source = await resolver.read(file);
    if (source == null) continue;
    const next: Array<string | null> = file.endsWith(".py")
      ? (await Promise.all(pythonImports(source).map((imp) => resolver.resolvePython(file, imp)))).flat()
      : await Promise.all(jsImportSpecifiers(source).map((spec) => resolver.resolveJs(file, spec)));
    for (const target of next) {
      if (target && !reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  return changed.filter((f) => !reached.has(f)).sort();
}
