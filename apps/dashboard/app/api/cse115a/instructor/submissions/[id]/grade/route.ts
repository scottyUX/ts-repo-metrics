import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { parseInstructorRubric } from "@/lib/cse115a/gradeReview";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Saves instructor points and notes for one task. `rubric: null` clears the override. Released grades update in place. */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => null) as { slot?: unknown; rubric?: unknown; notes?: unknown } | null;
  const slot = body?.slot;
  if (slot !== 1 && slot !== 2) return NextResponse.json({ error: "slot must be 1 or 2." }, { status: 400 });
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 5000) return NextResponse.json({ error: "Notes are too long." }, { status: 400 });

  let instructorRubric = null;
  let instructorTotal = null;
  if (body?.rubric !== null) {
    const parsed = parseInstructorRubric(body?.rubric);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    instructorRubric = parsed.rubric;
    instructorTotal = parsed.total;
  }
  const { data, error } = await getSupabase().from("cse_task_grades")
    .update({
      instructor_rubric: instructorRubric,
      instructor_total: instructorTotal,
      instructor_notes: notes || null,
      updated_by: guard.identity.userId,
    })
    .eq("assignment_submission_id", id).eq("task_slot", slot)
    .select("task_slot,instructor_rubric,instructor_total,instructor_notes").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the grade." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This task has no agent grade yet. Regrade it first." }, { status: 409 });
  return NextResponse.json({ grade: data });
}
