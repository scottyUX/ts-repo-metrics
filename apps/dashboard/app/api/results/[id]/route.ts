/**
 * GET /api/results/[id]
 * Returns a persisted analysis result by ID from Supabase.
 * @see Story 4.2
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log("[results] GET request for result_id:", id);

  const { data, error } = await getSupabase()
    .from("analyses")
    .select("report_json, result_id")
    .eq("result_id", id)
    .single();

  if (error) {
    console.error("[results] Supabase error:", error.message, error.code, "for id:", id);
    // Try to find similar IDs for debugging
    const { data: similar } = await getSupabase()
      .from("analyses")
      .select("result_id")
      .limit(5);
    console.log("[results] Available result_ids:", similar?.map(r => r.result_id));
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  if (!data) {
    console.log("[results] No row found for id:", id);
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  console.log("[results] Found report for id:", id);
  return NextResponse.json(data.report_json);
}
