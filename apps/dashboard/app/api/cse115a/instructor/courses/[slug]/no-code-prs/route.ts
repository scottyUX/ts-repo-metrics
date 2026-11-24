import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadNoCodeMarkers, type NoCodeDb } from "@/lib/cse115a/noCodePr";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/**
 * #440: which tasks of one assignment were submitted with a PR that changes only task files ("no code in PR"), and
 * which have a code PR chosen by staff (#431). Staff only, behind the same course guard as the submissions list.
 * Answers with submission ids and slot numbers only: no email, repository or diff text. Writes nothing.
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const { course } = guard;
  const assignmentNumber = Number(new URL(request.url).searchParams.get("assignment") ?? 1);
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || assignmentNumber > course.assignment_count) {
    return NextResponse.json({ error: "Invalid assignment number." }, { status: 400 });
  }
  const result = await loadNoCodeMarkers(getSupabase() as unknown as NoCodeDb, course.id, assignmentNumber);
  if (!result.ok) return NextResponse.json({ error: "Could not work out which PRs hold no code." }, { status: 500 });
  return NextResponse.json({ assignmentNumber, noCode: result.markers.noCode, chosenByStaff: result.markers.chosenByStaff });
}
