// The write-back as data: what each row's result changes in the database. The same rules as
// `writebackSql` (batch.ts), expressed as plain updates so a script can apply them through the
// Supabase client with the service-role key, and a test can check them without a database.

import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export const REASON_FLAG_PREFIX = "validation_reason:";

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
    });
  }
  return ops;
}

/** The row's flags with any old reason flag removed and the new one (if any) appended. */
export function mergeFlags(existing: string[], reasonFlag: string | null): string[] {
  const kept = existing.filter((f) => !f.startsWith(REASON_FLAG_PREFIX));
  return reasonFlag ? [...kept, reasonFlag] : kept;
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
    const flags = mergeFlags(data?.[0]?.flags ?? [], op.reasonFlag);
    const result = await client.from("cse_benchmark_task_sources").update({ validation_status: op.validation_status, flags, updated_at: now() }).eq("instance_id", op.instance_id);
    if (result.error) throw new Error(`${op.instance_id}: cse_benchmark_task_sources: ${result.error.message}`);
    lines.push(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag.slice(REASON_FLAG_PREFIX.length)})` : ""}${op.task ? `, ${op.task.FAIL_TO_PASS.length} F2P / ${op.task.PASS_TO_PASS.length} P2P written` : ""}`);
  }
  return lines;
}
