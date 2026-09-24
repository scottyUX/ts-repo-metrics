import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadCourseSources } from "@/lib/cse115a/benchmark/loadCourseBenchmark";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

const PREVIEW_ROWS = 25;
const PREVIEW_CHARS = 1500;

/** Counts by validation status and consent, and a preview of the newest rows. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const db = getSupabase();
  let loaded;
  try {
    loaded = await loadCourseSources(db, guard.course.id);
  } catch {
    return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  }
  const { sources, consented } = loaded;
  const counts = { sources: sources.length, instances: new Set(sources.map((row) => row.instance_id)).size, candidate: 0, validated: 0, rejected: 0, consented: 0, flagged: 0 };
  for (const row of sources) {
    counts[row.validation_status] += 1;
    if (consented.has(row.user_id)) counts.consented += 1;
    if (row.flags.length) counts.flagged += 1;
  }
  const newest = [...sources].reverse().slice(0, PREVIEW_ROWS);
  const { data: tasks, error } = newest.length
    ? await db.from("cse_benchmark_tasks")
      .select("instance_id,repo,base_commit,created_at,version,difficulty,FAIL_TO_PASS,problem_statement,patch,test_patch")
      .in("instance_id", newest.map((row) => row.instance_id))
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  const preview = newest.map((source) => {
    const task = (tasks ?? []).find((row) => row.instance_id === source.instance_id);
    return {
      ...source,
      consented: consented.has(source.user_id),
      task: task ? {
        ...task,
        problem_statement: String(task.problem_statement).slice(0, PREVIEW_CHARS),
        patch: String(task.patch).slice(0, PREVIEW_CHARS),
        test_patch: String(task.test_patch).slice(0, PREVIEW_CHARS),
      } : null,
    };
  });
  return NextResponse.json({ course: guard.course, counts, preview });
}
