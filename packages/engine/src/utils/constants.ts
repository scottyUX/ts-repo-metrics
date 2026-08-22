/**
 * Shared constants used across collection and extraction modules.
 */

/* ------------------------------------------------------------------ */
/*  File discovery                                                     */
/* ------------------------------------------------------------------ */

/** Glob patterns for TypeScript and TSX source files. */
export const SOURCE_PATTERNS = ["**/*.ts", "**/*.tsx"];

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

/** Path segments that match IGNORE_PATTERNS (for allow-list filtering). */
const BLOCKED_PATH_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".git",
]);

/**
 * True when a repo-relative path is a TypeScript/TSX source file outside ignored dirs.
 */
export function isAnalyzableSourcePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".tsx")) return false;
  const parts = normalized.split("/").filter(Boolean);
  return !parts.some((p) => BLOCKED_PATH_SEGMENTS.has(p));
}

/** Matches test files by convention: `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`. */
export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

/* ------------------------------------------------------------------ */
/*  AST node classification                                            */
/* ------------------------------------------------------------------ */

/** Tree-sitter node types that represent function-like constructs. */
export const FUNCTION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
  "arrow_function",
  "function",
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
