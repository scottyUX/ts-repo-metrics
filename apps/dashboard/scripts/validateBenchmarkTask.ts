// Validates one benchmark row in Docker and prints the result as JSON. Dry run: it writes
// nothing to Supabase. Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkTask.ts ROW.json [--repo-dir DIR] [--out RESULT.json] [--timeout SECONDS]
//
// ROW.json holds the row's instance_id, repo, base_commit, patch, test_patch, FAIL_TO_PASS and
// PASS_TO_PASS. Without --repo-dir the repository is cloned into a temp folder; a private
// repository needs GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY in the environment
// so the course App's installation token can be used. Docker must be running.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectEnvironment, type RepoFiles } from "@/lib/cse115a/benchmark/validation/environment";
import { DockerSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { filesInPatch, modifiedAcrossFiles, unsupportedResult, validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";
import { githubAppConfig, repoInstallationToken } from "@/lib/cse115a/githubAppToken";

const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"] as const;

function parseArgs(argv: string[]) {
  const args = { rowPath: "", repoDir: "", out: "", timeoutSeconds: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo-dir") args.repoDir = argv[++i] ?? "";
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--timeout") args.timeoutSeconds = Number(argv[++i]);
    else if (!args.rowPath) args.rowPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowPath) throw new Error("Usage: validateBenchmarkTask.ts ROW.json [--repo-dir DIR] [--out RESULT.json] [--timeout SECONDS]");
  return args;
}

/** Runs a command, returns stdout, throws on a non-zero exit. */
function run(cmd: string, args: string[], cwd?: string): Promise<string> {
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

/** File contents at a commit, or null when the path does not exist there. */
async function fileAt(repoDir: string, commit: string, path: string): Promise<string | null> {
  try {
    return await run("git", ["show", `${commit}:${path}`], repoDir);
  } catch {
    return null;
  }
}

async function cloneRepo(fullName: string): Promise<string> {
  const [owner, name] = fullName.split("/");
  const config = githubAppConfig();
  const token = config ? await repoInstallationToken(owner, name, config) : null;
  const url = token ? `https://x-access-token:${token}@github.com/${fullName}.git` : `https://github.com/${fullName}.git`;
  const dir = await mkdtemp(join(tmpdir(), "hecate-repo-"));
  console.error(`Cloning ${fullName}${token ? " with the course App token" : ""}...`);
  await run("git", ["clone", "--quiet", url, dir]);
  // Drop the token from the remote so it never lands in the mounted checkout.
  await run("git", ["remote", "set-url", "origin", `https://github.com/${fullName}.git`], dir);
  return dir;
}

async function ensureCommit(repoDir: string, commit: string): Promise<void> {
  try {
    await run("git", ["cat-file", "-e", `${commit}^{commit}`], repoDir);
  } catch {
    console.error(`Fetching ${commit}...`);
    await run("git", ["fetch", "--quiet", "origin", commit], repoDir);
  }
}

/** The test files as they are at base + test_patch, read from a throwaway worktree. */
async function patchedSources(repoDir: string, base: string, testPatch: string, files: string[]): Promise<Map<string, string | null>> {
  const worktree = await mkdtemp(join(tmpdir(), "hecate-patched-"));
  const patchFile = join(worktree, "..", `hecate-test-${Date.now()}.diff`);
  const sources = new Map<string, string | null>();
  try {
    await run("git", ["worktree", "add", "--detach", "--quiet", worktree, base], repoDir);
    await writeFile(patchFile, testPatch);
    await run("git", ["apply", "--whitespace=nowarn", patchFile], worktree);
    for (const file of files) {
      try {
        sources.set(file, await readFile(join(worktree, file), "utf8"));
      } catch {
        sources.set(file, null);
      }
    }
  } finally {
    await run("git", ["worktree", "remove", "--force", worktree], repoDir).catch(() => rm(worktree, { recursive: true, force: true }));
    await rm(patchFile, { force: true });
  }
  return sources;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const row = JSON.parse(await readFile(args.rowPath, "utf8")) as TaskRow;
  for (const key of ["instance_id", "repo", "base_commit", "patch", "test_patch"] as const) {
    if (typeof row[key] !== "string") throw new Error(`Row is missing "${key}"`);
  }
  row.FAIL_TO_PASS ??= [];
  row.PASS_TO_PASS ??= [];

  const cloned = !args.repoDir;
  const repoDir = cloned ? await cloneRepo(row.repo) : resolve(args.repoDir);
  await ensureCommit(repoDir, row.base_commit);
  try {
    await validate(args, row, repoDir);
  } finally {
    // The last container run leaves the checkout at base + both patches. Put it back, or drop the clone.
    if (cloned) await rm(repoDir, { recursive: true, force: true });
    else await run("git", ["checkout", "-q", "-f", row.base_commit], repoDir).then(() => run("git", ["clean", "-fdq"], repoDir)).catch(() => undefined);
  }
}

async function validate(args: ReturnType<typeof parseArgs>, row: TaskRow, repoDir: string) {
  const files: RepoFiles = { packageJson: await fileAt(repoDir, row.base_commit, "package.json"), lockfiles: [] };
  for (const lock of LOCKFILES) {
    if ((await fileAt(repoDir, row.base_commit, lock)) !== null) files.lockfiles.push(lock);
  }
  const env = detectEnvironment(files);

  let result;
  if (!env.supported) {
    result = unsupportedResult(row, env);
  } else {
    const testFiles = filesInPatch(row.test_patch);
    const baseSources = new Map<string, string | null>();
    for (const file of testFiles) baseSources.set(file, await fileAt(repoDir, row.base_commit, file));
    const patched = await patchedSources(repoDir, row.base_commit, row.test_patch, testFiles);
    const modified = modifiedAcrossFiles(testFiles, baseSources, patched);
    console.error(`Environment: ${env.packageManager} + vitest in ${env.image}. Running three states, twice each...`);
    const { runs, ...rest } = await validateTask({ row, repoDir, env, modified, runner: new DockerSuiteRunner(), timeoutSeconds: args.timeoutSeconds });
    void runs;
    result = rest;
  }

  const json = JSON.stringify(result, null, 2);
  if (args.out) await writeFile(args.out, json + "\n");
  console.log(json);
  console.error(`${result.validation_status}${result.reason ? ` (${result.reason})` : ""} — dry run, nothing written to the database.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
