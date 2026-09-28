/**
 * Check out an exact commit for structure metrics.
 *
 * One clone per owner/repo lives under cacheDir and is reused across SHAs.
 * This cache is separate from cloneOrUseCache, so a structure job cannot
 * reset the dashboard clone cache.
 *
 * Checkouts of the same owner/repo directory are serialized in-process.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const SHA40 = /^[0-9a-f]{40}$/;

export interface CheckoutCommitOptions {
  owner: string;
  repo: string;
  /** 40-hex commit SHA. */
  sha: string;
  /** Directory that holds one clone per owner/repo. Not the dashboard clone cache. */
  cacheDir: string;
  /** Optional PAT for private GitHub clones. Never logged. */
  githubToken?: string;
  /**
   * Clone URL override. Tests pass a local git directory so no network is used.
   * When omitted, the remote is https://github.com/owner/repo.git.
   */
  remoteUrl?: string;
}

export interface CheckoutCommitResult {
  repoPath: string;
  /** Full 40-hex SHA now at HEAD. */
  commit: string;
}

const tails = new Map<string, Promise<void>>();

function withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(key, gate);
  return prev.then(fn, fn).finally(() => {
    release();
  });
}

function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

function redact(text: string): string {
  return text
    .replace(/x-access-token:[^@\s'"]+@/gi, "x-access-token:***@")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_***")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***");
}

function redactError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(redact(message));
}

function remoteFor(options: CheckoutCommitOptions): string {
  const override = options.remoteUrl?.trim();
  if (override) {
    if (/[\0\r\n]/.test(override)) throw new Error("invalid remote URL");
    return override;
  }
  const token = options.githubToken?.trim();
  if (!token) return `https://github.com/${options.owner}/${options.repo}.git`;
  const encoded = encodeURIComponent(token);
  return `https://x-access-token:${encoded}@github.com/${options.owner}/${options.repo}.git`;
}

async function hasCommit(git: SimpleGit, sha: string): Promise<boolean> {
  try {
    await git.raw(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** `git checkout --detach <sha>` then `git clean -fd`. */
async function detachAndClean(git: SimpleGit, sha: string): Promise<void> {
  await git.raw(["checkout", "--detach", sha]);
  await git.raw(["clean", "-fd"]);
}

async function ensureClone(dest: string, remote: string): Promise<void> {
  if (existsSync(dest)) {
    let isRepo = false;
    try {
      isRepo = await simpleGit(dest).env(gitEnv()).checkIsRepo();
    } catch {
      isRepo = false;
    }
    if (!isRepo) rmSync(dest, { recursive: true, force: true });
  }
  if (existsSync(dest)) return;

  mkdirSync(path.dirname(dest), { recursive: true });
  try {
    await simpleGit().env(gitEnv()).clone(remote, dest, [
      "--no-single-branch",
      "--filter=blob:none",
    ]);
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    try {
      await simpleGit().env(gitEnv()).clone(remote, dest, ["--no-single-branch"]);
    } catch (err2) {
      rmSync(dest, { recursive: true, force: true });
      throw redactError(err2 ?? err);
    }
  }
}

async function checkoutCommitUnlocked(
  options: CheckoutCommitOptions,
  sha: string,
): Promise<CheckoutCommitResult> {
  const remote = remoteFor(options);
  const dest = path.resolve(options.cacheDir, options.owner, options.repo);
  const cacheRoot = path.resolve(options.cacheDir);
  const cachePrefix = cacheRoot.endsWith(path.sep) ? cacheRoot : cacheRoot + path.sep;
  if (dest !== cacheRoot && !dest.startsWith(cachePrefix)) {
    throw new Error("cache path escapes cacheDir");
  }

  try {
    await ensureClone(dest, remote);
    const git = simpleGit(dest).env(gitEnv());
    try {
      await git.raw(["remote", "set-url", "origin", remote]);
    } catch {
      await git.raw(["remote", "add", "origin", remote]);
    }

    if (!(await hasCommit(git, sha))) {
      await git.raw(["fetch", "origin", sha]);
    }
    try {
      await detachAndClean(git, sha);
    } catch {
      // SHA was not local, or the reused work tree was dirty. Fetch only when
      // the object is still missing, then check out again.
      if (!(await hasCommit(git, sha))) {
        await git.raw(["fetch", "origin", sha]);
      }
      await git.raw(["reset", "--hard"]);
      await git.raw(["clean", "-fd"]);
      await detachAndClean(git, sha);
    }

    const head = (await git.revparse(["HEAD"])).trim().toLowerCase();
    if (head !== sha) {
      throw new Error(`checkout HEAD ${head} does not match requested commit`);
    }
    return { repoPath: dest, commit: head };
  } catch (err) {
    throw redactError(err);
  }
}

/**
 * Clone (or reuse) owner/repo and detach HEAD at `sha`.
 * Throws when HEAD is not the requested 40-hex commit.
 */
export async function checkoutCommit(
  options: CheckoutCommitOptions,
): Promise<CheckoutCommitResult> {
  const owner = options.owner?.trim() ?? "";
  const repo = options.repo?.trim().replace(/\.git$/, "") ?? "";
  const sha = options.sha?.trim().toLowerCase() ?? "";
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    throw new Error("invalid owner or repo");
  }
  if (!SHA40.test(sha)) {
    throw new Error("commit must be a 40-character hex SHA");
  }
  if (!options.cacheDir?.trim()) throw new Error("cacheDir is required");

  const key = `${path.resolve(options.cacheDir)}:${owner}/${repo}`;
  return withRepoLock(key, () =>
    checkoutCommitUnlocked({ ...options, owner, repo, sha }, sha),
  );
}
