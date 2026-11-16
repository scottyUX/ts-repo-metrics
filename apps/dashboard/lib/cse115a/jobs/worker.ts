import OpenAI from "openai";
import { getSupabase } from "@/lib/supabase/server";
import { gradeTask } from "@/lib/cse115a/grader/gradeTask";
import { copyTaskRepo } from "@/lib/cse115a/benchmark/repoCopy";
import { supabaseSnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";
import { repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { startJobLoop } from "./loop";
import { drainJobs, REPO_COPY_KINDS, RUNNABLE_KINDS, type JobHandlers, type RunResult } from "./runner";
import { supabaseJobStore } from "./supabaseStore";

// Production wiring for the job runner: Supabase storage, OpenAI grading, the
// repo copies, and two poller loops started from instrumentation.ts.

export const POLL_INTERVAL_MS = 15_000;

function productionHandlers(): JobHandlers {
  return {
    async grade(snapshot) {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return Promise.all(snapshot.tasks.map((task) => gradeTask(client, task)));
    },
    async copyRepo(task) {
      const store = supabaseSnapshotStore(process.env);
      if (!store) return { instance_id: task.instance_id, outcome: "failed", reason: "storage", line: "Storage error: the site has no SUPABASE_SERVICE_ROLE_KEY." };
      return copyTaskRepo(task, { store, log: (line) => console.info(`[cse115a repo copy] ${line}`) });
    },
  };
}

/** The main line: grade and benchmark jobs only (never repo_copy). Also what the tick endpoint runs. */
export function runJobsOnce(limit?: number) {
  return drainJobs(supabaseJobStore(getSupabase()), productionHandlers(), limit, RUNNABLE_KINDS);
}

/** The copy line: repo_copy jobs only, one after another. Nothing is claimed while CSE115A_REPO_COPIES is not "on". */
export async function runCopyJobsOnce(limit?: number) {
  if (!repoCopiesEnabled()) return [];
  return drainJobs(supabaseJobStore(getSupabase()), productionHandlers(), limit, REPO_COPY_KINDS);
}

function report(line: string, results: NonNullable<RunResult>[]) {
  for (const result of results) {
    if (result.outcome.status !== "succeeded") {
      console.warn(`[cse115a ${line}] ${result.kind} job ${result.jobId} ${result.outcome.status}: ${result.outcome.error}`);
    }
  }
}

const started = Symbol.for("cse115a.worker.started");

/**
 * Starts the two poller loops once per process: the main line (grade, benchmark) and the copy line
 * (repo_copy, #298). Each tick starts only after its own previous tick finishes, so a slow or hung copy
 * holds up only the copy line; grading never waits on it.
 */
export function startCse115aWorker(intervalMs = POLL_INTERVAL_MS) {
  const flags = globalThis as typeof globalThis & { [started]?: boolean };
  if (flags[started]) return;
  flags[started] = true;
  startJobLoop("worker", intervalMs, async () => report("worker", await runJobsOnce()));
  startJobLoop("repo copies", intervalMs, async () => report("repo copies", await runCopyJobsOnce()));
  console.info(`[cse115a worker] polling every ${intervalMs / 1000}s: grade and benchmark jobs, and repo copies on their own line`);
}
