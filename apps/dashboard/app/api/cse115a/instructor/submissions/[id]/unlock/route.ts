import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Supersedes the submission so the student can change tasks and submit again. History and grades are kept. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id, { instructorOnly: true });
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 1000) return NextResponse.json({ error: "Give a reason for unlocking." }, { status: 400 });
  const { data, error } = await getSupabase().from("cse_assignment_submissions")
    .update({ superseded_at: new Date().toISOString(), unlocked_by: guard.identity.userId, unlock_reason: reason })
    .eq("id", id).is("superseded_at", null)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not unlock the submission." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This submission is already unlocked." }, { status: 409 });
  return NextResponse.json({ status: "unlocked" });
}
