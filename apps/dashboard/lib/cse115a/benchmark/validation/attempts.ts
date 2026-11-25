// The last attempt (#452): what the validator's last run of a task ended with, when it was not
// validated, as a `validation_attempt:<reason>` flag on the task's source rows. Not a verdict: the
// row's status, its task row and its other flags stay as they are. Written by
// `writebackValidation.ts --attempts`; the Benchmark page reads it to say why a candidate has no
// result yet. A later write-back of the same task, in either mode, replaces it (isManagedFlag).

import { ATTEMPT_FLAG_PREFIX } from "@/lib/cse115a/benchmark/validation/writeback";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

/** Used in place of the result's own reason when its test patch files never loaded after the fix. */
export const NEVER_LOADED_REASON = "test_file_never_loaded";

/** Every reason an attempt flag can carry. */
export const ATTEMPT_REASONS = [
  "no_fail_to_pass", "regressions", "regression_skip", "env_unsupported", "env_error", "no_source_patch", "no_test_patch", NEVER_LOADED_REASON,
] as const;

/**
 * The attempt reason of a result: null for a validated one (those go through the normal write-back)
 * and for one with no reason. A result whose test patch files never loaded after the fix (the
 * summary's "test patch file(s) never loaded after the fix" note) is `test_file_never_loaded`.
 */
export function attemptReason(r: ValidationResult): string | null {
  if (r.validation_status === "validated") return null;
  if ((r.test_files_never_loaded ?? []).length > 0) return NEVER_LOADED_REASON;
  return r.reason ?? null;
}

export type AttemptOp = { instance_id: string; reason: string; flag: string };

export type AttemptPlan = {
  ops: AttemptOp[];
  /** Validated results: left to the normal write-back. */
  skippedValidated: number;
  /** Results that are not validated and carry no reason: nothing to note. */
  skippedNoReason: string[];
};

/** One op per result that is not validated, env_error included. */
export function attemptPlan(results: ValidationResult[]): AttemptPlan {
  const plan: AttemptPlan = { ops: [], skippedValidated: 0, skippedNoReason: [] };
  for (const r of results) {
    if (r.validation_status === "validated") { plan.skippedValidated++; continue; }
    const reason = attemptReason(r);
    if (!reason) { plan.skippedNoReason.push(r.instance_id); continue; }
    plan.ops.push({ instance_id: r.instance_id, reason, flag: `${ATTEMPT_FLAG_PREFIX}${reason}` });
  }
  return plan;
}

/** The row's flags with every attempt flag removed and this one appended: never two attempt flags, every other flag kept. */
export function mergeAttemptFlag(existing: readonly string[], flag: string): string[] {
  return [...existing.filter((f) => !f.startsWith(ATTEMPT_FLAG_PREFIX)), flag];
}

/** The dry run's line, and the real run's line before " noted". */
export function attemptLine(op: AttemptOp): string {
  return `${op.instance_id}: ${op.reason}`;
}

/** The slice of the Supabase client the attempts write uses, so a test can hand in a fake. */
export type AttemptClient = {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): PromiseLike<{ data: Array<{ id?: unknown; validation_status?: unknown; flags?: unknown }> | null; error: { message: string } | null }> };
    update(values: Record<string, unknown>): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
  };
};

export type AttemptOutcome = {
  /** One line per task, in plan order. */
  lines: string[];
  noted: number;
  /** Source rows left alone because a verdict is already stored, by that status. */
  skipped: { validated: number; rejected: number };
  /** Tasks with no source row. */
  missing: number;
};

/**
 * Sets the attempt flag on each op's candidate source rows, one update per row by its id, writing
 * `flags` only: no status, no task row, no `updated_at`. A row already `validated` or `rejected` is
 * left alone and reported. Throws on the first database error.
 */
export async function applyAttempts(client: AttemptClient, ops: AttemptOp[]): Promise<AttemptOutcome> {
  const out: AttemptOutcome = { lines: [], noted: 0, skipped: { validated: 0, rejected: 0 }, missing: 0 };
  for (const op of ops) {
    const { data, error } = await client.from("cse_benchmark_task_sources").select("id,validation_status,flags").eq("instance_id", op.instance_id);
    if (error) throw new Error(`${op.instance_id}: read source rows: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) { out.missing++; out.lines.push(`${attemptLine(op)}, skipped: no source row`); continue; }
    const parts: string[] = [];
    let noted = 0;
    for (const row of rows) {
      const status = row.validation_status;
      if (status === "validated" || status === "rejected") {
        out.skipped[status]++;
        parts.push(`skipped (already ${status})`);
        continue;
      }
      const flags = Array.isArray(row.flags) ? row.flags.map(String) : [];
      const result = await client.from("cse_benchmark_task_sources").update({ flags: mergeAttemptFlag(flags, op.flag) }).eq("id", String(row.id));
      if (result.error) throw new Error(`${op.instance_id}: cse_benchmark_task_sources: ${result.error.message}`);
      noted++;
    }
    if (noted > 0) { out.noted++; parts.unshift(rows.length > 1 ? `noted on ${noted} source rows` : "noted"); }
    out.lines.push(`${attemptLine(op)} ${parts.join(", ")}`);
  }
  return out;
}

/** The run's closing line: how many were noted and what was skipped, by reason. */
export function attemptSummary(outcome: AttemptOutcome): string {
  const skipped = [
    outcome.skipped.validated ? `${outcome.skipped.validated} already validated` : "",
    outcome.skipped.rejected ? `${outcome.skipped.rejected} already rejected` : "",
    outcome.missing ? `${outcome.missing} with no source row` : "",
  ].filter(Boolean);
  return `${outcome.noted} task(s) noted${skipped.length ? `; source rows skipped: ${skipped.join(", ")}` : ""}.`;
}
