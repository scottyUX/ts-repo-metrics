import type { AssignmentSubmissionStatus } from "@/lib/cse115a/server";
import type { SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskGrade } from "@/lib/cse115a/grader/gradeTask";
import { buildInstance, type BenchmarkInstance, type BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import type { RepoCopyResult, RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import { repoCopiesEnabled } from "@/lib/cse115a/benchmark/repoCopySwitch";
import { prHoldsMoreThanThisTask } from "@/lib/cse115a/sharedPr";

// Claims queued jobs and runs them. Storage is behind JobStore so the retry
// rules can be tested without a database. Two lines, each its own poller loop
// (worker.ts): grade and benchmark jobs (RUNNABLE_KINDS), and repo copies
// (REPO_COPY_KINDS, #298), so grading never waits on a clone.

export type JobKind = "grade" | "benchmark" | "repo_copy";
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
/** One captured task: its instance, the capture flags, and the PR merge commit it was captured from. */
export type BenchmarkSave = { slot: number; instance: BenchmarkInstance; flags: BuildFlag[]; mergeCommit: string };

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
  /** The submitting student's UCSC email, used to strip their identifiers from benchmark rows. */
  loadStudentEmail(courseId: string, userId: string): Promise<string | null>;
  /**
   * Upserts instances and their source rows; a source's validation status is kept. An instance
   * already validated, rejected or rebuilt from the same merge commit is not overwritten (see
   * benchmarkSave.ts).
   */
  saveBenchmark(submission: Submission, rows: BenchmarkSave[]): Promise<void>;
  /**
   * Queues the submission's `repo_copy` job unless it has one (the unique submission-and-kind key, as
   * for its grade and benchmark jobs); an existing job is left as it is. Needs the repo_copy migration.
   */
  queueRepoCopy?(submissionId: string): Promise<void>;
  /** Every benchmark task of a submission with its repo and base commit as stored (a staff rebuild may have moved it). */
  loadSubmissionCopyTasks?(submissionId: string): Promise<RepoCopyTask[]>;
}

export type JobHandlers = {
  grade(snapshot: SubmissionSnapshot): Promise<TaskGrade[]>;
  /** Copies one task's repository into the snapshot store (repoCopy.ts); used by repo_copy jobs only. */
  copyRepo?(task: RepoCopyTask): Promise<RepoCopyResult>;
};

/** The main line: what the grading poller claims. Never repo_copy. */
export const RUNNABLE_KINDS: JobKind[] = ["grade", "benchmark"];
/** The copy line: what the copy poller claims. */
export const REPO_COPY_KINDS: JobKind[] = ["repo_copy"];
/** A repo_copy job starts no new task after this, so it ends well inside the 10-minute job lock (90 s per task at most). */
export const COPY_JOB_BUDGET_MS = 8 * 60_000;

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

async function runBenchmark(store: JobStore, job: Job, env: Record<string, string | undefined>): Promise<void> {
  const submission = await store.loadSubmission(job.assignment_submission_id);
  if (!submission) throw new Error("The submission no longer exists.");
  const studentEmail = await store.loadStudentEmail(submission.course_id, submission.user_id);
  const tasks = submission.snapshot.tasks;
  const rows = await Promise.all(tasks.map(async (task) => ({
    slot: task.slot,
    mergeCommit: task.pr.mergeCommitSha,
    ...buildInstance(task, submission.assignment_number, await store.loadRepoMetrics(task.analysisResultId), studentEmail,
      { prHoldsTwoTasks: prHoldsMoreThanThisTask(tasks, task) }),
  })));
  // Superseded attempts are still captured: the work was real, and the export filters by consent.
  await store.saveBenchmark(submission, rows);
  // #298: the copies run in their own job on their own line; this only queues it. A failure to queue
  // fails this job, which retries (saving the rows again changes nothing).
  if (repoCopiesEnabled(env)) {
    if (!store.queueRepoCopy) throw new Error("Repo copies are on, but this store cannot queue them.");
    await store.queueRepoCopy(submission.id);
  }
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * A repo_copy job: every benchmark task of the submission, at its stored base commit, one after
 * another. Every task is copied whatever the student's consent answer: validation needs the copy, and
 * consent governs export. A task already stored is skipped by the copy itself. No task is started
 * after COPY_JOB_BUDGET_MS; the job then fails "not finished, will retry", and the retry skips what is
 * stored. Any failed task fails the job with one line naming each failed task.
 */
async function runRepoCopy(store: JobStore, handlers: JobHandlers, job: Job, now: () => Date): Promise<void> {
  if (!handlers.copyRepo || !store.loadSubmissionCopyTasks) throw new Error("This worker cannot make repo copies.");
  const tasks = await store.loadSubmissionCopyTasks(job.assignment_submission_id);
  const started = now().getTime();
  const failures: string[] = [];
  for (const [index, task] of tasks.entries()) {
    if (now().getTime() - started >= COPY_JOB_BUDGET_MS) {
      failures.push(`not finished, will retry: ${tasks.length - index} of ${tasks.length} task(s) not started within ${COPY_JOB_BUDGET_MS / 60_000} minutes`);
      break;
    }
    const result = await handlers.copyRepo(task);
    if (result.outcome === "failed") failures.push(`${task.instance_id}: ${oneLine(result.line)}`);
  }
  if (failures.length) throw new Error(`Repo copy failed: ${failures.join("; ")}`);
}

/** Claims and runs one job. Returns null when nothing is runnable. */
export async function runNextJob(
  store: JobStore, handlers: JobHandlers, now: () => Date = () => new Date(), env: Record<string, string | undefined> = process.env,
  kinds: JobKind[] = RUNNABLE_KINDS,
): Promise<RunResult> {
  const job = await store.claim(kinds);
  if (!job) return null;
  let outcome: JobOutcome;
  if (job.attempts > MAX_ATTEMPTS) {
    // A worker crashed while holding it too many times.
    outcome = { status: "failed", error: "The job was abandoned by a worker too many times." };
  } else {
    try {
      if (job.kind === "grade") await runGrade(store, handlers, job);
      else if (job.kind === "benchmark") await runBenchmark(store, job, env);
      else if (job.kind === "repo_copy") await runRepoCopy(store, handlers, job, now);
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

/** Runs jobs of `kinds` (default: the main line) one after another until none is runnable or `limit` jobs have run. */
export async function drainJobs(
  store: JobStore, handlers: JobHandlers, limit = 10, kinds: JobKind[] = RUNNABLE_KINDS, now: () => Date = () => new Date(),
): Promise<NonNullable<RunResult>[]> {
  const results: NonNullable<RunResult>[] = [];
  while (results.length < limit) {
    const result = await runNextJob(store, handlers, now, process.env, kinds);
    if (!result) break;
    results.push(result);
  }
  return results;
}
