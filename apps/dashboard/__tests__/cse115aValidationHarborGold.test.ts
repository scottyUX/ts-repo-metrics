// Item F (#288): the Harbor gold check. A fake HarborRunner stands in for Harbor; no test needs
// Harbor or Docker. The two job results under fixtures/harbor/ are real Harbor 0.25 output (an
// oracle run scoring 1.0 and a nop run scoring 0.0 on a Sprint 2 task).
import { readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rejectedWithoutRun } from "@/lib/cse115a/benchmark/validation/batch";
import { NO_BUNDLE_REASON } from "@/lib/cse115a/benchmark/validation/bundleTask";
import { harborTaskName, type HarborEnv, type HarborGold, type HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import { goldCheck, goldVerdict, HARBOR_MISSING_REASON, parseHarborResult, withGold, type HarborAgent, type HarborRun, type HarborRunner } from "@/lib/cse115a/benchmark/validation/harborGold";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const validateRowCalls = vi.hoisted(() => ({ count: 0 }));
// --gold-only must never run the Docker validation: the batch's validateRow counts and refuses.
vi.mock("@/lib/cse115a/benchmark/validation/runRow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cse115a/benchmark/validation/runRow")>()),
  validateRow: vi.fn(async () => { validateRowCalls.count++; throw new Error("validateRow must not run"); }),
}));
const { goldOnly } = await import("@/lib/cse115a/benchmark/validation/batchRun");

const ORACLE_JSON = readFileSync(join(__dirname, "fixtures", "harbor", "oracleJobResult.json"), "utf8");
const NOP_JSON = readFileSync(join(__dirname, "fixtures", "harbor", "nopJobResult.json"), "utf8");

/** A job result like the fixture, with another mean reward. */
function withMean(json: string, mean: number): string {
  const job = JSON.parse(json);
  for (const e of Object.values(job.stats.evals) as Array<{ metrics: Array<{ mean: number }> }>) e.metrics[0]!.mean = mean;
  return JSON.stringify(job);
}

class FakeHarbor implements HarborRunner {
  calls: Array<{ taskDir: string; agent: HarborAgent; jobsDir: string; jobName: string; timeoutMs: number }> = [];
  constructor(private readonly runs: Partial<Record<HarborAgent, HarborRun>> = {}, private readonly installed = true) {}
  async version() { return this.installed ? "0.25.0" : null; }
  async run(options: { taskDir: string; agent: HarborAgent; jobsDir: string; jobName: string; timeoutMs: number }): Promise<HarborRun> {
    this.calls.push(options);
    return this.runs[options.agent] ?? { resultJson: options.agent === "oracle" ? ORACLE_JSON : NOP_JSON, output: "", error: null };
  }
}

const recipe: HarborEnv = {
  image: "node:24-bookworm@sha256:8fa9", runners: ["vitest"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }],
  test_steps: [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }],
  env: { CI: "true" }, services: [], node_source: "default", repo_public: true,
};
const ID = "Team__App-T-1";
const row: HarborRow = { instance_id: ID, repo: "team/app", base_commit: "28e92a1c0ffee0000000000000000000000000ab", patch: "diff --git a/a b/a\n", test_patch: "diff --git a/a.test.ts b/a.test.ts\n", FAIL_TO_PASS: [], PASS_TO_PASS: [], problem_statement: "# T-1" };
const validated: ValidationResult = {
  ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["a.test.ts::adds"], PASS_TO_PASS: ["a.test.ts::keeps"], image: "node:24-bookworm", image_digest: recipe.image,
  snapshot_bundle: `snapshots/${ID}.bundle`, harbor_env: recipe,
};
const NOW = () => new Date("2026-11-11T10:00:00.000Z");

let scratch = "";
beforeAll(async () => { scratch = await mkdtemp(join(tmpdir(), "hecate-gold-test-")); });
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

