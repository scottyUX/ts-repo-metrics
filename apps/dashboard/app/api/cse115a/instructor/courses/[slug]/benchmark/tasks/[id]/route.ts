import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadTaskDetail, type TaskTableDb } from "@/lib/cse115a/benchmark/loadTaskTable";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string; id: string }> };

/**
 * Course staff: one task of the Benchmark page's table, opened in place (#445): its spec and patches whole, its
 * proving tests, flags, validation detail and staff changes; its grade by box and its stored report's four scores (#449),
 * never the report. Only a task of this course. Writes nothing.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug, id } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  try {
    const task = await loadTaskDetail(getSupabase() as unknown as TaskTableDb, guard.course.id, id);
    if (!task) return NextResponse.json({ error: "This task is not in this course." }, { status: 404 });
    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "Could not load the task." }, { status: 500 });
  }
}
