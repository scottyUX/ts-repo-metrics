import AdmZip from "adm-zip";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadExportCandidates } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { harborExport } from "@/lib/cse115a/benchmark/exportHarbor";
import { CONSENT_APPROVED } from "@/lib/cse115a/consent";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/**
 * Harbor tasks for the rows the JSONL export returns with ?validated=1 (consented, validated), one
 * folder each, plus SKIPPED.txt for rows Harbor cannot express yet. Always validated-only.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  if (!CONSENT_APPROVED) {
    return NextResponse.json({ error: "Export is off until the IRB-approved consent wording is in lib/cse115a/consent.ts." }, { status: 409 });
  }
  let body: Buffer;
  try {
    const { files } = harborExport(await loadExportCandidates(getSupabase(), guard.course.id));
    const zip = new AdmZip();
    for (const [path, contents] of files) zip.addFile(path, Buffer.from(contents, "utf8"), "", path.endsWith(".sh") ? 0o755 : 0o644);
    body = zip.toBuffer();
  } catch {
    return NextResponse.json({ error: "Could not export Harbor tasks." }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${guard.course.slug}-harbor-validated.zip"`,
      "cache-control": "no-store",
    },
  });
}
