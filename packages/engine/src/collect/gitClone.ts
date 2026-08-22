/**
 * Git clone module for GitHub public repos.
 *
 * Clones into .cache/ts-repo-metrics/<cache-key> with full history.
 * Reuses cache unless --no-cache; reused clones are fetched and reset to the
 * requested ref (default branch, named branch, or pull-request head).
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import {
  sanitizeRefForKey,
  type ParsedGitHubUrl,
} from "../utils/githubUrl.js";

const CACHE_DIR = ".cache/ts-repo-metrics";

export type CloneCheckout =
  | { kind: "default" }
  | { kind: "pr"; number: number }
  | { kind: "branch"; name: string };

function cacheKey(parsed: ParsedGitHubUrl, checkout?: CloneCheckout): string {
  const base = `${parsed.owner}-${parsed.repo}`;
  if (!checkout || checkout.kind === "default") return base;
  if (checkout.kind === "pr") return `${base}-pr${checkout.number}`;
  return `${base}-branch-${sanitizeRefForKey(checkout.name)}`;
}

function fetchRefspec(checkout?: CloneCheckout): string {
  if (!checkout || checkout.kind === "default") return "HEAD";
  if (checkout.kind === "pr") return `pull/${checkout.number}/head`;
  return checkout.name;
}

function authenticatedCloneUrl(
  parsed: ParsedGitHubUrl,
  githubToken: string,
): string {
  const t = encodeURIComponent(githubToken);
  return `https://x-access-token:${t}@github.com/${parsed.owner}/${parsed.repo}.git`;
}

/**
 * Sync an existing clone with a remote ref.
 *
 * First compares the remote tip SHA (ls-remote) with the local HEAD and
 * returns without touching the tree when they match. Otherwise fetches from
 * the remote URL directly so a token rotated since the original clone still
 * works. Reset + clean rather than pull: force-pushed branches must still
 * converge, and files deleted upstream must leave the tree.
 */
async function syncCloneWithRemote(
  repoPath: string,
  remote: string,
  checkout?: CloneCheckout,
): Promise<void> {
  const repo = simpleGit(repoPath);
  const refspec = fetchRefspec(checkout);
  const remoteHead = (await repo.raw(["ls-remote", remote, refspec]))
    .trim()
    .split(/\s+/)[0];
  const localHead = (await repo.revparse(["HEAD"])).trim();
  if (remoteHead && remoteHead === localHead) {
    return;
  }
  await repo.raw(["fetch", remote, refspec]);
  await repo.raw(["reset", "--hard", "FETCH_HEAD"]);
  await repo.raw(["clean", "-fd"]);
}

/**
 * Clone a GitHub repo or reuse the cached clone, then check out the requested ref.
 *
 * @param parsed - Parsed GitHub URL.
 * @param useCache - If false, clone fresh (removes cache first).
 * @param baseDir - Base directory for cache (default: cwd).
 * @param githubToken - Optional PAT for private repositories (never logged).
 * @param checkout - Default branch, named branch, or pull-request head.
 * @returns Absolute path to the cloned repo.
 */
export async function cloneOrUseCache(
  parsed: ParsedGitHubUrl,
  useCache: boolean,
  baseDir: string = process.cwd(),
  githubToken?: string,
  checkout?: CloneCheckout,
): Promise<string> {
  const fullPath = path.resolve(baseDir, CACHE_DIR, cacheKey(parsed, checkout));

  const cloneRemote =
    githubToken?.trim() ? authenticatedCloneUrl(parsed, githubToken.trim()) : parsed.url;

  // A previous run may have left a partial tree (e.g. interrupted clone: `.git` without HEAD).
  // Reusing that path skips clone and yields 0 source files — all metrics zero.
  if (existsSync(fullPath)) {
    let looksLikeGitRepo = false;
    try {
      looksLikeGitRepo = await simpleGit(fullPath).checkIsRepo();
    } catch {
      looksLikeGitRepo = false;
    }
    if (!looksLikeGitRepo) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  if (useCache && existsSync(fullPath)) {
    try {
      await syncCloneWithRemote(fullPath, cloneRemote, checkout);
      return fullPath;
    } catch {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true });
  }

  const parentDir = path.dirname(fullPath);
  mkdirSync(parentDir, { recursive: true });

  const git = simpleGit();
  await git.clone(cloneRemote, fullPath, ["--no-single-branch"]);

  if (checkout && checkout.kind !== "default") {
    await syncCloneWithRemote(fullPath, cloneRemote, checkout);
  }

  return fullPath;
}
