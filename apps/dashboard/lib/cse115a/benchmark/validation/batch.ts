// The pure parts of the batch: reading a list of rows, deciding which rows can run at all, and
// summarizing results. The script around it does the cloning and Docker.

import type { TaskRow, ValidationReason, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

/** Parses a JSON array (Supabase `json_agg`) or JSON Lines (one row per line). */
export function parseRows(text: string): TaskRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as TaskRow[];
  return trimmed.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as TaskRow);
}

/** A row with no source patch or no test patch is rejected before any container starts. */
export function preflight(row: TaskRow): { reason: ValidationReason; detail: string } | null {
  if (!row.patch || !row.patch.trim()) return { reason: "no_source_patch", detail: "the row has an empty patch" };
  if (!row.test_patch || !row.test_patch.trim()) return { reason: "no_test_patch", detail: "the row has an empty test_patch" };
  return null;
}

/** The result record for a row the batch did not run (preflight failure or a crashed run). */
export function rejectedWithoutRun(row: TaskRow, reason: ValidationReason, detail: string): ValidationResult {
  return {
    instance_id: row.instance_id,
    image: null, eval_script: null, log_parser: null, package_dir: null,
    test_files: [],
    FAIL_TO_PASS: [], ABSENT_TO_PASS: [], PASS_TO_PASS: [], FAIL_TO_FAIL: [],
    regressions: [], regression_skips: [], flaky: [], skipped: [], judged_from_base: [], load_failures: [],
    modified_tests: [], unmatched_static_ids: [],
    validation_status: "rejected", reason, detail, timings: {},
  };
}

export type Summary = {
  total: number;
  validated: number;
  rejected: number;
  byReason: Record<string, number>;
  rows: Array<{ instance_id: string; status: string; reason: string; f2p: number; a2p: number; p2p: number; regressions: number; flaky: number; seconds: number }>;
};

export function summarize(results: ValidationResult[]): Summary {
  const byReason: Record<string, number> = {};
  const rows = results.map((r) => {
    if (r.validation_status === "rejected") byReason[r.reason ?? "unknown"] = (byReason[r.reason ?? "unknown"] ?? 0) + 1;
    const seconds = Math.round(Object.values(r.timings).reduce((a, b) => a + b, 0) / 1000);
    return {
      instance_id: r.instance_id,
      status: r.validation_status,
      reason: r.reason ?? "",
      f2p: r.FAIL_TO_PASS.length, a2p: r.ABSENT_TO_PASS.length, p2p: r.PASS_TO_PASS.length,
      regressions: r.regressions.length + r.regression_skips.length, flaky: r.flaky.length, seconds,
    };
  });
  return {
    total: results.length,
    validated: results.filter((r) => r.validation_status === "validated").length,
    rejected: results.filter((r) => r.validation_status === "rejected").length,
    byReason,
    rows,
  };
}

/** The summary as a Markdown table, ready for a Slack message or the deliverable note. */
export function summaryMarkdown(summary: Summary): string {
  const lines = [
    `${summary.validated} validated, ${summary.rejected} rejected of ${summary.total}` +
      (Object.keys(summary.byReason).length ? ` (${Object.entries(summary.byReason).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""),
    "",
    "| instance_id | status | reason | F2P | A2P | P2P | regressions | flaky | seconds |",
    "|---|---|---|---|---|---|---|---|---|",
    ...summary.rows.map((r) => `| ${r.instance_id} | ${r.status} | ${r.reason} | ${r.f2p} | ${r.a2p} | ${r.p2p} | ${r.regressions} | ${r.flaky} | ${r.seconds} |`),
  ];
  return lines.join("\n") + "\n";
}
