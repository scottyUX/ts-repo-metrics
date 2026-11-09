import { describe, expect, it } from "vitest";
import { parseRows, preflight, rejectedWithoutRun, summarize, summaryMarkdown, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
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

describe("writebackSql", () => {
  it("updates lists, image and status for a validated row, and only status plus a reason flag for a rejected one", () => {
    const validated: ValidationResult = {
      ...rejectedWithoutRun(row(), "env_error", ""), validation_status: "validated", reason: null, detail: null,
      FAIL_TO_PASS: ["a.test.ts::x"], ABSENT_TO_PASS: ["a.test.ts::y"], PASS_TO_PASS: ["a.test.ts::z"],
      image: "node:24-bookworm", image_digest: "node:24-bookworm@sha256:abc", eval_script: "set -e\necho $REPORT_DIR\n", log_parser: "node-test-json",
    };
    const rejected = rejectedWithoutRun(row({ instance_id: "org__repo-T-2", patch: "" }), "no_source_patch", "x");
    const sql = writebackSql([validated, rejected]);
    expect(sql).toContain(`"FAIL_TO_PASS" = $hecate$["a.test.ts::x","a.test.ts::y"]$hecate$::jsonb`);
    expect(sql).toContain("image = $hecate$node:24-bookworm@sha256:abc$hecate$");
    expect(sql).toContain("eval_script = $hecate$set -e\necho $REPORT_DIR\n$hecate$");
    expect(sql).toContain("validation_status = $hecate$validated$hecate$");
    expect(sql).toContain("|| array[$hecate$validation_reason:no_source_patch$hecate$]");
    expect(sql).toContain("f not like 'validation_reason:%' and f <> 'proof_outside_test_patch'");
    const flagged = writebackSql([{ ...validated, proof_outside_test_patch: ["a.test.ts::y"] }, { ...rejected, proof_outside_test_patch: ["z::z"] }]);
    expect(flagged).toContain("|| array[$hecate$proof_outside_test_patch$hecate$]");
    expect(flagged).toContain("|| array[$hecate$validation_reason:no_source_patch$hecate$, $hecate$proof_outside_test_patch$hecate$]");
    expect(sql.match(/update public.cse_benchmark_tasks/g)).toHaveLength(1);
    expect(sql.match(/update public.cse_benchmark_task_sources/g)).toHaveLength(2);
    expect(sql.startsWith("-- Generated")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });

  it("leaves env_error rows alone", () => {
    const sql = writebackSql([rejectedWithoutRun(row(), "env_error", "docker died")]);
    expect(sql).toContain("skipped: env_error is not a verdict");
    expect(sql).not.toContain("update public.");
  });

  it("picks a dollar-quote tag the text cannot contain", () => {
    const r = rejectedWithoutRun(row({ instance_id: "weird$hecate$id", patch: "" }), "no_source_patch", "x");
    expect(writebackSql([r])).toContain("$hecatex$weird$hecate$id$hecatex$");
  });
});
