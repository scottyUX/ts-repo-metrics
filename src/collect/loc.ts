/**
 * Repository profiling module.
 *
 * Computes high-level repository statistics — file counts by type and lines
 * of code (total, source, test) — before AST analysis runs. Reuses the same
 * ignore list as file discovery so counts stay consistent.
 */

import { readFile } from "node:fs/promises";
import fg from "fast-glob";

const SOURCE_PATTERNS = ["**/*.ts", "**/*.tsx"];

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.git/**",
];

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

/** Breakdown of file counts and lines of code for a repository. */
export interface RepoProfile {
  totalFiles: number;
  tsFiles: number;
  tsxFiles: number;
  testFiles: number;
  totalLOC: number;
  sourceLOC: number;
  testLOC: number;
}

/**
 * Count the number of newline-delimited lines in a string.
 *
 * @param text - Raw file contents.
 * @returns Line count (empty file = 0, single trailing newline not double-counted).
 */
function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") count++;
  }
  if (text[text.length - 1] === "\n") count--;
  return count;
}

/**
 * Profile a repository's TypeScript / TSX source files.
 *
 * Discovers all `.ts` and `.tsx` files (excluding common non-source dirs),
 * classifies each as source or test, and counts lines of code.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns A {@link RepoProfile} with file counts and LOC breakdowns.
 */
export async function profileRepo(repoPath: string): Promise<RepoProfile> {
  const files = await fg(SOURCE_PATTERNS, {
    cwd: repoPath,
    absolute: true,
    ignore: IGNORE,
  });

  let tsFiles = 0;
  let tsxFiles = 0;
  let testFiles = 0;
  let totalLOC = 0;
  let sourceLOC = 0;
  let testLOC = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const lines = countLines(content);
    const isTest = TEST_FILE_RE.test(filePath);
    const isTsx = filePath.endsWith(".tsx");

    if (isTsx) tsxFiles++;
    else tsFiles++;

    if (isTest) {
      testFiles++;
      testLOC += lines;
    } else {
      sourceLOC += lines;
    }

    totalLOC += lines;
  }

  return {
    totalFiles: files.length,
    tsFiles,
    tsxFiles,
    testFiles,
    totalLOC,
    sourceLOC,
    testLOC,
  };
}
