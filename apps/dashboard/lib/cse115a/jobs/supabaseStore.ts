import type { SupabaseClient } from "@supabase/supabase-js";
import { planBenchmarkSave, snapshotMergeCommit, type StoredSource } from "./benchmarkSave";
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
        .select("id,course_id,user_id,assignment_number,status,snapshot,superseded_at").eq("id", id).maybeSingle();
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
    async loadRepoMetrics(analysisResultId) {
      const { data, error } = await db.from("analyses").select("report_json").eq("result_id", analysisResultId).maybeSingle();
      check(error, "load the Repo Metrics report");
      return data?.report_json ?? null;
    },
    async loadStudentEmail(courseId, userId) {
      const { data, error } = await db.from("cse_course_memberships")
        .select("ucsc_email").eq("course_id", courseId).eq("user_id", userId).maybeSingle();
      check(error, "load the student's email");
      return (data?.ucsc_email as string | undefined) ?? null;
    },
    async saveBenchmark(submission, rows) {
      if (rows.length === 0) return;
      const { data, error: readError } = await db.from("cse_benchmark_task_sources")
        .select("instance_id,assignment_submission_id,task_slot,validation_status,flags,cse_assignment_submissions(snapshot)")
        .in("instance_id", rows.map((row) => row.instance.instance_id));
      check(readError, "read stored benchmark sources");
      type Row = Omit<StoredSource, "merge_commit"> & { cse_assignment_submissions: { snapshot: unknown } | null };
      const stored: StoredSource[] = ((data ?? []) as unknown as Row[]).map(({ cse_assignment_submissions: sub, ...source }) => ({
        ...source,
        flags: source.flags ?? [],
        merge_commit: snapshotMergeCommit(sub?.snapshot, source.task_slot),
      }));
      const plan = planBenchmarkSave(submission, rows, stored, new Date().toISOString());
      if (plan.tasks.length > 0) {
        const { error } = await db.from("cse_benchmark_tasks").upsert(plan.tasks, { onConflict: "instance_id" });
        check(error, "save benchmark tasks");
      }
      // One upsert per source row: some carry validation_status and some do not, and a bulk upsert
      // would set the missing column to null.
      for (const source of plan.sources) {
        const { error } = await db.from("cse_benchmark_task_sources").upsert(source, { onConflict: "assignment_submission_id,task_slot" });
        check(error, "save benchmark sources");
      }
    },
  };
}
