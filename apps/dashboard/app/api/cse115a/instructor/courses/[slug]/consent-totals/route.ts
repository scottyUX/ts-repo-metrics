import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadConsentTotals } from "@/lib/cse115a/consentTotals";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** Research consent totals for the course (current wording only). Counts only, never who answered what. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  try {
    const { enrolled, yes, no, notAnswered } = await loadConsentTotals(getSupabase(), guard.course.id);
    return NextResponse.json({ enrolled, yes, no, notAnswered }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load consent totals." }, { status: 500 });
  }
}
