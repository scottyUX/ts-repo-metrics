/**
 * GET /api/results/[id]
 * Returns a cached analysis result by ID.
 * @see Story 4.2
 */

import { NextRequest, NextResponse } from "next/server";
import { resultsStore } from "@/lib/resultsStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = resultsStore.get(id);

  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
