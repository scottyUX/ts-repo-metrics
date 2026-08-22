/**
 * File discovery module.
 *
 * Recursively finds all .ts and .tsx source files within a given repository
 * path using fast-glob. Common non-source directories (node_modules, dist,
 * build, .next, coverage, etc.) are excluded automatically.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import {
  SOURCE_PATTERNS,
  IGNORE_PATTERNS,
  isAnalyzableSourcePath,
} from "../utils/constants.js";

/**
 * Discover TypeScript and TSX source files in a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param includePaths - Optional repo-relative allow-list (PR changed files).
 * @returns Array of absolute file paths.
 */
export async function discoverSourceFiles(
  repoPath: string,
  includePaths?: string[],
) {
  if (includePaths) {
    const out: string[] = [];
    for (const rel of includePaths) {
      const normalized = rel.replace(/\\/g, "/");
      if (!isAnalyzableSourcePath(normalized)) continue;
      const abs = path.resolve(repoPath, normalized);
      if (existsSync(abs)) out.push(abs);
    }
    return out;
  }
  return fg(SOURCE_PATTERNS, {
    cwd: repoPath,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  });
}
