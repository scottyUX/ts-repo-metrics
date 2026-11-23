import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { BenchmarkSave, Submission } from "./runner";

// Decides what a benchmark job writes when the instance is already in the database. Every Submit
// (and every resubmission after an unlock) re-captures each task, and the capture would replace a
// row that staff have validated, rejected or rebuilt since. The rule: if a source row for the
// instance has left 'candidate' and came from the same PR merge commit, the work under the row has
// not changed, so the instance is kept and the new source row inherits that source's status and
// flags. A different merge commit means the student's PR changed: the instance is captured again
// and the new source row goes back to 'candidate' for the validator. So does a row captured under the
// other diff rule (#382): a source is "same" only when both or neither have `base_commit_from_merge_base`,
// because a row from before #382 holds a different base and patch for the same merge commit. Pure, so it is tested
// without a database; supabaseStore reads the stored sources and applies the plan.

/** A source row already stored for an instance, with the merge commit of the task it was captured from. */
export type StoredSource = {
  instance_id: string;
  assignment_submission_id: string;
  task_slot: number;
  validation_status: "candidate" | "validated" | "rejected";
  flags: string[];
  /** `pr.mergeCommitSha` of the task in that source's submission snapshot; null when unknown. */
  merge_commit: string | null;
};

export type SourceUpsert = {
  instance_id: string;
  course_id: string;
  user_id: string;
  assignment_submission_id: string;
  task_slot: number;
  flags: string[];
  updated_at: string;
  /** Set only when the plan decides it; left out, an existing row keeps its status and a new one starts as 'candidate'. */
  validation_status?: StoredSource["validation_status"];
};

export type BenchmarkSavePlan = {
  /** Instances to upsert into cse_benchmark_tasks; each overwrites the row's validation fields, harbor_env and validation_detail included (null). */
  tasks: BenchmarkInstance[];
  /** Source rows to upsert, one per saved row. */
  sources: SourceUpsert[];
  /** Instance ids kept as stored, for the job log. */
  kept: string[];
};

/** The flag of a row captured on the merge-base rule (#382); its presence tells the two capture rules apart. */
const MERGE_BASE_FLAG = "base_commit_from_merge_base";

/**
 * #437: the flag of a row whose task has extra PRs. It follows this capture's task, never a settled source's: a new
 * attempt with the same main PR carries no extra PRs over, so it does not carry the flag over either.
 */
const EXTRA_CODE_PRS_FLAG = "extra_code_prs";

export function planBenchmarkSave(submission: Submission, rows: BenchmarkSave[], stored: StoredSource[], now: string): BenchmarkSavePlan {
  const plan: BenchmarkSavePlan = { tasks: [], sources: [], kept: [] };
  for (const row of rows) {
    const id = row.instance.instance_id;
    const base: SourceUpsert = {
      instance_id: id,
      course_id: submission.course_id,
      user_id: submission.user_id,
      assignment_submission_id: submission.id,
      task_slot: row.slot,
      flags: row.flags,
      updated_at: now,
    };
    const settled = stored.filter((s) => s.instance_id === id && s.validation_status !== "candidate");
    const mergeBaseRule = row.flags.includes(MERGE_BASE_FLAG);
    const same = settled.find((s) => s.merge_commit != null && s.merge_commit === row.mergeCommit
      && s.flags.includes(MERGE_BASE_FLAG) === mergeBaseRule);
    if (same) {
      // Unchanged PR: keep the instance (validated lists, a staff rebuild) and carry the status and
      // every flag the settled source has (validator and staff flags) onto this source row.
      plan.kept.push(id);
      plan.sources.push({ ...base, flags: [...new Set([...row.flags, ...same.flags.filter((flag) => flag !== EXTRA_CODE_PRS_FLAG)])], validation_status: same.validation_status });
    } else if (settled.length > 0) {
      // The PR changed since the row was judged, or the row was captured under the other diff rule (#382):
      // capture it again and send it back to the validator.
      // The capture's validation fields are empty, and the Harbor recipe and validation detail go with them.
      plan.tasks.push({ ...row.instance, harbor_env: null, validation_detail: null });
      plan.sources.push({ ...base, validation_status: "candidate" });
    } else {
      plan.tasks.push({ ...row.instance, harbor_env: null, validation_detail: null });
      plan.sources.push(base);
    }
  }
  return plan;
}

