import { describe, expect, it } from "vitest";
import { compareRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
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

  it("checks out the base commit, applies patches, installs, runs the steps in the package dir, and never fails the script on a red suite", () => {
    const script = containerScript(plan, "r1");
    expect(script).toContain("git checkout -q -f abc123");
    expect(script).toContain("git apply --whitespace=nowarn /patches/test.diff\ncd /work\nnpm ci\n");
    expect(script).toContain("export REPORT_DIR=/patches/reports\ncd /work/server\npnpm build || true\nnpx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-1.json || true");
    expect(script.indexOf("git apply")).toBeLessThan(script.indexOf("npm ci"));
    expect(script.indexOf("npm ci")).toBeLessThan(script.indexOf("cd /work/server"));
  });

  it("installs in the package dir when it is not a workspace", () => {
    const script = containerScript({ ...plan, installDir: "server" }, "r0");
    expect(script).toContain("git clean -fdq\ncd /work/server\nnpm ci\n");
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
});
