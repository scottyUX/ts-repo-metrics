import { describe, expect, it } from "vitest";
import type { BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import { rejectedWithoutRun, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { STAFF_REBUILT_FLAG } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, mergeFlags, staleCaptureFlags, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";

const TEST_PATCH = [
  "diff --git a/src/a.test.ts b/src/a.test.ts",
  "--- a/src/a.test.ts",
  "+++ b/src/a.test.ts",
  "@@ -1,1 +1,4 @@",
  " import { a } from './a';",
  "+it('adds', () => {",
  "+  expect(a()).toBe(1);",
  "+});",
  "",
].join("\n");
const PATCH = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n";

const row = (id: string): TaskRow => ({ instance_id: id, repo: "JoKHerre/Bookworm", base_commit: "40b28261", patch: PATCH, test_patch: TEST_PATCH, FAIL_TO_PASS: [], PASS_TO_PASS: [] });
const rebuildRecord = (patch: string, test_patch: string) => ({
  rebuilt_from: "merge-parent" as const, merge_commit: "96798e0b", original_base_commit: "0ld", original_patch_sha256: "p", original_test_patch_sha256: "t",
  base_commit: "40b28261", patch, test_patch,
});
const validated = (id: string, rebuild?: ReturnType<typeof rebuildRecord>): ValidationResult => ({
  ...rejectedWithoutRun(row(id), "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["src/a.test.ts::adds", "src/a.test.ts::b", "src/a.test.ts::c"], image: "node:24-bookworm", eval_script: "", log_parser: "vitest-json",
  ...(rebuild ? { rebuild } : {}),
});

/** Applies the plan against a fake source row holding `existing` flags; returns the flags written and the output lines. */
async function apply(result: ValidationResult, existing: string[]): Promise<{ flags: string[]; lines: string[] }> {
  let written: string[] = [];
  const fake: WritebackClient = {
    from(table) {
      return {
        select() { return { eq: async () => ({ data: [{ flags: existing }], error: null }) }; },
        update(values) {
          if (table === "cse_benchmark_task_sources") written = values.flags as string[];
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  const lines = await applyWriteback(fake, writebackPlan([result]), () => "now");
  return { flags: written, lines };
}

/**
 * The flags writeback.sql leaves on a row, read off its `where` clause: kept are those the clause
 * does not exclude, then the appended array. Enough to compare against the client for these rows.
 */
function sqlFlags(sql: string, existing: string[]): string[] {
  const statement = sql.slice(sql.indexOf("update public.cse_benchmark_task_sources"));
  const excluded = [...statement.matchAll(/f <> '([^']+)'/g)].map((m) => m[1]!);
  const added = [...(statement.match(/\|\| array\[(.*?)\]/)?.[1] ?? "").matchAll(/\$hecate\$(.*?)\$hecate\$/g)].map((m) => m[1]!);
  const kept = existing.filter((f) => !f.startsWith("validation_reason:") && !excluded.includes(f));
  return [...kept, ...added];
}

describe("rebuilt rows drop the capture flags the rebuild made untrue", () => {
  it("removes no_test_patch and keeps the staff-rebuilt flag when the rebuilt test_patch is non-empty", async () => {
    const result = validated("JoKHerre__Bookworm-COL-04-T-4", rebuildRecord(PATCH, TEST_PATCH));
    const { flags, lines } = await apply(result, ["no_test_patch", STAFF_REBUILT_FLAG]);
    expect(flags).toEqual([STAFF_REBUILT_FLAG]);
    expect(lines[0]).toMatch(/, dropped capture flag\(s\): no_test_patch$/);
  });

  it("keeps no_test_patch when the rebuilt test_patch is still empty", async () => {
    const result = validated("T-2", rebuildRecord(PATCH, ""));
    expect(staleCaptureFlags(result.rebuild!)).not.toContain("no_test_patch");
    const { flags, lines } = await apply(result, ["no_test_patch", STAFF_REBUILT_FLAG]);
    expect(flags).toEqual(["no_test_patch", STAFF_REBUILT_FLAG]);
    expect(lines[0]).not.toContain("dropped capture flag");
  });

  it("leaves a captured (not rebuilt) row's capture flags alone", async () => {
    const result = validated("T-3");
    expect(writebackPlan([result])[0]!.dropCaptureFlags).toEqual([]);
    const { flags, lines } = await apply(result, ["no_test_patch", "diff_missing", "base_commit_from_pr_base"]);
    expect(flags).toEqual(["no_test_patch", "diff_missing", "base_commit_from_pr_base"]);
    expect(lines[0]).not.toContain("dropped");
    expect(writebackSql([result])).not.toContain("no_test_patch");
  });

  it("drops only statements about the patches, each when the rebuilt patches contradict it", () => {
    expect(staleCaptureFlags({ patch: PATCH, test_patch: TEST_PATCH })).toEqual(["no_test_patch", "no_source_patch", "diff_missing", "diff_truncated", "no_tests_found"]);
    expect(staleCaptureFlags({ patch: "", test_patch: TEST_PATCH })).toEqual(["no_test_patch", "diff_missing", "diff_truncated", "no_tests_found"]);
    expect(staleCaptureFlags({ patch: PATCH, test_patch: "" })).toEqual(["no_source_patch", "diff_missing", "diff_truncated"]);
    // A test patch with no test extractAddedTests can find: no_tests_found stays true.
    expect(staleCaptureFlags({ patch: PATCH, test_patch: "diff --git a/src/a.test.ts b/src/a.test.ts\n--- a/src/a.test.ts\n+++ b/src/a.test.ts\n@@ -1 +1 @@\n-x\n+y\n" })).not.toContain("no_tests_found");
    const kept: BuildFlag[] = ["base_commit_from_pr_base", "base_commit_from_first_commit", "pii_scrubbed_from_patch"];
    for (const flag of kept) expect(staleCaptureFlags({ patch: PATCH, test_patch: TEST_PATCH })).not.toContain(flag);
  });

  it("writeback.sql and the client leave the same flags", async () => {
    const all = ["no_test_patch", "no_source_patch", "diff_missing", "diff_truncated", "no_tests_found", "base_commit_from_pr_base", "pii_scrubbed_from_patch", "validation_reason:old", STAFF_REBUILT_FLAG];
    const cases = [
      validated("A-1", rebuildRecord(PATCH, TEST_PATCH)),
      validated("A-2", rebuildRecord(PATCH, "")),
      validated("A-3"),
      { ...rejectedWithoutRun({ ...row("A-4"), rebuild: undefined }, "no_fail_to_pass", ""), rebuild: rebuildRecord(PATCH, TEST_PATCH) },
    ];
    for (const result of cases) {
      for (const existing of [all, ["no_test_patch", STAFF_REBUILT_FLAG], []]) {
        const client = (await apply(result, existing)).flags;
        expect(new Set(sqlFlags(writebackSql([result]), existing))).toEqual(new Set(client));
      }
    }
  });

  it("mergeFlags without a drop list behaves as before", () => {
    expect(mergeFlags(["no_test_patch", "validation_reason:old"], null)).toEqual(["no_test_patch"]);
    expect(mergeFlags(["no_test_patch", "validation_reason:old"], null, ["no_test_patch"])).toEqual([]);
  });
});
