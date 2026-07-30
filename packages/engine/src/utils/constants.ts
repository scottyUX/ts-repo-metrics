/**
 * Shared constants used across collection and extraction modules.
 */

/* ------------------------------------------------------------------ */
/*  File discovery                                                     */
/* ------------------------------------------------------------------ */

/** Glob patterns for analyzable source files (TS/TSX/JS/JSX/Python). */
export const SOURCE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.py",
];

/** Directories to exclude from all file discovery and analysis. */
export const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.git/**",
];

/** Matches test files by convention: `*.test.ts`, `*.spec.jsx`, etc. */
export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

/** True when the path is a JSX-bearing extension (`.tsx` or `.jsx`). */
export function isJsxPath(filePath: string): boolean {
  return filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
}

/** Matches pytest/unittest-style Python test modules. */
export const PYTHON_TEST_FILE_RE = /(?:^|[/\\])(?:test_.+|.+_test)\.py$/i;

/** True when the path matches any supported test-file naming convention. */
export function isTestFilePath(filePath: string): boolean {
  return TEST_FILE_RE.test(filePath) || PYTHON_TEST_FILE_RE.test(filePath);
}

/** Tree-sitter flavor for a discovered source file path. */
export function sourceFlavorForPath(filePath: string): "ts" | "tsx" | "js" | "jsx" | "py" {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".jsx")) return "jsx";
  if (filePath.endsWith(".js")) return "js";
  if (filePath.endsWith(".py")) return "py";
  return "ts";
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
  // `function` is the node type older tree-sitter-javascript grammars emitted
  // for a function expression; tree-sitter-typescript 0.23 emits
  // `function_expression`. Both are listed so neither grammar silently drops
  // `const x = function () {}` — an unrecognised function is not just missing,
  // its body is also counted into the enclosing function's score.
  "function",
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
  // `else_clause` is deliberately absent. McCabe counts decision points, and a
  // bare `else` has no predicate — it is the fall-through of an `if` already
  // counted. An `else if` still counts once, via the `if_statement` nested
  // inside its `else_clause`.
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "ternary_expression",
]);
