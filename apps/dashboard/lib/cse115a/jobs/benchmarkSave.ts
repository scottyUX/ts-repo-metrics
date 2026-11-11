import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { BenchmarkSave, Submission } from "./runner";

// Decides what a benchmark job writes when the instance is already in the database. Every Submit
// (and every resubmission after an unlock) re-captures each task, and the capture would replace a
// row that staff have validated, rejected or rebuilt since. The rule: if a source row for the
// instance has left 'candidate' and came from the same PR merge commit, the work under the row has
// not changed, so the instance is kept and the new source row inherits that source's status and
// flags. A different merge commit means the student's PR changed: the instance is captured again
// and the new source row goes back to 'candidate' for the validator. Pure, so it is tested
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
  /** Instances to upsert into cse_benchmark_tasks. */
  tasks: BenchmarkInstance[];
  /** Source rows to upsert, one per saved row. */
  sources: SourceUpsert[];
  /** Instance ids kept as stored, for the job log. */
  kept: string[];
};

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
    const same = settled.find((s) => s.merge_commit != null && s.merge_commit === row.mergeCommit);
    if (same) {
      // Unchanged PR: keep the instance (validated lists, a staff rebuild) and carry the status and
      // every flag the settled source has (validator and staff flags) onto this source row.
      plan.kept.push(id);
      plan.sources.push({ ...base, flags: [...new Set([...row.flags, ...same.flags])], validation_status: same.validation_status });
    } else if (settled.length > 0) {
      // The PR changed since the row was judged: capture it again and send it back to the validator.
      plan.tasks.push(row.instance);
      plan.sources.push({ ...base, validation_status: "candidate" });
    } else {
      plan.tasks.push(row.instance);
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
