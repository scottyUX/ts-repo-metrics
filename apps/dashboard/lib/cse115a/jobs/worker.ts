import OpenAI from "openai";
import { getSupabase } from "@/lib/supabase/server";
import { gradeTask } from "@/lib/cse115a/grader/gradeTask";
import { drainJobs, type JobHandlers } from "./runner";
import { supabaseJobStore } from "./supabaseStore";

// Production wiring for the job runner: Supabase storage, OpenAI grading, and
// a poller started from instrumentation.ts.

export const POLL_INTERVAL_MS = 15_000;

function productionHandlers(): JobHandlers {
  return {
    async grade(snapshot) {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return Promise.all(snapshot.tasks.map((task) => gradeTask(client, task)));
    },
  };
}

export function runJobsOnce(limit?: number) {
  return drainJobs(supabaseJobStore(getSupabase()), productionHandlers(), limit);
}

const started = Symbol.for("cse115a.worker.started");

/** Starts the poller once per process. A tick starts only after the previous one finishes. */
export function startCse115aWorker(intervalMs = POLL_INTERVAL_MS) {
  const flags = globalThis as typeof globalThis & { [started]?: boolean };
  if (flags[started]) return;
  flags[started] = true;
  const tick = async () => {
    try {
      const results = await runJobsOnce();
      for (const result of results) {
        if (result.outcome.status !== "succeeded") {
          console.warn(`[cse115a worker] ${result.kind} job ${result.jobId} ${result.outcome.status}: ${result.outcome.error}`);
        }
      }
    } catch (error) {
      console.error("[cse115a worker] tick failed", error);
    } finally {
      setTimeout(tick, intervalMs).unref?.();
    }
  };
  setTimeout(tick, intervalMs).unref?.();
  console.info(`[cse115a worker] polling every ${intervalMs / 1000}s`);
}
