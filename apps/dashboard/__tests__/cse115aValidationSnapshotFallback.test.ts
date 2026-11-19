// Item E (#298): a normal batch run validates from the row's snapshot bundle when GitHub cannot
// supply the repository or base_commit. Real git (a local repository stands in for github.com), a
// fake suite runner instead of Docker.
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rejectedWithoutRun, summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { batchRun, validateBatchRow, type BatchRun } from "@/lib/cse115a/benchmark/validation/batchRun";
import type { RunResults } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { bundleRepo, CloneError, NO_APP_CLONE_DETAIL, run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { RunPlan, State, SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { snapshotPath, type BatchGit } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
const TOKEN = "ghs_SECRETTOKEN123";
let scratch = "";
/** Stands in for github.com: `<github>/team/app.git`. */
let github = "";
let base = "";
let row: TaskRow;
/** The row's bundle, written once from the stand-in at base_commit. */
let bundle = "";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-fallback-test-"));
  github = join(scratch, "github");
  const repo = join(github, "team", "app.git");
  await mkdir(join(repo, "src"), { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "app", scripts: { test: "vitest run" }, devDependencies: { vitest: "^3.0.0" } }, null, 2) + "\n",
    "package-lock.json": "{}\n",
    // The fake runner reads this from the checkout, so the lists depend on the files it was given.
    "src/name.txt": "adds\n",
    "src/a.ts": "export const add = (a: number, b: number) => a - b;\n",
    "src/b.test.ts": "import { it } from \"vitest\";\nit(\"keeps\", () => {});\n",
  };
  for (const [path, text] of Object.entries(files)) await writeFile(join(repo, path), text);
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  // The student's work, as two diffs against base (the row's test_patch and patch).
  await writeFile(join(repo, "src/a.test.ts"), "import { it, expect } from \"vitest\";\nimport { add } from \"./a\";\nit(\"adds\", () => { expect(add(1, 2)).toBe(3); });\n");
  await run("git", ["add", "src/a.test.ts"], repo);
  const testPatch = await run("git", ["diff", "--cached", base], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "test"], repo);
  await writeFile(join(repo, "src/a.ts"), "export const add = (a: number, b: number) => a + b;\n");
  const patch = await run("git", ["diff", "HEAD"], repo);
  await run("git", ["checkout", "-q", "-f", base], repo);
  row = { instance_id: "team__app-T-1", repo: "team/app", base_commit: base, patch, test_patch: testPatch, FAIL_TO_PASS: ["src/a.test.ts::adds"], PASS_TO_PASS: [] };
  bundle = join(scratch, "row.bundle");
  await bundleRepo(repo, base, bundle);
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

/**
 * Stands in for Docker: requires base_commit in the checkout and takes the proving test's name from
 * `src/name.txt` there. r1 fails it, r2 passes it; `src/b.test.ts::keeps` passes throughout.
 */
class CheckoutRunner implements SuiteRunner {
  repoDirs = new Set<string>();
  async runSuite(plan: RunPlan, state: State): Promise<RunResults> {
    this.repoDirs.add(plan.repoDir);
    const name = (await run("git", ["show", `${plan.baseCommit}:src/name.txt`], plan.repoDir)).trim();
    const keeps = { "src/b.test.ts::keeps": "passed" as const };
    if (state === "r0") return keeps;
    return { ...keeps, [`src/a.test.ts::${name}`]: state === "r1" ? "failed" : "passed" };
  }
}

const cloneFromStandIn: BatchGit["clone"] = async (fullName, dir) => { await run("git", ["clone", "-q", join(github, `${fullName}.git`), dir]); };
/** GitHub refusing the clone, with a message that carries a token (as a raw git error could). */
const refusedClone: BatchGit["clone"] = async (fullName) => {
  throw new Error(`git clone --quiet https://x-access-token:${TOKEN}@github.com/${fullName}.git exited 128\nfatal: unable to access 'https://x-access-token:${TOKEN}@github.com/${fullName}.git/': Could not resolve host: github.com`);
};

function context(out: string, git: BatchGit, runner: SuiteRunner, snapshotsFrom?: string): BatchRun {
  return batchRun({ out, snapshots: false, snapshotsFrom, timeoutSeconds: 60, log: () => {}, git, runner, imageDigest: async () => null, repoIsPublic: async () => true });
}

async function freshOut(withBundle: boolean): Promise<string> {
  const out = await mkdtemp(join(scratch, "out-"));
  if (withBundle) {
    await mkdir(join(out, "snapshots"), { recursive: true });
    await run("cp", [bundle, join(out, snapshotPath(row.instance_id))]);
  }
  return out;
}

/** What a verdict is made of: everything but timings and where the code came from. */
function lists(r: ValidationResult) {
  return {
    status: r.validation_status, reason: r.reason, FAIL_TO_PASS: r.FAIL_TO_PASS, ABSENT_TO_PASS: r.ABSENT_TO_PASS, PASS_TO_PASS: r.PASS_TO_PASS,
    FAIL_TO_FAIL: r.FAIL_TO_FAIL, regressions: r.regressions, flaky: r.flaky, modified_tests: r.modified_tests, test_files: r.test_files,
    proof_outside_test_patch: r.proof_outside_test_patch, untested_files: r.untested_files, eval_script: r.eval_script, harbor_env: r.harbor_env,
  };
}

let fromGithub: ValidationResult;

