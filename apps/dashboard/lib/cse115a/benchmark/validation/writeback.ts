// The write-back as data: what each row's result changes in the database. The same rules as
// `writebackSql` (batch.ts), expressed as plain updates so a script can apply them through the
// Supabase client with the service-role key, and a test can check them without a database.

import type { BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import { extractAddedTests } from "@/lib/cse115a/benchmark/extractTests";
import type { FixCoverage, UntestedSource } from "@/lib/cse115a/benchmark/validation/fixCoverage";
import type { HarborEnv, HarborGold } from "@/lib/cse115a/benchmark/validation/harbor";
import { STAFF_REBUILT_FLAG } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export const REASON_FLAG_PREFIX = "validation_reason:";
/** Set on a row whose proving tests include one outside the files the test patch touched. */
export const PROOF_OUTSIDE_FLAG = "proof_outside_test_patch";
/**
 * Set on a validated row whose `untested_files` is non-empty: changed code files the proving tests
 * do not run, from the coverage run when there was one (fixCoverage.ts), else from imports (untestedFiles.ts).
 */
export const UNTESTED_FILES_FLAG = "untested_files";
/** Set on a validated row whose Harbor gold check failed (harbor_gold.status === "failed"). */
export const HARBOR_GOLD_FAILED_FLAG = "harbor_gold_failed";

/** Whether a flag is one the validator owns (and so replaces on every write-back). */
export function isManagedFlag(flag: string): boolean {
  return flag.startsWith(REASON_FLAG_PREFIX) || flag === PROOF_OUTSIDE_FLAG || flag === UNTESTED_FILES_FLAG || flag === HARBOR_GOLD_FAILED_FLAG;
}

/** A validated result's gold check: `harbor_gold`, else the copy in `harbor_env.gold`; null when none (or not validated). */
export function resultGold(r: ValidationResult): HarborGold | null {
  if (r.validation_status !== "validated") return null;
  return r.harbor_gold ?? r.harbor_env?.gold ?? null;
}

/** `, gold check passed` / `, gold check failed: <reason>` / `, gold check skipped: <reason>`; empty without a check. */
export function goldNote(gold: HarborGold | null | undefined): string {
  if (!gold) return "";
  return gold.status === "passed" ? ", gold check passed" : `, gold check ${gold.status}: ${gold.reason ?? "no reason recorded"}`;
}

/** The validator-owned flags a result produces: the reason flag when rejected, the diagnostic flags when they apply. */
export function managedFlags(r: ValidationResult): string[] {
  const flags: string[] = [];
  if (r.validation_status === "rejected") flags.push(`${REASON_FLAG_PREFIX}${r.reason}`);
  // `?? []`: result files written before this field existed are still readable.
  if ((r.proof_outside_test_patch ?? []).length > 0) flags.push(PROOF_OUTSIDE_FLAG);
  if ((r.untested_files ?? []).length > 0) flags.push(UNTESTED_FILES_FLAG);
  if (resultGold(r)?.status === "failed") flags.push(HARBOR_GOLD_FAILED_FLAG);
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

/**
 * `cse_benchmark_tasks.validation_detail`: what a validated result says beyond its test lists, copied
 * from the result file and never recomputed. Internal: not a SWE-bench field, and neither export
 * carries it. The `untested_files` flag stays the quick filter; this is the detail behind it.
 */
export type ValidationDetail = {
  /** The coverage run, whole; absent when the result has none (the batch ran without --fix-coverage). */
  fix_coverage?: FixCoverage;
  /** The result's `untested_files`; [] when the result lists none. */
  untested_files: string[];
  /** How that list was made; null when the coverage run was not requested (the list is the import rule's). */
  untested_files_source: UntestedSource | null;
  /** `github` or `snapshot`; null for a result written before the field existed. */
  repo_source: "github" | "snapshot" | null;
  /** The batch's snapshot bundle path for the row; null when it had none. */
  snapshot_bundle: string | null;
  /** How many ABSENT_TO_PASS, flaky, and proof-outside-the-test-patch tests the result lists. */
  counts: { absent_to_pass: number; flaky: number; proof_outside_test_patch: number };
  /** The result's own time (`validated_at`); null when the result file does not record one. */
  validated_at: string | null;
  /** The validator's commit, only when the result records one. */
  validator_commit?: string;
};

/** The detail a validated result writes; null for any other result. */
export function validationDetail(r: ValidationResult): ValidationDetail | null {
  if (r.validation_status !== "validated") return null;
  return {
    ...(r.fix_coverage ? { fix_coverage: r.fix_coverage } : {}),
    untested_files: r.untested_files ?? [],
    untested_files_source: r.untested_files_source ?? null,
    repo_source: r.repo_source ?? null,
    snapshot_bundle: r.snapshot_bundle ?? null,
    counts: { absent_to_pass: r.ABSENT_TO_PASS.length, flaky: r.flaky.length, proof_outside_test_patch: (r.proof_outside_test_patch ?? []).length },
    validated_at: r.validated_at ?? null,
    ...(r.validator_commit ? { validator_commit: r.validator_commit } : {}),
  };
}

/** `detail: N/M files, N/M lines` (files run of files changed, lines covered of lines executable), or `detail: no coverage`. */
export function detailNote(detail: ValidationDetail): string {
  const c = detail.fix_coverage;
  return c ? `detail: ${c.files_run}/${c.files_changed} files, ${c.lines_covered}/${c.lines_executable} lines` : "detail: no coverage";
}

export type TaskUpdate = {
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
  image: string;
  eval_script: string;
  log_parser: string;
  /**
   * The Harbor recipe, when the result carries one. A result file written before the recipe existed
   * leaves the column as it is rather than clearing a recipe a later run stored. Carries `gold` when
   * the result has a gold check; without one, applyWriteback keeps the `gold` already stored.
   */
  harbor_env?: HarborEnv;
  /** What the result says beyond its lists (validationDetail); every validated row writes it. */
  validation_detail: ValidationDetail;
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
  /**
   * The gold check to store in `harbor_env.gold` (validated rows that have one); null leaves any
   * stored `gold` as it is.
   */
  gold: HarborGold | null;
};

/** One op per result; `env_error` rows produce none (our run failed, the row stays a candidate). */
export function writebackPlan(results: ValidationResult[]): WritebackOp[] {
  const ops: WritebackOp[] = [];
  for (const r of results) {
    if (r.reason === "env_error") continue;
    const gold = resultGold(r);
    ops.push({
      instance_id: r.instance_id,
      task: r.validation_status === "validated"
        ? {
            FAIL_TO_PASS: [...r.FAIL_TO_PASS, ...r.ABSENT_TO_PASS],
            PASS_TO_PASS: r.PASS_TO_PASS,
            image: r.image_digest ?? r.image ?? "",
            eval_script: r.eval_script ?? "",
            log_parser: r.log_parser ?? "",
            ...(r.harbor_env ? { harbor_env: gold ? { ...r.harbor_env, gold } : r.harbor_env } : {}),
            validation_detail: validationDetail(r)!,
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
      gold,
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
    select(columns: string): { eq(column: string, value: string): Promise<{ data: Array<{ flags?: string[]; harbor_env?: HarborEnv | null }> | null; error: { message: string } | null }> };
    update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
  };
};

/** The migration that adds `cse_benchmark_tasks.harbor_env`; write-back needs it applied first. */
export const HARBOR_ENV_MIGRATION = "supabase/migrations/20261110000000_cse115a_benchmark_harbor_env.sql";

/** The migration that adds `cse_benchmark_tasks.validation_detail`; write-back needs it applied first. */
export const VALIDATION_DETAIL_MIGRATION = "supabase/migrations/20261114000000_cse115a_benchmark_validation_detail.sql";

/** The slice of the Supabase client the column check uses. */
export type ColumnProbeClient = {
  from(table: string): { select(columns: string): { limit(count: number): PromiseLike<{ error: { message: string } | null }> } };
};

/**
 * Throws a clear error when the database has no `harbor_env` column yet (one cheap select), so a
 * write-back never half-applies against an unmigrated project.
 */
export async function assertHarborEnvColumn(client: ColumnProbeClient): Promise<void> {
  await assertColumn(client, "harbor_env", HARBOR_ENV_MIGRATION);
}

/** The same check for `validation_detail`. */
export async function assertValidationDetailColumn(client: ColumnProbeClient): Promise<void> {
  await assertColumn(client, "validation_detail", VALIDATION_DETAIL_MIGRATION);
}

async function assertColumn(client: ColumnProbeClient, column: string, migration: string): Promise<void> {
  const { error } = await client.from("cse_benchmark_tasks").select(column).limit(1);
  if (!error) return;
  if (error.message.includes(column)) throw new Error(`cse_benchmark_tasks has no ${column} column: apply migration ${migration} first (${error.message})`);
  throw new Error(`could not check for the ${column} column: ${error.message}`);
}

/**
 * The `harbor_env` a validated row's task update writes, given what is stored: the result's recipe
 * with the result's gold check, or with the stored `gold` when the result has none; a result with a
 * gold check but no recipe adds it to the stored recipe (and writes nothing when none is stored).
 * Undefined: leave the column alone. Mirrors writebackSql.
 */
export function harborEnvToWrite(op: WritebackOp, stored: HarborEnv | null | undefined): HarborEnv | undefined {
  const env = op.task?.harbor_env;
  if (env) return op.gold || !stored?.gold ? env : { ...env, gold: stored.gold };
  if (op.task && op.gold && stored) return { ...stored, gold: op.gold };
  return undefined;
}

/** Applies the ops; returns one line per row describing what changed. Throws on the first database error. */
export async function applyWriteback(client: WritebackClient, ops: WritebackOp[], now: () => string = () => new Date().toISOString()): Promise<string[]> {
  const lines: string[] = [];
  for (const op of ops) {
    if (op.task || op.rebuild) {
      let task: Record<string, unknown> | null = op.task;
      // Reading the stored recipe is needed only to keep its gold, or to add one to it.
      if (op.task && (op.task.harbor_env ? !op.gold : op.gold)) {
        const stored = await client.from("cse_benchmark_tasks").select("harbor_env").eq("instance_id", op.instance_id);
        if (stored.error) throw new Error(`${op.instance_id}: read harbor_env: ${stored.error.message}`);
        const env = harborEnvToWrite(op, stored.data?.[0]?.harbor_env);
        task = { ...op.task, harbor_env: env };
        if (!env) delete task.harbor_env;
      }
      const { error } = await client.from("cse_benchmark_tasks").update({ ...task, ...op.rebuild }).eq("instance_id", op.instance_id);
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
    lines.push(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag.slice(REASON_FLAG_PREFIX.length)})` : ""}${op.task ? `, ${op.task.FAIL_TO_PASS.length} F2P / ${op.task.PASS_TO_PASS.length} P2P written${op.task.harbor_env ? " with harbor_env" : ""}, ${detailNote(op.task.validation_detail)}` : ""}${proof}${untested}${rebuilt}${dropped.length ? `, dropped capture flag(s): ${dropped.join(", ")}` : ""}${goldNote(op.gold)}`);
  }
  return lines;
}

/**
 * The write-back the script runs: checks both columns exist (harbor_env, validation_detail), then
 * applies the ops. A missing column stops it before anything is written, naming the migration.
 */
export async function guardedWriteback(client: WritebackClient & ColumnProbeClient, ops: WritebackOp[], now?: () => string): Promise<string[]> {
  await assertHarborEnvColumn(client);
  await assertValidationDetailColumn(client);
  return applyWriteback(client, ops, now);
}
