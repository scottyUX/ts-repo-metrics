import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";
import { importTaskFromPullRequest } from "@/lib/cse115a/githubTaskImport";
import { parseGitHubUrl } from "@/lib/github/parseGitHubUrl";

export const runtime = "nodejs";

type Params = { params: Promise<{ number: string }> };
type SubmissionBody = { courseSlug?: unknown; slot?: unknown; prUrl?: unknown; resultId?: unknown };

async function context(params: Params, body: SubmissionBody) {
  const identity = await getCourseIdentity();
  if (!identity) return { error: NextResponse.json({ error: "Sign in with a verified UCSC Google account." }, { status: 401 }) };
  const { number } = await params.params;
  const assignmentNumber = Number(number);
  const slug = typeof body.courseSlug === "string" ? body.courseSlug : "";
  const course = await getEnrolledCourse(identity.userId, slug);
  if (!course) return { error: NextResponse.json({ error: "Join this course before submitting an assignment." }, { status: 403 }) };
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || assignmentNumber > course.assignment_count) {
    return { error: NextResponse.json({ error: "Invalid assignment number." }, { status: 400 }) };
  }
  const slot = Number(body.slot);
  if (slot !== 1 && slot !== 2) return { error: NextResponse.json({ error: "Choose task 1 or task 2." }, { status: 400 }) };
  return { identity, course, assignmentNumber, slot };
}

export async function POST(request: Request, params: Params) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as SubmissionBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const access = await context(params, body);
  if ("error" in access) return access.error;
  const { identity, course, assignmentNumber, slot } = access;
  const token = await getDecryptedGitHubTokenForUser(identity.userId);
  if (!token) return NextResponse.json({ error: "Connect GitHub before submitting a pull request.", code: "github_token_missing" }, { status: 403 });
  const prUrl = typeof body.prUrl === "string" ? body.prUrl.trim() : "";
  let imported;
  try {
    imported = await importTaskFromPullRequest(prUrl, assignmentNumber, token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import this task." }, { status: 422 });
  }
  const { data, error } = await getSupabase().from("cse_task_submissions")
    .upsert({
      course_id: course.id,
      user_id: identity.userId,
      assignment_number: assignmentNumber,
      task_slot: slot,
      task_id: imported.spec.id,
      pr_url: imported.prUrl,
      repo_full_name: imported.repoFullName,
      pr_number: imported.prNumber,
      task_path: imported.taskPath,
      task_spec_markdown: imported.markdown,
      task_spec_json: imported.spec,
      validation_json: imported.validation,
      analysis_result_id: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "course_id,user_id,assignment_number,task_slot" })
    .select("id,course_id,assignment_number,task_slot,task_id,pr_url,task_path,task_spec_json,validation_json,analysis_result_id,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This task ID or PR is already submitted in another slot." : "Could not save the task submission." }, { status: error.code === "23505" ? 409 : 500 });
  const { error: invalidateError } = await getSupabase().from("cse_assignment_submissions").delete()
    .eq("course_id", course.id).eq("user_id", identity.userId).eq("assignment_number", assignmentNumber);
  if (invalidateError) return NextResponse.json({ error: "Task saved, but assignment status could not be reset. Try again." }, { status: 500 });
  return NextResponse.json({ submission: data });
}

export async function PATCH(request: Request, params: Params) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as SubmissionBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const access = await context(params, body);
  if ("error" in access) return access.error;
  const { identity, course, assignmentNumber, slot } = access;
  const resultId = typeof body.resultId === "string" ? body.resultId.trim() : "";
  if (!resultId) return NextResponse.json({ error: "Missing analysis result." }, { status: 400 });
  const db = getSupabase();
  const [submissionResult, analysisResult] = await Promise.all([
    db.from("cse_task_submissions").select("id,pr_number,repo_full_name")
      .eq("course_id", course.id).eq("user_id", identity.userId)
      .eq("assignment_number", assignmentNumber).eq("task_slot", slot).maybeSingle(),
    db.from("analyses").select("result_id,repo_url,report_json")
      .eq("result_id", resultId).eq("user_id", identity.userId).eq("course_id", course.slug).maybeSingle(),
  ]);
  const submission = submissionResult.data;
  const analysis = analysisResult.data;
  const source = analysis?.report_json?.source as { scope?: string; prNumber?: number } | undefined;
  const analyzedRepo = analysis ? parseGitHubUrl(analysis.repo_url) : null;
  if (!submission || !analysis || source?.scope !== "pr" || source.prNumber !== submission.pr_number ||
      !analyzedRepo || `${analyzedRepo.owner}/${analyzedRepo.repo}`.toLowerCase() !== submission.repo_full_name.toLowerCase()) {
    return NextResponse.json({ error: "The analysis must be for this submitted pull request." }, { status: 400 });
  }
  const { data, error } = await db.from("cse_task_submissions")
    .update({ analysis_result_id: resultId, updated_at: new Date().toISOString() })
    .eq("id", submission.id).eq("user_id", identity.userId)
    .select("id,course_id,assignment_number,task_slot,task_id,pr_url,task_path,task_spec_json,validation_json,analysis_result_id,updated_at")
    .single();
  if (error) return NextResponse.json({ error: "Could not save the analysis result." }, { status: 500 });
  return NextResponse.json({ submission: data });
}