/** A batch folder with the row's bundle (any bytes do: with a recipe the builder only copies it). */
async function batchWithBundle(): Promise<string> {
  const out = await mkdtemp(join(scratch, "out-"));
  await mkdir(join(out, "snapshots"), { recursive: true });
  await writeFile(join(out, "snapshots", `${ID}.bundle`), "bundle bytes");
  return out;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

describe("6. parseHarborResult on real Harbor job results", () => {
  it("reads the oracle and nop fixtures", () => {
    expect(parseHarborResult(ORACLE_JSON)).toEqual({ reward: 1, exceptions: 0, exceptionNames: [] });
    expect(parseHarborResult(NOP_JSON)).toEqual({ reward: 0, exceptions: 0, exceptionNames: [] });
  });

  it("counts errored trials and exception_stats as exceptions", () => {
    const job = JSON.parse(ORACLE_JSON);
    job.stats.n_errored_trials = 1;
    job.stats.evals.oracle__adhoc.n_errors = 1;
    job.stats.evals.oracle__adhoc.exception_stats = { DockerBuildError: ["t1"] };
    expect(parseHarborResult(JSON.stringify(job))).toEqual({ reward: 1, exceptions: 1, exceptionNames: ["DockerBuildError"] });
  });
});

describe("5. goldCheck with a fake Harbor", () => {
  it("oracle 1.0 / nop 0.0: passed; the task is built from the bundle under harbor-gold/, jobs under harbor-gold/jobs/", async () => {
    const out = await batchWithBundle();
    const harbor = new FakeHarbor();
    const gold = await goldCheck({ out, row, result: validated, harbor, now: NOW, timeoutMs: 1234 });
    expect(gold).toEqual({ status: "passed", oracle: 1, nop: 0, reason: null, checked_at: "2026-11-11T10:00:00.000Z" });
    const taskDir = join(out, "harbor-gold", harborTaskName(ID));
    expect(harbor.calls.map((c) => [c.agent, c.taskDir, c.jobsDir, c.timeoutMs])).toEqual([
      ["oracle", taskDir, join(out, "harbor-gold", "jobs"), 1234],
      ["nop", taskDir, join(out, "harbor-gold", "jobs"), 1234],
    ]);
    expect(harbor.calls[0]!.jobName).not.toBe(harbor.calls[1]!.jobName);
    expect(await readFile(join(taskDir, "environment", "repo.bundle"), "utf8")).toBe("bundle bytes");
    expect(await readFile(join(taskDir, "environment", "Dockerfile"), "utf8")).toContain("COPY repo.bundle /tmp/repo.bundle");
  });

  it("the timeout defaults to 20 minutes", async () => {
    const harbor = new FakeHarbor();
    await goldCheck({ out: await batchWithBundle(), row, result: validated, harbor, now: NOW });
    expect(harbor.calls[0]!.timeoutMs).toBe(20 * 60 * 1000);
  });

  it("oracle 0.0: failed, with the reason", async () => {
    const harbor = new FakeHarbor({ oracle: { resultJson: withMean(ORACLE_JSON, 0), output: "", error: null } });
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: validated, harbor, now: NOW });
    expect(gold).toMatchObject({ status: "failed", oracle: 0, nop: 0, reason: "oracle 0.0" });
  });

  it("nop 1.0: failed, the tests pass without the fix", async () => {
    const harbor = new FakeHarbor({ nop: { resultJson: withMean(NOP_JSON, 1), output: "", error: null } });
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: validated, harbor, now: NOW });
    expect(gold).toMatchObject({ status: "failed", oracle: 1, nop: 1, reason: "nop 1.0: tests pass without the fix" });
  });

  it("an exception or a run with no result: failed, with the first useful line of Harbor's output and no token", async () => {
    const job = JSON.parse(ORACLE_JSON);
    job.stats.evals.oracle__adhoc.n_errors = 1;
    job.stats.evals.oracle__adhoc.exception_stats = { DockerBuildError: ["t1"] };
    const output = "Agent 'oracle' does not declare an options_model\nERROR: image build failed: fetching https://x-access-token:ghs_abc@github.com/team/app.git\n";
    const harbor = new FakeHarbor({ oracle: { resultJson: JSON.stringify(job), output, error: null }, nop: { resultJson: null, output: "", error: "timed out after 1200 s" } });
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: validated, harbor, now: NOW });
    expect(gold.status).toBe("failed");
    expect(gold.reason).toBe("oracle: DockerBuildError: ERROR: image build failed: fetching https://***@github.com/team/app.git; nop: timed out after 1200 s");
    expect(gold.reason).not.toContain("ghs_abc");
  });

  it("Harbor not installed: skipped, nothing run", async () => {
    const harbor = new FakeHarbor({}, false);
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: validated, harbor, now: NOW });
    expect(gold).toEqual({ status: "skipped", oracle: null, nop: null, reason: HARBOR_MISSING_REASON, checked_at: "2026-11-11T10:00:00.000Z" });
    expect(harbor.calls).toEqual([]);
  });

  it("a row with a database service: skipped, with harborSkipReason's wording", async () => {
    const harbor = new FakeHarbor();
    const db = { ...validated, harbor_env: { ...recipe, services: [{ name: "postgres", image: "postgres:16" }] } };
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: db, harbor, now: NOW });
    expect(gold).toMatchObject({ status: "skipped", reason: "Harbor export for rows with a database service is not built yet" });
    expect(harbor.calls).toEqual([]);
  });

  it("no snapshot bundle: skipped", async () => {
    const harbor = new FakeHarbor();
    const gold = await goldCheck({ out: await batchWithBundle(), row, result: { ...validated, snapshot_bundle: undefined }, harbor, now: NOW });
    expect(gold).toMatchObject({ status: "skipped", reason: NO_BUNDLE_REASON });
    expect(harbor.calls).toEqual([]);
  });
});

