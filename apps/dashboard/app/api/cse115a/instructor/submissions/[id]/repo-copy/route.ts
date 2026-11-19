import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardSubmission } from "@/lib/cse115a/instructorApi";
import { NO_COPY_ERROR, repoCopyFileName } from "@/lib/cse115a/getTheCode";
import { DOWNLOAD_LINK_SECONDS, findRepoCopy, loadSlotBenchmarks, supabaseCopyFiles } from "@/lib/cse115a/repoCopyAccess";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const NO_STORE = { "cache-control": "no-store" };

function answer(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Downloads one task's stored repo copy: course staff only (instructors and TAs). Answers with a
 * redirect to a Storage link that lasts 60 seconds and saves as `<instance_id>.bundle`; the file never
 * passes through the site. One log line per download, with no link or token in it.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await guardSubmission(id);
  if ("response" in guard) {
    guard.response.headers.set("cache-control", "no-store");
    return guard.response;
  }
  const slotText = new URL(request.url).searchParams.get("slot") ?? "";
  const slot = /^[1-9][0-9]*$/.test(slotText) ? Number(slotText) : null;
  if (slot === null) return answer("Give the task slot (slot=1, 2, …).", 400);
  const files = supabaseCopyFiles();
  if (!files) return answer("Storage is not configured on this site.", 503);
  let row;
  let copy;
  try {
    row = (await loadSlotBenchmarks(getSupabase(), id)).find((item) => item.slot === slot);
    if (!row) return answer(NO_COPY_ERROR, 404);
    copy = await findRepoCopy(files, row.instance_id, row.base_commit);
  } catch (error) {
    console.error(`Repo copy download: submission ${id} slot ${slot}: ${error instanceof Error ? error.message : String(error)}`);
    return answer("Could not look up the repo copy. Try again in a minute.", 502);
  }
  if (!copy.stored || !copy.object) return answer(NO_COPY_ERROR, 404);
  const { data, error } = await files.createSignedUrl(copy.object, DOWNLOAD_LINK_SECONDS, { download: repoCopyFileName(row.instance_id) });
  if (error || !data?.signedUrl) {
    console.error(`Repo copy download: submission ${id} slot ${slot}: Storage: ${error?.message ?? "no link"}`);
    return answer("Could not get a download link from Storage. Try again in a minute.", 502);
  }
  console.info(`Repo copy download: user ${guard.identity.userId} submission ${id} slot ${slot} instance ${row.instance_id}`);
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: NO_STORE });
}
