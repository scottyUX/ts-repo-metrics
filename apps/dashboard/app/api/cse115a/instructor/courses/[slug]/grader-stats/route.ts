import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadGraderStats } from "@/lib/cse115a/loadGraderStats";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** How the AI grader is doing in this course (#423). Course staff. Counts only: never a row, an id, an email or a task. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json(await loadGraderStats(getSupabase(), guard.course.id), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the grader numbers." }, { status: 500 });
  }
}
