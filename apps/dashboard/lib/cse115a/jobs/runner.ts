import type { AssignmentSubmissionStatus } from "@/lib/cse115a/server";
import type { SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskGrade } from "@/lib/cse115a/grader/gradeTask";
import { buildInstance, type BenchmarkInstance, type BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";

// Claims queued jobs and runs them. Storage is behind JobStore so the retry
// rules can be tested without a database.

export type JobKind = "grade" | "benchmark";
export type Job = { id: string; assignment_submission_id: string; kind: JobKind; attempts: number };
export type Submission = {
  id: string;
  course_id: string;
  user_id: string;
  assignment_number: number;
  status: AssignmentSubmissionStatus;
  snapshot: SubmissionSnapshot;
  superseded_at: string | null;
};
export type BenchmarkSave = { slot: number; instance: BenchmarkInstance; flags: BuildFlag[] };

export const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 60_000;

export type JobOutcome =
  | { status: "succeeded" }
  | { status: "queued"; runAfter: Date; error: string }
  | { status: "failed"; error: string };

/** After a failed attempt: retry in 1, then 4 minutes, and give up after MAX_ATTEMPTS. */
export function nextJobState(attempts: number, error: string, now: Date): JobOutcome {
  if (attempts >= MAX_ATTEMPTS) return { status: "failed", error };
  return { status: "queued", runAfter: new Date(now.getTime() + BASE_BACKOFF_MS * 4 ** (attempts - 1)), error };
}

export interface JobStore {
  claim(kinds: JobKind[]): Promise<Job | null>;
  loadSubmission(id: string): Promise<Submission | null>;
  /** Sets the status unless the submission is already released. */
  setSubmissionStatus(id: string, status: AssignmentSubmissionStatus): Promise<void>;
  /** Writes the agent's fields only; instructor edits and release are kept. */
  saveGrades(submissionId: string, grades: TaskGrade[]): Promise<void>;
  finishJob(id: string, outcome: JobOutcome): Promise<void>;
  /** The Repo Metrics report saved for an analysis, or null. */
  loadRepoMetrics(analysisResultId: string): Promise<unknown>;
  /** Upserts instances and their source rows; a source's validation status is kept. */
  saveBenchmark(submission: Submission, rows: BenchmarkSave[]): Promise<void>;
}

export type JobHandlers = {
  grade(snapshot: SubmissionSnapshot): Promise<TaskGrade[]>;
};

export const RUNNABLE_KINDS: JobKind[] = ["grade", "benchmark"];

export type RunResult = { jobId: string; kind: JobKind; outcome: JobOutcome } | null;

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function runGrade(store: JobStore, handlers: JobHandlers, job: Job): Promise<void> {
  const submission = await store.loadSubmission(job.assignment_submission_id);
  if (!submission) throw new Error("The submission no longer exists.");
  if (submission.superseded_at) return; // Unlocked since it was queued; the next attempt has its own job.
  await store.setSubmissionStatus(submission.id, "grading");
  const grades = await handlers.grade(submission.snapshot);
  await store.saveGrades(submission.id, grades);
  await store.setSubmissionStatus(submission.id, "graded");
}

async function runBenchmark(store: JobStore, job: Job): Promise<void> {
  const submission = await store.loadSubmission(job.assignment_submission_id);
  if (!submission) throw new Error("The submission no longer exists.");
  const rows = await Promise.all(submission.snapshot.tasks.map(async (task) => ({
    slot: task.slot,
    ...buildInstance(task, submission.assignment_number, await store.loadRepoMetrics(task.analysisResultId)),
  })));
  // Superseded attempts are still captured: the work was real, and the export filters by consent.
  await store.saveBenchmark(submission, rows);
}

/** Claims and runs one job. Returns null when nothing is runnable. */
export async function runNextJob(store: JobStore, handlers: JobHandlers, now: () => Date = () => new Date()): Promise<RunResult> {
  const job = await store.claim(RUNNABLE_KINDS);
  if (!job) return null;
  let outcome: JobOutcome;
  if (job.attempts > MAX_ATTEMPTS) {
    // A worker crashed while holding it too many times.
    outcome = { status: "failed", error: "The job was abandoned by a worker too many times." };
  } else {
    try {
      if (job.kind === "grade") await runGrade(store, handlers, job);
      else if (job.kind === "benchmark") await runBenchmark(store, job);
      else throw new Error(`No handler for ${job.kind} jobs.`);
      outcome = { status: "succeeded" };
    } catch (error) {
      outcome = nextJobState(job.attempts, message(error), now());
    }
  }
  await store.finishJob(job.id, outcome);
  if (outcome.status === "failed" && job.kind === "grade") {
    await store.setSubmissionStatus(job.assignment_submission_id, "grading_failed");
  }
  return { jobId: job.id, kind: job.kind, outcome };
}

/** Runs jobs until the queue is empty or `limit` jobs have run. */
export async function drainJobs(store: JobStore, handlers: JobHandlers, limit = 10): Promise<NonNullable<RunResult>[]> {
  const results: NonNullable<RunResult>[] = [];
  while (results.length < limit) {
    const result = await runNextJob(store, handlers);
    if (!result) break;
    results.push(result);
  }
  return results;
}
