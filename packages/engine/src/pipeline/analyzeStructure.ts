/**
 * Per-file structure metrics for a path list.
 *
 * Does not run analyzeRepo: no git-history metrics, no jscpd, and no
 * Django/web2py early return. Callers that want the student dashboard
 * report must keep using analyzeRepo, which still skips those frameworks.
 */

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { simpleGit } from "simple-git";
import { discoverSourceFiles } from "../collect/fileDiscovery.js";
import { extractFunctionMetrics } from "../extract/functionMetrics.js";
import { computeModuleScope } from "../extract/python/moduleScope.js";
import { pythonImportFanOut } from "../extract/python/importFanOut.js";
import { extractNotebookSource, isNotebookPath } from "../parsing/notebook.js";
import { parseSource } from "../parsing/tsParser.js";
import { isAnalyzableSourcePath } from "../utils/constants.js";
import {
  isPythonSourcePath,
  languageProfileForPath,
} from "../utils/languageProfile.js";
import { countLines } from "../utils/text.js";

/** Dependency and cache trees are not project modules, so they are not import targets. */
const PY_INDEX_IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/__pycache__/**",
  "**/site-packages/**",
];

export class StructurePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructurePathError";
  }
}

export interface StructureFileMetrics {
  file: string;
  cyclomaticMean: number;
  cyclomaticMax: number;
  maxNestingDepth: number;
  fanOut: number;
  functions: number;
  loc: number;
}

export interface StructureReport {
  /** `git rev-parse HEAD` when this directory is its own git work tree, else "". */
  commit: string;
  files: StructureFileMetrics[];
  missing: string[];
}

export interface AnalyzeStructureOptions {
  /** Repo-relative files or directories. Directories expand to analyzable source files. */
  paths: string[];
}

/**
 * Reject absolute paths and `..` segments. Returns a normalized repo-relative path.
 */
export function assertRepoRelativePath(input: string): string {
  if (typeof input !== "string" || /[\0\r\n]/.test(input)) {
    throw new StructurePathError("path must be a repo-relative string");
  }
  const slashed = input.replace(/\\/g, "/").trim();
  if (!slashed || slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    throw new StructurePathError(`path must be repo-relative: ${input}`);
  }
  if (slashed.split("/").includes("..")) {
    throw new StructurePathError(`path traversal rejected: ${input}`);
  }
  const parts = slashed.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new StructurePathError(`path must be repo-relative: ${input}`);
  }
  return parts.join("/");
}

/**
 * Every `.py` path in the repo, excluding dependency and cache directories.
 * Used to resolve imports. Files are not parsed.
 */
async function listPythonFiles(repoPath: string): Promise<Set<string>> {
  const found = await fg("**/*.py", {
    cwd: repoPath,
    onlyFiles: true,
    ignore: PY_INDEX_IGNORE,
  });
  const out = new Set<string>();
  for (const rel of found) out.add(rel.replace(/\\/g, "/"));
  return out;
}

/**
 * HEAD of this directory when it is the git work tree root.
 * A fixture nested inside another repo must not report that parent commit.
 */
async function headCommit(repoPath: string): Promise<string> {
  const root = path.resolve(repoPath);
  try {
    const git = simpleGit(root);
    const toplevel = path.resolve((await git.revparse(["--show-toplevel"])).trim());
    // git reports the physical work tree. Compare real paths so a symlinked
    // cache directory still shows the commit that was checked out.
    const rootReal = await realpath(root);
    const topReal = await realpath(toplevel);
    if (topReal !== rootReal) return "";
    const head = (await git.revparse(["HEAD"])).trim();
    return /^[0-9a-f]{40}$/i.test(head) ? head.toLowerCase() : head;
  } catch {
    return "";
  }
}

function grammarForFile(filePath: string): "ts" | "tsx" | "py" {
  if (isPythonSourcePath(filePath)) return "py";
  return filePath.endsWith(".ts") ? "ts" : "tsx";
}

