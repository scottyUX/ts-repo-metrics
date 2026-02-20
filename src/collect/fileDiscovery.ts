/**
 * File discovery module.
 *
 * Recursively finds all .ts and .tsx source files within a given repository
 * path using fast-glob. Common non-source directories (node_modules, dist,
 * build, .next, coverage, etc.) are excluded automatically.
 */

import fg from "fast-glob";

export async function discoverSourceFiles(repoPath: string) {
  const patterns = ["**/*.ts", "**/*.tsx"];
  const ignore = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/.git/**",
  ];

  return fg(patterns, {
    cwd: repoPath,
    absolute: true,
    ignore,
  });
}
