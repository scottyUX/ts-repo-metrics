import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { parseInstructorRubric } from "@/lib/cse115a/gradeReview";
import { isTaskSlot, MAX_TASKS_PER_SPRINT } from "@/lib/cse115a/taskSlots";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const NO_GRADE = "This task has no agent grade yet. Regrade it first.";
/** Reads of graded_at before giving up, each after a Regrade changed it between the read and the save. */
const SAVE_ATTEMPTS = 3;

/**
 * Saves instructor points and notes for one task. `rubric: null` clears the override. Released grades update in place.
 * A save with points also records `instructor_saved_at` and `instructor_saw_graded_at` (#429); clearing sets both to null.
 */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => null) as { slot?: unknown; rubric?: unknown; notes?: unknown } | null;
  const slot = body?.slot;
  if (!isTaskSlot(slot)) return NextResponse.json({ error: `slot must be a whole number from 1 to ${MAX_TASKS_PER_SPRINT}.` }, { status: 400 });
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
  const db = getSupabase();
  const staff = {
    instructor_rubric: instructorRubric,
    instructor_total: instructorTotal,
    instructor_notes: notes || null,
    updated_by: guard.identity.userId,
  };
  const columns = "task_slot,instructor_rubric,instructor_total,instructor_notes";

  // "Use agent grade": no staff points, so no save time and no AI grade seen (#429).
  if (instructorRubric === null) {
    const { data, error } = await db.from("cse_task_grades")
      .update({ ...staff, instructor_saved_at: null, instructor_saw_graded_at: null })
      .eq("assignment_submission_id", id).eq("task_slot", slot).select(columns).maybeSingle();
    if (error) return NextResponse.json({ error: "Could not save the grade." }, { status: 500 });
    if (!data) return NextResponse.json({ error: NO_GRADE }, { status: 409 });
    return NextResponse.json({ grade: data });
  }

  // A save records when it was made and the graded_at of the AI grade on the task then (#429). The update
  // only lands while graded_at is still the one read, so a Regrade finishing in between cannot leave a
  // stale one; the route then reads again.
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    const current = await db.from("cse_task_grades").select("graded_at")
      .eq("assignment_submission_id", id).eq("task_slot", slot).maybeSingle();
    if (current.error) return NextResponse.json({ error: "Could not save the grade." }, { status: 500 });
    if (!current.data) return NextResponse.json({ error: NO_GRADE }, { status: 409 });
    const gradedAt = (current.data as { graded_at: string }).graded_at;
    const { data, error } = await db.from("cse_task_grades")
      .update({ ...staff, instructor_saved_at: new Date().toISOString(), instructor_saw_graded_at: gradedAt })
      .eq("assignment_submission_id", id).eq("task_slot", slot).eq("graded_at", gradedAt)
      .select(columns).maybeSingle();
    if (error) return NextResponse.json({ error: "Could not save the grade." }, { status: 500 });
    if (data) return NextResponse.json({ grade: data });
  }
  return NextResponse.json({ error: "The AI kept regrading this task while saving. Reload the page and save again." }, { status: 409 });
}
