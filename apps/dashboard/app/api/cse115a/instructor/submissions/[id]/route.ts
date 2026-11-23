import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { releaseBlockers, submittedSlots, type TaskGradeRow } from "@/lib/cse115a/gradeReview";
import { supabaseCopyFiles, taskCodes } from "@/lib/cse115a/repoCopyAccess";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const AI_GRADE_COLUMNS = "task_slot,rubric,agent_total,model,prompt_version,graded_at";

/**
 * The snapshot, agent and instructor grades, jobs, and earlier attempts for one submission, and each
 * task slot's "Get the code" entry (`code`: its stored repo copy and run recipe; a lookup that fails
 * gives `stored: false` and never fails the page), and every AI grade of each task, newest first (`aiGrades`, #429;
 * a lookup that fails gives none and never fails the page).
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const db = getSupabase();
  const { data: submission, error } = await db.from("cse_assignment_submissions")
    .select("id,course_id,user_id,assignment_number,attempt,status,snapshot,submitted_at,superseded_at,unlock_reason")
    .eq("id", id).single();
  if (error || !submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const [member, grades, jobs, history, aiGrades] = await Promise.all([
    db.from("cse_course_memberships").select("ucsc_email").eq("course_id", submission.course_id).eq("user_id", submission.user_id).maybeSingle(),
    db.from("cse_task_grades")
      .select("task_slot,rubric,agent_total,needs_review,model,prompt_version,graded_at,instructor_rubric,instructor_total,instructor_notes,released_at")
      .eq("assignment_submission_id", id).order("task_slot"),
    db.from("cse_grading_jobs").select("kind,status,attempts,run_after,last_error,updated_at").eq("assignment_submission_id", id),
    db.from("cse_assignment_submissions").select("id,attempt,status,submitted_at,superseded_at,unlock_reason")
      .eq("course_id", submission.course_id).eq("user_id", submission.user_id)
      .eq("assignment_number", submission.assignment_number).order("attempt", { ascending: false }),
    db.from("cse_task_ai_grades").select(AI_GRADE_COLUMNS)
      .eq("assignment_submission_id", id).order("task_slot").order("graded_at", { ascending: false }),
  ]);
  if (grades.error || jobs.error || history.error) return NextResponse.json({ error: "Could not load the submission." }, { status: 500 });
  const code = await taskCodes(db, id, submittedSlots(submission.snapshot), supabaseCopyFiles());
  return NextResponse.json({
    course: guard.course,
    submission: { ...submission, email: member.data?.ucsc_email ?? null },
    grades: grades.data,
    releaseBlockers: releaseBlockers((grades.data ?? []) as TaskGradeRow[], submittedSlots(submission.snapshot)),
    jobs: jobs.data,
    history: history.data,
    aiGrades: aiGrades.error ? [] : aiGrades.data ?? [],
    code,
  });
}
