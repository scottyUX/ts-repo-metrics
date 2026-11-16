// The website's copy of a benchmark task's repository (#298): the whole repo at the row's base commit,
// as a git bundle in the private bucket benchmark-snapshots, so the validator can validate a private
// repository from the copy without the course App's private key, which only the website has. The
// website writes copies (at Submit, behind CSE115A_REPO_COPIES, and from the instructor Benchmark
// page) and asks whether one exists; it never downloads or serves one.
//
// Everything is the validator's own code: cloneRepo and ensureCommit (the App token, never stored in
// the remote and never in an error), bundleRepo, verifyBundle, and the SnapshotStore, which names the
// object for the base commit and never overwrites. GitHub access and the store are passed in, so
// tests use a local repository and a folder.

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CourseRepoAccessError, githubAppConfig, repoInstallationToken } from "@/lib/cse115a/githubAppToken";
import { bundleRepo, cloneRepo, CloneError, ensureCommit, NO_APP_CLONE_DETAIL, redactToken, run, type GitAccess } from "@/lib/cse115a/benchmark/validation/runRow";
import { verifyBundle } from "@/lib/cse115a/benchmark/validation/snapshots";
import { OBJECT_COMMIT_CHARS, SNAPSHOT_SIZE_LIMIT, type SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

/** What a copy needs from a benchmark row. */
export type RepoCopyTask = { instance_id: string; repo: string; base_commit: string };

export type RepoCopyFailure = "not_installed" | "base_missing" | "too_large" | "github" | "storage" | "bundle";

export type RepoCopyResult =
  | { instance_id: string; outcome: "stored" | "already stored" }
  | { instance_id: string; outcome: "failed"; reason: RepoCopyFailure; line: string };

/** A clone or fetch that takes longer is stopped (the job poller and the 10-minute job lock wait on it). */
export const GIT_NETWORK_TIMEOUT_MS = 120_000;

export type RepoCopyOptions = {
  store: SnapshotStore;
  /** How the clone reaches GitHub (the validator's GitAccess); the App config and token from the environment when omitted. */
  access?: GitAccess;
  log?: (line: string) => void;
  /** Where the temp folder is made (default: the system temp folder). */
  tmp?: string;
  /** Default SNAPSHOT_SIZE_LIMIT (the bucket's limit); tests make it small. */
  sizeLimit?: number;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find(Boolean) ?? text;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** git's answer when the commit is not in the repository (GitHub, and git over file:// in tests). */
const MISSING_COMMIT = /not our ref|couldn't find remote ref|no such remote ref|unadvertised object|bad object|not a valid object|unable to find/i;

/**
 * Copies one task's repository at its base commit into the store. Asks the store first (a copy for
 * this base commit already there is "already stored" and nothing is cloned). Then: the App's
 * installation token for the repository, or an anonymous clone when the App is not installed there or
 * not set up on the site (so a public repository still works); a clone into a fresh temp folder; the
 * base commit fetched if the clone lacks it; the bundle written and checked as the validator does;
 * the upload. The temp folder is removed whatever happens. Never throws: a failure is one plain line,
 * with no token in it or in any log line.
 */
export async function copyTaskRepo(task: RepoCopyTask, options: RepoCopyOptions): Promise<RepoCopyResult> {
  const { instance_id: id, repo, base_commit: base } = task;
  let token: string | null = null;
  const log = (line: string) => options.log?.(redactToken(line, token));
  const fail = (reason: RepoCopyFailure, line: string): RepoCopyResult => ({ instance_id: id, outcome: "failed", reason, line: redactToken(line, token).slice(0, 500) });
  const storageError = (error: unknown) => fail("storage", `Storage error: ${firstLine(errorText(error)).replace(/^Storage:\s*/, "")}`);
  const short = base.slice(0, OBJECT_COMMIT_CHARS);
  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) return fail("github", `GitHub error: "${repo}" is not an owner/name repository`);
  if (!/^[0-9a-f]{40,64}$/i.test(base)) return fail("base_missing", `The base commit "${base}" is not a full commit id.`);

  try {
    if (await options.store.has(id, base)) return { instance_id: id, outcome: "already stored" };
  } catch (error) {
    return storageError(error);
  }

  const access = options.access ?? {};
  const git = access.git ?? run;
  // Every git command the clone runs gets a time limit; a timed-out command's message (which holds
  // the URL) is redacted like any other.
  const timed: typeof run = (cmd, args, cwd, runOptions = {}) => git(cmd, args, cwd, { ...runOptions, timeoutMs: runOptions.timeoutMs ?? GIT_NETWORK_TIMEOUT_MS });
  const config = (access.config ?? githubAppConfig)();
  let cloneAccess: GitAccess = { ...access, git: timed, config: () => null };
  if (config) {
    try {
      token = await (access.token ?? repoInstallationToken)(owner, name, config);
      const issued = token;
      cloneAccess = { ...access, git: timed, config: () => config, token: async () => issued };
    } catch (error) {
      if (!(error instanceof CourseRepoAccessError && error.code === "github_app_not_installed")) {
        return fail("github", `GitHub error: could not get the course App token: ${firstLine(errorText(error))}`);
      }
      log(`The course App is not installed on ${repo}; trying an anonymous clone.`);
    }
  }

  const tmp = await mkdtemp(join(options.tmp ?? tmpdir(), "hecate-repo-copy-"));
  try {
    const repoDir = join(tmp, "repo");
    try {
      await cloneRepo(repo, repoDir, log, cloneAccess);
    } catch (error) {
      if (error instanceof CloneError && error.message === NO_APP_CLONE_DETAIL) {
        return fail("not_installed", config
          ? `${repo} is private (or gone) and the course GitHub App is not installed on it. Install the App on the repository, then retry.`
          : `${repo} is private (or gone) and the course GitHub App is not set up on this site.`);
      }
      return fail("github", `GitHub error: ${firstLine(errorText(error))}`);
    }
    try {
      await ensureCommit(repoDir, base, log, repo, cloneAccess);
    } catch (error) {
      const text = redactToken(errorText(error), token);
      if (MISSING_COMMIT.test(text)) return fail("base_missing", `The base commit ${short} is not in ${repo} on GitHub (it may have been force-pushed away).`);
      return fail("github", `GitHub error: ${firstLine(text)}`);
    }
    const file = join(tmp, `${id}.bundle`);
    try {
      await bundleRepo(repoDir, base, file);
      await verifyBundle(file, base);
    } catch (error) {
      return fail("bundle", `Could not write the copy: ${firstLine(errorText(error))}`);
    }
    const { size } = await stat(file);
    const limit = options.sizeLimit ?? SNAPSHOT_SIZE_LIMIT;
    if (size > limit) return fail("too_large", `The copy is ${mb(size)}, over the ${mb(limit)} limit for stored copies.`);
    try {
      const answer = await options.store.upload(id, base, file);
      log(`${id}: ${answer === "uploaded" ? "stored" : "already stored"} (${mb(size)})`);
      return { instance_id: id, outcome: answer === "uploaded" ? "stored" : "already stored" };
    } catch (error) {
      return storageError(error);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** One task's copy state: true or false, or null when the store could not be asked (with the line). */
export type CopyStatus = RepoCopyTask & { stored: boolean | null; error?: string };

/** Whether each task has a copy for its current base commit, asking the store a few at a time. */
export async function copyStatus(tasks: RepoCopyTask[], store: SnapshotStore, concurrency = 8): Promise<CopyStatus[]> {
  const out: CopyStatus[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index]!;
      try {
        out[index] = { ...task, stored: await store.has(task.instance_id, task.base_commit) };
      } catch (error) {
        out[index] = { ...task, stored: null, error: `Storage error: ${firstLine(errorText(error)).replace(/^Storage:\s*/, "")}` };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return out;
}

/** At most this many copies per request from the instructor page. */
export const COPIES_PER_REQUEST = 3;

/**
 * The backfill step: the tasks with no copy for their base commit (a task whose status could not be
 * read counts as missing), less `skip` (ones that already failed in this backfill), copied one after
 * another, at most `max`. A failure does not stop the others. `remaining` is how many missing tasks
 * not skipped are left after these.
 */
export async function copyMissing(
  tasks: RepoCopyTask[], store: SnapshotStore, copy: (task: RepoCopyTask) => Promise<RepoCopyResult>,
  options: { max?: number; skip?: string[] } = {},
): Promise<{ results: RepoCopyResult[]; remaining: number }> {
  const skip = new Set(options.skip ?? []);
  const status = await copyStatus(tasks.filter((task) => !skip.has(task.instance_id)), store);
  const missing = status.filter((task) => task.stored !== true);
  const now = missing.slice(0, options.max ?? COPIES_PER_REQUEST);
  const results: RepoCopyResult[] = [];
  for (const task of now) results.push(await copyOne(task, copy));
  return { results, remaining: missing.length - now.length };
}

/** `copy` for one task; a throw (copyTaskRepo never throws, but a stand-in might) is a GitHub-or-other failure line. */
export async function copyOne(task: RepoCopyTask, copy: (task: RepoCopyTask) => Promise<RepoCopyResult>): Promise<RepoCopyResult> {
  try {
    return await copy({ instance_id: task.instance_id, repo: task.repo, base_commit: task.base_commit });
  } catch (error) {
    return { instance_id: task.instance_id, outcome: "failed", reason: "github", line: firstLine(redactToken(errorText(error))) };
  }
}
