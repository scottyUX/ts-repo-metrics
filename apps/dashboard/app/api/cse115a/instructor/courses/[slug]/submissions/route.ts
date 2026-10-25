import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { effectiveTotal, sprintScore, type TaskGradeRow } from "@/lib/cse115a/gradeReview";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** Every enrolled student with their active submission for one assignment, if any. */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const { course } = guard;
  const assignmentNumber = Number(new URL(request.url).searchParams.get("assignment") ?? 1);
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || assignmentNumber > course.assignment_count) {
    return NextResponse.json({ error: "Invalid assignment number." }, { status: 400 });
  }

  const db = getSupabase();
  const [members, submissions] = await Promise.all([
    db.from("cse_course_memberships").select("user_id,ucsc_email").eq("course_id", course.id).order("ucsc_email"),
    db.from("cse_assignment_submissions").select("id,user_id,attempt,status,submitted_at")
      .eq("course_id", course.id).eq("assignment_number", assignmentNumber).is("superseded_at", null),
  ]);
  if (members.error || submissions.error) return NextResponse.json({ error: "Could not load submissions." }, { status: 500 });
  const ids = (submissions.data ?? []).map((row) => row.id as string);
  const [grades, jobs] = ids.length
    ? await Promise.all([
      db.from("cse_task_grades").select("assignment_submission_id,task_slot,agent_total,instructor_total,needs_review,released_at").in("assignment_submission_id", ids),
      db.from("cse_grading_jobs").select("assignment_submission_id,kind,status,last_error").in("assignment_submission_id", ids),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (grades.error || jobs.error) return NextResponse.json({ error: "Could not load grades." }, { status: 500 });

  const rows = (members.data ?? []).map((member) => {
    const submission = submissions.data?.find((row) => row.user_id === member.user_id);
    if (!submission) return { userId: member.user_id, email: member.ucsc_email, submission: null };
    const taskGrades = (grades.data ?? []).filter((row) => row.assignment_submission_id === submission.id) as Array<Pick<TaskGradeRow, "task_slot" | "agent_total" | "instructor_total" | "needs_review" | "released_at">>;
    const gradeJob = jobs.data?.find((row) => row.assignment_submission_id === submission.id && row.kind === "grade");
    const tasks = [1, 2].map((slot) => {
      const grade = taskGrades.find((row) => row.task_slot === slot);
      return grade ? {
        slot,
        agentTotal: Number(grade.agent_total),
        instructorTotal: grade.instructor_total === null ? null : Number(grade.instructor_total),
        needsReview: grade.needs_review,
      } : { slot, agentTotal: null, instructorTotal: null, needsReview: false };
    });
    return {
      userId: member.user_id,
      email: member.ucsc_email,
      submission: {
        id: submission.id,
        attempt: submission.attempt,
        status: submission.status,
        submittedAt: submission.submitted_at,
        tasks,
        agentSprint: taskGrades.length ? sprintScore(tasks.map((task) => task.agentTotal)) : null,
        sprint: taskGrades.length ? sprintScore(taskGrades.map(effectiveTotal)) : null,
        needsReview: tasks.some((task) => task.needsReview && task.instructorTotal === null),
        jobError: gradeJob?.status === "failed" ? gradeJob.last_error : null,
      },
    };
  });
  return NextResponse.json({ course, assignmentNumber, rows });
}
