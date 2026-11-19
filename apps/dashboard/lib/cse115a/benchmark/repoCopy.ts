// The website's copy of a benchmark task's repository (#298): the whole repo at the row's base commit,
// plus the PR's own commits (its head, its merge commit, and for a paired task the task-file PR's
// head), as a git bundle in the private bucket benchmark-snapshots, so the validator can validate a
// private repository from the copy without the course App's private key, which only the website has,
// and a task's diff can be worked out again from the copy later. The
// website writes copies, in `repo_copy` jobs on their own poller line (jobs/runner.ts, jobs/worker.ts),
// and asks whether one exists; it never downloads or serves one.
//
// Everything is the validator's own code: cloneRepo and ensureCommit (the App token, never stored in
// the remote and never in an error), bundleRepo, verifyBundle, and the SnapshotStore, which names the
// object for the base commit and never overwrites. Only the time limits are the website's: each step
// 30 seconds and the whole copy 90, with the git process group killed on a timeout. The validator's
// own batch runs keep theirs. GitHub access and the store are passed in, so tests use a local
// repository and a folder.

import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CourseRepoAccessError, githubAppConfig, repoInstallationToken } from "@/lib/cse115a/githubAppToken";
import { bundleRepo, cloneRepo, CloneError, ensureCommit, fetchRef, NO_APP_CLONE_DETAIL, redactToken, type GitAccess, type RunOptions } from "@/lib/cse115a/benchmark/validation/runRow";
import { verifyBundle } from "@/lib/cse115a/benchmark/validation/snapshots";
import { fullSnapshotObject, OBJECT_COMMIT_CHARS, SNAPSHOT_SIZE_LIMIT, type SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

/**
 * What a copy needs from a benchmark row, and from the submission snapshot's task: the PR's number and
 * merge commit, and for a task whose task file came in a separate PR, that PR's number. Those three are
 * optional; only the base commit is required.
 */
export type RepoCopyTask = {
  instance_id: string; repo: string; base_commit: string;
  pr_number?: number; merge_commit?: string; task_file_pr_number?: number;
};

export type RepoCopyFailure = "not_installed" | "base_missing" | "too_large" | "github" | "storage" | "bundle" | "timeout";

export type RepoCopyResult =
  /** `missing`: the refs a stored copy was made without, each with why (the copy is stored all the same). */
  | { instance_id: string; outcome: "stored" | "already stored"; missing?: string[] }
  | { instance_id: string; outcome: "failed"; reason: RepoCopyFailure; line: string };

/** Each step of a copy (the token request, one git command, a Storage call) is stopped after this. */
export const GIT_STEP_TIMEOUT_MS = 30_000;
/** The whole copy of one task is stopped after this. */
export const COPY_TASK_TIMEOUT_MS = 90_000;

export type RepoCopyOptions = {
  store: SnapshotStore;
  /** How the clone reaches GitHub (the validator's GitAccess); the App config and token from the environment, and runGroup, when omitted. */
  access?: GitAccess;
  log?: (line: string) => void;
  /** Where the temp folder is made (default: the system temp folder). */
  tmp?: string;
  /** Default SNAPSHOT_SIZE_LIMIT (the bucket's limit); tests make it small. */
  sizeLimit?: number;
  /** Default GIT_STEP_TIMEOUT_MS and COPY_TASK_TIMEOUT_MS; tests make them short. */
  stepTimeoutMs?: number;
  taskTimeoutMs?: number;
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

function secondsText(ms: number): string {
  return `${Number((ms / 1000).toFixed(1))} s`;
}

/** The message `run` and runGroup give a command they stopped. */
const TIMED_OUT = /timed out after \d+ ms/;

/**
 * Runs a command like the validator's `run`, but as the leader of its own process group, so a time
 * limit kills git and everything it started (git clone runs git-remote-https and index-pack as
 * children; killing only the parent can leave them on the network). Same messages as `run`.
 */
export function runGroup(cmd: string, args: string[], cwd?: string, options: RunOptions = {}): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let out = "";
    let err = "";
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      finish();
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
        settle(() => reject(new Error(`${cmd} ${args.join(" ")} timed out after ${options.timeoutMs} ms`)));
      }, options.timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => settle(() => (code === 0 ? resolvePromise(out) : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${err.trim()}`)))));
  });
}

/** A step that ran out of time; the copy's failure line names it. */
class StepTimeout extends Error {
  constructor(readonly step: string, readonly whole: boolean) {
    super(`timed out: ${step}`);
  }
}

/**
 * Copies one task's repository at its base commit into the store and logs one line with how many
 * seconds it took. Never throws: a failure is one plain line, with no token in it or in any log line.
 */
export async function copyTaskRepo(task: RepoCopyTask, options: RepoCopyOptions): Promise<RepoCopyResult> {
  const started = Date.now();
  const result = await copyOnce(task, options);
  const seconds = secondsText(Date.now() - started);
  const missing = result.outcome !== "failed" && result.missing?.length ? `; stored without ${result.missing.join("; ")}` : "";
  options.log?.(`${task.instance_id}: ${result.outcome} in ${seconds}${result.outcome === "failed" ? `: ${result.line}` : missing}`);
  return result;
}

/** A git complaint meaning the ref or commit is not on GitHub (any more). */
const NOT_ON_GITHUB = /not our ref|couldn't find remote ref|no such remote ref|unadvertised object|bad object|not a valid object|unable to find/i;

/** The refs a complete copy adds to the base commit, from the task's PR numbers and merge commit. */
type ExtraRef = { ref: string; step: string; fetch: { pull: number } | { commit: string } };

function extraRefs(task: RepoCopyTask): ExtraRef[] {
  const out: ExtraRef[] = [];
  if (task.pr_number !== undefined) out.push({ ref: "refs/hecate/pr-head", step: "fetch of the PR head", fetch: { pull: task.pr_number } });
  if (task.merge_commit !== undefined) out.push({ ref: "refs/hecate/merge", step: "fetch of the merge commit", fetch: { commit: task.merge_commit } });
  if (task.task_file_pr_number !== undefined) out.push({ ref: "refs/hecate/task-file-pr-head", step: "fetch of the task file PR's head", fetch: { pull: task.task_file_pr_number } });
  return out;
}

/**
 * The copy: asks the store first (a complete copy for this base commit already there is "already
 * stored" and nothing is cloned; an old base-only copy is not enough); then the App's installation
 * token for the repository, or an anonymous clone when the App is not installed there or not set up
 * on the site (so a public repository still works); a clone into a fresh temp folder; the base commit
 * fetched if the clone lacks it; the PR's head, its merge commit and a paired task's task-file PR head
 * fetched into refs/hecate/*; the bundle written with those refs and checked as the validator does;
 * the upload under the complete-copy name. A PR ref or merge commit GitHub no longer has is left out
 * and named in the log line; any other failure fetching one fails the copy, as for the base commit, so
 * a retry can make it whole. Each step has its own limit and the whole copy one too; a git command past
 * its limit is killed. The temp folder is removed whatever happens.
 */
async function copyOnce(task: RepoCopyTask, options: RepoCopyOptions): Promise<RepoCopyResult> {
  const { instance_id: id, repo, base_commit: base } = task;
  const stepLimit = options.stepTimeoutMs ?? GIT_STEP_TIMEOUT_MS;
  const taskLimit = options.taskTimeoutMs ?? COPY_TASK_TIMEOUT_MS;
  const deadline = Date.now() + taskLimit;
  let token: string | null = null;
  let step = "check for a stored copy";
  let timedOut: StepTimeout | null = null;
  const log = (line: string) => options.log?.(redactToken(line, token));
  const fail = (reason: RepoCopyFailure, line: string): RepoCopyResult => ({ instance_id: id, outcome: "failed", reason, line: redactToken(line, token).slice(0, 500) });
  const timeoutLine = (t: StepTimeout) => fail("timeout", t.whole
    ? `Timed out: the copy took longer than ${secondsText(taskLimit)} (during the ${t.step}).`
    : `Timed out: the ${t.step} took longer than ${secondsText(stepLimit)}.`);
  const storageError = (error: unknown) => fail("storage", `Storage error: ${firstLine(errorText(error)).replace(/^Storage:\s*/, "")}`);

  /** The limit for the next step: the step's own, or what is left of the copy's, whichever is less. */
  const limit = () => {
    const left = deadline - Date.now();
    return left < stepLimit ? { ms: Math.max(left, 1), whole: true } : { ms: stepLimit, whole: false };
  };
  /** A promise that loses to the step's limit. What it was doing is abandoned, not cancelled (Storage and fetch calls). */
  const within = async <T>(work: Promise<T>): Promise<T> => {
    const { ms, whole } = limit();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StepTimeout(step, whole)), ms); })]);
    } finally {
      clearTimeout(timer);
    }
  };

  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) return fail("github", `GitHub error: "${repo}" is not an owner/name repository`);
  if (!/^[0-9a-f]{40,64}$/i.test(base)) return fail("base_missing", `The base commit "${base}" is not a full commit id.`);

  try {
    if (await within(options.store.has(id, base, "full"))) return { instance_id: id, outcome: "already stored" };
  } catch (error) {
    return error instanceof StepTimeout ? timeoutLine(error) : storageError(error);
  }

  const access = options.access ?? {};
  const exec = access.git ?? runGroup;
  // Every git command runs under the step's limit; a command stopped there is remembered, so the
  // failure names the step instead of git's (redacted) command line.
  const timed = (cmd: string, args: string[], cwd?: string, runOptions: RunOptions = {}) => {
    const { ms, whole } = limit();
    return exec(cmd, args, cwd, { ...runOptions, timeoutMs: ms }).catch((error: unknown) => {
      if (TIMED_OUT.test(errorText(error))) timedOut ??= new StepTimeout(step, whole);
      throw error;
    });
  };
  const config = (access.config ?? githubAppConfig)();
  let cloneAccess: GitAccess = { ...access, git: timed, config: () => null };
  if (config) {
    step = "course App token request";
    try {
      const fetchWithLimit: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(limit().ms) });
      token = await within((access.token ?? ((o, n, c) => repoInstallationToken(o, n, c, fetchWithLimit)))(owner, name, config));
      const issued = token;
      cloneAccess = { ...access, git: timed, config: () => config, token: async () => issued };
    } catch (error) {
      if (error instanceof StepTimeout) return timeoutLine(error);
      if (!(error instanceof CourseRepoAccessError && error.code === "github_app_not_installed")) {
        return fail("github", `GitHub error: could not get the course App token: ${firstLine(errorText(error))}`);
      }
      log(`The course App is not installed on ${repo}; trying an anonymous clone.`);
    }
  }

  const tmp = await mkdtemp(join(options.tmp ?? tmpdir(), "hecate-repo-copy-"));
  try {
    const repoDir = join(tmp, "repo");
    step = "clone";
    try {
      await cloneRepo(repo, repoDir, log, cloneAccess);
    } catch (error) {
      if (timedOut) return timeoutLine(timedOut);
      if (error instanceof CloneError && error.message === NO_APP_CLONE_DETAIL) {
        return fail("not_installed", config
          ? `${repo} is private (or gone) and the course GitHub App is not installed on it. Install the App on the repository, then retry.`
          : `${repo} is private (or gone) and the course GitHub App is not set up on this site.`);
      }
      return fail("github", `GitHub error: ${firstLine(errorText(error))}`);
    }
    step = "fetch of the base commit";
    try {
      await ensureCommit(repoDir, base, log, repo, cloneAccess);
    } catch (error) {
      if (timedOut) return timeoutLine(timedOut);
      const text = redactToken(errorText(error), token);
      if (NOT_ON_GITHUB.test(text)) {
        return fail("base_missing", `The base commit ${base.slice(0, OBJECT_COMMIT_CHARS)} is not in ${repo} on GitHub (it may have been force-pushed away).`);
      }
      return fail("github", `GitHub error: ${firstLine(text)}`);
    }
    const fetched: string[] = [];
    const missing: string[] = [];
    for (const extra of extraRefs(task)) {
      step = extra.step;
      const remote = "pull" in extra.fetch ? `refs/pull/${extra.fetch.pull}/head` : extra.fetch.commit;
      if ("pull" in extra.fetch ? !(Number.isInteger(extra.fetch.pull) && extra.fetch.pull > 0) : !/^[0-9a-f]{40,64}$/i.test(extra.fetch.commit)) {
        missing.push(`${extra.ref} (${JSON.stringify(String(remote))} is not a ${"pull" in extra.fetch ? "PR number" : "full commit id"})`);
        continue;
      }
      try {
        if ("pull" in extra.fetch) {
          await fetchRef(repoDir, repo, remote, extra.ref, log, cloneAccess);
        } else {
          await ensureCommit(repoDir, remote, log, repo, cloneAccess);
          await timed("git", ["update-ref", extra.ref, remote], repoDir);
        }
        fetched.push(extra.ref);
      } catch (error) {
        if (timedOut) return timeoutLine(timedOut);
        const text = redactToken(errorText(error), token);
        if (!NOT_ON_GITHUB.test(text)) return fail("github", `GitHub error: ${firstLine(text)}`);
        const what = "pull" in extra.fetch ? `${remote} is` : `the merge commit ${remote.slice(0, OBJECT_COMMIT_CHARS)} is`;
        missing.push(`${extra.ref} (${what} not on GitHub)`);
      }
    }
    const file = join(tmp, `${id}.bundle`);
    try {
      step = "bundle";
      await bundleRepo(repoDir, base, file, timed, fetched);
      step = "bundle check";
      await verifyBundle(file, base, timed);
    } catch (error) {
      if (timedOut) return timeoutLine(timedOut);
      return fail("bundle", `Could not write the copy: ${firstLine(errorText(error))}`);
    }
    const { size } = await stat(file);
    const sizeLimit = options.sizeLimit ?? SNAPSHOT_SIZE_LIMIT;
    if (size > sizeLimit) return fail("too_large", `The copy is ${mb(size)}, over the ${mb(sizeLimit)} limit for stored copies.`);
    step = "upload";
    try {
      const answer = await within(options.store.upload(id, base, file, "full"));
      return { instance_id: id, outcome: answer === "uploaded" ? "stored" : "already stored", ...(missing.length ? { missing } : {}) };
    } catch (error) {
      return error instanceof StepTimeout ? timeoutLine(error) : storageError(error);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** One task's copy state: true or false, or null when the store could not be asked (with the line). */
export type CopyStatus = RepoCopyTask & { stored: boolean | null; error?: string };

/**
 * Whether each task has a complete copy for its current base commit (an old base-only copy does not
 * count), from one listing of the bucket rather than a request per task. When the listing fails,
 * every task is null with the one error line.
 */
export async function copyStatus(tasks: RepoCopyTask[], store: SnapshotStore): Promise<CopyStatus[]> {
  let names: Set<string>;
  try {
    names = await store.list();
  } catch (error) {
    const line = `Storage error: ${firstLine(errorText(error)).replace(/^Storage:\s*/, "")}`;
    return tasks.map((task) => ({ ...task, stored: null, error: line }));
  }
  return tasks.map((task) => {
    try {
      return { ...task, stored: names.has(fullSnapshotObject(task.instance_id, task.base_commit)) };
    } catch (error) {
      return { ...task, stored: null, error: firstLine(errorText(error)) };
    }
  });
}
