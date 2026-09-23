/**
 * Repository profiling module.
 *
 * Computes high-level repository statistics — file counts by type and lines
 * of code (total, source, test) — before AST analysis runs. Uses shared
 * constants so ignore patterns and file classification stay consistent
 * across all modules.
 */

import path from "node:path";
import { isTestFilePath } from "../utils/constants.js";
import { countLines } from "../utils/text.js";
import { discoverSourceFiles } from "./fileDiscovery.js";
import { isNotebookPath, readAnalyzableSource } from "../parsing/notebook.js";
import type { RepoProfile } from "../types/report.js";

export type { RepoProfile } from "../types/report.js";

/**
 * Profile a repository's TypeScript, JavaScript, JSX, and Python source files.
 *
 * Discovers analyzable source files, classifies each as source or test, and
 * counts lines of code. `.mjs` and `.cjs` count as `jsFiles`. `.py` counts as `pyFiles`.
 * `.ipynb` counts as `notebookFiles`, with LOC from code cells only; a malformed notebook adds 0 lines.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param includePaths - Optional repo-relative allow-list (PR changed files).
 * @returns A {@link RepoProfile} with file counts and LOC breakdowns.
 */
export async function profileRepo(
  repoPath: string,
  includePaths?: string[],
): Promise<RepoProfile> {
  const files = await discoverSourceFiles(repoPath, includePaths);

  let tsFiles = 0;
  let tsxFiles = 0;
  let jsFiles = 0;
  let jsxFiles = 0;
  let pyFiles = 0;
  let notebookFiles = 0;
  let testFiles = 0;
  let totalLOC = 0;
  let sourceLOC = 0;
  let testLOC = 0;

  for (const filePath of files) {
    let lines: number;
    if (isNotebookPath(filePath)) {
      try {
        lines = countLines((await readAnalyzableSource(filePath)).code);
      } catch {
        lines = 0;
      }
    } else {
      lines = countLines((await readAnalyzableSource(filePath)).code);
    }
    const isTest = isTestFilePath(filePath);
    const ext = path.extname(filePath);

    if (ext === ".tsx") tsxFiles++;
    else if (ext === ".jsx") jsxFiles++;
    else if (ext === ".js" || ext === ".mjs" || ext === ".cjs") jsFiles++;
    else if (ext === ".py") pyFiles++;
    else if (ext === ".ipynb") notebookFiles++;
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
    pyFiles,
    notebookFiles,
    testFiles,
    totalLOC,
    sourceLOC,
    testLOC,
  };
}
