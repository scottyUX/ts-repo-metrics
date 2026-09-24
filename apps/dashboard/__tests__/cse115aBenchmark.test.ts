import { describe, expect, it } from "vitest";
import { extractAddedTests, extractJsTests, extractPyTests } from "@/lib/cse115a/benchmark/extractTests";
import { buildInstance, difficultyFor, instanceId, SWE_BENCH_FIELDS } from "@/lib/cse115a/benchmark/buildInstance";
import { exportJsonl, isExportable, toJsonlRecord } from "@/lib/cse115a/benchmark/exportJsonl";
import { runNextJob, type JobStore, type BenchmarkSave } from "@/lib/cse115a/jobs/runner";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const TS_DIFF = `diff --git a/src/cart.ts b/src/cart.ts
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -1,3 +1,6 @@
 export class Cart {
+  total() {
+    return 0;
+  }
 }
diff --git a/src/__tests__/cart.test.ts b/src/__tests__/cart.test.ts
new file mode 100644
--- /dev/null
+++ b/src/__tests__/cart.test.ts
@@ -0,0 +1,16 @@
+import { Cart } from "../cart";
+
+describe("Cart", () => {
+  it("starts empty", () => {
+    expect(new Cart().total()).toBe(0);
+  });
+  describe('total()', () => {
+    test("adds {items}", () => {
+      expect(1).toBe(1);
+    });
+  });
+  it.skip(\`skips "quoted"\`, () => {});
+});
+test("top level", () => {
+  expect(true).toBe(true);
+});
diff --git a/src/__tests__/old.test.ts b/src/__tests__/old.test.ts
--- a/src/__tests__/old.test.ts
+++ b/src/__tests__/old.test.ts
@@ -10,6 +10,9 @@ describe("Old", () => {
   it("was already here", () => {
     expect(1).toBe(1);
   });
+  it("is new in an existing file", () => {
+    expect(2).toBe(2);
+  });
 });
diff --git a/src/__tests__/gone.test.ts b/src/__tests__/gone.test.ts
deleted file mode 100644
--- a/src/__tests__/gone.test.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-it("was removed", () => {
-  expect(1).toBe(1);
-});
`;

const PY_DIFF = `diff --git a/app/api.py b/app/api.py
--- a/app/api.py
+++ b/app/api.py
@@ -1,2 +1,4 @@
 def handler():
-    return None
+    return {"ok": True}
diff --git a/tests/test_api.py b/tests/test_api.py
new file mode 100644
--- /dev/null
+++ b/tests/test_api.py
@@ -0,0 +1,15 @@
+import pytest
+
+def test_handler_ok():
+    assert handler()["ok"]
+
+class TestHandler:
+    def test_returns_dict(self):
+        assert isinstance(handler(), dict)
+
+    async def test_async(self):
+        def test_nested_helper():
+            pass
+
+def helper():
+    pass
diff --git a/tests/test_more.py b/tests/test_more.py
--- a/tests/test_more.py
+++ b/tests/test_more.py
@@ -20,3 +20,6 @@ class TestMore:
     def test_existing(self):
         pass
+
+    def test_added_in_class(self):
+        pass
`;

function snapshot(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot: 1, taskId: "US-1-T-1", prUrl: "https://github.com/team-alpha/proj/pull/7", repoFullName: "team-alpha/proj", prNumber: 7,
    taskPath: "docs/tasks/sprint-1/US-1-T-1.md", specMarkdown: "# Cart total\n", spec: { id: "US-1-T-1", estimateHours: 3 } as TaskSpec,
    validation: {}, analysisResultId: "result-1",
    pr: { title: "US-1-T-1", body: "Adds Cart.total", headRef: "US-1-T-1", author: "s", mergedAt: "2026-10-01T12:00:00Z", baseSha: "prbase", mergeCommitSha: "merge" },
    baseCommit: "basetag", baseCommitSource: "base_tag", diff: TS_DIFF, diffBytes: TS_DIFF.length, diffTruncated: false, diffError: null,
    comments: [{ kind: "review", author: "ta", body: "Consider an empty-cart test.", createdAt: null }],
    checks: [],
    ...overrides,
  };
}

