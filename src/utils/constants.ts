/**
 * Shared constants used across collection and extraction modules.
 */

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

/** Matches test files by convention: `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`. */
export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
