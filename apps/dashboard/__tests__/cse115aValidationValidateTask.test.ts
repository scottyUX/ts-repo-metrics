import { describe, expect, it } from "vitest";
import { RUNS_PER_STATE } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { FakeSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import type { Environment, Unsupported } from "@/lib/cse115a/benchmark/validation/environment";
import { filesInPatch, modifiedAcrossFiles, unsupportedResult, validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const testPatch = [
  "diff --git a/src/sum.test.ts b/src/sum.test.ts",
  "--- a/src/sum.test.ts",
  "+++ b/src/sum.test.ts",
  "@@ -1,3 +1,4 @@",
  " import { it } from 'vitest';",
  " it('adds', () => {});",
  "+it('adds negatives', () => {});",
  "diff --git a/src/old.test.ts b/src/old.test.ts",
  "deleted file mode 100644",
  "--- a/src/old.test.ts",
  "+++ /dev/null",
  "",
].join("\n");

const row: TaskRow = {
  instance_id: "org__repo-US-1-T-2",
  repo: "org/repo",
  base_commit: "abc123",
  patch: "diff --git a/src/sum.ts b/src/sum.ts\n",
  test_patch: testPatch,
  FAIL_TO_PASS: ["src/sum.test.ts::adds negatives"],
  PASS_TO_PASS: ["src/sum.test.ts::adds", "src/sum.test.ts::not really there"],
};

const env: Environment = {
  supported: true, runners: ["vitest"], packageManager: "npm", packageDir: "", installDir: "", installCommand: "npm ci",
  testSteps: [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }],
  env: { CI: "true" }, dockerfile: "FROM node:22-bookworm", image: "node:22-bookworm",
};

describe("filesInPatch", () => {
  it("lists written files and skips deleted ones", () => {
    expect(filesInPatch(testPatch)).toEqual(["src/sum.test.ts"]);
  });
});

describe("modifiedAcrossFiles", () => {
  it("finds tests whose body changed and ignores new files", () => {
    const base = new Map<string, string | null>([
      ["a.test.ts", "it('x', () => { expect(1).toBe(1); });"],
      ["new.test.ts", null],
    ]);
    const patched = new Map<string, string | null>([
      ["a.test.ts", "it('x', () => { expect(2).toBe(2); });"],
      ["new.test.ts", "it('y', () => {});"],
    ]);
    expect([...modifiedAcrossFiles(["a.test.ts", "new.test.ts"], base, patched)]).toEqual(["a.test.ts::x"]);
  });
});

describe("validateTask", () => {
  it("validates a row with a fail-to-pass test and reports unmatched static ids", async () => {
    const runner = new FakeSuiteRunner({
      r0: { "src/sum.test.ts::adds": "passed" },
      r1: { "src/sum.test.ts::adds": "passed", "src/sum.test.ts::adds negatives": "failed" },
      r2: { "src/sum.test.ts::adds": "passed", "src/sum.test.ts::adds negatives": "passed" },
    });
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner });

    expect(result.validation_status).toBe("validated");
    expect(result.reason).toBeNull();
    expect(result.FAIL_TO_PASS).toEqual(["src/sum.test.ts::adds negatives"]);
    expect(result.PASS_TO_PASS).toEqual(["src/sum.test.ts::adds"]);
    expect(result.unmatched_static_ids).toEqual(["src/sum.test.ts::not really there"]);
    expect(result.test_files).toEqual(["src/sum.test.ts"]);
    expect(result.image).toBe("node:22-bookworm");
    expect(result.log_parser).toBe("vitest-json");
    expect(result.package_dir).toBe("");
    expect(result.eval_script).toContain("git apply --whitespace=nowarn /patches/fix.diff");
    expect(runner.calls).toHaveLength(3 * RUNS_PER_STATE);
    expect(Object.keys(result.timings)).toHaveLength(3 * RUNS_PER_STATE);
  });

  it("rejects when the fix breaks a pre-existing test", async () => {
    const runner = new FakeSuiteRunner({
      r0: { "src/sum.test.ts::adds": "passed" },
      r1: { "src/sum.test.ts::adds": "passed", "src/sum.test.ts::adds negatives": "failed" },
      r2: { "src/sum.test.ts::adds": "failed", "src/sum.test.ts::adds negatives": "passed" },
    });
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner });
    expect(result.validation_status).toBe("rejected");
    expect(result.reason).toBe("regressions");
    expect(result.regressions).toEqual(["src/sum.test.ts::adds"]);
  });

  it("passes the modified set through to the comparison and the result", async () => {
    const runner = new FakeSuiteRunner({
      r0: { "src/sum.test.ts::adds": "passed" },
      r1: {},
      r2: { "src/sum.test.ts::adds": "passed" },
    });
    const modified = new Set(["src/sum.test.ts::adds"]);
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified, runner });
    expect(result.modified_tests).toEqual(["src/sum.test.ts::adds"]);
    expect(result.judged_from_base).toEqual([]);
    expect(result.ABSENT_TO_PASS).toEqual(["src/sum.test.ts::adds"]);
  });
});

describe("unsupportedResult", () => {
  it("rejects with env_unsupported and the detail", () => {
    const env: Unsupported = { supported: false, reason: "env_unsupported", detail: "jest is not supported yet" };
    const result = unsupportedResult(row, env);
    expect(result.validation_status).toBe("rejected");
    expect(result.reason).toBe("env_unsupported");
    expect(result.detail).toBe("jest is not supported yet");
    expect(result.test_files).toEqual(["src/sum.test.ts"]);
    expect(result.FAIL_TO_PASS).toEqual([]);
  });
});
