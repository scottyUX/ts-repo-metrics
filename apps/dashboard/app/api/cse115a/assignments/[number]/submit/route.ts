import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
  const { number } = await params;
  const assignmentNumber = Number(number);
  const body = await request.json().catch(() => null) as { courseSlug?: unknown } | null;
  const slug = typeof body?.courseSlug === "string" ? body.courseSlug : "";
  const course = await getEnrolledCourse(identity.userId, slug);
  if (!course) return NextResponse.json({ error: "Join this course before submitting." }, { status: 403 });
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || assignmentNumber > course.assignment_count) {
    return NextResponse.json({ error: "Invalid assignment number." }, { status: 400 });
  }
  const db = getSupabase();
  const { data: tasks, error: tasksError } = await db.from("cse_task_submissions")
    .select("task_slot,task_id,pr_url,analysis_result_id")
    .eq("course_id", course.id).eq("user_id", identity.userId)
    .eq("assignment_number", assignmentNumber);
  if (tasksError || !tasks || tasks.length !== 2 ||
      !tasks.some((task) => task.task_slot === 1 && task.analysis_result_id) ||
      !tasks.some((task) => task.task_slot === 2 && task.analysis_result_id) ||
      tasks[0]!.task_id === tasks[1]!.task_id || tasks[0]!.pr_url === tasks[1]!.pr_url) {
    return NextResponse.json({ error: "Submit and analyze two different merged task PRs first." }, { status: 400 });
  }
  const { data, error } = await db.from("cse_assignment_submissions")
    .upsert({ course_id: course.id, user_id: identity.userId, assignment_number: assignmentNumber, submitted_at: new Date().toISOString() },
      { onConflict: "course_id,user_id,assignment_number" })
    .select("course_id,assignment_number,submitted_at").single();
  if (error) return NextResponse.json({ error: "Could not submit this assignment." }, { status: 500 });
  return NextResponse.json({ assignmentSubmission: data });
}
