/**
 * File discovery module.
 *
 * Recursively finds all .ts and .tsx source files within a given repository
 * path using fast-glob. Common non-source directories (node_modules, dist,
 * build, .next, coverage, etc.) are excluded automatically.
 */

import fg from "fast-glob";
import { SOURCE_PATTERNS, IGNORE_PATTERNS } from "../utils/constants.js";

/**
 * Discover all TypeScript and TSX source files in a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Array of absolute file paths.
 */
export async function discoverSourceFiles(repoPath: string) {
  return fg(SOURCE_PATTERNS, {
    cwd: repoPath,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  });
}
