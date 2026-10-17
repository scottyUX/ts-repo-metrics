import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { releaseBlockers, type TaskGradeRow } from "@/lib/cse115a/gradeReview";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Shows the grade to the student. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const db = getSupabase();
  const { data: grades, error } = await db.from("cse_task_grades")
    .select("task_slot,rubric,agent_total,instructor_rubric,instructor_total").eq("assignment_submission_id", id);
  if (error) return NextResponse.json({ error: "Could not load grades." }, { status: 500 });
  const blockers = releaseBlockers((grades ?? []) as TaskGradeRow[]);
  if (blockers.length) return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 409 });
  const { error: releaseError } = await db.rpc("release_cse_assignment_submission", { p_submission_id: id, p_released_by: guard.identity.userId });
  if (releaseError) {
    if (releaseError.message.includes("not_releasable")) return NextResponse.json({ error: "Only a graded, active submission can be released." }, { status: 409 });
    if (releaseError.message.includes("grades_missing")) return NextResponse.json({ error: "Both tasks need a grade." }, { status: 409 });
    return NextResponse.json({ error: "Could not release the grade." }, { status: 500 });
  }
  return NextResponse.json({ status: "released" });
}