describe("static test extraction", () => {
  it("finds Jest/Vitest tests with describe paths, only on added lines", () => {
    expect(extractAddedTests(TS_DIFF)).toEqual([
      "src/__tests__/cart.test.ts::Cart > starts empty",
      "src/__tests__/cart.test.ts::Cart > total() > adds {items}",
      'src/__tests__/cart.test.ts::Cart > skips "quoted"',
      "src/__tests__/cart.test.ts::top level",
      // The enclosing describe opened before the hunk, so only the test name is known.
      "src/__tests__/old.test.ts::is new in an existing file",
    ]);
  });

  it("finds pytest functions and methods, using the hunk header for the class", () => {
    expect(extractAddedTests(PY_DIFF)).toEqual([
      "tests/test_api.py::test_handler_ok",
      "tests/test_api.py::TestHandler::test_returns_dict",
      "tests/test_api.py::TestHandler::test_async",
      "tests/test_more.py::TestMore::test_added_in_class",
    ]);
  });

  it("ignores non-test files", () => {
    expect(extractJsTests("src/a.ts", "@@ -0,0 +1 @@\n+it(\"x\", () => {});\n")).toHaveLength(1);
    expect(extractAddedTests("diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+it(\"x\", () => {});\n")).toEqual([]);
    expect(extractPyTests("t.py", "@@ -0,0 +1 @@\n+    def test_orphan(self): pass\n")).toEqual([]);
  });
});

describe("buildInstance", () => {
  it("maps a snapshot to SWE-bench fields", () => {
    const { instance, flags } = buildInstance(snapshot(), 1, { summary: { score: 80 } });
    expect(instance.instance_id).toBe("team-alpha__proj-US-1-T-1");
    expect(instance).toMatchObject({
      repo: "team-alpha/proj", base_commit: "basetag", environment_setup_commit: "basetag",
      created_at: "2026-10-01T12:00:00Z", version: "sprint-1", problem_statement: "# Cart total\n",
      hints_text: "Adds Cart.total\n\nConsider an empty-cart test.", PASS_TO_PASS: [], eval_type: "pass_and_fail",
      image: null, eval_script: null, log_parser: null, difficulty: "1-4 hours", repo_metrics: { summary: { score: 80 } },
    });
    expect(instance.patch).toContain("src/cart.ts");
    expect(instance.patch).not.toContain("__tests__");
    expect(instance.test_patch).toContain("cart.test.ts");
    expect(instance.FAIL_TO_PASS).toHaveLength(5);
    expect(flags).toEqual([]);
  });

  it("flags a PR base commit, a missing diff, and a diff without tests", () => {
    expect(buildInstance(snapshot({ baseCommitSource: "pr_base", baseCommit: "prbase" }), 1, null).flags).toEqual(["base_commit_from_pr_base"]);
    expect(buildInstance(snapshot({ diff: "", diffError: "404" }), 2, null).flags).toEqual(["diff_missing", "no_test_patch", "no_source_patch"]);
    const onlySource = TS_DIFF.slice(0, TS_DIFF.indexOf("diff --git a/src/__tests__"));
    expect(buildInstance(snapshot({ diff: onlySource }), 1, null).flags).toEqual(["no_test_patch"]);
  });

  it("buckets difficulty with the SWE-bench Verified labels", () => {
    expect([0.1, 0.25, 1, 2, 4, 6].map(difficultyFor)).toEqual(["<15 min fix", "15 min - 1 hour", "15 min - 1 hour", "1-4 hours", "1-4 hours", ">4 hours"]);
    expect(difficultyFor(undefined)).toBeNull();
    expect(instanceId("a/b", "T-1")).toBe("a__b-T-1");
  });
});

