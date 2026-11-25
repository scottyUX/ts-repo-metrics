import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadCourseSources } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { CONSENT_APPROVED } from "@/lib/cse115a/consent";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/**
 * Counts by validation status and consent, over every captured task (older attempts included). The per-row table is
 * the tasks route (#445), which says nothing about consent.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const db = getSupabase();
  let loaded;
  try {
    loaded = await loadCourseSources(db, guard.course.id);
  } catch {
    return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  }
  const { sources, consented } = loaded;
  const counts = { sources: sources.length, instances: new Set(sources.map((row) => row.instance_id)).size, candidate: 0, validated: 0, rejected: 0, consented: 0, flagged: 0 };
  for (const row of sources) {
    counts[row.validation_status] += 1;
    if (consented.has(row.user_id)) counts.consented += 1;
    if (row.flags.length) counts.flagged += 1;
  }
  return NextResponse.json({ course: guard.course, counts, exportEnabled: CONSENT_APPROVED });
}
