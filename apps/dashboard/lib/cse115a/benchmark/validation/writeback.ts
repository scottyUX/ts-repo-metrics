// The write-back as data: what each row's result changes in the database. The same rules as
// `writebackSql` (batch.ts), expressed as plain updates so a script can apply them through the
// Supabase client with the service-role key, and a test can check them without a database.

import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export const REASON_FLAG_PREFIX = "validation_reason:";
/** Set on a row whose proving tests include one outside the files the test patch touched. */
export const PROOF_OUTSIDE_FLAG = "proof_outside_test_patch";

/** Whether a flag is one the validator owns (and so replaces on every write-back). */
export function isManagedFlag(flag: string): boolean {
  return flag.startsWith(REASON_FLAG_PREFIX) || flag === PROOF_OUTSIDE_FLAG;
}

/** The validator-owned flags a result produces: the reason flag when rejected, the proof flag when it applies. */
export function managedFlags(r: ValidationResult): string[] {
  const flags: string[] = [];
  if (r.validation_status === "rejected") flags.push(`${REASON_FLAG_PREFIX}${r.reason}`);
  // `?? []`: result files written before this field existed are still readable.
  if ((r.proof_outside_test_patch ?? []).length > 0) flags.push(PROOF_OUTSIDE_FLAG);
  return flags;
}

export type TaskUpdate = {
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
  image: string;
  eval_script: string;
  log_parser: string;
};

export type WritebackOp = {
  instance_id: string;
  /** Null for a rejected row: its lists stay as the app guessed them. */
  task: TaskUpdate | null;
  validation_status: "validated" | "rejected";
  /** The reason flag to carry, or null to carry none (validated). */
  reasonFlag: string | null;
  /** Every validator-owned flag to carry (the reason flag plus any diagnostic flags). */
  flags: string[];
};

/** One op per result; `env_error` rows produce none (our run failed, the row stays a candidate). */
export function writebackPlan(results: ValidationResult[]): WritebackOp[] {
  const ops: WritebackOp[] = [];
  for (const r of results) {
    if (r.reason === "env_error") continue;
    ops.push({
      instance_id: r.instance_id,
      task: r.validation_status === "validated"
        ? {
            FAIL_TO_PASS: [...r.FAIL_TO_PASS, ...r.ABSENT_TO_PASS],
            PASS_TO_PASS: r.PASS_TO_PASS,
            image: r.image_digest ?? r.image ?? "",
            eval_script: r.eval_script ?? "",
            log_parser: r.log_parser ?? "",
          }
        : null,
      validation_status: r.validation_status,
      reasonFlag: r.validation_status === "rejected" ? `${REASON_FLAG_PREFIX}${r.reason}` : null,
      flags: managedFlags(r),
    });
  }
  return ops;
}

/** The row's flags with every validator-owned flag removed and the new ones (if any) appended. */
export function mergeFlags(existing: string[], flags: string[] | string | null): string[] {
  const kept = existing.filter((f) => !isManagedFlag(f));
  const added = flags == null ? [] : typeof flags === "string" ? [flags] : flags;
  return [...kept, ...added];
}

/** The slice of the Supabase client the write-back uses, so a test can hand in a fake. */
export type WritebackClient = {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): Promise<{ data: Array<{ flags: string[] }> | null; error: { message: string } | null }> };
    update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
  };
};

/** Applies the ops; returns one line per row describing what changed. Throws on the first database error. */
export async function applyWriteback(client: WritebackClient, ops: WritebackOp[], now: () => string = () => new Date().toISOString()): Promise<string[]> {
  const lines: string[] = [];
  for (const op of ops) {
    if (op.task) {
      const { error } = await client.from("cse_benchmark_tasks").update(op.task).eq("instance_id", op.instance_id);
      if (error) throw new Error(`${op.instance_id}: cse_benchmark_tasks: ${error.message}`);
    }
    const { data, error } = await client.from("cse_benchmark_task_sources").select("flags").eq("instance_id", op.instance_id);
    if (error) throw new Error(`${op.instance_id}: read flags: ${error.message}`);
    const flags = mergeFlags(data?.[0]?.flags ?? [], op.flags);
    const result = await client.from("cse_benchmark_task_sources").update({ validation_status: op.validation_status, flags, updated_at: now() }).eq("instance_id", op.instance_id);
    if (result.error) throw new Error(`${op.instance_id}: cse_benchmark_task_sources: ${result.error.message}`);
    const proof = op.flags.includes(PROOF_OUTSIDE_FLAG) ? `, flagged ${PROOF_OUTSIDE_FLAG}` : "";
    lines.push(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag.slice(REASON_FLAG_PREFIX.length)})` : ""}${op.task ? `, ${op.task.FAIL_TO_PASS.length} F2P / ${op.task.PASS_TO_PASS.length} P2P written` : ""}${proof}`);
  }
  return lines;
}
