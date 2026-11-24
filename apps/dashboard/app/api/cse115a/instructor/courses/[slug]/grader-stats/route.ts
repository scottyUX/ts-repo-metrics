import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadGraderStats } from "@/lib/cse115a/loadGraderStats";
import type { GraderStatsResponse } from "@/lib/cse115a/graderStats";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/**
 * How the AI grader is doing in this course (#423). Course staff. Counts, plus, for each task staff changed (#432)
 * and each task behind a non-zero "What the AI gave" count (#442), its submission id, task slot, assignment and the
 * AI's points so the page can link to the staff review page; never an email, user id, repo, PR number, task ID, note
 * or rationale.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  try {
    const stats = await loadGraderStats(getSupabase(), guard.course.id);
    const body: GraderStatsResponse = { course: { title: guard.course.title, term: guard.course.term }, ...stats };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the grader numbers." }, { status: 500 });
  }
}
