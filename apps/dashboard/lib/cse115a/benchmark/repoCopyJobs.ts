// The repo_copy jobs behind the instructor Benchmark page (#298): what each task's copy is doing, and
// queuing (or re-queuing) the job of a task's submission. The page never clones; the copy line does.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CopyStatus } from "./repoCopy";

export type CopyJobRow = { assignment_submission_id: string; status: "queued" | "running" | "succeeded" | "failed"; last_error: string | null; attempts: number };

/** How the page reaches the jobs table; tests hand in a fake. */
export type RepoCopyJobs = {
  /** The repo_copy job of each submission that has one. Works on a database without the repo_copy migration (none are found). */
  states(submissionIds: string[]): Promise<Map<string, CopyJobRow>>;
  /**
   * Makes each submission's repo_copy job runnable now: inserts it when missing; a failed or succeeded
   * one is reset (attempts 0, no error); a queued or running one is left alone.
   */
  queue(submissionIds: string[]): Promise<void>;
};

export type CopyTaskState = "stored" | "queued" | "running" | "failed" | "missing" | "unknown";

/** A task as the page shows it. */
export type CopyTaskView = {
  instance_id: string; repo: string; base_commit: string; assignment_submission_id: string;
  state: CopyTaskState;
  /** The job's last error (failed, or queued for a retry), or the Storage error when the copy could not be checked. */
  reason: string | null;
};

/**
 * Stored when the store has the copy for the base commit. Otherwise the submission's job decides:
 * queued, running, failed (with its last error); a succeeded job or none is "missing" (a staff
 * rebuild moved the base commit since, say). "unknown" when the store could not be asked.
 */
export function copyTaskViews(status: Array<CopyStatus & { assignment_submission_id: string }>, jobs: Map<string, CopyJobRow>): CopyTaskView[] {
  return status.map((task) => {
    const base = { instance_id: task.instance_id, repo: task.repo, base_commit: task.base_commit, assignment_submission_id: task.assignment_submission_id };
    if (task.stored === true) return { ...base, state: "stored", reason: null };
    const job = jobs.get(task.assignment_submission_id);
    if (job && (job.status === "queued" || job.status === "running" || job.status === "failed")) return { ...base, state: job.status, reason: job.last_error };
    if (task.stored === null) return { ...base, state: "unknown", reason: task.error ?? null };
    return { ...base, state: "missing", reason: null };
  });
}

const PAGE = 100;

export function supabaseRepoCopyJobs(db: SupabaseClient): RepoCopyJobs {
  return {
    async states(submissionIds) {
      const out = new Map<string, CopyJobRow>();
      for (let index = 0; index < submissionIds.length; index += PAGE) {
        const { data, error } = await db.from("cse_grading_jobs").select("assignment_submission_id,status,last_error,attempts")
          .eq("kind", "repo_copy").in("assignment_submission_id", submissionIds.slice(index, index + PAGE));
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as CopyJobRow[]) out.set(row.assignment_submission_id, row);
      }
      return out;
    },
    async queue(submissionIds) {
      const ids = [...new Set(submissionIds)];
      for (let index = 0; index < ids.length; index += PAGE) {
        const slice = ids.slice(index, index + PAGE);
        const inserted = await db.from("cse_grading_jobs")
          .upsert(slice.map((id) => ({ assignment_submission_id: id, kind: "repo_copy" })), { onConflict: "assignment_submission_id,kind", ignoreDuplicates: true });
        if (inserted.error) throw new Error(inserted.error.message);
        const reset = await db.from("cse_grading_jobs")
          .update({ status: "queued", attempts: 0, run_after: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString() })
          .eq("kind", "repo_copy").in("assignment_submission_id", slice).in("status", ["failed", "succeeded"]);
        if (reset.error) throw new Error(reset.error.message);
      }
    },
  };
}
