// Runs the validator for one row on this machine: git plumbing (clone, fetch, worktrees), environment
// detection on the patched tree, the modified-test set, and the Docker runs. Shared by the one-row
// script and the batch script. Needs git and Docker; a private repository needs GITHUB_APP_ID,
// GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY so the course App's installation token can be used.
// Writes nothing to Supabase.

import { RUNS_PER_STATE } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signals, type Signals } from "@/lib/cse115a/benchmark/validation/census";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";
import { DockerSuiteRunner, type SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { filesInPatch, modifiedAcrossFiles, unsupportedResult, validateTask, withRebuild, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { CourseRepoAccessError, githubAppConfig, repoInstallationToken, type GitHubAppConfig } from "@/lib/cse115a/githubAppToken";

export type RunOptions = {
  /** The child's environment (default: this process's). */
  env?: NodeJS.ProcessEnv;
  /** Kill the command and reject after this many milliseconds. */
  timeoutMs?: number;
};

/** Runs a command, returns stdout, throws on a non-zero exit with stderr in the message. */
export function run(cmd: string, args: string[], cwd?: string, options: RunOptions = {}): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = options.timeoutMs
      ? setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} ${args.join(" ")} timed out after ${options.timeoutMs} ms`)); }, options.timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
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

/** The detail of a row whose clone or base-commit fetch GitHub refused, when the course App is not configured. */
export const NO_APP_CLONE_DETAIL =
  "clone failed: repository not found or private; set GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY to clone private repositories";

/** The same with the App configured: the token was used and GitHub still refused. */
export function appCloneDetail(fullName: string): string {
  return `clone failed with the course App token: is the App installed on ${fullName}?`;
}

/** A clone or base-commit fetch that failed; the message is the row's `detail` and never holds a token. */
export class CloneError extends Error {}

/**
 * Whether git's output says GitHub refused access: a private or missing repository answers an
 * anonymous request with "Repository not found" or a credentials prompt (which GIT_TERMINAL_PROMPT=0
 * turns into "could not read Username … terminal prompts disabled"), a bad token with 401/403.
 * Network, disk and missing-commit failures do not match.
 */
export function isAccessError(message: string): boolean {
  return /repository not found|repository '[^']*' not found|could not read (username|password)|terminal prompts disabled|authentication failed|invalid username or password|returned error: 40[134]|permission to .* denied/i.test(message);
}

/** `text` with the token, and any credentials in a URL, replaced by `***`. */
export function redactToken(text: string, token?: string | null): string {
  const masked = token ? text.split(token).join("***") : text;
  return masked.replace(/(https?:\/\/)[^/@\s]+@/g, "$1***@");
}

/** git with no credential prompt and no credential helper: only the URL's own credentials, never the user's keychain. */
const GIT_NO_PROMPT = ["-c", "credential.helper="];
const noPromptEnv = (): NodeJS.ProcessEnv => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });

/** How the clone reaches GitHub; tests hand in fakes. */
export type GitAccess = {
  config?: () => GitHubAppConfig | null;
  token?: (owner: string, name: string, config: GitHubAppConfig) => Promise<string>;
  git?: typeof run;
};

/** The App token for `owner/name`, or null without App config. A failure becomes a CloneError. */
async function appToken(fullName: string, access: GitAccess): Promise<{ configured: boolean; token: string | null }> {
  const config = (access.config ?? githubAppConfig)();
  if (!config) return { configured: false, token: null };
  const [owner, name] = fullName.split("/");
  try {
    return { configured: true, token: await (access.token ?? repoInstallationToken)(owner, name, config) };
  } catch (error) {
    if (error instanceof CourseRepoAccessError && error.code === "github_app_not_installed") throw new CloneError(appCloneDetail(fullName));
    throw new CloneError(`clone failed: could not get the course App token for ${fullName}: ${firstLine(redactToken(errorText(error)))}`);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find(Boolean) ?? text;
}

/** The CloneError for a failed git command: the access messages when GitHub refused, else git's first line. */
function gitFailure(error: unknown, what: string, fullName: string, configured: boolean, token: string | null): CloneError {
  const message = redactToken(errorText(error), token);
  if (isAccessError(message)) return new CloneError(configured ? appCloneDetail(fullName) : NO_APP_CLONE_DETAIL);
  // The first line is the command itself; git's own complaint is on the lines after it.
  const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
  return new CloneError(`${what} failed: ${lines.slice(1).join("; ") || lines[0] || "unknown error"}`.slice(0, 2000));
}

const githubUrl = (fullName: string, token: string | null) =>
  token ? `https://x-access-token:${token}@github.com/${fullName}.git` : `https://github.com/${fullName}.git`;

/**
 * Clones `owner/name` into `dir` (a fresh temp folder when omitted). Uses the course App's installation
 * token when the App is configured, otherwise an anonymous clone; the token never stays in the remote
 * URL and never appears in an error. A failure throws a CloneError whose message is the row's detail.
 */
export async function cloneRepo(fullName: string, dir?: string, log: (line: string) => void = () => {}, access: GitAccess = {}): Promise<string> {
  const git = access.git ?? run;
  const { configured, token } = await appToken(fullName, access);
  const target = dir ?? (await mkdtemp(join(tmpdir(), "hecate-repo-")));
  if (dir) await mkdir(dir, { recursive: true });
  log(`Cloning ${fullName}${token ? " with the course App token" : ""}...`);
  try {
    await git("git", [...GIT_NO_PROMPT, "clone", "--quiet", githubUrl(fullName, token), target], undefined, { env: noPromptEnv() });
  } catch (error) {
    throw gitFailure(error, "clone", fullName, configured, token);
  }
  await git("git", ["remote", "set-url", "origin", githubUrl(fullName, null)], target);
  return target;
}

/** Repository-relative paths of the GitHub workflow files in a checkout (`.github/workflows/*.yml|yaml`). */
export async function workflowFiles(dir: string): Promise<string[]> {
  const names = (await run("git", ["ls-files", ".github/workflows"], dir).catch(() => "")).split("\n");
  return names.filter((n) => /\.ya?ml$/.test(n));
}

/**
 * Fetches `commit` unless the clone already has it. With `fullName`, the fetch goes to GitHub the way
 * cloneRepo does (the App token when configured, never stored in the remote) and a failure throws a
 * CloneError; without it, from origin as configured.
 */
export async function ensureCommit(repoDir: string, commit: string, log: (line: string) => void = () => {}, fullName?: string, access: GitAccess = {}): Promise<void> {
  const git = access.git ?? run;
  try {
    await git("git", ["cat-file", "-e", `${commit}^{commit}`], repoDir);
    return;
  } catch {
    // not here yet
  }
  log(`Fetching ${commit}...`);
  if (!fullName) {
    await git("git", ["fetch", "--quiet", "origin", commit], repoDir);
    return;
  }
  const { configured, token } = await appToken(fullName, access);
  try {
    await git("git", [...GIT_NO_PROMPT, "fetch", "--quiet", githubUrl(fullName, token), commit], repoDir, { env: noPromptEnv() });
  } catch (error) {
    throw gitFailure(error, `fetch of ${commit}`, fullName, configured, token);
  }
}

/**
 * Whether GitHub serves `owner/name` to anyone: an anonymous `git ls-remote` with no credentials.
 * True when it succeeds, false when GitHub refuses (private or gone), undefined when the check itself
 * failed for another reason (network, timeout), which is logged and never fails the row.
 */
export async function repoIsPublic(fullName: string, options: { git?: typeof run; log?: (line: string) => void; timeoutMs?: number } = {}): Promise<boolean | undefined> {
  const git = options.git ?? run;
  try {
    await git("git", [...GIT_NO_PROMPT, "ls-remote", githubUrl(fullName, null), "HEAD"], undefined, { env: noPromptEnv(), timeoutMs: options.timeoutMs ?? 20_000 });
    return true;
  } catch (error) {
    const message = redactToken(errorText(error));
    if (isAccessError(message)) return false;
    options.log?.(`  could not check whether ${fullName} is public (repo_public left unset): ${firstLine(message.split("\n").slice(1).join("\n") || message)}`);
    return undefined;
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
    return out && out !== "<no value>" ? pinnedImage(image, out) : null;
  } catch {
    return null;
  }
}

/**
 * `node:24-bookworm` + `node@sha256:abc` → `node:24-bookworm@sha256:abc`. Docker's RepoDigests drop the
 * tag; keeping it lets a reader see the Node major without resolving the digest, and Docker accepts the
 * combined form (the digest wins when pulling). An image already given by digest is returned as is.
 */
export function pinnedImage(image: string, repoDigest: string): string {
  const at = repoDigest.indexOf("@");
  if (at < 0) return repoDigest;
  if (image.includes("@")) return image;
  return image + repoDigest.slice(at);
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
  /** Runs the suites; Docker (logs in `logDir`) when omitted. Tests hand in a fake. */
  runner?: SuiteRunner;
};

/**
 * Detects the environment on base + both patches, computes the modified-test set, runs the three
 * states in Docker, and returns the result record. Resets the checkout afterwards.
 */
export async function validateRow(options: ValidateRowOptions): Promise<ValidationResult> {
  return withRebuild(await validateRowResult(options), options.row);
}

async function validateRowResult(options: ValidateRowOptions): Promise<ValidationResult> {
  const { row, repoDir } = options;
  const log = options.log ?? (() => {});
  try {
    const testFiles = filesInPatch(row.test_patch);
    // The environment comes from the finished tree: the student's test script and dependencies
    // usually arrive with the fix, since package.json is not a test file.
    const { env, needs } = await withPatchedWorktree(repoDir, row.base_commit, [row.test_patch, row.patch], async (dir) => {
      const workflowNames = await workflowFiles(dir);
      const env = await detectEnvironment({ testFiles, read: (path) => fileIn(dir, path), workflowFiles: workflowNames });
      const packageDir = env.supported ? env.packageDir : "";
      const needs: Signals = signals({
        packageJson: await fileIn(dir, packageDir ? `${packageDir}/package.json` : "package.json"),
        workflows: (await Promise.all(workflowNames.map((n) => fileIn(dir, n)))).join("\n"),
        testSources: (await Promise.all(testFiles.map((f) => fileIn(dir, f)))).join("\n"),
      });
      return { env, needs };
    });
    if (!env.supported) return { ...unsupportedResult(row, env), signals: needs };

    const baseSources = new Map<string, string | null>();
    for (const file of testFiles) baseSources.set(file, await fileAt(repoDir, row.base_commit, file));
    const patched = await withPatchedWorktree(repoDir, row.base_commit, [row.test_patch], async (dir) => {
      const sources = new Map<string, string | null>();
      for (const file of testFiles) sources.set(file, await fileIn(dir, file));
      return sources;
    });
    const modified = modifiedAcrossFiles(testFiles, baseSources, patched);

    await mkdir(options.logDir, { recursive: true });
    const db = env.services?.length ? `, with ${env.services.map((s) => s.image).join(", ")} from CI` : "";
    const installs = env.installSteps?.length ? `, installs in ${env.installSteps.map((s) => s.dir || ".").join(", ")} (from CI)` : "";
    log(`Environment: ${env.packageManager} + ${env.runners.join("+")} in ${env.packageDir || "."}, image ${env.image}${env.nodeSource && env.nodeSource !== "default" ? ` (from ${env.nodeSource})` : ""}${installs}${db}. Running three states, ${RUNS_PER_STATE} times each; logs in ${options.logDir}`);
    const { runs, ...result } = await validateTask({
      row, repoDir, env, modified, runner: options.runner ?? new DockerSuiteRunner(options.logDir, options.cacheDir), timeoutSeconds: options.timeoutSeconds,
      // The R2 tree, checked out fresh (the container runs leave repoDir with installs and reports in it).
      withPostFixTree: (fn) => withPatchedWorktree(repoDir, row.base_commit, [row.test_patch, row.patch], (dir) => fn((path) => fileIn(dir, path))),
    });
    void runs;
    result.signals = needs;
    // A row that proved nothing in a repository whose tests want a service it did not get: say so, instead of a bare reason.
    if (result.validation_status === "rejected" && result.reason === "no_fail_to_pass" && needs.database.length > 0 && !env.services?.length) {
      const note = `no test passed in any state and the tests appear to need a database (${needs.database.join(", ")}); the repository's CI has no postgres service the validator could start`;
      result.detail = result.detail ? `${result.detail}; ${note}` : note;
    }
    return result;
  } finally {
    await resetCheckout(repoDir, row.base_commit).catch(() => undefined);
  }
}
