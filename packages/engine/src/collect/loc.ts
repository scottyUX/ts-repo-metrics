/**
 * Repository profiling module.
 *
 * Computes high-level repository statistics — file counts by type and lines
 * of code (total, source, test) — before AST analysis runs. Uses shared
 * constants so ignore patterns and file classification stay consistent
 * across all modules.
 */

import { readFile } from "node:fs/promises";
import fg from "fast-glob";
import { SOURCE_PATTERNS, IGNORE_PATTERNS, TEST_FILE_RE } from "../utils/constants.js";
import { countLines } from "../utils/text.js";
import type { RepoProfile } from "../types/report.js";

export type { RepoProfile } from "../types/report.js";

/**
 * Profile a repository's analyzable source files (TS/TSX/JS/JSX).
 *
 * Discovers source files (excluding common non-source dirs), classifies each
 * as source or test, and counts lines of code.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns A {@link RepoProfile} with file counts and LOC breakdowns.
 */
export async function profileRepo(repoPath: string): Promise<RepoProfile> {
  const files = await fg(SOURCE_PATTERNS, {
    cwd: repoPath,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  });

  let tsFiles = 0;
  let tsxFiles = 0;
  let jsFiles = 0;
  let jsxFiles = 0;
  let testFiles = 0;
  let totalLOC = 0;
  let sourceLOC = 0;
  let testLOC = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const lines = countLines(content);
    const isTest = TEST_FILE_RE.test(filePath);

    if (filePath.endsWith(".tsx")) tsxFiles++;
    else if (filePath.endsWith(".jsx")) jsxFiles++;
    else if (filePath.endsWith(".js")) jsFiles++;
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
    jsFiles,
    jsxFiles,
    testFiles,
    totalLOC,
    sourceLOC,
    testLOC,
  };
}
