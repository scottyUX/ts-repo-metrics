import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobStore, Submission } from "./runner";

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

/** JobStore backed by the service-role Supabase client. */
export function supabaseJobStore(db: SupabaseClient): JobStore {
  return {
    async claim(kinds) {
      const { data, error } = await db.rpc("claim_cse_grading_job", { p_kinds: kinds });
      check(error, "claim a job");
      return ((data as Job[] | null) ?? [])[0] ?? null;
    },
    async loadSubmission(id) {
      const { data, error } = await db.from("cse_assignment_submissions")
        .select("id,status,snapshot,superseded_at").eq("id", id).maybeSingle();
      check(error, "load the submission");
      return data as Submission | null;
    },
    async setSubmissionStatus(id, status) {
      const { error } = await db.from("cse_assignment_submissions")
        .update({ status }).eq("id", id).neq("status", "released");
      check(error, "update the submission status");
    },
    async saveGrades(submissionId, grades) {
      const now = new Date().toISOString();
      const { error } = await db.from("cse_task_grades").upsert(
        grades.map((grade) => ({
          assignment_submission_id: submissionId,
          task_slot: grade.slot,
          rubric: grade.rubric,
          agent_total: grade.agentTotal,
          needs_review: grade.needsReview,
          model: grade.model,
          prompt_version: grade.promptVersion,
          graded_at: now,
        })),
        { onConflict: "assignment_submission_id,task_slot" },
      );
      check(error, "save grades");
    },
    async finishJob(id, outcome) {
      const now = new Date().toISOString();
      const patch = outcome.status === "succeeded"
        ? { status: "succeeded", locked_at: null, last_error: null, updated_at: now }
        : outcome.status === "queued"
          ? { status: "queued", locked_at: null, run_after: outcome.runAfter.toISOString(), last_error: outcome.error, updated_at: now }
          : { status: "failed", locked_at: null, last_error: outcome.error, updated_at: now };
      const { error } = await db.from("cse_grading_jobs").update(patch).eq("id", id);
      check(error, "finish the job");
    },
  };
}
