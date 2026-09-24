import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { ASSIGNMENT_SUBMISSION_COLUMNS, getCourseIdentity } from "@/lib/cse115a/server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with a verified UCSC Google account." }, { status: 401 });

  const db = getSupabase();
  const { data: memberships, error: membershipError } = await db
    .from("cse_course_memberships")
    .select("course_id,joined_at")
    .eq("user_id", identity.userId);
  if (membershipError) return NextResponse.json({ error: "Could not load courses." }, { status: 500 });
  const courseIds = (memberships ?? []).map((row) => row.course_id as string);
  if (courseIds.length === 0) return NextResponse.json({ email: identity.email, courses: [], submissions: [], assignmentSubmissions: [] });
  const [coursesResult, submissionsResult, assignmentResult] = await Promise.all([
    db.from("cse_courses").select("id,slug,title,term,assignment_count,active").in("id", courseIds).eq("active", true),
    db.from("cse_task_submissions")
      .select("id,course_id,assignment_number,task_slot,task_id,pr_url,task_path,task_spec_json,validation_json,analysis_result_id,updated_at")
      .eq("user_id", identity.userId).in("course_id", courseIds)
      .order("assignment_number").order("task_slot"),
    db.from("cse_assignment_submissions").select(ASSIGNMENT_SUBMISSION_COLUMNS)
      .eq("user_id", identity.userId).in("course_id", courseIds).is("superseded_at", null),
  ]);
  if (coursesResult.error || submissionsResult.error || assignmentResult.error) {
    return NextResponse.json({ error: "Could not load assignments." }, { status: 500 });
  }
  return NextResponse.json({ email: identity.email, courses: coursesResult.data, submissions: submissionsResult.data, assignmentSubmissions: assignmentResult.data });
}
