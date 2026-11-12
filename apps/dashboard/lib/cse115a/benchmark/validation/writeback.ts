// The write-back as data: what each row's result changes in the database. The same rules as
// `writebackSql` (batch.ts), expressed as plain updates so a script can apply them through the
// Supabase client with the service-role key, and a test can check them without a database.

import type { BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import { extractAddedTests } from "@/lib/cse115a/benchmark/extractTests";
import type { HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";
import { STAFF_REBUILT_FLAG } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export const REASON_FLAG_PREFIX = "validation_reason:";
/** Set on a row whose proving tests include one outside the files the test patch touched. */
export const PROOF_OUTSIDE_FLAG = "proof_outside_test_patch";
/** Set on a validated row whose patch changes code files no proving test reaches by imports (untestedFiles.ts). */
export const UNTESTED_FILES_FLAG = "untested_files";

/** Whether a flag is one the validator owns (and so replaces on every write-back). */
export function isManagedFlag(flag: string): boolean {
  return flag.startsWith(REASON_FLAG_PREFIX) || flag === PROOF_OUTSIDE_FLAG || flag === UNTESTED_FILES_FLAG;
}

/** The validator-owned flags a result produces: the reason flag when rejected, the diagnostic flags when they apply. */
export function managedFlags(r: ValidationResult): string[] {
  const flags: string[] = [];
  if (r.validation_status === "rejected") flags.push(`${REASON_FLAG_PREFIX}${r.reason}`);
  // `?? []`: result files written before this field existed are still readable.
  if ((r.proof_outside_test_patch ?? []).length > 0) flags.push(PROOF_OUTSIDE_FLAG);
  if ((r.untested_files ?? []).length > 0) flags.push(UNTESTED_FILES_FLAG);
  return flags;
}

/**
 * The capture flags (BuildFlag, buildInstance.ts) a staff rebuild has made untrue. Capture's flags
 * stay on the source row through write-back, so these must be removed explicitly. Only statements
 * about the captured diff qualify, and each only when the rebuilt patches contradict it:
 * - `no_test_patch`: the rebuilt test_patch is non-empty;
 * - `no_source_patch`: the rebuilt patch is non-empty;
 * - `diff_missing`: the rebuilt patch (or test_patch) is non-empty, so the diff exists;
 * - `diff_truncated`: always, since a rebuild takes the full `git diff M^1 M` (rebuildRow.ts);
 * - `no_tests_found`: the rebuilt test_patch adds a test that extractAddedTests finds.
 * Kept: `base_commit_from_*` (how capture chose the base) and `pii_scrubbed_from_patch` (the result
 * does not say whether the rebuild's own scrubbing changed anything, and keeping it errs toward review).
 */
export function staleCaptureFlags(rebuild: { patch: string; test_patch: string }): BuildFlag[] {
  const hasPatch = rebuild.patch.trim() !== "";
  const hasTestPatch = rebuild.test_patch.trim() !== "";
  const stale: BuildFlag[] = [];
  if (hasTestPatch) stale.push("no_test_patch");
  if (hasPatch) stale.push("no_source_patch");
  if (hasPatch || hasTestPatch) stale.push("diff_missing");
  stale.push("diff_truncated");
  if (hasTestPatch && extractAddedTests(rebuild.test_patch).length > 0) stale.push("no_tests_found");
  return stale;
}

export type TaskUpdate = {
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
  image: string;
  eval_script: string;
  log_parser: string;
  /**
   * The Harbor recipe, when the result carries one. A result file written before the recipe existed
   * leaves the column as it is rather than clearing a recipe a later run stored.
   */
  harbor_env?: HarborEnv;
};

/** The rebuilt base and patches a staff-rebuilt row writes, whatever its verdict. */
export type RebuildUpdate = { base_commit: string; environment_setup_commit: string; patch: string; test_patch: string };

export type WritebackOp = {
  instance_id: string;
  /** Null for a rejected row: its lists stay as the app guessed them. */
  task: TaskUpdate | null;
  /** Set for a row rebuilt by staff (rebuildRow.ts); null for every captured row. */
  rebuild: RebuildUpdate | null;
  validation_status: "validated" | "rejected";
  /** The reason flag to carry, or null to carry none (validated). */
  reasonFlag: string | null;
  /** Every validator-owned flag to carry (the reason flag plus any diagnostic flags). */
  flags: string[];
  /** How many files `untested_files` lists (0 when none), for the output line. */
  untestedFiles: number;
  /** Capture flags to remove if the row has them (a rebuilt row's staleCaptureFlags; empty otherwise). */
  dropCaptureFlags: string[];
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
            ...(r.harbor_env ? { harbor_env: r.harbor_env } : {}),
          }
        : null,
      rebuild: r.rebuild
        ? { base_commit: r.rebuild.base_commit, environment_setup_commit: r.rebuild.base_commit, patch: r.rebuild.patch, test_patch: r.rebuild.test_patch }
        : null,
      validation_status: r.validation_status,
      reasonFlag: r.validation_status === "rejected" ? `${REASON_FLAG_PREFIX}${r.reason}` : null,
      flags: r.rebuild ? [...managedFlags(r), STAFF_REBUILT_FLAG] : managedFlags(r),
      untestedFiles: (r.untested_files ?? []).length,
      dropCaptureFlags: r.rebuild ? staleCaptureFlags(r.rebuild) : [],
    });
  }
  return ops;
}

