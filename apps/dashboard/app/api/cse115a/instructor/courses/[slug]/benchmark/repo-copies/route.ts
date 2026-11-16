import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";
import { loadCourseCopyTasks } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { copyStatus } from "@/lib/cse115a/benchmark/repoCopy";
import { copyTaskViews, supabaseRepoCopyJobs } from "@/lib/cse115a/benchmark/repoCopyJobs";
import { REPO_COPIES_OFF_MESSAGE, repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { supabaseSnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

const NO_STORE = "Storage for repo copies is not configured on this site (SUPABASE_SERVICE_ROLE_KEY).";

/** The course's tasks, each with its copy state; a Response when something could not be loaded. */
async function load(courseId: string) {
  const store = supabaseSnapshotStore(process.env);
  if (!store) return NextResponse.json({ error: NO_STORE }, { status: 503 });
  const db = getSupabase();
  try {
    const tasks = await loadCourseCopyTasks(db, courseId);
    const status = await copyStatus(tasks, store);
    const jobs = supabaseRepoCopyJobs(db);
    const withSubmission = status.map((row, index) => ({ ...row, assignment_submission_id: tasks[index]!.assignment_submission_id }));
    return { jobs, views: copyTaskViews(withSubmission, await jobs.states([...new Set(tasks.map((t) => t.assignment_submission_id))])) };
  } catch {
    return NextResponse.json({ error: "Could not load benchmark rows." }, { status: 500 });
  }
}

/**
 * #298: each of the course's benchmark tasks as stored, queued, running, failed (with the reason) or
 * missing. Works with CSE115A_REPO_COPIES off. Never returns a copy or a token.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const loaded = await load(guard.course.id);
  if (loaded instanceof NextResponse) return loaded;
  return NextResponse.json({ enabled: repoCopiesEnabled(), tasks: loaded.views });
}

/**
 * Queues repo_copy jobs and returns at once; the copy line does the cloning. `{ instanceId }` queues
 * that task's submission (Retry), resetting a failed or finished job; otherwise every submission with
 * a task that has no copy (and no queued or running job). Refused while CSE115A_REPO_COPIES is not "on".
 */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  if (!repoCopiesEnabled()) return NextResponse.json({ error: REPO_COPIES_OFF_MESSAGE }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { instanceId?: unknown };
  const loaded = await load(guard.course.id);
  if (loaded instanceof NextResponse) return loaded;
  let targets = loaded.views;
  if (typeof body.instanceId === "string") {
    targets = targets.filter((task) => task.instance_id === body.instanceId);
    if (targets.length === 0) return NextResponse.json({ error: "That task is not in this course's benchmark." }, { status: 404 });
  } else {
    targets = targets.filter((task) => task.state === "missing" || task.state === "failed" || task.state === "unknown");
  }
  const submissions = [...new Set(targets.map((task) => task.assignment_submission_id))];
  try {
    await loaded.jobs.queue(submissions);
  } catch {
    return NextResponse.json({ error: "Could not queue repo copy jobs. Has the repo_copy migration been applied?" }, { status: 500 });
  }
  return NextResponse.json({ queued: targets.map((task) => task.instance_id), submissions: submissions.length });
}