describe("10. the gold check never changes the verdict", () => {
  it("withGold changes only harbor_gold and harbor_env.gold", () => {
    const failed = goldVerdict({ resultJson: withMean(ORACLE_JSON, 0), output: "", error: null }, { resultJson: NOP_JSON, output: "", error: null }, "t");
    const updated = withGold(validated, failed);
    expect(updated.validation_status).toBe("validated");
    expect(updated.reason).toBeNull();
    expect(updated.detail).toBeNull();
    const { harbor_gold, harbor_env, ...rest } = updated;
    expect(harbor_gold).toEqual(failed);
    expect(harbor_env).toEqual({ ...recipe, gold: failed });
    const { harbor_env: _env, ...before } = validated;
    void _env;
    expect(rest).toEqual(before);
  });
});

describe("7. --gold-only", () => {
  it("updates only harbor_gold and harbor_env.gold in an existing result, leaves other results alone, rewrites the summary, and never validates", async () => {
    const out = await batchWithBundle();
    await mkdir(join(out, "results"), { recursive: true });
    const original = JSON.stringify(validated, null, 2) + "\n";
    const rejected = JSON.stringify(rejectedWithoutRun({ ...row, instance_id: "Team__App-T-2" }, "no_test_patch", "x"), null, 2) + "\n";
    await writeFile(join(out, "results", `${ID}.json`), original);
    await writeFile(join(out, "results", "Team__App-T-2.json"), rejected);
    const lines: string[] = [];
    const rows = [row, { ...row, instance_id: "Team__App-T-2" }, { ...row, instance_id: "Team__App-T-3" }];
    const { checked } = await goldOnly({ rows, out, harbor: new FakeHarbor(), now: NOW, log: (l) => lines.push(l) });

    expect(validateRowCalls.count).toBe(0);
    expect(checked.map((r) => r.instance_id)).toEqual([ID]);
    const text = await readFile(join(out, "results", `${ID}.json`), "utf8");
    const updated = JSON.parse(text) as ValidationResult;
    const gold: HarborGold = { status: "passed", oracle: 1, nop: 0, reason: null, checked_at: "2026-11-11T10:00:00.000Z" };
    expect(updated.harbor_gold).toEqual(gold);
    expect(updated.harbor_env!.gold).toEqual(gold);
    // Everything else byte-identical: drop the two new fields and the file is the original.
    delete updated.harbor_gold;
    delete updated.harbor_env!.gold;
    expect(JSON.stringify(updated, null, 2) + "\n").toBe(original);
    expect(await readFile(join(out, "results", "Team__App-T-2.json"), "utf8")).toBe(rejected);
    expect(lines).toContain("[2/3] Team__App-T-2: rejected (no_test_patch), skipping");
    expect(lines).toContain("[3/3] Team__App-T-3: no result in the batch, skipping");
    // No clone, no Docker folders; the summary files are rewritten from every result.
    expect((await readdir(out)).sort()).toEqual(["harbor-gold", "results", "snapshots", "summary.json", "summary.md", "writeback.sql"]);
    const md = await readFile(join(out, "summary.md"), "utf8");
    expect(md.split("\n")[0]).toBe("1 validated, 1 rejected of 2 (no_test_patch: 1); 1 gold-checked: 1 passed, 0 failed");
    expect(md).toContain(`| ${ID} | validated |  | 1 | 0 | 1 | 0 | 0 | 0 | 0 | passed |`);
    expect(md).toContain("| Team__App-T-2 | rejected | no_test_patch | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |");
    expect(await readFile(join(out, "writeback.sql"), "utf8")).toContain(`"gold":${JSON.stringify(gold)}`);
  });

  it("a second pass replaces the gold check in place", async () => {
    const out = await batchWithBundle();
    await mkdir(join(out, "results"), { recursive: true });
    await writeFile(join(out, "results", `${ID}.json`), JSON.stringify(validated, null, 2) + "\n");
    await goldOnly({ rows: [row], out, harbor: new FakeHarbor(), now: NOW });
    const failing = new FakeHarbor({ nop: { resultJson: withMean(NOP_JSON, 1), output: "", error: null } });
    await goldOnly({ rows: [row], out, harbor: failing, now: () => new Date("2026-11-12T00:00:00.000Z") });
    const updated = JSON.parse(await readFile(join(out, "results", `${ID}.json`), "utf8")) as ValidationResult;
    expect(updated.harbor_gold).toMatchObject({ status: "failed", reason: "nop 1.0: tests pass without the fix", checked_at: "2026-11-12T00:00:00.000Z" });
    expect(updated.harbor_env!.gold).toEqual(updated.harbor_gold);
    expect(updated.validation_status).toBe("validated");
    expect(Object.keys(updated).filter((k) => k === "harbor_gold")).toHaveLength(1);
    expect(await exists(join(out, "repos"))).toBe(false);
  });
});
