import { describe, expect, it } from "vitest";
import { compareRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { containerScript, FakeSuiteRunner, runThreeStates, type RunPlan } from "@/lib/cse115a/benchmark/validation/runner";

const plan: RunPlan = {
  repoDir: "/tmp/repo",
  baseCommit: "abc123",
  patch: "diff --git a/src/login.ts b/src/login.ts\n",
  testPatch: "diff --git a/tests/login.test.ts b/tests/login.test.ts\n",
  installCommand: "npm ci",
  testCommand: "npx vitest run --reporter=json --outputFile=$REPORT",
};

describe("runThreeStates", () => {
  it("runs each state twice, in order, and hands the six results to compareRuns", async () => {
    const runner = new FakeSuiteRunner({
      r0: { "tests/smoke.test.ts::ok": "passed" },
      r1: { "tests/smoke.test.ts::ok": "passed", "tests/login.test.ts::rejects": "failed" },
      r2: { "tests/smoke.test.ts::ok": "passed", "tests/login.test.ts::rejects": "passed" },
    });
    const states = await runThreeStates(plan, runner);
    expect(runner.calls).toEqual([
      { state: "r0", attempt: 1 }, { state: "r0", attempt: 2 },
      { state: "r1", attempt: 1 }, { state: "r1", attempt: 2 },
      { state: "r2", attempt: 1 }, { state: "r2", attempt: 2 },
    ]);
    expect(Object.keys(states.timings).sort()).toEqual(["r0a", "r0b", "r1a", "r1b", "r2a", "r2b"]);
    const result = compareRuns(states);
    expect(result.failToPass).toEqual(["tests/login.test.ts::rejects"]);
    expect(result.passToPass).toEqual(["tests/smoke.test.ts::ok"]);
    expect(result.validationStatus).toBe("validated");
  });

  it("lets the two attempts of one state differ, which compareRuns reports as flaky", async () => {
    const runner = new FakeSuiteRunner({
      r0: {},
      r1: { "t::a": "failed" },
      r2a: { "t::a": "passed" },
      r2b: { "t::a": "failed" },
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

  it("checks out the base commit, installs, and never fails the script on a red suite", () => {
    const script = containerScript(plan, "r1");
    expect(script).toContain("git checkout -q abc123");
    expect(script).toContain("npm ci");
    expect(script).toContain("export REPORT=/patches/report.json\nnpx vitest run --reporter=json --outputFile=$REPORT || true");
    expect(script.indexOf("npm ci")).toBeLessThan(script.indexOf("git apply"));
  });
});
