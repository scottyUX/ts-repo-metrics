import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { courseRepoReader, githubAppConfig } from "@/lib/cse115a/githubApp";
import { oldRuleCount, RECAPTURE_TASK_PATHS, runRecapture, STAFF_READER_LOGIN } from "@/lib/cse115a/benchmark/recapture";
import { supabaseRecaptureDb } from "@/lib/cse115a/benchmark/recaptureStore";
import { repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { supabaseJobStore } from "@/lib/cse115a/jobs/supabaseStore";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };
type Listed = { id: string; assignment_number: number; status: string } & Record<string, unknown>;

// #418: re-capture the diffs saved before the PR-own-diff rule (#382), staff only. GET lists the course's
// submissions that still hold an old-rule task (no `diffEnd`); POST re-captures one submission, as a dry run
// (the default, writes nothing) or with `apply: true`. Grades, grade status and grading jobs are never touched.

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const { data, error } = await getSupabase().from("cse_assignment_submissions")
    .select<string, Listed>(`id,assignment_number,status,${RECAPTURE_TASK_PATHS}`)
    .eq("course_id", guard.course.id).is("superseded_at", null).order("assignment_number").order("id");
  if (error) return NextResponse.json({ error: "Could not load submissions." }, { status: 500 });
  const submissions = (data ?? [])
    .map((row) => ({ id: row.id, assignmentNumber: row.assignment_number, status: row.status, oldRuleTasks: oldRuleCount(row) }))
    .filter((row) => row.oldRuleTasks > 0);
  return NextResponse.json({
    submissions,
    counts: { submissions: submissions.length, tasks: submissions.reduce((sum, row) => sum + row.oldRuleTasks, 0) },
  });
}

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => ({})) as { submissionId?: unknown; apply?: unknown };
  if (typeof body.submissionId !== "string" || !body.submissionId) return NextResponse.json({ error: "Say which submission (submissionId)." }, { status: 400 });
  const apply = body.apply === true;
  if (!githubAppConfig()) return NextResponse.json({ error: "The course GitHub App is not set up on this site, so saved PRs cannot be read again." }, { status: 503 });
  const db = getSupabase();
  let submission;
  try {
    submission = await supabaseJobStore(db).loadSubmission(body.submissionId);
  } catch {
    return NextResponse.json({ error: "Could not load the submission." }, { status: 500 });
  }
  if (!submission || submission.course_id !== guard.course.id) return NextResponse.json({ error: "That submission is not in this course." }, { status: 404 });
  let result;
  try {
    result = await runRecapture(supabaseRecaptureDb(db), courseRepoReader(STAFF_READER_LOGIN), submission, { apply, repoCopies: repoCopiesEnabled() });
  } catch (error) {
    return NextResponse.json({ error: `Could not check the submission: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) }, { status: 500 });
  }
  if (result.done?.stopped) return NextResponse.json({ error: result.done.stopped, plan: result.plan, done: result.done }, { status: 409 });
  return NextResponse.json({ apply, ...result });
}
