import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getActiveAssignmentSubmission, getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";
import { canChangeSubmission } from "@/lib/cse115a/processChecklist";

export const runtime = "nodejs";

/**
 * Withdraws the student's submitted sprint so they can change tasks and submit
 * again. Allowed until the sprint's deadline and only before a grade is
 * released. The withdrawn attempt is kept as history, like an instructor unlock.
 */
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
  const { number } = await params;
  const assignmentNumber = Number(number);
  const body = await request.json().catch(() => null) as { courseSlug?: unknown } | null;
  const slug = typeof body?.courseSlug === "string" ? body.courseSlug : "";
  const course = await getEnrolledCourse(identity.userId, slug);
  if (!course) return NextResponse.json({ error: "Join this course first." }, { status: 403 });
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || assignmentNumber > course.assignment_count) {
    return NextResponse.json({ error: "Invalid sprint number." }, { status: 400 });
  }

  const submission = await getActiveAssignmentSubmission(course.id, identity.userId, assignmentNumber);
  if (!submission) return NextResponse.json({ error: `Sprint ${assignmentNumber} isn't submitted.` }, { status: 409 });

  const db = getSupabase();
  const { data: sprint, error: sprintError } = await db.from("cse_sprints").select("due_at")
    .eq("course_id", course.id).eq("number", assignmentNumber).maybeSingle();
  if (sprintError) return NextResponse.json({ error: "Could not check the sprint deadline." }, { status: 500 });
  if (!canChangeSubmission(submission.status, sprint?.due_at)) {
    return NextResponse.json({
      error: submission.status === "released"
        ? "Your grade for this sprint is released, so the submission can't be changed. Ask your instructor."
        : "This sprint is closed, so the submission can't be changed. Ask your instructor.",
      code: "sprint_closed",
    }, { status: 409 });
  }

  const { data, error } = await db.from("cse_assignment_submissions")
    .update({ superseded_at: new Date().toISOString(), unlocked_by: identity.userId, unlock_reason: "Withdrawn by the student to change it before the deadline." })
    .eq("id", submission.id).is("superseded_at", null).neq("status", "released")
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not change the submission." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This submission changed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ status: "reopened" });
}
