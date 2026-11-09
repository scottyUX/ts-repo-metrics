// The pure parts of the batch: reading a list of rows, deciding which rows can run at all, and
// summarizing results. The script around it does the cloning and Docker.

import type { TaskRow, ValidationReason, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { managedFlags, PROOF_OUTSIDE_FLAG, REASON_FLAG_PREFIX } from "@/lib/cse115a/benchmark/validation/writeback";

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
    modified_tests: [], unmatched_static_ids: [], proof_outside_test_patch: [],
    validation_status: "rejected", reason, detail, timings: {},
  };
}

/** One step of the funnel: how many rows got this far, and how many fell out here. */
export type FunnelStage = { stage: string; reached: number; dropped: number };

export type Summary = {
  total: number;
  validated: number;
  rejected: number;
  byReason: Record<string, number>;
  /** Rows with at least one proving test outside the test patch's files (diagnostic). */
  proofOutsideTestPatch: number;
  funnel: FunnelStage[];
  rows: Array<{ instance_id: string; status: string; reason: string; f2p: number; a2p: number; p2p: number; regressions: number; flaky: number; outside: number; seconds: number }>;
};

/**
 * The stages a row passes through, in order, each as a test on its result. A row is counted at a
 * stage only if it passed every earlier one, so the counts can only go down and the last stage's
 * `reached` equals the validated count. `env_error` rows drop at "ran" (ours to rerun, not the
 * student's fault), which is why "ran" is a stage of its own.
 */
const FUNNEL: Array<[stage: string, passes: (r: ValidationResult) => boolean]> = [
  ["captured", () => true],
  ["has both patches", (r) => r.reason !== "no_source_patch" && r.reason !== "no_test_patch"],
  ["environment supported", (r) => r.reason !== "env_unsupported"],
  ["ran", (r) => r.reason !== "env_error"],
  ["has a proving test", (r) => r.FAIL_TO_PASS.length + r.ABSENT_TO_PASS.length > 0],
  ["no regressions", (r) => r.regressions.length === 0 && r.regression_skips.length === 0],
  ["validated", (r) => r.validation_status === "validated"],
];

export function funnel(results: ValidationResult[]): FunnelStage[] {
  let remaining = results;
  const stages: FunnelStage[] = [];
  for (const [stage, passes] of FUNNEL) {
    const next = remaining.filter(passes);
    stages.push({ stage, reached: next.length, dropped: remaining.length - next.length });
    remaining = next;
  }
  return stages;
}

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
      regressions: r.regressions.length + r.regression_skips.length, flaky: r.flaky.length,
      outside: (r.proof_outside_test_patch ?? []).length, seconds,
    };
  });
  return {
    total: results.length,
    validated: results.filter((r) => r.validation_status === "validated").length,
    rejected: results.filter((r) => r.validation_status === "rejected").length,
    byReason,
    proofOutsideTestPatch: results.filter((r) => (r.proof_outside_test_patch ?? []).length > 0).length,
    funnel: funnel(results),
    rows,
  };
}

/** The summary as Markdown: headline, funnel table, per-row table. Ready for Slack or the deliverable note. */
export function summaryMarkdown(summary: Summary): string {
  const lines = [
    `${summary.validated} validated, ${summary.rejected} rejected of ${summary.total}` +
      (Object.keys(summary.byReason).length ? ` (${Object.entries(summary.byReason).map(([k, v]) => `${k}: ${v}`).join(", ")})` : "") +
      (summary.proofOutsideTestPatch ? `; ${summary.proofOutsideTestPatch} flagged proof_outside_test_patch` : ""),
    "",
    "| stage | reached | dropped |",
    "|---|---|---|",
    ...summary.funnel.map((f) => `| ${f.stage} | ${f.reached} | ${f.dropped} |`),
    "",
    "| instance_id | status | reason | F2P | A2P | P2P | regressions | flaky | outside | seconds |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...summary.rows.map((r) => `| ${r.instance_id} | ${r.status} | ${r.reason} | ${r.f2p} | ${r.a2p} | ${r.p2p} | ${r.regressions} | ${r.flaky} | ${r.outside} | ${r.seconds} |`),
  ];
  return lines.join("\n") + "\n";
}

/** Postgres dollar-quoting with a tag that cannot occur in the text; safe for scripts and diffs. */
function quote(text: string): string {
  let tag = "hecate";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}

/**
 * The write-back as SQL, one statement pair per row, for the Supabase SQL editor (or psql). Verified
 * lists replace the static ones; `image` carries the digest when known; the reason lives in
 * `cse_benchmark_task_sources.flags` as `validation_reason:<reason>` until the schema has a column,
 * and `proof_outside_test_patch` is set when the result lists any such test (see `managedFlags`).
 * `env_error` rows are left untouched (still `candidate`). Rolling back is `validation_status =
 * 'candidate'` plus removing those flags.
 */
export function writebackSql(results: ValidationResult[]): string {
  const lines = [
    "-- Generated by validateBenchmarkBatch.ts. Review, then run in the Supabase SQL editor.",
    "begin;",
  ];
  for (const r of results) {
    const id = quote(r.instance_id);
    const flags = managedFlags(r);
    lines.push("");
    lines.push(`-- ${r.instance_id}: ${r.validation_status}${r.reason ? ` (${r.reason})` : ""}`);
    if (r.reason === "env_error") {
      // Our run failed, not the student's work: the row stays a candidate for the next batch.
      lines.push("-- skipped: env_error is not a verdict; rerun this row.");
      continue;
    }
    if (r.validation_status === "validated") {
      const f2p = quote(JSON.stringify([...r.FAIL_TO_PASS, ...r.ABSENT_TO_PASS]));
      const p2p = quote(JSON.stringify(r.PASS_TO_PASS));
      const image = quote(r.image_digest ?? r.image ?? "");
      lines.push(
        "update public.cse_benchmark_tasks",
        `   set "FAIL_TO_PASS" = ${f2p}::jsonb,`,
        `       "PASS_TO_PASS" = ${p2p}::jsonb,`,
        `       image = ${image},`,
        `       eval_script = ${quote(r.eval_script ?? "")},`,
        `       log_parser = ${quote(r.log_parser ?? "")}`,
        ` where instance_id = ${id};`,
      );
    }
    lines.push(
      "update public.cse_benchmark_task_sources",
      `   set validation_status = ${quote(r.validation_status)},`,
      `       flags = array_remove(array(select f from unnest(flags) as f where f not like '${REASON_FLAG_PREFIX}%' and f <> '${PROOF_OUTSIDE_FLAG}'), null)` +
        (flags.length ? ` || array[${flags.map(quote).join(", ")}]` : "") + ",",
      "       updated_at = now()",
      ` where instance_id = ${id};`,
    );
  }
  lines.push("", "commit;", "");
  return lines.join("\n");
}
