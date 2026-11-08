// Runs the validator for one row on this machine: git plumbing (clone, fetch, worktrees), environment
// detection on the patched tree, the modified-test set, and the Docker runs. Shared by the one-row
// script and the batch script. Needs git and Docker; a private repository needs GITHUB_APP_ID,
// GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY so the course App's installation token can be used.
// Writes nothing to Supabase.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";
import { DockerSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { filesInPatch, modifiedAcrossFiles, unsupportedResult, validateTask, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { githubAppConfig, repoInstallationToken } from "@/lib/cse115a/githubAppToken";

/** Runs a command, returns stdout, throws on a non-zero exit with stderr in the message. */
export function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${err.trim()}`));
    });
  });
}

/** Throws unless the row has the five fields the validator reads; fills the two lists. */
export function assertRow(row: Partial<TaskRow>): asserts row is TaskRow {
  for (const key of ["instance_id", "repo", "base_commit", "patch", "test_patch"] as const) {
    if (typeof row[key] !== "string") throw new Error(`Row is missing "${key}"`);
  }
  row.FAIL_TO_PASS ??= [];
  row.PASS_TO_PASS ??= [];
}

/** File contents at a commit, or null when the path does not exist there. */
export async function fileAt(repoDir: string, commit: string, path: string): Promise<string | null> {
  try {
    return await run("git", ["show", `${commit}:${path}`], repoDir);
  } catch {
    return null;
  }
}

/** Reads a file under `dir`, or null when it does not exist. */
export async function fileIn(dir: string, path: string): Promise<string | null> {
  try {
    return await readFile(join(dir, path), "utf8");
  } catch {
    return null;
  }
}

/**
 * Clones `owner/name` into `dir` (a fresh temp folder when omitted). Uses the course App's installation
 * token when the App is configured, otherwise an anonymous clone; the token never stays in the remote URL.
 */
export async function cloneRepo(fullName: string, dir?: string, log: (line: string) => void = () => {}): Promise<string> {
  const [owner, name] = fullName.split("/");
  const config = githubAppConfig();
  const token = config ? await repoInstallationToken(owner, name, config) : null;
  const url = token ? `https://x-access-token:${token}@github.com/${fullName}.git` : `https://github.com/${fullName}.git`;
  const target = dir ?? (await mkdtemp(join(tmpdir(), "hecate-repo-")));
  if (dir) await mkdir(dir, { recursive: true });
  log(`Cloning ${fullName}${token ? " with the course App token" : ""}...`);
  await run("git", ["clone", "--quiet", url, target]);
  await run("git", ["remote", "set-url", "origin", `https://github.com/${fullName}.git`], target);
  return target;
}

/** Fetches `commit` from origin unless the clone already has it. */
export async function ensureCommit(repoDir: string, commit: string, log: (line: string) => void = () => {}): Promise<void> {
  try {
    await run("git", ["cat-file", "-e", `${commit}^{commit}`], repoDir);
  } catch {
    log(`Fetching ${commit}...`);
    await run("git", ["fetch", "--quiet", "origin", commit], repoDir);
  }
}

/** Puts a checkout back at `base` with no stray files (the last container run leaves it at R2). */
export async function resetCheckout(repoDir: string, base: string): Promise<void> {
  await run("git", ["checkout", "-q", "-f", base], repoDir);
  await run("git", ["clean", "-fdq"], repoDir);
}

/** Runs `fn` with a throwaway worktree at `base` plus the given patches applied in order. */
export async function withPatchedWorktree<T>(repoDir: string, base: string, patches: string[], fn: (dir: string) => Promise<T>): Promise<T> {
  const worktree = await mkdtemp(join(tmpdir(), "hecate-patched-"));
  const patchFile = join(tmpdir(), `hecate-patch-${process.pid}-${Date.now()}.diff`);
  try {
    await run("git", ["worktree", "add", "--detach", "--quiet", worktree, base], repoDir);
    for (const patch of patches) {
      if (!patch.trim()) continue;
      await writeFile(patchFile, patch);
      await run("git", ["apply", "--whitespace=nowarn", patchFile], worktree);
    }
    return await fn(worktree);
  } finally {
    await run("git", ["worktree", "remove", "--force", worktree], repoDir).catch(() => rm(worktree, { recursive: true, force: true }));
    await rm(patchFile, { force: true });
  }
}

/** `node:24-bookworm@sha256:…` for a pulled image, or null if Docker cannot say. */
export async function imageDigest(image: string): Promise<string | null> {
  try {
    const out = (await run("docker", ["inspect", "--format", "{{index .RepoDigests 0}}", image])).trim();
    return out && out !== "<no value>" ? out : null;
  } catch {
    return null;
  }
}

/**
 * Writes a git bundle holding every commit reachable from `base`: the repository snapshot for a row.
 * Bundles record refs, not bare hashes, so the commit gets a temporary branch for the duration;
 * a branch (not a custom ref) so that `git clone <bundle>` checks the snapshot out.
 */
export async function bundleRepo(repoDir: string, base: string, outFile: string): Promise<void> {
  const ref = "refs/heads/hecate-snapshot";
  await mkdir(join(outFile, ".."), { recursive: true });
  await run("git", ["update-ref", ref, base], repoDir);
  try {
    await run("git", ["bundle", "create", outFile, ref], repoDir);
  } finally {
    await run("git", ["update-ref", "-d", ref], repoDir).catch(() => undefined);
  }
}

export type ValidateRowOptions = {
  row: TaskRow;
  /** A clone that already has `row.base_commit`. Left at base when done. */
  repoDir: string;
  /** One log per container run lands here. */
  logDir: string;
  /** Host folder mounted into every container as the shared package cache (see PACKAGE_CACHE_ENV). */
  cacheDir?: string;
  timeoutSeconds?: number;
  log?: (line: string) => void;
};

/**
 * Detects the environment on base + both patches, computes the modified-test set, runs the three
 * states in Docker, and returns the result record. Resets the checkout afterwards.
 */
export async function validateRow(options: ValidateRowOptions): Promise<ValidationResult> {
  const { row, repoDir } = options;
  const log = options.log ?? (() => {});
  try {
    const testFiles = filesInPatch(row.test_patch);
    // The environment comes from the finished tree: the student's test script and dependencies
    // usually arrive with the fix, since package.json is not a test file.
    const env = await withPatchedWorktree(repoDir, row.base_commit, [row.test_patch, row.patch], (dir) =>
      detectEnvironment({ testFiles, read: (path) => fileIn(dir, path) }));
    if (!env.supported) return unsupportedResult(row, env);

    const baseSources = new Map<string, string | null>();
    for (const file of testFiles) baseSources.set(file, await fileAt(repoDir, row.base_commit, file));
    const patched = await withPatchedWorktree(repoDir, row.base_commit, [row.test_patch], async (dir) => {
      const sources = new Map<string, string | null>();
      for (const file of testFiles) sources.set(file, await fileIn(dir, file));
      return sources;
    });
    const modified = modifiedAcrossFiles(testFiles, baseSources, patched);

    await mkdir(options.logDir, { recursive: true });
    log(`Environment: ${env.packageManager} + ${env.runners.join("+")} in ${env.packageDir || "."}, image ${env.image}. Running three states, twice each; logs in ${options.logDir}`);
    const { runs, ...result } = await validateTask({ row, repoDir, env, modified, runner: new DockerSuiteRunner(options.logDir, options.cacheDir), timeoutSeconds: options.timeoutSeconds });
    void runs;
    return result;
  } finally {
    await resetCheckout(repoDir, row.base_commit).catch(() => undefined);
  }
}
