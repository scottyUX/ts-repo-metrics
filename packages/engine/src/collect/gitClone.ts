/**
 * Git clone module for GitHub public repos.
 *
 * Clones into .cache/ts-repo-metrics/<owner-repo> with full history.
 * Reuses cache unless --no-cache.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import type { ParsedGitHubUrl } from "../utils/githubUrl.js";

const CACHE_DIR = ".cache/ts-repo-metrics";

function cacheKey(parsed: ParsedGitHubUrl): string {
  return `${parsed.owner}-${parsed.repo}`;
}

/**
 * Clone a GitHub repo or return cached path.
 *
 * @param parsed - Parsed GitHub URL.
 * @param useCache - If false, clone fresh (removes cache first).
 * @param baseDir - Base directory for cache (default: cwd).
 * @returns Absolute path to the cloned repo.
 */
export async function cloneOrUseCache(
  parsed: ParsedGitHubUrl,
  useCache: boolean,
  baseDir: string = process.cwd(),
): Promise<string> {
  const fullPath = path.resolve(baseDir, CACHE_DIR, cacheKey(parsed));

  if (useCache && existsSync(fullPath)) {
    return fullPath;
  }

  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true });
  }

  const parentDir = path.dirname(fullPath);
  mkdirSync(parentDir, { recursive: true });

  const git = simpleGit();
  await git.clone(parsed.url, fullPath, ["--no-single-branch"]);

  return fullPath;
}
