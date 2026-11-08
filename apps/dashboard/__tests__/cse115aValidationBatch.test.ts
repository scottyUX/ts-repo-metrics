import { describe, expect, it } from "vitest";
import { parseRows, preflight, rejectedWithoutRun, summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const row = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  instance_id: "org__repo-T-1", repo: "org/repo", base_commit: "abc", patch: "diff --git a/x b/x\n", test_patch: "diff --git a/x.test.ts b/x.test.ts\n",
  FAIL_TO_PASS: [], PASS_TO_PASS: [], ...overrides,
});

describe("parseRows", () => {
  it("reads a JSON array or JSON Lines", () => {
    expect(parseRows(JSON.stringify([row(), row({ instance_id: "b" })])).map((r) => r.instance_id)).toEqual(["org__repo-T-1", "b"]);
    expect(parseRows(`${JSON.stringify(row())}\n${JSON.stringify(row({ instance_id: "b" }))}\n`).map((r) => r.instance_id)).toEqual(["org__repo-T-1", "b"]);
    expect(parseRows("  \n")).toEqual([]);
  });
});

describe("preflight", () => {
  it("rejects empty patches before any run and passes complete rows", () => {
    expect(preflight(row({ patch: "" }))).toMatchObject({ reason: "no_source_patch" });
    expect(preflight(row({ test_patch: "  \n" }))).toMatchObject({ reason: "no_test_patch" });
    expect(preflight(row())).toBeNull();
  });

  it("builds a complete rejected result without running anything", () => {
    const result = rejectedWithoutRun(row({ patch: "" }), "no_source_patch", "the row has an empty patch");
    expect(result).toMatchObject({ instance_id: "org__repo-T-1", validation_status: "rejected", reason: "no_source_patch", FAIL_TO_PASS: [], timings: {} });
  });
});

describe("summarize", () => {
  const validated: ValidationResult = {
    ...rejectedWithoutRun(row(), "env_error", ""), validation_status: "validated", reason: null, detail: null,
    FAIL_TO_PASS: ["a", "b"], PASS_TO_PASS: ["c"], timings: { r0a: 1000, r0b: 500, r1a: 500, r1b: 500, r2a: 500, r2b: 1000 },
  };
  const rejected = rejectedWithoutRun(row({ instance_id: "org__repo-T-2", patch: "" }), "no_source_patch", "x");
  const rejected2 = rejectedWithoutRun(row({ instance_id: "org__repo-T-3", patch: "" }), "no_source_patch", "x");

  it("counts verdicts and reasons and lists every row", () => {
    const summary = summarize([validated, rejected, rejected2]);
    expect(summary).toMatchObject({ total: 3, validated: 1, rejected: 2, byReason: { no_source_patch: 2 } });
    expect(summary.rows[0]).toMatchObject({ instance_id: "org__repo-T-1", status: "validated", f2p: 2, p2p: 1, seconds: 4 });
  });

  it("renders a Markdown table with the headline first", () => {
    const md = summaryMarkdown(summarize([validated, rejected]));
    expect(md.split("\n")[0]).toBe("1 validated, 1 rejected of 2 (no_source_patch: 1)");
    expect(md).toContain("| org__repo-T-2 | rejected | no_source_patch | 0 | 0 | 0 | 0 | 0 | 0 |");
  });
});
