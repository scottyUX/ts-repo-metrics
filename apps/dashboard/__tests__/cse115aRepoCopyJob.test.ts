// #298: repo copies in their own job kind on their own line. The benchmark job only queues a repo_copy
// job (when CSE115A_REPO_COPIES is exactly "on"); the copy line claims only repo_copy jobs and the main
// line never does. Real git with a local repository for github.com, a folder for the bucket, and an
// in-memory job table with the unique submission-and-kind key.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyTaskRepo, type RepoCopyResult, type RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import { run, type GitAccess } from "@/lib/cse115a/benchmark/validation/runRow";
import { bucketSnapshotStore, snapshotObject } from "@/lib/cse115a/benchmark/validation/snapshotStore";
import { startJobLoop } from "@/lib/cse115a/jobs/loop";
import {
  COPY_JOB_BUDGET_MS, drainJobs, REPO_COPY_KINDS, RUNNABLE_KINDS, runNextJob,
  type BenchmarkSave, type Job, type JobHandlers, type JobKind, type JobOutcome, type JobStore, type Submission,
} from "@/lib/cse115a/jobs/runner";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { folderBucket, type FolderBucket } from "./helpers/folderBucket";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
const NOW = new Date("2026-11-16T00:00:00Z");
const ON = { CSE115A_REPO_COPIES: "on" };
const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
diff --git a/src/a.test.ts b/src/a.test.ts
new file mode 100644
--- /dev/null
+++ b/src/a.test.ts
@@ -0,0 +1 @@
+it("is two", () => {});
`;
let scratch = "";
let github = "";
let base = "";
let later = "";

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-repo-copy-job-"));
  github = join(scratch, "github");
  const repo = join(github, "team", "app.git");
  await mkdir(join(repo, "src"), { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  await writeFile(join(repo, "src/a.ts"), "export const a = 1;\n");
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await writeFile(join(repo, "src/b.ts"), "export const b = 1;\n");
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "later"], repo);
  later = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

/** Anonymous access to the local stand-in; `down` makes every clone fail as an unreachable GitHub. */
function access(state: { down: boolean }): GitAccess {
  return {
    config: () => null,
    git: async (cmd, args, cwd, options) => {
      if (!args.some((a) => a === "clone" || a === "fetch")) return run(cmd, args, cwd, options);
      if (state.down) throw new Error(`git ${args.join(" ")} exited 128\nfatal: unable to access 'https://github.com/team/app.git/': Could not resolve host: github.com`);
      return run(cmd, args.map((a) => a.replace(/^https:\/\/github\.com\/(.+)\.git$/, (_m, name) => join(github, `${name}.git`))), cwd, options);
    },
  };
}

function task(slot: number, taskId: string): TaskSnapshot {
  return {
    slot, taskId, prUrl: "https://github.com/team/app/pull/1", repoFullName: "team/app", prNumber: slot,
    taskPath: `docs/tasks/sprint-1/${taskId}.md`, specMarkdown: "# A\n", spec: { id: taskId, estimateHours: 2 } as TaskSpec,
    validation: {}, analysisResultId: `result-${slot}`,
    pr: { title: taskId, body: "", headRef: taskId, author: "s", mergedAt: "2026-11-01T00:00:00Z", baseSha: base, mergeCommitSha: `merge-${slot}` },
    baseCommit: base, baseCommitSource: "base_tag", diff: DIFF, diffBytes: DIFF.length, diffTruncated: false, diffError: null,
    comments: [], checks: [],
  };
}

type Row = Job & { status: string; error: string | null };

/**
 * A job table with the unique (submission, kind) key and claim-by-kinds, one submission, and the
 * benchmark rows the job saved. `stored` gives a task's base commit as stored (a staff rebuild).
 */
function memory(options: { jobs?: JobKind[]; stored?: Record<string, string>; queueFails?: boolean; withQueue?: boolean; tasks?: number } = {}) {
  const rows: Row[] = (options.jobs ?? ["benchmark"]).map((kind, i) => ({ id: `job-${i}`, assignment_submission_id: "sub-1", kind, attempts: 0, status: "queued", error: null }));
  const state = { rows, saved: [] as BenchmarkSave[][], order: [] as string[], claims: [] as JobKind[][] };
  const count = options.tasks ?? 2;
  const submission = {
    id: "sub-1", course_id: "c", user_id: "u", assignment_number: 1, status: "submitted", superseded_at: null,
    snapshot: { version: 1, capturedAt: "", tasks: Array.from({ length: count }, (_, i) => task(i + 1, `T-${i + 1}`)) },
  } as unknown as Submission;
  const store: JobStore = {
    async claim(kinds) {
      state.claims.push(kinds);
      const job = rows.find((r) => r.status === "queued" && kinds.includes(r.kind));
      if (!job) return null;
      job.status = "running";
      job.attempts += 1;
      return { id: job.id, assignment_submission_id: job.assignment_submission_id, kind: job.kind, attempts: job.attempts };
    },
    async loadSubmission() { return submission; },
    async setSubmissionStatus() {},
    async saveGrades() { state.order.push("graded"); },
    async finishJob(id, outcome: JobOutcome) {
      const job = rows.find((r) => r.id === id)!;
      job.status = outcome.status;
      job.error = outcome.status === "succeeded" ? null : outcome.error;
    },
    async loadRepoMetrics() { return null; },
    async loadStudentEmail() { return null; },
    async saveBenchmark(_submission, saved) { state.order.push("rows saved"); state.saved.push(saved); },
    async loadSubmissionCopyTasks(submissionId) {
      return Array.from({ length: count }, (_, i) => `team__app-T-${i + 1}`).map((id) => ({ instance_id: id, repo: "team/app", base_commit: options.stored?.[id] ?? base }))
        .filter(() => submissionId === "sub-1");
    },
  };
  if (options.withQueue !== false) {
    store.queueRepoCopy = async (submissionId) => {
      if (options.queueFails) throw new Error("Could not queue the repo copy job: new row violates check constraint \"cse_grading_jobs_kind_check\"");
      state.order.push("copy job queued");
      if (rows.some((r) => r.assignment_submission_id === submissionId && r.kind === "repo_copy")) return;
      rows.push({ id: `job-${rows.length}`, assignment_submission_id: submissionId, kind: "repo_copy", attempts: 0, status: "queued", error: null });
    };
  }
  const requeue = (kind: JobKind) => { rows.find((r) => r.kind === kind)!.status = "queued"; };
  return { store, state, requeue };
}

async function bucket(): Promise<FolderBucket> {
  return folderBucket(await mkdtemp(join(scratch, "bucket-")));
}

function handlers(files: FolderBucket, order: string[], git: { down: boolean } = { down: false }): JobHandlers & { copied: RepoCopyTask[] } {
  const copied: RepoCopyTask[] = [];
  return {
    copied,
    grade: async () => [],
    copyRepo: async (t) => {
      order.push(`copy ${t.instance_id}`);
      copied.push(t);
      return copyTaskRepo(t, { store: bucketSnapshotStore(files), access: access(git), tmp: scratch });
    },
  };
}

describe("#298: the benchmark job queues a repo_copy job and copies nothing itself", () => {
  it.each([["unset", undefined], ["off", "off"], ["'ON '", "ON "], ["1", "1"]])("switch %s: no repo_copy job, and the job does what it did before #298", async (_label, value) => {
    const env: Record<string, string | undefined> = value === undefined ? {} : { CSE115A_REPO_COPIES: value };
    const files = await bucket();
    const { store, state } = memory();
    const h = handlers(files, state.order);
    expect((await runNextJob(store, h, () => NOW, env))?.outcome).toEqual({ status: "succeeded" });
    expect(state.rows.map((r) => r.kind)).toEqual(["benchmark"]);
    expect(state.order).toEqual(["rows saved"]);
    expect(h.copied).toEqual([]);
    // The same rows as a store and worker that know nothing of copies (a database without the migration).
    const plain = memory({ withQueue: false });
    await runNextJob(plain.store, { grade: async () => [] }, () => NOW, env);
    expect(state.saved).toEqual(plain.state.saved);
  });

  it("switch on: the rows are saved, then one repo_copy job is queued; nothing is cloned; a retry queues no second job", async () => {
    const files = await bucket();
    const { store, state, requeue } = memory();
    const h = handlers(files, state.order);
    expect((await runNextJob(store, h, () => NOW, ON))?.outcome).toEqual({ status: "succeeded" });
    expect(state.order).toEqual(["rows saved", "copy job queued"]);
    expect(h.copied).toEqual([]);
    expect(await files.names()).toEqual([]);
    requeue("benchmark");
    await runNextJob(store, h, () => NOW, ON);
    expect(state.rows.filter((r) => r.kind === "repo_copy")).toHaveLength(1);
  });

  it("switch on: if queuing fails, the benchmark job fails after saving its rows and retries", async () => {
    const { store, state } = memory({ queueFails: true });
    const result = await runNextJob(store, { grade: async () => [] }, () => NOW, ON);
    expect(result?.outcome).toMatchObject({ status: "queued", runAfter: new Date("2026-11-16T00:01:00Z") });
    expect((result?.outcome as { error: string }).error).toContain("Could not queue the repo copy job");
    expect(state.saved).toHaveLength(1);
  });
});

describe("#298: two lines", () => {
  it("the main line never claims a repo_copy job, and the copy line never claims a grade or benchmark job", async () => {
    const { store, state } = memory({ jobs: ["repo_copy", "grade", "benchmark"] });
    const h = { grade: async () => [], copyRepo: async (t: RepoCopyTask): Promise<RepoCopyResult> => ({ instance_id: t.instance_id, outcome: "stored" }) };
    const main = await drainJobs(store, h);
    expect(main.map((r) => r.kind)).toEqual(["grade", "benchmark"]);
    expect(state.rows.find((r) => r.kind === "repo_copy")?.status).toBe("queued");
    expect(new Set(state.claims.flat())).toEqual(new Set(RUNNABLE_KINDS));

    const other = memory({ jobs: ["grade", "benchmark", "repo_copy"] });
    const copies = await drainJobs(other.store, h, 10, REPO_COPY_KINDS);
    expect(copies.map((r) => r.kind)).toEqual(["repo_copy"]);
    expect(other.state.rows.filter((r) => r.kind !== "repo_copy").map((r) => r.status)).toEqual(["queued", "queued"]);
    expect(new Set(other.state.claims.flat())).toEqual(new Set(["repo_copy"]));
    expect(RUNNABLE_KINDS).not.toContain("repo_copy");
  });

  it("a grade job queued while a copy hangs is still graded", async () => {
    const { store, state } = memory({ jobs: ["repo_copy"] });
    let copyStarted = false;
    const h: JobHandlers = {
      grade: async () => [],
      copyRepo: () => { copyStarted = true; return new Promise<never>(() => {}); },
    };
    const copyLine = startJobLoop("repo copies", 5, async () => { await drainJobs(store, h, 10, REPO_COPY_KINDS); });
    const mainLine = startJobLoop("worker", 5, async () => { await drainJobs(store, h); });
    try {
      for (let i = 0; i < 100 && !copyStarted; i++) await new Promise((r) => setTimeout(r, 5));
      expect(copyStarted).toBe(true);
      state.rows.push({ id: "grade-1", assignment_submission_id: "sub-1", kind: "grade", attempts: 0, status: "queued", error: null });
      for (let i = 0; i < 200 && state.rows.find((r) => r.id === "grade-1")!.status !== "succeeded"; i++) await new Promise((r) => setTimeout(r, 5));
      expect(state.rows.find((r) => r.id === "grade-1")!.status).toBe("succeeded");
      expect(state.order).toContain("graded");
      expect(state.rows.find((r) => r.kind === "repo_copy")!.status).toBe("running");
    } finally {
      copyLine.stop();
      mainLine.stop();
    }
  });
});

describe("#298: the repo_copy job", () => {
  it("copies every task of the submission at its stored base commit; a second run uploads nothing", async () => {
    const files = await bucket();
    const { store, state, requeue } = memory({ jobs: ["repo_copy"], stored: { "team__app-T-2": later } });
    const h = handlers(files, state.order);
    expect((await runNextJob(store, h, () => NOW, ON, REPO_COPY_KINDS))?.outcome).toEqual({ status: "succeeded" });
    expect(h.copied.map((t) => [t.instance_id, t.base_commit])).toEqual([["team__app-T-1", base], ["team__app-T-2", later]]);
    expect(await files.names()).toEqual([snapshotObject("team__app-T-1", base), snapshotObject("team__app-T-2", later)].sort());
    requeue("repo_copy");
    expect((await runNextJob(store, h, () => NOW, ON, REPO_COPY_KINDS))?.outcome).toEqual({ status: "succeeded" });
    expect(files.calls.filter((c) => c.startsWith("upload"))).toHaveLength(2);
  });

  it("a failed task fails the job with one line, and the retry rule applies", async () => {
    const files = await bucket();
    const { store, state } = memory({ jobs: ["repo_copy"] });
    const result = await runNextJob(store, handlers(files, state.order, { down: true }), () => NOW, ON, REPO_COPY_KINDS);
    expect(result?.outcome).toMatchObject({ status: "queued", runAfter: new Date("2026-11-16T00:01:00Z") });
    const error = (result?.outcome as { error: string }).error;
    expect(error).not.toContain("\n");
    expect(error).toBe("Repo copy failed: "
      + "team__app-T-1: GitHub error: clone failed: fatal: unable to access 'https://github.com/team/app.git/': Could not resolve host: github.com; "
      + "team__app-T-2: GitHub error: clone failed: fatal: unable to access 'https://github.com/team/app.git/': Could not resolve host: github.com");
  });

  it("starts no task after 8 minutes, fails 'not finished, will retry', and the retry skips what is stored", async () => {
    const files = await bucket();
    const { store, state, requeue } = memory({ jobs: ["repo_copy"], tasks: 3 });
    let clock = NOW.getTime();
    const h = handlers(files, state.order);
    const copy = h.copyRepo!;
    // Each new copy takes 5 minutes of the job's clock (one already stored takes none): the third task would start at 10 minutes.
    h.copyRepo = async (t) => { const r = await copy(t); if (r.outcome === "stored") clock += 5 * 60_000; return r; };
    const first = await runNextJob(store, h, () => new Date(clock), ON, REPO_COPY_KINDS);
    expect(COPY_JOB_BUDGET_MS).toBe(8 * 60_000);
    expect(first?.outcome).toMatchObject({ status: "queued", error: "Repo copy failed: not finished, will retry: 1 of 3 task(s) not started within 8 minutes" });
    expect(h.copied.map((t) => t.instance_id)).toEqual(["team__app-T-1", "team__app-T-2"]);
    requeue("repo_copy");
    expect((await runNextJob(store, h, () => new Date(clock), ON, REPO_COPY_KINDS))?.outcome).toEqual({ status: "succeeded" });
    expect(files.calls.filter((c) => c.startsWith("upload"))).toHaveLength(3);
  });
});
