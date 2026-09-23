/**
 * Python backend framework and AI/ML stack detection.
 *
 * Two sources, merged: dependency files at the repo root and one directory
 * down (`backend/`, `api/`, …), and top-level imports from the Python files
 * that were parsed. Student repos often skip `requirements.txt`, so imports
 * alone are enough.
 *
 * Path checks are inline. CodeQL's path-injection query does not follow a helper.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SyntaxNode } from "tree-sitter";
import type { FrameworkInfo } from "../types/report.js";

type PythonBackend = NonNullable<FrameworkInfo["pythonBackend"]>;

/** Backend priority when several appear: FastAPI is built on Starlette, so it wins. */
const BACKENDS: { name: PythonBackend; packages: string[]; modules: string[] }[] = [
  { name: "FastAPI", packages: ["fastapi"], modules: ["fastapi"] },
  { name: "Flask", packages: ["flask"], modules: ["flask"] },
  { name: "Starlette", packages: ["starlette"], modules: ["starlette"] },
];

/** Stack tag → dependency names and import roots that imply it. */
const STACK: { tag: string; packages: string[]; modules: string[] }[] = [
  { tag: "torch", packages: ["torch", "pytorch-lightning", "lightning"], modules: ["torch", "lightning", "pytorch_lightning"] },
  { tag: "tensorflow", packages: ["tensorflow", "tensorflow-cpu", "keras"], modules: ["tensorflow", "keras"] },
  { tag: "scikit-learn", packages: ["scikit-learn", "sklearn"], modules: ["sklearn"] },
  { tag: "xgboost", packages: ["xgboost", "lightgbm"], modules: ["xgboost", "lightgbm"] },
  { tag: "transformers", packages: ["transformers", "sentence-transformers"], modules: ["transformers", "sentence_transformers"] },
  { tag: "langchain", packages: ["langchain", "langchain-core", "langgraph"], modules: ["langchain", "langchain_core", "langgraph"] },
  { tag: "llama-index", packages: ["llama-index", "llama_index"], modules: ["llama_index"] },
  { tag: "openai", packages: ["openai"], modules: ["openai"] },
  { tag: "anthropic", packages: ["anthropic"], modules: ["anthropic"] },
  { tag: "streamlit", packages: ["streamlit"], modules: ["streamlit"] },
  { tag: "gradio", packages: ["gradio"], modules: ["gradio"] },
];

const DEPENDENCY_FILES = ["requirements.txt", "requirements-dev.txt", "pyproject.toml", "Pipfile", "setup.py", "setup.cfg"];
const SKIPPED_DIRS = new Set(["node_modules", "venv", "__pycache__", "dist", "build", "vendor", "third_party"]);

/** Top-level module names imported by a Python tree: `import torch.nn` → `torch`. Relative imports are skipped. */
export function collectPythonImports(root: SyntaxNode, into: Set<string>): void {
  for (const node of root.descendantsOfType(["import_statement", "import_from_statement"])) {
    if (node.type === "import_from_statement") {
      const mod = node.childForFieldName("module_name");
      if (mod?.type === "dotted_name") into.add(mod.text.split(".")[0] ?? "");
      continue;
    }
    for (const name of node.childrenForFieldName("name")) {
      const dotted = name.type === "aliased_import" ? name.childForFieldName("name") : name;
      if (dotted?.type === "dotted_name") into.add(dotted.text.split(".")[0] ?? "");
    }
  }
}

/** Normalized package names declared in one dependency file's text. */
function declaredPackages(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    for (const m of t.toLowerCase().matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
      out.add(m[0].replace(/_/g, "-"));
    }
  }
  return out;
}

async function readDependencyPackages(repoPath: string): Promise<Set<string>> {
  const base = path.resolve(repoPath);
  const root = base + path.sep;
  const dirs = [""];
  try {
    const listing = path.resolve(base, ".");
    if (!listing.startsWith(base)) return new Set();
    for (const entry of await readdir(listing, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
      if (entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("..")) continue;
      dirs.push(entry.name);
    }
  } catch {
    // unreadable root: dependency files are optional
  }
  const packages = new Set<string>();
  for (const dir of dirs) {
    for (const file of DEPENDENCY_FILES) {
      const target = path.resolve(root, dir, file);
      if (!target.startsWith(root)) continue;
      try {
        for (const p of declaredPackages(await readFile(target, "utf8"))) packages.add(p);
      } catch {
        // missing file
      }
    }
  }
  return packages;
}

/**
 * Detect the Python backend and AI/ML stack.
 *
 * @param importedModules - Top-level import roots from the parsed Python files.
 */
export async function detectPythonStack(
  repoPath: string,
  importedModules: ReadonlySet<string>,
): Promise<{ pythonBackend: PythonBackend | null; pythonStack: string[] }> {
  const packages = await readDependencyPackages(repoPath);
  const has = (pkgs: string[], mods: string[]) =>
    pkgs.some((p) => packages.has(p)) || mods.some((m) => importedModules.has(m));
  const backend = BACKENDS.find((b) => has(b.packages, b.modules))?.name ?? null;
  const pythonStack = STACK.filter((s) => has(s.packages, s.modules)).map((s) => s.tag);
  return { pythonBackend: backend, pythonStack };
}

/**
 * Merge Python detection into the package.json-based framework info.
 * A repo without package.json gets a Python-only record; `type` is the
 * backend name, or `Python`.
 */
export function mergePythonFramework(
  framework: FrameworkInfo | null,
  python: { pythonBackend: PythonBackend | null; pythonStack: string[] },
  hasPythonFiles: boolean,
): FrameworkInfo | null {
  if (!hasPythonFiles && !python.pythonBackend && python.pythonStack.length === 0) {
    return framework;
  }
  if (!framework) {
    return {
      type: python.pythonBackend ?? "Python",
      hasReact: false,
      hasBackend: python.pythonBackend !== null,
      pythonBackend: python.pythonBackend,
      pythonStack: python.pythonStack,
    };
  }
  return {
    ...framework,
    hasBackend: framework.hasBackend || python.pythonBackend !== null,
    pythonBackend: python.pythonBackend,
    pythonStack: python.pythonStack,
  };
}
