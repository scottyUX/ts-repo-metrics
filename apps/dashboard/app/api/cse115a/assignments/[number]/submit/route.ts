import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getActiveAssignmentSubmission, getCourseIdentity, getEnrolledCourse, lockedAssignmentMessage } from "@/lib/cse115a/server";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";
import { githubReader } from "@/lib/cse115a/githubClient";
import { captureSubmissionSnapshot, type SubmittedTaskRow } from "@/lib/cse115a/submissionSnapshot";

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
  if (await getActiveAssignmentSubmission(course.id, identity.userId, assignmentNumber)) {
    return NextResponse.json({ error: lockedAssignmentMessage(assignmentNumber), code: "already_submitted" }, { status: 409 });
  }

  const db = getSupabase();
  const { data: tasks, error: tasksError } = await db.from("cse_task_submissions")
    .select("task_slot,task_id,pr_url,repo_full_name,pr_number,task_path,task_spec_markdown,task_spec_json,validation_json,analysis_result_id")
    .eq("course_id", course.id).eq("user_id", identity.userId)
    .eq("assignment_number", assignmentNumber);
  if (tasksError || !tasks || tasks.length !== 2 ||
      !tasks.some((task) => task.task_slot === 1 && task.analysis_result_id) ||
      !tasks.some((task) => task.task_slot === 2 && task.analysis_result_id) ||
      tasks[0]!.task_id === tasks[1]!.task_id || tasks[0]!.pr_url === tasks[1]!.pr_url) {
    return NextResponse.json({ error: "Submit and analyze two different merged task PRs first." }, { status: 400 });
  }

  const token = await getDecryptedGitHubTokenForUser(identity.userId);
  if (!token) return NextResponse.json({ error: "Reconnect GitHub before submitting.", code: "github_token_missing" }, { status: 403 });
  let snapshot;
  try {
    snapshot = await captureSubmissionSnapshot(githubReader(token), tasks as SubmittedTaskRow[]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read your pull requests from GitHub." }, { status: 502 });
  }

  const { data, error } = await db.rpc("submit_cse_assignment", {
    p_course_id: course.id,
    p_user_id: identity.userId,
    p_assignment_number: assignmentNumber,
    p_snapshot: snapshot,
  }).single();
  if (error) {
    if (error.message.includes("already_submitted")) {
      return NextResponse.json({ error: lockedAssignmentMessage(assignmentNumber), code: "already_submitted" }, { status: 409 });
    }
    if (error.message.includes("tasks_changed")) {
      return NextResponse.json({ error: "Your tasks changed while submitting. Check them and submit again." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not submit this assignment." }, { status: 500 });
  }
  return NextResponse.json({ assignmentSubmission: data });
}