async function scoreFile(
  repoPath: string,
  rel: string,
  pyFiles: ReadonlySet<string>,
): Promise<StructureFileMetrics> {
  const root = path.resolve(repoPath);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(rootPrefix)) {
    throw new StructurePathError(`path escapes repository: ${rel}`);
  }
  const raw = await readFile(abs, "utf8");
  const loc = countLines(raw);
  const empty: StructureFileMetrics = {
    file: rel,
    cyclomaticMean: 0,
    cyclomaticMax: 0,
    maxNestingDepth: 0,
    fanOut: 0,
    functions: 0,
    loc,
  };
  let code = raw;
  try {
    if (isNotebookPath(abs)) code = extractNotebookSource(raw).code;
    const tree = parseSource(code, grammarForFile(abs));
    const profile = languageProfileForPath(abs);
    const fnMetrics = extractFunctionMetrics(tree.rootNode, {
      relativeFilePath: rel,
      languageProfile: profile,
    });
    const units: { cc: number; nest: number }[] = fnMetrics.functions.map((fn) => ({
      cc: fn.cyclomaticComplexity,
      nest: fn.maxNestingDepth,
    }));
    if (isPythonSourcePath(abs)) {
      const moduleScope = computeModuleScope(tree.rootNode);
      if (moduleScope) {
        units.push({
          cc: moduleScope.cyclomaticComplexity,
          nest: moduleScope.maxNestingDepth,
        });
      }
    }
    const cyclomaticMean =
      units.length === 0
        ? 0
        : units.reduce((sum, unit) => sum + unit.cc, 0) / units.length;
    const cyclomaticMax =
      units.length === 0 ? 0 : Math.max(...units.map((unit) => unit.cc));
    const maxNestingDepth =
      units.length === 0 ? 0 : Math.max(...units.map((unit) => unit.nest));
    const fanOut = isPythonSourcePath(abs)
      ? pythonImportFanOut(rel, tree.rootNode, pyFiles)
      : 0;
    return {
      file: rel,
      cyclomaticMean,
      cyclomaticMax,
      maxNestingDepth,
      fanOut,
      functions: fnMetrics.functions.length,
      loc,
    };
  } catch {
    return empty;
  }
}

/**
 * Score structure metrics for repo-relative files and directories.
 *
 * Directories expand to analyzable source files from engine discovery
 * (`.py` and notebooks included). Paths that do not exist, and paths that
 * exist but are not analyzable source, are returned in `missing`.
 */
export async function analyzeStructure(
  repoPath: string,
  options: AnalyzeStructureOptions,
): Promise<StructureReport> {
  const root = path.resolve(repoPath);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  const requested = options.paths.map((p) => assertRepoRelativePath(p));
  const discoveredAbs = await discoverSourceFiles(root);
  const discovered = new Set(
    discoveredAbs.map((abs) => path.relative(root, abs).replace(/\\/g, "/")),
  );
  const pyFiles = await listPythonFiles(root);

  const missing: string[] = [];
  const selected = new Set<string>();

  for (const rel of requested) {
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(rootPrefix)) {
      throw new StructurePathError(`path escapes repository: ${rel}`);
    }
    let real = abs;
    try {
      real = await realpath(abs);
    } catch {
      missing.push(rel);
      continue;
    }
    const realRoot = await realpath(root);
    const realRootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
    if (real !== realRoot && !real.startsWith(realRootPrefix)) {
      throw new StructurePathError(`path escapes repository: ${rel}`);
    }
    let info;
    try {
      info = await stat(abs);
    } catch {
      missing.push(rel);
      continue;
    }
    if (info.isDirectory()) {
      const prefix = `${rel}/`;
      for (const file of discovered) {
        if (file.startsWith(prefix)) selected.add(file);
      }
      continue;
    }
    if (info.isFile() && (discovered.has(rel) || isAnalyzableSourcePath(rel))) {
      selected.add(rel);
      continue;
    }
    missing.push(rel);
  }

  const files: StructureFileMetrics[] = [];
  for (const rel of [...selected].sort((a, b) => a.localeCompare(b))) {
    try {
      files.push(await scoreFile(root, rel, pyFiles));
    } catch (err) {
      if (err instanceof StructurePathError) throw err;
      missing.push(rel);
    }
  }

  return {
    commit: await headCommit(root),
    files,
    missing,
  };
}
