/**
 * Shared constants used across collection and extraction modules.
 */

/* ------------------------------------------------------------------ */
/*  File discovery                                                     */
/* ------------------------------------------------------------------ */

/** Glob patterns for TypeScript, JavaScript, JSX, Python, and notebook source files. */
export const SOURCE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
  "**/*.py",
  "**/*.ipynb",
];

/**
 * fast-glob and jscpd ignore globs. jscpd matches these against repo-relative
 * paths only when its process cwd is the repo (see detectDuplication).
 * The last two entries cover dot-directories such as .storybook and .github.
 */
export const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/third_party/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/*.min.js",
  "**/*.min.jsx",
  "**/*.min.mjs",
  "**/*.min.cjs",
  "**/*.config.js",
  "**/*.config.cjs",
  "**/*.config.mjs",
  "**/.*/**",
  "**/.*",
];

/** Directory names excluded from analysis. Dot-directories are handled separately. */
const BLOCKED_PATH_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "third_party",
  "venv",
  "__pycache__",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".ipynb",
]);

const MINIFIED_BASENAME_RE = /\.min\.(js|jsx|mjs|cjs)$/;
const CONFIG_JS_BASENAME_RE = /\.config\.(js|cjs|mjs)$/;

/**
 * True when a repo-relative path is source we score.
 * Path-only: no sibling lookup. Emit files next to TypeScript are dropped later
 * in discoverSourceFiles, after the tree is on disk.
 */
export function isAnalyzableSourcePath(relPath: string): boolean {
  const slashed = relPath.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return false;
  const normalized = slashed.replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((p) => p.startsWith(".") || BLOCKED_PATH_SEGMENTS.has(p))) {
    return false;
  }
  const base = parts[parts.length - 1] ?? "";
  if (MINIFIED_BASENAME_RE.test(base) || CONFIG_JS_BASENAME_RE.test(base)) {
    return false;
  }
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTENSIONS.has(base.slice(dot));
}

/** Matches `*.test` / `*.spec` for JS and TS source extensions. */
export const TEST_FILE_RE = /\.(test|spec)\.(js|jsx|mjs|cjs|ts|tsx)$/;

/** pytest basenames `test_*.py` or `*_test.py`. Tested against the basename only. */
const PYTHON_TEST_BASENAME_RE = /^(?:test_[^/]*|[^/]*_test)\.py$/i;

/** True for JS/TS test names, pytest module names, and `conftest.py`. */
export function isTestFilePath(filePath: string): boolean {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
  if (base === "conftest.py") return true;
  return TEST_FILE_RE.test(filePath) || PYTHON_TEST_BASENAME_RE.test(base);
}

/* ------------------------------------------------------------------ */
/*  AST node classification                                            */
/* ------------------------------------------------------------------ */

/** Tree-sitter node types that represent function-like constructs. */
export const FUNCTION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
  "arrow_function",
  "function_expression",
  "generator_function",
]);

/** Tree-sitter node types that introduce a nesting level for depth calculation. */
export const NESTING_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "try_statement",
]);

/* ------------------------------------------------------------------ */
/*  Thresholds                                                         */
/* ------------------------------------------------------------------ */

/** Functions exceeding this many lines are classified as "long". */
export const LONG_FUNCTION_THRESHOLD = 50;

/** Functions with cyclomatic complexity above this are "high complexity". */
export const HIGH_COMPLEXITY_THRESHOLD = 10;

/** Functions nested deeper than this level are flagged as a "deep nesting" smell. */
export const DEEP_NESTING_THRESHOLD = 4;

/** Functions with more parameters than this are flagged as "long parameter list". */
export const LONG_PARAM_LIST_THRESHOLD = 4;

/* ------------------------------------------------------------------ */
/*  React / RQ3 (TSX)                                                  */
/* ------------------------------------------------------------------ */

/** Tampere-style: flag when max nested JSX depth exceeds this (exclusive). */
export const JSX_NESTING_TAMPERE_THRESHOLD = 5;

/** Ferreira-style: hook count above this contributes to lack-of-cohesion when SLOC is high. */
export const FERREIRA_HOOK_COUNT_THRESHOLD = 5;

/** Ferreira-style: component SLOC above this contributes with high hook count. */
export const FERREIRA_COMPONENT_SLOC_THRESHOLD = 50;

/**
 * Tree-sitter node types that add one branch point to cyclomatic complexity.
 * Logical operators (`&&`, `||`) are handled separately via binary_expression inspection.
 */
export const COMPLEXITY_BRANCH_TYPES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "ternary_expression",
]);