/**
 * The row's flags with every validator-owned flag (and every flag in `drop`, the capture flags a
 * rebuild made untrue) removed and the new ones (if any) appended.
 */
export function mergeFlags(existing: string[], flags: string[] | string | null, drop: readonly string[] = []): string[] {
  const kept = existing.filter((f) => !isManagedFlag(f) && !drop.includes(f));
  const added = flags == null ? [] : typeof flags === "string" ? [flags] : flags;
  // The staff-rebuilt flag is not validator-owned (a later captured result must not drop it), so it
  // can already be in `kept`; never add it twice.
  return [...kept, ...added.filter((f) => !kept.includes(f))];
}

/** The slice of the Supabase client the write-back uses, so a test can hand in a fake. */
export type WritebackClient = {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): Promise<{ data: Array<{ flags: string[] }> | null; error: { message: string } | null }> };
    update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
  };
};

/** The migration that adds `cse_benchmark_tasks.harbor_env`; write-back needs it applied first. */
export const HARBOR_ENV_MIGRATION = "supabase/migrations/20261110000000_cse115a_benchmark_harbor_env.sql";

/** The slice of the Supabase client the column check uses. */
export type ColumnProbeClient = {
  from(table: string): { select(columns: string): { limit(count: number): PromiseLike<{ error: { message: string } | null }> } };
};

/**
 * Throws a clear error when the database has no `harbor_env` column yet (one cheap select), so a
 * write-back never half-applies against an unmigrated project.
 */
export async function assertHarborEnvColumn(client: ColumnProbeClient): Promise<void> {
  const { error } = await client.from("cse_benchmark_tasks").select("harbor_env").limit(1);
  if (!error) return;
  if (/harbor_env/.test(error.message)) throw new Error(`cse_benchmark_tasks has no harbor_env column: apply migration ${HARBOR_ENV_MIGRATION} first (${error.message})`);
  throw new Error(`could not check for the harbor_env column: ${error.message}`);
}

/** Applies the ops; returns one line per row describing what changed. Throws on the first database error. */
export async function applyWriteback(client: WritebackClient, ops: WritebackOp[], now: () => string = () => new Date().toISOString()): Promise<string[]> {
  const lines: string[] = [];
  for (const op of ops) {
    if (op.task || op.rebuild) {
      const { error } = await client.from("cse_benchmark_tasks").update({ ...op.task, ...op.rebuild }).eq("instance_id", op.instance_id);
      if (error) throw new Error(`${op.instance_id}: cse_benchmark_tasks: ${error.message}`);
    }
    const { data, error } = await client.from("cse_benchmark_task_sources").select("flags").eq("instance_id", op.instance_id);
    if (error) throw new Error(`${op.instance_id}: read flags: ${error.message}`);
    const existing = data?.[0]?.flags ?? [];
    const flags = mergeFlags(existing, op.flags, op.dropCaptureFlags);
    const dropped = op.dropCaptureFlags.filter((f) => existing.includes(f));
    const result = await client.from("cse_benchmark_task_sources").update({ validation_status: op.validation_status, flags, updated_at: now() }).eq("instance_id", op.instance_id);
    if (result.error) throw new Error(`${op.instance_id}: cse_benchmark_task_sources: ${result.error.message}`);
    const proof = op.flags.includes(PROOF_OUTSIDE_FLAG) ? `, flagged ${PROOF_OUTSIDE_FLAG}` : "";
    const untested = op.flags.includes(UNTESTED_FILES_FLAG) ? `, flagged ${UNTESTED_FILES_FLAG} (${op.untestedFiles})` : "";
    const rebuilt = op.rebuild ? `, rebuilt base ${op.rebuild.base_commit.slice(0, 7)} and patches written, flagged ${STAFF_REBUILT_FLAG}` : "";
    lines.push(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag.slice(REASON_FLAG_PREFIX.length)})` : ""}${op.task ? `, ${op.task.FAIL_TO_PASS.length} F2P / ${op.task.PASS_TO_PASS.length} P2P written${op.task.harbor_env ? " with harbor_env" : ""}` : ""}${proof}${untested}${rebuilt}${dropped.length ? `, dropped capture flag(s): ${dropped.join(", ")}` : ""}`);
  }
  return lines;
}
