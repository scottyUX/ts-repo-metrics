/**
 * GET /api/results/[id]/ai-usage
 * Returns the current user's most recently uploaded AI usage CSV for an
 * analysis. Reads from ai_usage_csvs (result_id, user_id, version) — every
 * upload is kept as its own row, so this takes the highest version.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isDevReportMemoryFallback,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { devGetAiUsageCsv } from "@/lib/devAiUsageStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resultId = id.trim();

  if (isDevReportMemoryFallback()) {
    const cached = devGetAiUsageCsv(resultId);
    if (cached) return NextResponse.json({ resultId, csvText: cached });
    return NextResponse.json({ error: "AI usage not found" }, { status: 404 });
  }

  if (!isSupabaseConfigured() || !isUserSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Storage is not configured." },
      { status: 503 },
    );
  }

  const userSb = await createUserSupabaseServerClient();
  const {
    data: { user },
  } = await userSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS on ai_usage_csvs enforces user_id = auth.uid(); no manual filter needed.
  const { data, error } = await userSb
    .from("ai_usage_csvs")
    .select("csv_text")
    .eq("result_id", resultId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.csv_text) {
    return NextResponse.json({ error: "AI usage not found" }, { status: 404 });
  }

  return NextResponse.json({ resultId, csvText: data.csv_text as string });
}
