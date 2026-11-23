import type { SupabaseClient } from "@supabase/supabase-js";
import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { planBenchmarkSave, snapshotCopyRefs, snapshotMergeCommit, type SourceUpsert, type StoredSource } from "./benchmarkSave";
import type { Job, JobStore, RepoCopyRequeue, Submission } from "./runner";

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

/**
 * Upserts instances into cse_benchmark_tasks and source rows into cse_benchmark_task_sources, as a benchmark
 * job saves them; the staff re-capture (benchmark/recapture.ts) writes through the same path.
 */
export async function writeBenchmarkRows(db: SupabaseClient, tasks: BenchmarkInstance[], sources: SourceUpsert[]): Promise<void> {
  if (tasks.length > 0) {
    const { error } = await db.from("cse_benchmark_tasks").upsert(tasks, { onConflict: "instance_id" });
    check(error, "save benchmark tasks");
  }
  // One upsert per source row: some carry validation_status and some do not, and a bulk upsert
  // would set the missing column to null.
  for (const source of sources) {
    const { error } = await db.from("cse_benchmark_task_sources").upsert(source, { onConflict: "assignment_submission_id,task_slot" });
    check(error, "save benchmark sources");
  }
}

/**
 * Makes a submission's repo_copy job run again: inserted when missing; a failed or succeeded one is set
 * back to queued (attempts 0, no error, runnable now); a queued one is left as it is, and so is a running
 * one (its worker would overwrite the reset when it finishes; it is reported instead).
 */
export async function requeueRepoCopyJob(db: SupabaseClient, submissionId: string): Promise<RepoCopyRequeue> {
  const inserted = await db.from("cse_grading_jobs")
    .upsert({ assignment_submission_id: submissionId, kind: "repo_copy" }, { onConflict: "assignment_submission_id,kind", ignoreDuplicates: true })
    .select("id");
  check(inserted.error, "queue the repo copy job");
  if ((inserted.data ?? []).length > 0) return "inserted";
  const now = new Date().toISOString();
  const reset = await db.from("cse_grading_jobs")
    .update({ status: "queued", attempts: 0, run_after: now, locked_at: null, last_error: null, updated_at: now })
    .eq("assignment_submission_id", submissionId).eq("kind", "repo_copy").in("status", ["failed", "succeeded"])
    .select("id");
  check(reset.error, "queue the repo copy job again");
  if ((reset.data ?? []).length > 0) return "reset";
  const { data, error } = await db.from("cse_grading_jobs").select("status")
    .eq("assignment_submission_id", submissionId).eq("kind", "repo_copy").maybeSingle();
  check(error, "read the repo copy job");
  return (data as { status?: string } | null)?.status === "running" ? "running" : "already queued";
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
      const rows = grades.map((grade) => ({
        assignment_submission_id: submissionId,
        task_slot: grade.slot,
        rubric: grade.rubric,
        agent_total: grade.agentTotal,
        needs_review: grade.needsReview,
        model: grade.model,
        prompt_version: grade.promptVersion,
        graded_at: now,
      }));
      // #429: the history first, so a grade that reaches cse_task_grades always has its history row. The same
      // row written twice (same graded_at) is kept once. A failure here fails the job before cse_task_grades
      // changes; its retry grades again, with a new graded_at, and adds that grade as a new row.
      const history = await db.from("cse_task_ai_grades")
        .upsert(rows, { onConflict: "assignment_submission_id,task_slot,graded_at", ignoreDuplicates: true });
      check(history.error, "save the grade history");
      const { error } = await db.from("cse_task_grades").upsert(rows, { onConflict: "assignment_submission_id,task_slot" });
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
    async queueRepoCopy(submissionId) {
      // One repo_copy job per submission, like its grade and benchmark jobs; an existing one is left alone.
      const { error } = await db.from("cse_grading_jobs")
        .upsert({ assignment_submission_id: submissionId, kind: "repo_copy" }, { onConflict: "assignment_submission_id,kind", ignoreDuplicates: true });
      check(error, "queue the repo copy job");
    },
    async requeueRepoCopy(submissionId) {
      return requeueRepoCopyJob(db, submissionId);
    },
    async loadSubmissionCopyTasks(submissionId) {
      const { data: sources, error: sourceError } = await db.from("cse_benchmark_task_sources")
        .select("instance_id,task_slot").eq("assignment_submission_id", submissionId).order("task_slot");
      check(sourceError, "read the submission's benchmark sources");
      const slots = (sources ?? []) as Array<{ instance_id: string; task_slot: number }>;
      const ids = slots.map((row) => row.instance_id);
      if (ids.length === 0) return [];
      const { data, error } = await db.from("cse_benchmark_tasks").select("instance_id,repo,base_commit").in("instance_id", ids);
      check(error, "read stored benchmark tasks");
      const tasks = (data ?? []) as Array<{ instance_id: string; repo: string; base_commit: string }>;
      // #298: the PR's own refs for a complete copy, from the submission snapshot's task in the source's slot.
      const { data: submission, error: submissionError } = await db.from("cse_assignment_submissions")
        .select("snapshot").eq("id", submissionId).maybeSingle();
      check(submissionError, "read the submission snapshot");
      return slots.flatMap(({ instance_id: id, task_slot: slot }) => tasks
        .filter((task) => task.instance_id === id)
        .map((task) => ({ ...task, ...snapshotCopyRefs(submission?.snapshot, slot) })));
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
      await writeBenchmarkRows(db, plan.tasks, plan.sources);
    },
  };
}
