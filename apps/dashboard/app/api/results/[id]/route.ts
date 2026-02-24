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
  const trimmedId = id.trim();
  console.log("[results] GET request for result_id:", trimmedId);

  try {
    const supabase = getSupabase();
    
    // First try exact match
    let { data, error } = await supabase
      .from("analyses")
      .select("report_json, result_id")
      .eq("result_id", trimmedId)
      .single();

    // If not found, try with partial match (for incomplete IDs)
    if (error || !data) {
      console.log("[results] Exact match failed, trying partial match");
      const { data: partialData, error: partialError } = await supabase
        .from("analyses")
        .select("report_json, result_id")
        .like("result_id", `${trimmedId}%`)
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!partialError && partialData) {
        console.log("[results] Found via partial match:", partialData.result_id);
        return NextResponse.json(partialData.report_json);
      }
    }

    if (error) {
      console.error("[results] Supabase error:", error.message, error.code, error.details);
      // Debug: list all available IDs
      const { data: all } = await supabase
        .from("analyses")
        .select("result_id")
        .limit(10);
      console.log("[results] Available result_ids:", all?.map(r => r.result_id));
      return NextResponse.json({ 
        error: "Result not found",
        debug: { searched: trimmedId, available: all?.map(r => r.result_id) }
      }, { status: 404 });
    }

    if (!data) {
      console.log("[results] No row found for id:", trimmedId);
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    console.log("[results] Found report for id:", trimmedId);
    return NextResponse.json(data.report_json);
  } catch (err) {
    console.error("[results] Exception:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ 
      error: "Failed to fetch result",
      details: message 
    }, { status: 500 });
  }
}