describe("JSONL export", () => {
  it("writes the golden row with JSON-string test lists", () => {
    const { instance } = buildInstance(snapshot({ diff: PY_DIFF, repoFullName: "team/py", taskId: "US-2-T-1" }), 2, null);
    const line = exportJsonl([{ instance, sources: [{ consented: true, validationStatus: "candidate" }] }]);
    expect(line.endsWith("\n")).toBe(true);
    const row = JSON.parse(line);
    expect(Object.keys(row)).toEqual([...SWE_BENCH_FIELDS]);
    expect(row).toEqual({
      instance_id: "team__py-US-2-T-1",
      repo: "team/py",
      base_commit: "basetag",
      environment_setup_commit: "basetag",
      created_at: "2026-10-01T12:00:00.000Z",
      version: "sprint-2",
      problem_statement: "# Cart total\n",
      hints_text: "Adds Cart.total\n\nConsider an empty-cart test.",
      patch: PY_DIFF.slice(0, PY_DIFF.indexOf("diff --git a/tests/test_api.py")),
      test_patch: PY_DIFF.slice(PY_DIFF.indexOf("diff --git a/tests/test_api.py")),
      FAIL_TO_PASS: JSON.stringify([
        "tests/test_api.py::test_handler_ok",
        "tests/test_api.py::TestHandler::test_returns_dict",
        "tests/test_api.py::TestHandler::test_async",
          "tests/test_more.py::TestMore::test_added_in_class",
      ]),
      PASS_TO_PASS: "[]",
      eval_type: "pass_and_fail",
      image: null,
      eval_script: null,
      log_parser: null,
      difficulty: "1-4 hours",
      repo_metrics: null,
    });
  });

  it("exports only consented, non-rejected instances", () => {
    const { instance } = buildInstance(snapshot(), 1, null);
    expect(isExportable({ instance, sources: [{ consented: false, validationStatus: "candidate" }] })).toBe(false);
    expect(isExportable({ instance, sources: [{ consented: false, validationStatus: "candidate" }, { consented: true, validationStatus: "candidate" }] })).toBe(true);
    expect(isExportable({ instance, sources: [{ consented: true, validationStatus: "rejected" }] })).toBe(false);
    expect(isExportable({ instance, sources: [{ consented: true, validationStatus: "candidate" }] }, { validatedOnly: true })).toBe(false);
    expect(exportJsonl([{ instance, sources: [{ consented: false, validationStatus: "candidate" }] }])).toBe("");
    expect(toJsonlRecord({ ...instance, created_at: null }).created_at).toBeNull();
  });
});

describe("benchmark job", () => {
  it("builds rows for both tasks with their Repo Metrics reports", async () => {
    let saved: BenchmarkSave[] = [];
    const store: JobStore = {
      claim: async () => ({ id: "j", assignment_submission_id: "s", kind: "benchmark", attempts: 1 }),
      loadSubmission: async () => ({
        id: "s", course_id: "c", user_id: "u", assignment_number: 1, status: "graded", superseded_at: null,
        snapshot: { version: 1, capturedAt: "", tasks: [snapshot(), snapshot({ slot: 2, taskId: "US-1-T-2", analysisResultId: "result-2" })] },
      }),
      setSubmissionStatus: async () => { throw new Error("benchmark jobs must not change the grading status"); },
      saveGrades: async () => {},
      finishJob: async () => {},
      loadRepoMetrics: async (id) => ({ id }),
      saveBenchmark: async (_submission, rows) => { saved = rows; },
    };
    const result = await runNextJob(store, { grade: async () => [] });
    expect(result?.outcome).toEqual({ status: "succeeded" });
    expect(saved.map((row) => [row.slot, row.instance.instance_id, row.instance.repo_metrics])).toEqual([
      [1, "team-alpha__proj-US-1-T-1", { id: "result-1" }],
      [2, "team-alpha__proj-US-1-T-2", { id: "result-2" }],
    ]);
  });
});
