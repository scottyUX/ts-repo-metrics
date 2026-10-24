import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadExportCandidates } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { exportJsonl } from "@/lib/cse115a/benchmark/exportJsonl";
import { CONSENT_APPROVED } from "@/lib/cse115a/consent";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** SWE-bench JSONL of consented, non-rejected instances. `?validated=1` limits it to validated rows. */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  if (!CONSENT_APPROVED) {
    return NextResponse.json({ error: "Export is off until the IRB-approved consent wording is in lib/cse115a/consent.ts." }, { status: 409 });
  }
  const validatedOnly = new URL(request.url).searchParams.get("validated") === "1";
  let body;
  try {
    body = exportJsonl(await loadExportCandidates(getSupabase(), guard.course.id), { validatedOnly });
  } catch {
    return NextResponse.json({ error: "Could not export benchmark rows." }, { status: 500 });
  }
  return new NextResponse(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="${guard.course.slug}-benchmark${validatedOnly ? "-validated" : ""}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}
