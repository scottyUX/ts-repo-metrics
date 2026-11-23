import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { courseRepoReader, githubAppConfig } from "@/lib/cse115a/githubApp";
import { STAFF_READER_LOGIN } from "@/lib/cse115a/benchmark/recapture";
import { repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { listWorkPrCandidates, runWorkPrChange, usedPrs, type SeenState, type WorkPrRequest } from "@/lib/cse115a/benchmark/workPrChoice";
import { supabaseWorkPrDb } from "@/lib/cse115a/benchmark/workPrChoiceStore";
import { supabaseJobStore } from "@/lib/cse115a/jobs/supabaseStore";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import { WORK_PR_TEXT } from "@/lib/cse115a/workPr";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// #431: staff choose the PR that holds a task's code. GET lists the student's other merged PRs in the task's
// repository (read-only). POST previews a choice (`apply: false`, the default, writes nothing), applies it
// (`apply: true`), or undoes the last choice (`undo: true`). Staff of the submission's course only. No grade row,
// grade status or grade job is ever written.

const NO_APP = "The course GitHub App is not set up on this site, so the student's PRs cannot be read.";

function slotOf(value: unknown): number | null {
  const slot = typeof value === "string" ? Number(value) : value;
  return typeof slot === "number" && Number.isInteger(slot) && slot > 0 ? slot : null;
}

function seenOf(value: unknown): SeenState | null {
  const seen = value as { prNumber?: unknown; recapturedAt?: unknown } | null | undefined;
  if (!seen || typeof seen !== "object" || typeof seen.prNumber !== "number") return null;
  return { prNumber: seen.prNumber, recapturedAt: typeof seen.recapturedAt === "string" ? seen.recapturedAt : null };
}

async function load(id: string): Promise<{ submission: Submission | null } | { response: NextResponse }> {
  try {
    return { submission: await supabaseJobStore(getSupabase()).loadSubmission(id) };
  } catch {
    return { response: NextResponse.json({ error: "Could not load the submission." }, { status: 500 }) };
  }
}

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const slot = slotOf(new URL(request.url).searchParams.get("slot"));
  if (slot === null) return NextResponse.json({ error: "Say which task (slot)." }, { status: 400 });
  if (!githubAppConfig()) return NextResponse.json({ error: NO_APP }, { status: 503 });
  const loaded = await load(id);
  if ("response" in loaded) return loaded.response;
  const submission = loaded.submission;
  if (!submission || submission.course_id !== guard.course.id) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const task = submission.snapshot.tasks?.find((item) => item.slot === slot);
  if (!task) return NextResponse.json({ error: `This submission has no Task ${slot}.` }, { status: 404 });
  try {
    const db = supabaseWorkPrDb(getSupabase());
    const used = usedPrs(await db.loadCourseTaskRefs(submission.course_id, task.repoFullName), submission, slot);
    const listed = await listWorkPrCandidates(courseRepoReader(STAFF_READER_LOGIN), task, used);
    return NextResponse.json({
      slot, repoFullName: task.repoFullName, ...listed,
      note: listed.authorKnown ? null : WORK_PR_TEXT.unknownAuthor,
    });
  } catch (error) {
    return NextResponse.json({ error: `Could not list the student's PRs: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => ({})) as { slot?: unknown; pr?: unknown; prNumber?: unknown; reason?: unknown; apply?: unknown; undo?: unknown; seen?: unknown };
  const slot = slotOf(body.slot);
  if (slot === null) return NextResponse.json({ error: "Say which task (slot)." }, { status: 400 });
  const change: WorkPrRequest = body.undo === true
    ? { kind: "undo", slot, seen: seenOf(body.seen) }
    : { kind: "choose", slot, pr: body.pr ?? body.prNumber, reason: typeof body.reason === "string" ? body.reason : "", apply: body.apply === true, seen: seenOf(body.seen) };
  if (!githubAppConfig()) return NextResponse.json({ error: NO_APP }, { status: 503 });
  const loaded = await load(id);
  if ("response" in loaded) return loaded.response;
  const submission = loaded.submission;
  if (!submission || submission.course_id !== guard.course.id) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  try {
    const result = await runWorkPrChange(supabaseWorkPrDb(getSupabase()), courseRepoReader(STAFF_READER_LOGIN), submission, change,
      { by: guard.identity.email, repoCopies: repoCopiesEnabled() });
    return result.ok ? NextResponse.json(result.body) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    return NextResponse.json({ error: `Could not change the task's PR: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) }, { status: 500 });
  }
}
