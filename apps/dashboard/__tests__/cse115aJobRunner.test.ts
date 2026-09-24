import { describe, expect, it } from "vitest";
import { drainJobs, MAX_ATTEMPTS, nextJobState, runNextJob, type BenchmarkSave, type Job, type JobOutcome, type JobStore, type Submission } from "@/lib/cse115a/jobs/runner";
import type { TaskGrade } from "@/lib/cse115a/grader/gradeTask";
import type { SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";

const NOW = new Date("2026-10-01T00:00:00Z");

function memoryStore(jobs: Job[], submission: Partial<Submission> = {}) {
  const state = {
    jobs: jobs.map((job) => ({ ...job, status: "queued" as string })),
    submission: { id: "sub-1", course_id: "c", user_id: "u", assignment_number: 1, status: "submitted", snapshot: { version: 1, capturedAt: "", tasks: [] }, superseded_at: null, ...submission } as Submission,
    grades: [] as TaskGrade[],
    finished: [] as Array<{ id: string; outcome: JobOutcome }>,
    statuses: [] as string[],
    benchmark: [] as BenchmarkSave[],
  };
  const store: JobStore = {
    async claim(kinds) {
      const job = state.jobs.find((item) => item.status === "queued" && kinds.includes(item.kind));
      if (!job) return null;
      job.status = "running";
      job.attempts += 1;
      return { ...job };
    },
    async loadSubmission(id) { return id === state.submission.id ? state.submission : null; },
    async setSubmissionStatus(_id, status) {
      if (state.submission.status === "released") return;
      state.submission.status = status;
      state.statuses.push(status);
    },
    async saveGrades(_id, grades) { state.grades = grades; },
    async finishJob(id, outcome) {
      state.finished.push({ id, outcome });
      const job = state.jobs.find((item) => item.id === id)!;
      job.status = outcome.status === "queued" ? "retry" : outcome.status;
    },
    async loadRepoMetrics(id) { return { resultId: id }; },
    async saveBenchmark(_submission, rows) { state.benchmark = rows; },
  };
  return { store, state };
}

const grade: TaskGrade = { slot: 1, rubric: [], agentTotal: 7, needsReview: false, model: "m", promptVersion: "v" };
const gradeJob = (attempts = 0): Job => ({ id: "job-1", assignment_submission_id: "sub-1", kind: "grade", attempts });

describe("nextJobState", () => {
  it("backs off 1 then 4 minutes, then fails", () => {
    expect(nextJobState(1, "boom", NOW)).toEqual({ status: "queued", runAfter: new Date("2026-10-01T00:01:00Z"), error: "boom" });
    expect(nextJobState(2, "boom", NOW)).toEqual({ status: "queued", runAfter: new Date("2026-10-01T00:04:00Z"), error: "boom" });
    expect(nextJobState(MAX_ATTEMPTS, "boom", NOW)).toEqual({ status: "failed", error: "boom" });
  });
});

describe("runNextJob", () => {
  it("returns null when the queue is empty", async () => {
    const { store } = memoryStore([]);
    expect(await runNextJob(store, { grade: async () => [grade] })).toBeNull();
  });

  it("grades, saves, and marks the submission graded", async () => {
    const { store, state } = memoryStore([gradeJob(), { ...gradeJob(), id: "bench", kind: "benchmark" }]);
    let seen: SubmissionSnapshot | null = null;
    const result = await runNextJob(store, { grade: async (snapshot) => { seen = snapshot; return [grade]; } });
    expect(result).toEqual({ jobId: "job-1", kind: "grade", outcome: { status: "succeeded" } });
    expect(seen).toBe(state.submission.snapshot);
    expect(state.grades).toEqual([grade]);
    expect(state.statuses).toEqual(["grading", "graded"]);
    const bench = await runNextJob(store, { grade: async () => [grade] });
    expect(bench).toEqual({ jobId: "bench", kind: "benchmark", outcome: { status: "succeeded" } });
    expect(state.statuses).toEqual(["grading", "graded"]);
  });

  it("requeues a failed attempt and gives up after the last one", async () => {
    const { store, state } = memoryStore([gradeJob(1)]);
    const failing = { grade: async () => { throw new Error("OpenAI 500"); } };
    const retry = await runNextJob(store, failing, () => NOW);
    expect(retry?.outcome).toEqual({ status: "queued", runAfter: new Date("2026-10-01T00:04:00Z"), error: "OpenAI 500" });
    expect(state.submission.status).toBe("grading");

    state.jobs[0]!.status = "queued";
    const final = await runNextJob(store, failing, () => NOW);
    expect(final?.outcome).toEqual({ status: "failed", error: "OpenAI 500" });
    expect(state.submission.status).toBe("grading_failed");
  });

  it("fails a job that crashed workers too many times without running it", async () => {
    const { store, state } = memoryStore([gradeJob(MAX_ATTEMPTS)]);
    let ran = false;
    const result = await runNextJob(store, { grade: async () => { ran = true; return [grade]; } });
    expect(ran).toBe(false);
    expect(result?.outcome.status).toBe("failed");
    expect(state.submission.status).toBe("grading_failed");
  });

  it("skips a superseded submission", async () => {
    const { store, state } = memoryStore([gradeJob()], { superseded_at: "2026-10-02T00:00:00Z" });
    const result = await runNextJob(store, { grade: async () => [grade] });
    expect(result?.outcome.status).toBe("succeeded");
    expect(state.grades).toEqual([]);
    expect(state.statuses).toEqual([]);
  });

  it("does not move a released submission back to graded on regrade", async () => {
    const { store, state } = memoryStore([gradeJob()], { status: "released" });
    await runNextJob(store, { grade: async () => [grade] });
    expect(state.submission.status).toBe("released");
    expect(state.grades).toEqual([grade]);
  });
});

describe("drainJobs", () => {
  it("stops at the limit", async () => {
    const jobs = [1, 2, 3].map((n) => ({ ...gradeJob(), id: `job-${n}` }));
    const { store } = memoryStore(jobs);
    expect(await drainJobs(store, { grade: async () => [grade] }, 2)).toHaveLength(2);
    expect(await drainJobs(store, { grade: async () => [grade] }, 2)).toHaveLength(1);
  });
});