/** The merge commit of a task in a stored submission snapshot, or null. */
export function snapshotMergeCommit(snapshot: unknown, slot: number): string | null {
  const tasks = (snapshot as { tasks?: Array<{ slot?: number; pr?: { mergeCommitSha?: string } }> } | null)?.tasks ?? [];
  return tasks.find((task) => task.slot === slot)?.pr?.mergeCommitSha ?? null;
}

/** One extra PR of a task as the benchmark records it (#437): no diff text. */
export type ExtraPrProvenance = { pr_number: number; merge_commit: string; base_commit: string; head_commit: string | null };

/**
 * #437: the extra PRs of the task in `slot` of a stored submission snapshot, in merge order, as a later validator
 * step would need them to try to combine them with the main PR: each one's number, merge commit, base commit and
 * head commit. They live where the row's other provenance lives: the source row (cse_benchmark_task_sources) names
 * its submission and slot, and that submission's snapshot holds the task (its merge commit, snapshotMergeCommit; its
 * PR refs, snapshotCopyRefs; and these). Nothing of them goes into the exported row. Empty when there are none.
 */
export function snapshotExtraCodePrs(snapshot: unknown, slot: number): ExtraPrProvenance[] {
  type Saved = { slot?: number; extraCodePrs?: Array<{ prNumber?: unknown; mergeCommitSha?: unknown; baseCommit?: unknown; headCommit?: unknown; mergedAt?: unknown }> };
  const tasks = (snapshot as { tasks?: Saved[] } | null)?.tasks ?? [];
  const task = Array.isArray(tasks) ? tasks.find((t) => t?.slot === slot) : undefined;
  const extras = Array.isArray(task?.extraCodePrs) ? task.extraCodePrs : [];
  return extras
    .filter((extra) => typeof extra?.prNumber === "number" && typeof extra.mergeCommitSha === "string" && typeof extra.baseCommit === "string")
    .sort((a, b) => Date.parse(String(a.mergedAt)) - Date.parse(String(b.mergedAt)) || (a.prNumber as number) - (b.prNumber as number))
    .map((extra) => ({
      pr_number: extra.prNumber as number,
      merge_commit: extra.mergeCommitSha as string,
      base_commit: extra.baseCommit as string,
      head_commit: typeof extra.headCommit === "string" ? extra.headCommit : null,
    }));
}

/**
 * What a repo copy (#298) takes from the stored submission snapshot's task in `slot`: the PR's number
 * (`prNumber`), its merge commit (`pr.mergeCommitSha`) and, for a task whose task file came in a
 * separate PR, that PR's number (`taskFilePr.number`). A field the snapshot lacks is left out.
 */
export function snapshotCopyRefs(snapshot: unknown, slot: number): { pr_number?: number; merge_commit?: string; task_file_pr_number?: number } {
  type Saved = { slot?: number; prNumber?: unknown; pr?: { mergeCommitSha?: unknown }; taskFilePr?: { number?: unknown } };
  const tasks = (snapshot as { tasks?: Saved[] } | null)?.tasks ?? [];
  const task = Array.isArray(tasks) ? tasks.find((t) => t?.slot === slot) : undefined;
  if (!task) return {};
  return {
    ...(typeof task.prNumber === "number" ? { pr_number: task.prNumber } : {}),
    ...(typeof task.pr?.mergeCommitSha === "string" && task.pr.mergeCommitSha ? { merge_commit: task.pr.mergeCommitSha } : {}),
    ...(typeof task.taskFilePr?.number === "number" ? { task_file_pr_number: task.taskFilePr.number } : {}),
  };
}
