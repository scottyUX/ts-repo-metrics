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

  const { data, error } = await getSupabase()
    .from("analyses")
    .select("report_json")
    .eq("result_id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  return NextResponse.json(data.report_json);
}
