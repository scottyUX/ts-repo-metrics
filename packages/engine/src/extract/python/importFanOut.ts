/**
 * Import fan-out for one Python file.
 *
 * This is import fan-out, not call fan-out: the count is distinct other files
 * in this repo that the file imports. `import pkg.mod`, `from pkg.mod import name`,
 * and relative imports all count. A name imported from a module counts as that
 * submodule file when it resolves (`pkg/mod.py` or `pkg/mod/__init__.py`).
 * Stdlib and third-party imports that do not resolve to a repo file do not count.
 * The file itself does not count.
 */

import type { SyntaxNode } from "tree-sitter";

interface ParsedImport {
  /** 0 for absolute imports. Relative imports use the number of leading dots. */
  level: number;
  /** Dotted module, or null for `from . import name`. */
  module: string | null;
  /** Empty for `import pkg.mod` and for wildcard imports. */
  names: string[];
  wildcard: boolean;
}

function fileForModule(dotted: string, pyFiles: ReadonlySet<string>): string | null {
  if (!dotted) return null;
  const asPath = dotted.replace(/\./g, "/");
  const moduleFile = `${asPath}.py`;
  if (pyFiles.has(moduleFile)) return moduleFile;
  const packageInit = `${asPath}/__init__.py`;
  if (pyFiles.has(packageInit)) return packageInit;
  return null;
}

/** Package directory of a repo-relative Python file, as path segments. */
function packageDirParts(relFile: string): string[] {
  const parts = relFile.split("/").filter(Boolean);
  parts.pop();
  return parts;
}

/**
 * Turn a relative import into a dotted absolute module name.
 * Level 1 is the current package; each extra dot walks up one package.
 */
function absoluteModule(
  relFile: string,
  level: number,
  module: string | null,
): string | null {
  if (level <= 0) return module;
  const parts = packageDirParts(relFile);
  const up = level - 1;
  if (up > parts.length) return null;
  const base = parts.slice(0, parts.length - up);
  const extra = module ? module.split(".").filter(Boolean) : [];
  const all = [...base, ...extra];
  if (all.length === 0) return null;
  return all.join(".");
}

function importedNameText(node: SyntaxNode): string | null {
  if (node.type === "aliased_import") {
    return node.childForFieldName("name")?.text ?? null;
  }
  if (node.type === "dotted_name") return node.text;
  return null;
}

function parseImport(node: SyntaxNode): ParsedImport[] {
  if (node.type === "import_statement") {
    const out: ParsedImport[] = [];
    for (const nameNode of node.childrenForFieldName("name")) {
      const module = importedNameText(nameNode);
      if (!module) continue;
      out.push({ level: 0, module, names: [], wildcard: false });
    }
    return out;
  }
  if (node.type !== "import_from_statement") return [];

  const moduleNode = node.childForFieldName("module_name");
  let level = 0;
  let module: string | null = null;
  if (moduleNode?.type === "relative_import") {
    for (let i = 0; i < moduleNode.childCount; i++) {
      const child = moduleNode.child(i);
      if (!child) continue;
      if (child.type === "import_prefix") level = child.text.length;
      else if (child.type === "dotted_name") module = child.text;
    }
    if (level === 0) {
      const dots = /^\.+/.exec(moduleNode.text)?.[0].length ?? 0;
      level = dots || 1;
    }
  } else if (moduleNode?.type === "dotted_name") {
    module = moduleNode.text;
  }

  let wildcard = false;
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i)?.type === "wildcard_import") wildcard = true;
  }
  const names: string[] = [];
  if (!wildcard) {
    for (const nameNode of node.childrenForFieldName("name")) {
      const text = importedNameText(nameNode);
      if (text) names.push(text);
    }
  }
  return [{ level, module, names, wildcard }];
}

function resolvedFiles(
  imp: ParsedImport,
  relFile: string,
  pyFiles: ReadonlySet<string>,
): string[] {
  const base =
    imp.level > 0 ? absoluteModule(relFile, imp.level, imp.module) : imp.module;
  if (!base) return [];
  if (imp.wildcard || imp.names.length === 0) {
    const hit = fileForModule(base, pyFiles);
    return hit ? [hit] : [];
  }
  const out: string[] = [];
  for (const name of imp.names) {
    const submodule = fileForModule(`${base}.${name}`, pyFiles);
    if (submodule) {
      out.push(submodule);
      continue;
    }
    const parent = fileForModule(base, pyFiles);
    if (parent) out.push(parent);
  }
  return out;
}

/**
 * Number of distinct other repo files this Python file imports.
 * `pyFiles` is the repo-relative `.py` index (no per-file parse).
 */
export function pythonImportFanOut(
  relFile: string,
  root: SyntaxNode,
  pyFiles: ReadonlySet<string>,
): number {
  const hits = new Set<string>();
  const current = relFile.replace(/\\/g, "/");
  for (const node of root.descendantsOfType([
    "import_statement",
    "import_from_statement",
  ])) {
    for (const imp of parseImport(node)) {
      for (const file of resolvedFiles(imp, current, pyFiles)) {
        if (file !== current) hits.add(file);
      }
    }
  }
  return hits.size;
}
