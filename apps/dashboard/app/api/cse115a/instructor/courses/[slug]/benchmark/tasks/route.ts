import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadTaskTable, type TaskTableDb } from "@/lib/cse115a/benchmark/loadTaskTable";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/**
 * Course staff: one row per current task of the course for the Benchmark page's table (#444, #445). Small fields
 * only: no spec, no patches (the detail route loads those when a row opens), and nothing about consent. Writes nothing.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  try {
    const rows = await loadTaskTable(getSupabase() as unknown as TaskTableDb, guard.course.id);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: "Could not load the tasks." }, { status: 500 });
  }
}
