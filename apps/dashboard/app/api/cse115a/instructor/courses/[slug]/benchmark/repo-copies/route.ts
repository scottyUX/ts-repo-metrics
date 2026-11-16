import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadCourseCopyTasks } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { copyMissing, copyOne, copyStatus, copyTaskRepo, COPIES_PER_REQUEST, type RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import { REPO_COPIES_OFF_MESSAGE, repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { supabaseSnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

const NO_STORE = "Storage for repo copies is not configured on this site (SUPABASE_SERVICE_ROLE_KEY).";

/**
 * #298: which of the course's benchmark tasks have a repo copy for their current base commit. Works
 * with CSE115A_REPO_COPIES off. Never returns a copy or a token: only ids, repos, commits and yes/no.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const store = supabaseSnapshotStore(process.env);
  if (!store) return NextResponse.json({ error: NO_STORE }, { status: 503 });
  let tasks: RepoCopyTask[];
  try {
    tasks = await loadCourseCopyTasks(getSupabase(), guard.course.id);
  } catch {
    return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  }
  const status = await copyStatus(tasks, store);
  return NextResponse.json({
    enabled: repoCopiesEnabled(),
    perRequest: COPIES_PER_REQUEST,
    tasks: status,
    stored: status.filter((task) => task.stored === true).length,
  });
}

/**
 * Saves missing repo copies: `{ instanceId }` copies that one task (Retry), otherwise up to
 * COPIES_PER_REQUEST tasks with no copy, leaving out `skip` (the ones that failed earlier in the same
 * backfill). Returns each task's outcome and how many are left. Refused when CSE115A_REPO_COPIES is not "on".
 */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  if (!repoCopiesEnabled()) return NextResponse.json({ error: REPO_COPIES_OFF_MESSAGE }, { status: 409 });
  const store = supabaseSnapshotStore(process.env);
  if (!store) return NextResponse.json({ error: NO_STORE }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { instanceId?: unknown; skip?: unknown };
  const skip = Array.isArray(body.skip) ? body.skip.filter((id): id is string => typeof id === "string") : [];
  let tasks: RepoCopyTask[];
  try {
    tasks = await loadCourseCopyTasks(getSupabase(), guard.course.id);
  } catch {
    return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  }
  const copy = (task: RepoCopyTask) => copyTaskRepo(task, { store, log: (line) => console.info(`[cse115a repo copy] ${line}`) });
  if (typeof body.instanceId === "string") {
    const task = tasks.find((row) => row.instance_id === body.instanceId);
    if (!task) return NextResponse.json({ error: "That task is not in this course's benchmark." }, { status: 404 });
    return NextResponse.json({ results: [await copyOne(task, copy)], remaining: null });
  }
  return NextResponse.json(await copyMissing(tasks, store, copy, { max: COPIES_PER_REQUEST, skip }));
}