describe("snapshot fallback", () => {
  beforeAll(async () => {
    fromGithub = await validateBatchRow(context(await freshOut(false), { clone: cloneFromStandIn }, new CheckoutRunner()), { ...row }, join(scratch, "logs-gh"));
  });

  it("a GitHub-backed run records repo_source github", () => {
    expect(fromGithub.validation_status).toBe("validated");
    expect(fromGithub.FAIL_TO_PASS).toEqual(["src/a.test.ts::adds"]);
    expect(fromGithub.PASS_TO_PASS).toEqual(["src/b.test.ts::keeps"]);
    expect(fromGithub.repo_source).toBe("github");
    expect(fromGithub.detail).toBeNull();
  });

  it("1. clone fails, bundle present: validated from the snapshot with the same lists, the failure in detail without the token", async () => {
    const out = await freshOut(true);
    const runner = new CheckoutRunner();
    const result = await validateBatchRow(context(out, { clone: refusedClone }, runner), { ...row }, join(out, "logs"));
    expect(lists(result)).toEqual(lists(fromGithub));
    expect(result.repo_source).toBe("snapshot");
    expect([...runner.repoDirs]).toEqual([join(out, "repos-from-snapshot", row.instance_id)]);
    expect(result.detail).toContain("code taken from the snapshot because GitHub failed: git clone --quiet https://***@github.com/team/app.git exited 128");
    expect(result.detail).not.toContain(TOKEN);
    expect(result.detail).not.toContain("\n");
    expect(result.snapshot_bundle).toBe(snapshotPath(row.instance_id));
    const md = summaryMarkdown(summarize([result]));
    expect(md).toContain(`| ${row.instance_id} | validated | from snapshot |`);
  });

  it("the snapshot checkout is reused by a later run into the same folder", async () => {
    const out = await freshOut(true);
    const first = await validateBatchRow(context(out, { clone: refusedClone }, new CheckoutRunner()), { ...row }, join(out, "logs"));
    const again = await validateBatchRow(context(out, { clone: refusedClone }, new CheckoutRunner()), { ...row }, join(out, "logs"));
    expect(lists(again)).toEqual(lists(first));
    expect(await readdir(join(out, "repos-from-snapshot"))).toEqual([row.instance_id]);
  });

  it("2. the base_commit fetch into an existing clone fails, bundle present: falls back the same way", async () => {
    const out = await freshOut(true);
    await mkdir(join(out, "repos"), { recursive: true });
    await run("git", ["clone", "-q", join(github, "team", "app.git"), join(out, "repos", "team__app")]);
    let cloned = false;
    const git: BatchGit = {
      clone: async () => { cloned = true; },
      ensure: async () => { throw new CloneError(`fetch of ${base} failed: fatal: remote error: upload-pack: not our ref ${base}`); },
    };
    const result = await validateBatchRow(context(out, git, new CheckoutRunner()), { ...row }, join(out, "logs"));
    expect(cloned).toBe(false);
    expect(lists(result)).toEqual(lists(fromGithub));
    expect(result.repo_source).toBe("snapshot");
    expect(result.detail).toBe(`code taken from the snapshot because GitHub failed: fetch of ${base} failed: fatal: remote error: upload-pack: not our ref ${base}`);
  });

  it("3. clone fails and there is no bundle: env_error exactly as before", async () => {
    const out = await freshOut(false);
    const refused: BatchGit = { clone: async () => { throw new CloneError(NO_APP_CLONE_DETAIL); } };
    const result = await validateBatchRow(context(out, refused, new CheckoutRunner()), { ...row }, join(out, "logs"));
    expect(result).toEqual(rejectedWithoutRun(row, "env_error", NO_APP_CLONE_DETAIL));
    expect(result.repo_source).toBeUndefined();
    expect(await exists(join(out, "repos-from-snapshot"))).toBe(false);
  });

  it("4. --snapshots-from is used when <out>/snapshots/ has no bundle for the row, and the bundle is kept in the batch", async () => {
    const out = await freshOut(false);
    const elsewhere = join(scratch, "bucket");
    await mkdir(elsewhere, { recursive: true });
    await run("cp", [bundle, join(elsewhere, `${row.instance_id}.bundle`)]);
    const result = await validateBatchRow(context(out, { clone: refusedClone }, new CheckoutRunner(), elsewhere), { ...row }, join(out, "logs"));
    expect(lists(result)).toEqual(lists(fromGithub));
    expect(result.repo_source).toBe("snapshot");
    expect(result.snapshot_bundle).toBe(snapshotPath(row.instance_id));
    expect(await exists(join(out, snapshotPath(row.instance_id)))).toBe(true);
    // Without that folder, the same row is env_error.
    const without = await validateBatchRow(context(await freshOut(false), { clone: refusedClone }, new CheckoutRunner()), { ...row }, join(scratch, "logs-none"));
    expect(without.reason).toBe("env_error");
  });

  it("a bundle that cannot be used names both failures", async () => {
    const out = await freshOut(false);
    await mkdir(join(out, "snapshots"), { recursive: true });
    await writeFile(join(out, snapshotPath(row.instance_id)), "not a bundle");
    const result = await validateBatchRow(context(out, { clone: async () => { throw new CloneError(NO_APP_CLONE_DETAIL); } }, new CheckoutRunner()), { ...row }, join(out, "logs"));
    expect(result.reason).toBe("env_error");
    expect(result.detail).toContain(`${NO_APP_CLONE_DETAIL}; the snapshot `);
    expect(result.detail).toContain("could not be used either");
  });
});
