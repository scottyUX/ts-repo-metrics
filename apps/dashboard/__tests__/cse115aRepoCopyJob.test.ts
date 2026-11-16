// #298 C: the benchmark job copies each task's repository after the rows are saved, only when
// CSE115A_REPO_COPIES is exactly "on". Real git with a local repository for github.com, a folder for
// the bucket, and an in-memory JobStore.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyTaskRepo, type RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import { run, type GitAccess } from "@/lib/cse115a/benchmark/validation/runRow";
import { bucketSnapshotStore, snapshotObject } from "@/lib/cse115a/benchmark/validation/snapshotStore";
import { runNextJob, type BenchmarkSave, type Job, type JobHandlers, type JobStore, type Submission } from "@/lib/cse115a/jobs/runner";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { folderBucket, type FolderBucket } from "./helpers/folderBucket";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
const NOW = new Date("2026-11-16T00:00:00Z");
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

/** A queue with one benchmark job, the rows it saved, and the order of saves and copies. */
function memory(stored: Record<string, string> = {}) {
  const state = { job: { status: "queued", attempts: 0 }, saved: [] as BenchmarkSave[][], order: [] as string[], loaded: 0 };
  const submission = {
    id: "sub-1", course_id: "c", user_id: "u", assignment_number: 1, status: "submitted", superseded_at: null,
    snapshot: { version: 1, capturedAt: "", tasks: [task(1, "T-1"), task(2, "T-2")] },
  } as unknown as Submission;
  const store: JobStore = {
    async claim() {
      if (state.job.status !== "queued") return null;
      state.job.status = "running";
      state.job.attempts += 1;
      return { id: "job-1", assignment_submission_id: "sub-1", kind: "benchmark", attempts: state.job.attempts } as Job;
    },
    async loadSubmission() { return submission; },
    async setSubmissionStatus() {},
    async saveGrades() {},
    async finishJob(_id, outcome) { state.job.status = outcome.status; },
    async loadRepoMetrics() { return null; },
    async loadStudentEmail() { return null; },
    async saveBenchmark(_submission, rows) { state.order.push("save"); state.saved.push(rows); },
    async loadBenchmarkTasks(ids) {
      state.loaded++;
      // As stored: a staff rebuild may have moved a row's base commit.
      return ids.map((id) => ({ instance_id: id, repo: "team/app", base_commit: stored[id] ?? base }));
    },
  };
  const requeue = () => { state.job.status = "queued"; };
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

describe("#298 C: repo copies at Submit", () => {
  it.each([["unset", undefined], ["off", "off"], ["'ON '", "ON "], ["1", "1"]])("switch %s: no copy, and the job does what it did", async (_label, value) => {
    const files = await bucket();
    const env: Record<string, string | undefined> = value === undefined ? {} : { CSE115A_REPO_COPIES: value };
    const withCopier = memory();
    const h = handlers(files, withCopier.state.order);
    const result = await runNextJob(withCopier.store, h, () => NOW, env);
    expect(result?.outcome).toEqual({ status: "succeeded" });
    expect(h.copied).toEqual([]);
    expect(withCopier.state.loaded).toBe(0);
    expect(await files.names()).toEqual([]);
    // The same as a worker with no copier at all.
    const plain = memory();
    await runNextJob(plain.store, { grade: async () => [] }, () => NOW, env);
    expect(withCopier.state.saved).toEqual(plain.state.saved);
  });

  it("switch on: one copy per task, at its stored base commit, after the rows are saved", async () => {
    const files = await bucket();
    const { store, state } = memory({ "team__app-T-2": later });
    const h = handlers(files, state.order);
    const result = await runNextJob(store, h, () => NOW, { CSE115A_REPO_COPIES: "on" });
    expect(result?.outcome).toEqual({ status: "succeeded" });
    expect(state.order).toEqual(["save", "copy team__app-T-1", "copy team__app-T-2"]);
    expect(h.copied.map((t) => t.base_commit)).toEqual([base, later]);
    expect(await files.names()).toEqual([snapshotObject("team__app-T-1", base), snapshotObject("team__app-T-2", later)].sort());
  });

  it("a failed copy throws after the rows are saved; the retry copies, and nothing is uploaded twice", async () => {
    const files = await bucket();
    const { store, state, requeue } = memory();
    const git = { down: true };
    const h = handlers(files, state.order, git);
    const env = { CSE115A_REPO_COPIES: "on" };
    const first = await runNextJob(store, h, () => NOW, env);
    expect(first?.outcome).toMatchObject({ status: "queued", runAfter: new Date("2026-11-16T00:01:00Z") });
    const error = (first?.outcome as { error: string }).error;
    expect(error).toBe([
      "Repo copy for team__app-T-1 failed: GitHub error: clone failed: fatal: unable to access 'https://github.com/team/app.git/': Could not resolve host: github.com",
      "Repo copy for team__app-T-2 failed: GitHub error: clone failed: fatal: unable to access 'https://github.com/team/app.git/': Could not resolve host: github.com",
    ].join("\n"));
    expect(state.saved).toHaveLength(1);
    expect(state.order[0]).toBe("save");

    git.down = false;
    requeue();
    expect((await runNextJob(store, h, () => NOW, env))?.outcome).toEqual({ status: "succeeded" });
    requeue();
    expect((await runNextJob(store, h, () => NOW, env))?.outcome).toEqual({ status: "succeeded" });
    expect(state.saved).toHaveLength(3);
    expect(files.calls.filter((c) => c.startsWith("upload"))).toEqual([
      `upload ${snapshotObject("team__app-T-1", base)}`, `upload ${snapshotObject("team__app-T-2", base)}`,
    ]);
  });

  it("switch on with no copier: the job fails loudly instead of skipping the copies", async () => {
    const { store } = memory();
    const result = await runNextJob(store, { grade: async () => [] }, () => NOW, { CSE115A_REPO_COPIES: "on" });
    expect(result?.outcome).toMatchObject({ status: "queued", error: "Repo copies are on, but this worker cannot make them." });
  });
});
