import { describe, expect, it } from "vitest";
import { compareRuns, RUNS_PER_STATE } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { containerScript, FakeSuiteRunner, runThreeStates, type RunPlan } from "@/lib/cse115a/benchmark/validation/runner";

const plan: RunPlan = {
  repoDir: "/tmp/repo",
  baseCommit: "abc123",
  patch: "diff --git a/src/login.ts b/src/login.ts\n",
  testPatch: "diff --git a/tests/login.test.ts b/tests/login.test.ts\n",
  installDir: "",
  installCommand: "npm ci",
  packageDir: "server",
  testSteps: ["pnpm build", "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-1.json"],
};

describe("runThreeStates", () => {
  it("runs each state RUNS_PER_STATE times, in order, and hands every result to compareRuns", async () => {
    const runner = new FakeSuiteRunner({
      r0: { "tests/smoke.test.ts::ok": "passed" },
      r1: { "tests/smoke.test.ts::ok": "passed", "tests/login.test.ts::rejects": "failed" },
      r2: { "tests/smoke.test.ts::ok": "passed", "tests/login.test.ts::rejects": "passed" },
    });
    const states = await runThreeStates(plan, runner);
    expect(RUNS_PER_STATE).toBe(3);
    expect(runner.calls).toEqual([
      { state: "r0", attempt: 1 }, { state: "r0", attempt: 2 }, { state: "r0", attempt: 3 },
      { state: "r1", attempt: 1 }, { state: "r1", attempt: 2 }, { state: "r1", attempt: 3 },
      { state: "r2", attempt: 1 }, { state: "r2", attempt: 2 }, { state: "r2", attempt: 3 },
    ]);
    expect(Object.keys(states.timings).sort()).toEqual(["r0a", "r0b", "r0c", "r1a", "r1b", "r1c", "r2a", "r2b", "r2c"]);
    expect(states.r1).toHaveLength(RUNS_PER_STATE);
    const result = compareRuns(states);
    expect(result.failToPass).toEqual(["tests/login.test.ts::rejects"]);
    expect(result.passToPass).toEqual(["tests/smoke.test.ts::ok"]);
    expect(result.validationStatus).toBe("validated");
  });

  it("marks a test flaky when any one of a state's runs disagrees with the others", async () => {
    const runner = new FakeSuiteRunner({
      r0: {},
      r1: { "t::a": "failed" },
      r2: { "t::a": "passed" },
      r2c: { "t::a": "failed" },
    });
    const result = compareRuns(await runThreeStates(plan, runner));
    expect(result.flaky).toEqual(["t::a"]);
    expect(result.reason).toBe("no_fail_to_pass");
  });
});

describe("containerScript", () => {
  it("applies no patch at R0, the test patch at R1, and both at R2", () => {
    const r0 = containerScript(plan, "r0");
    const r1 = containerScript(plan, "r1");
    const r2 = containerScript(plan, "r2");
    expect(r0).not.toContain("git apply");
    expect(r1).toContain("git apply --whitespace=nowarn /patches/test.diff");
    expect(r1).not.toContain("fix.diff");
    expect(r2).toContain("/patches/test.diff");
    expect(r2).toContain("/patches/fix.diff");
    expect(r2.indexOf("test.diff")).toBeLessThan(r2.indexOf("fix.diff"));
  });

  it("checks out the base commit, applies patches, installs, runs the steps in the package dir, and never fails the script on a red suite", () => {
    const script = containerScript(plan, "r1");
    expect(script).toContain("git checkout -q -f abc123");
    expect(script).toContain("git apply --whitespace=nowarn /patches/test.diff\ncd /work\nif ! { npm ci; } > /patches/install.log 2>&1; then\n");
    expect(script).toContain("export REPORT_DIR=/patches/reports\ncd /work/server\npnpm build || true\nnpx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-1.json || true");
    expect(script.indexOf("git apply")).toBeLessThan(script.indexOf("npm ci"));
    expect(script.indexOf("npm ci")).toBeLessThan(script.indexOf("cd /work/server"));
  });

  it("installs in the package dir when it is not a workspace", () => {
    const script = containerScript({ ...plan, installDir: "server" }, "r0");
    expect(script).toContain("git clean -fdq\ncd /work/server\nif ! { npm ci; }");
  });
});

describe("readReports", () => {
  it("merges Vitest JSON and node --test reports from one directory, stripping the mount prefix", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readReports } = await import("@/lib/cse115a/benchmark/validation/runner");
    const dir = await mkdtemp(join(tmpdir(), "hecate-reports-"));
    try {
      await writeFile(join(dir, "vitest-0.json"), JSON.stringify({ testResults: [{ name: "/work/src/a.test.ts", assertionResults: [{ ancestorTitles: [], title: "vitest one", status: "passed" }] }] }));
      await writeFile(join(dir, "node-2.json"), JSON.stringify({ "/work/server/tests/b.test.mjs::group > node one": "failed", "/work/server/tests/b.test.mjs::todo": "skipped" }));
      expect(await readReports(dir)).toEqual({
        "src/a.test.ts::vitest one": "passed",
        "server/tests/b.test.mjs::group > node one": "failed",
        "server/tests/b.test.mjs::todo": "skipped",
      });
      expect(await readReports(join(dir, "missing"))).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges a Jest report alongside a node --test report", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readReports } = await import("@/lib/cse115a/benchmark/validation/runner");
    const dir = await mkdtemp(join(tmpdir(), "hecate-reports-"));
    try {
      await writeFile(join(dir, "jest-0.json"), JSON.stringify({ success: false, testResults: [{ name: "/work/client/src/a.test.tsx", status: "passed", message: "", assertionResults: [{ ancestorTitles: ["A"], title: "renders", status: "passed" }, { ancestorTitles: ["A"], title: "later", status: "todo" }] }] }));
      await writeFile(join(dir, "node-1.json"), JSON.stringify({ "/work/server/b.test.mjs::node one": "failed" }));
      expect(await readReports(dir)).toEqual({
        "client/src/a.test.tsx::A > renders": "passed",
        "client/src/a.test.tsx::A > later": "skipped",
        "server/b.test.mjs::node one": "failed",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
