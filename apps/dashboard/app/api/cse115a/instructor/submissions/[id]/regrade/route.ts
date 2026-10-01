import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Queues the grade job again. Instructor edits are kept. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const { error } = await getSupabase().rpc("requeue_cse_grading_job", { p_submission_id: id });
  if (error) {
    if (error.message.includes("job_running")) return NextResponse.json({ error: "Grading is running now. Try again when it finishes." }, { status: 409 });
    if (error.message.includes("not_active")) return NextResponse.json({ error: "This submission was unlocked; grade the new attempt." }, { status: 409 });
    return NextResponse.json({ error: "Could not queue grading." }, { status: 500 });
  }
  return NextResponse.json({ status: "queued" });
}
