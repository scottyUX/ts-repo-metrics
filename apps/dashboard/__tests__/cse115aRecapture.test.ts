// #418: re-capture of diffs saved before the PR-own-diff rule. The saved task re-captured against a fake
// GitHub, the plan for each action, and the apply against a fake store. Nothing reaches GitHub or Supabase.
// Names, repos and ids are made up.
import { describe, expect, it } from "vitest";
import { buildInstance, type BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { taskFileFirst } from "@/lib/cse115a/benchmark/exportJsonl";
import {
  applyRecapture, GUARD_MESSAGE, oldRuleCount, planRecapture, RECAPTURED_SAME_PATCH_FLAG, runRecapture,
  type RecaptureDb, type RecaptureInput, type RecaptureStore, type RecaptureWrites, type StoredTaskRow,
} from "@/lib/cse115a/benchmark/recapture";
import { copyTotalsLine, recaptureTotals } from "@/lib/cse115a/benchmark/recaptureTotals";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import { DIFF_FIELDS, recaptureTaskDiff, type RecaptureResult, type SubmissionSnapshot, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const MERGE = "m".repeat(40);
const OLD_BASE = "a".repeat(40);
const MB = "b".repeat(40);
const HEAD = "c".repeat(40);
const PR_BASE = "d".repeat(40);

const fileDiff = (path: string, line = "x") => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${line}\n`;
const OLD_DIFF = fileDiff("docs/tasks/sprint-1/US-1-T-1.md") + fileDiff("src/cart.ts") + fileDiff("src/teammate.ts") + fileDiff("src/__tests__/cart.test.ts");
const NEW_DIFF = fileDiff("docs/tasks/sprint-1/US-1-T-1.md") + fileDiff("src/cart.ts") + fileDiff("src/__tests__/cart.test.ts");

/** A task saved before #382: no diffEnd, headCommit or taskFileFirstCommit. */
function oldTask(slot = 1, overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot, taskId: `US-1-T-${slot}`, prUrl: `https://github.com/team/proj/pull/${6 + slot}`, repoFullName: "team/proj", prNumber: 6 + slot,
    taskPath: `docs/tasks/sprint-1/US-1-T-${slot}.md`, specMarkdown: "# Task\n", spec: { id: `US-1-T-${slot}`, estimateHours: 3 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: `result-${slot}`,
    pr: { title: "US-1-T-1", body: "Closes it", headRef: "branch", author: "student", mergedAt: "2026-10-01T00:00:00Z", baseSha: PR_BASE, mergeCommitSha: MERGE },
    baseCommit: OLD_BASE, baseCommitSource: "first_commit",
    diff: OLD_DIFF, diffBytes: Buffer.byteLength(OLD_DIFF), diffTruncated: false, diffError: null,
    comments: [{ kind: "issue", author: "ta", body: "Looks good", createdAt: null }],
    checks: [{ source: "check_run", name: "test", status: "completed", conclusion: "success" }],
    ...overrides,
  };
}

type GhOptions = { pull?: "throw" | "unmerged" | "other-merge"; diff?: string | Error; mergeBase?: string | null; first?: string[] };
function gitHub(options: GhOptions = {}) {
  const calls: string[] = [];
  const reader: GitHubReader = {
    async json<T>(path: string) {
      calls.push(`json ${path}`);
      if (/\/pulls\/\d+$/.test(path)) {
        if (options.pull === "throw") throw new Error("GitHub 404");
        return {
          title: "changed title", body: "changed body", merged_at: options.pull === "unmerged" ? null : "2026-10-01T00:00:00Z",
          merge_commit_sha: options.pull === "unmerged" ? null : options.pull === "other-merge" ? "e".repeat(40) : MERGE,
          base: { sha: PR_BASE }, head: { ref: "branch", sha: HEAD }, user: { login: "someone-else" },
        } as T;
      }
      if (path.includes("/commits?per_page=1")) return [{ sha: OLD_BASE }] as T;
      if (/\/commits\/[0-9a-f]{40}$/.test(path)) return { files: (options.first ?? ["docs/tasks/sprint-1/US-1-T-1.md"]).map((filename) => ({ filename })) } as T;
      if (/\/compare\/[0-9a-f]+\.\.\.[0-9a-f]+$/.test(path)) {
        if (options.mergeBase === null) throw new Error("compare failed");
        return { merge_base_commit: { sha: options.mergeBase ?? MB } } as T;
      }
      throw new Error(`unexpected ${path}`);
    },
    async text(path: string) {
      calls.push(`text ${path}`);
      if (options.diff instanceof Error) throw options.diff;
      return options.diff ?? NEW_DIFF;
    },
  };
  return { reader, calls };
}

describe("recaptureTaskDiff", () => {
  it("replaces only the diff fields; spec, validation, comments, checks and pr keep their saved values", async () => {
    const saved = oldTask();
    const { reader, calls } = gitHub();
    const result = await recaptureTaskDiff(reader, saved);
    expect(result.ok).toBe(true);
    const task = (result as Extract<RecaptureResult, { ok: true }>).task;
    expect(task).toMatchObject({ baseCommit: MB, baseCommitSource: "merge_base", headCommit: HEAD, diffEnd: "head", diff: NEW_DIFF, diffError: null, taskFileFirstCommit: true });
    for (const key of Object.keys(saved) as Array<keyof TaskSnapshot>) {
      if ((DIFF_FIELDS as readonly string[]).includes(key)) continue;
      expect(task[key]).toEqual(saved[key]);
    }
    // The PR's title and body changed on GitHub since Submit; the saved ones stay.
    expect(task.pr).toEqual(saved.pr);
    expect(task.spec).toBe(saved.spec);
    expect(task.comments).toBe(saved.comments);
    expect(task.checks).toBe(saved.checks);
    // Only the PR, its first commit, the merge base and the diff are read: no comments, reviews or checks.
    expect(calls).toEqual([
      "json /repos/team/proj/pulls/7",
      "json /repos/team/proj/pulls/7/commits?per_page=1&page=1",
      `json /repos/team/proj/compare/${PR_BASE}...${HEAD}`,
      `json /repos/team/proj/commits/${OLD_BASE}`,
      `text /repos/team/proj/compare/${MB}...${HEAD}`,
    ]);
    // The saved object is not changed in place.
    expect(saved.diff).toBe(OLD_DIFF);
    expect(saved.diffEnd).toBeUndefined();
  });

  it("falls back to the old range, ending at the merge commit, when the merge base can't be read", async () => {
    const { reader, calls } = gitHub({ mergeBase: null });
    const result = await recaptureTaskDiff(reader, oldTask());
    expect(result.ok && result.task).toMatchObject({ baseCommit: OLD_BASE, baseCommitSource: "first_commit", diffEnd: "merge_commit" });
    expect(calls).toContain(`text /repos/team/proj/compare/${OLD_BASE}...${MERGE}`);
  });

  it.each([
    ["the PR can't be read", { pull: "throw" } as GhOptions, /could not be read/],
    ["the PR is no longer merged", { pull: "unmerged" } as GhOptions, /no longer merged/],
    ["the merge commit is not the saved one", { pull: "other-merge" } as GhOptions, /merge commit is not the one saved/],
    ["the diff fails to load", { diff: new Error("GitHub 500") } as GhOptions, /new diff could not be loaded/],
  ])("is an error and changes nothing when %s", async (_name, options, message) => {
    const saved = oldTask();
    const copy = structuredClone(saved);
    const result = await recaptureTaskDiff(gitHub(options).reader, saved);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(message);
    expect(saved).toEqual(copy);
  });

  it("passes the same submission's other task paths from the same PR, as Submit does", async () => {
    // The first commit adds both task files of a two-tasks-one-PR pair: task file first for each.
    const { reader } = gitHub({ first: ["docs/tasks/sprint-1/US-1-T-1.md", "docs/tasks/sprint-1/US-1-T-2.md"], mergeBase: null });
    const alone = await recaptureTaskDiff(reader, oldTask());
    const paired = await recaptureTaskDiff(reader, oldTask(), ["docs/tasks/sprint-1/US-1-T-2.md"]);
    expect(alone.ok && alone.task.taskFileFirstCommit).toBe(false);
    expect(paired.ok && paired.task.taskFileFirstCommit).toBe(true);
  });
});

// ---- the plan ----

const SUBMISSION_ID = "sub-1";
function submission(tasks: TaskSnapshot[], overrides: Partial<Submission> = {}): Submission {
  return {
    id: SUBMISSION_ID, course_id: "course-1", user_id: "user-1", assignment_number: 1, status: "graded",
    snapshot: { version: 1, capturedAt: "2026-10-02T00:00:00.000Z", tasks }, superseded_at: null, ...overrides,
  };
}
function recapturedOk(task: TaskSnapshot, diff = NEW_DIFF): RecaptureResult {
  return { ok: true, task: { ...task, baseCommit: MB, baseCommitSource: "merge_base", headCommit: HEAD, diffEnd: "head", taskFileFirstCommit: true, diff, diffBytes: Buffer.byteLength(diff), diffTruncated: false, diffError: null } };
}
function source(slot: number, status: StoredSource["validation_status"], flags: string[] = ["base_commit_from_first_commit"], submissionId = SUBMISSION_ID): StoredSource {
  return { instance_id: `team__proj-US-1-T-${slot}`, assignment_submission_id: submissionId, task_slot: slot, validation_status: status, flags, merge_commit: null };
}
/** The task row as the new capture would build it, so its patches are byte-for-byte equal. */
function sameRow(task: TaskSnapshot, base = OLD_BASE): StoredTaskRow {
  const built = buildInstance((recapturedOk(task) as { task: TaskSnapshot }).task, 1, null, null).instance;
  return { instance_id: built.instance_id, base_commit: base, patch: built.patch, test_patch: built.test_patch };
}
function input(sub: Submission, overrides: Partial<RecaptureInput> = {}): RecaptureInput {
  return {
    submission: sub,
    recaptured: new Map(sub.snapshot.tasks.map((task) => [task.slot, recapturedOk(task)])),
    sources: [], storedTasks: [], repoMetrics: new Map(), studentEmail: null, now: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("planRecapture", () => {
  it("candidate row → replace: a new instance, harbor_env and validation_detail null, the new capture's flags", () => {
    const task = oldTask();
    const { plan, writes } = planRecapture(input(submission([task]), { sources: [source(1, "candidate")], storedTasks: [{ ...sameRow(task), patch: "old" }] }));
    expect(plan.tasks[0]).toMatchObject({
      task: { slot: 1, instanceId: "team__proj-US-1-T-1" }, action: "replace", row: "candidate", codeChanged: true,
      filesRemoved: ["src/teammate.ts"], filesAdded: [], baseChanged: true, fallback: false,
    });
    expect(plan.tasks[0]!.old).toMatchObject({ baseCommitSource: "first_commit", baseCommit: OLD_BASE, diffEnd: null, files: ["docs/tasks/sprint-1/US-1-T-1.md", "src/__tests__/cart.test.ts", "src/cart.ts", "src/teammate.ts"] });
    expect(plan.tasks[0]!.new).toMatchObject({ baseCommitSource: "merge_base", baseCommit: MB, diffEnd: "head", files: ["docs/tasks/sprint-1/US-1-T-1.md", "src/__tests__/cart.test.ts", "src/cart.ts"] });
    expect(writes.tasks).toHaveLength(1);
    expect(writes.tasks[0]).toMatchObject({ base_commit: MB, harbor_env: null, validation_detail: null });
    expect(writes.tasks[0]!.patch).not.toContain("teammate");
    expect(writes.sources).toEqual([expect.objectContaining({ task_slot: 1, flags: expect.arrayContaining(["base_commit_from_merge_base"]) })]);
    expect(writes.sources[0]).not.toHaveProperty("validation_status");
    expect(writes.baseChanged).toEqual(["team__proj-US-1-T-1"]);
    expect(writes.snapshot?.tasks[0]).toMatchObject({ diffEnd: "head", diff: NEW_DIFF });
  });

  it("no row at all → replace", () => {
    const { plan, writes } = planRecapture(input(submission([oldTask()])));
    expect(plan.tasks[0]).toMatchObject({ action: "replace", row: null, baseChanged: true });
    expect(writes.tasks).toHaveLength(1);
  });

  it("validated with the same patches → keep: the task row is not written; the source keeps status and flags and gains recaptured_same_patch", () => {
    const task = oldTask();
    const flags = ["base_commit_from_first_commit", "validated_by_harness"];
    const { plan, writes } = planRecapture(input(submission([task]), { sources: [source(1, "validated", flags)], storedTasks: [sameRow(task)] }));
    expect(plan.tasks[0]).toMatchObject({ action: "keep", row: "validated", baseChanged: false, codeChanged: true });
    expect(writes.tasks).toEqual([]);
    expect(writes.sources).toEqual([expect.objectContaining({ task_slot: 1, validation_status: "validated", flags: [...flags, RECAPTURED_SAME_PATCH_FLAG] })]);
    expect(writes.baseChanged).toEqual([]);
    // The snapshot still gets the new diff: graders read it.
    expect(writes.snapshot?.tasks[0]!.diff).toBe(NEW_DIFF);
  });

  it("validated with a different patch → back_to_candidate: new instance, status candidate, the new capture's flags only", () => {
    const task = oldTask();
    const { plan, writes } = planRecapture(input(submission([task]), {
      sources: [source(1, "validated", ["base_commit_from_first_commit", "validated_by_harness"])],
      storedTasks: [{ ...sameRow(task), patch: `${sameRow(task).patch}+one more line\n` }],
    }));
    expect(plan.tasks[0]).toMatchObject({ action: "back_to_candidate", row: "validated", baseChanged: true });
    expect(writes.tasks[0]).toMatchObject({ harbor_env: null, validation_detail: null, base_commit: MB });
    expect(writes.sources[0]).toMatchObject({ validation_status: "candidate" });
    expect(writes.sources[0]!.flags).not.toContain("validated_by_harness");
    expect(writes.sources[0]!.flags).not.toContain(RECAPTURED_SAME_PATCH_FLAG);
  });

  it("rejected with a different test_patch → back_to_candidate", () => {
    const task = oldTask();
    const { plan, writes } = planRecapture(input(submission([task]), {
      sources: [source(1, "rejected")], storedTasks: [{ ...sameRow(task), test_patch: "" }],
    }));
    expect(plan.tasks[0]).toMatchObject({ action: "back_to_candidate", row: "rejected" });
    expect(writes.sources[0]).toMatchObject({ validation_status: "candidate" });
  });

  it("back_to_candidate with the same base commit: baseChanged is false", () => {
    const task = oldTask();
    const { plan } = planRecapture(input(submission([task]), { sources: [source(1, "rejected")], storedTasks: [{ ...sameRow(task, MB), patch: "different" }] }));
    expect(plan.tasks[0]).toMatchObject({ action: "back_to_candidate", baseChanged: false });
  });

  it("a task that has diffEnd → skip, and it is not re-captured or written", () => {
    const done = { ...oldTask(2), diffEnd: "head" as const, baseCommitSource: "merge_base" as const };
    const sub = submission([oldTask(1), done]);
    const { plan, writes } = planRecapture(input(sub, { recaptured: new Map([[1, recapturedOk(oldTask(1))]]) }));
    expect(plan.tasks.map((t) => t.action)).toEqual(["replace", "skip"]);
    expect(plan.tasks[1]!.reason).toMatch(/already/i);
    expect(writes.snapshot?.tasks[1]).toBe(done);
    expect(writes.sources.map((s) => s.task_slot)).toEqual([1]);
  });

  it("a superseded submission → every task skip, nothing to write", () => {
    const { plan, writes } = planRecapture(input(submission([oldTask(1), oldTask(2)], { superseded_at: "2026-10-05T00:00:00Z" })));
    expect(plan.superseded).toBe(true);
    expect(plan.tasks.map((t) => t.action)).toEqual(["skip", "skip"]);
    expect(writes).toEqual({ snapshot: null, tasks: [], sources: [], baseChanged: [] });
  });

  it("an error in one task keeps that task as saved and still re-captures the other", () => {
    const sub = submission([oldTask(1), oldTask(2)]);
    const { plan, writes } = planRecapture(input(sub, { recaptured: new Map([[1, { ok: false, error: "Task 1: the pull request is no longer merged." }], [2, recapturedOk(oldTask(2))]]) }));
    expect(plan.tasks.map((t) => t.action)).toEqual(["error", "replace"]);
    expect(plan.tasks[0]).toMatchObject({ reason: "Task 1: the pull request is no longer merged.", new: null });
    expect(writes.snapshot?.tasks[0]).toBe(sub.snapshot.tasks[0]);
    expect(writes.snapshot?.tasks[1]!.diffEnd).toBe("head");
    expect(writes.sources.map((s) => s.task_slot)).toEqual([2]);
  });

  it("only this submission's source rows count; an older attempt's row for the same instance is left alone", () => {
    const task = oldTask();
    const older = source(1, "validated", ["x"], "older-sub");
    const { plan, writes } = planRecapture(input(submission([task]), { sources: [older], storedTasks: [sameRow(task)] }));
    expect(plan.tasks[0]).toMatchObject({ action: "replace", row: null });
    expect(writes.sources.every((s) => s.assignment_submission_id === SUBMISSION_ID)).toBe(true);
  });

  it("codeChanged is false when only files under docs/tasks/ differ", () => {
    const task = oldTask(1, { diff: NEW_DIFF + fileDiff("docs/tasks/sprint-1/US-1-T-9.md") });
    const { plan } = planRecapture(input(submission([task])));
    expect(plan.tasks[0]).toMatchObject({ codeChanged: false, filesRemoved: ["docs/tasks/sprint-1/US-1-T-9.md"] });
  });

  it("marks the fallback (no merge base) so the report shows it", () => {
    const task = oldTask();
    const fallback: RecaptureResult = { ok: true, task: { ...task, diffEnd: "merge_commit", headCommit: HEAD, taskFileFirstCommit: true } };
    const { plan } = planRecapture(input(submission([task]), { recaptured: new Map([[1, fallback]]) }));
    expect(plan.tasks[0]).toMatchObject({ fallback: true, action: "replace" });
  });

  it("recaptured_same_patch does not change task_file_first in the export", () => {
    const before = [{ flags: ["base_commit_from_first_commit"] }];
    const after = [{ flags: ["base_commit_from_first_commit", RECAPTURED_SAME_PATCH_FLAG] }];
    expect(taskFileFirst(before as never)).toBe(true);
    expect(taskFileFirst(after as never)).toBe(true);
    expect(taskFileFirst([{ flags: ["base_commit_from_pr_base", RECAPTURED_SAME_PATCH_FLAG] }] as never)).toBe(false);
  });
});

// ---- apply ----

type Write = { op: string; args: unknown[] };
function fakeStore(options: { column?: boolean; backup?: "written" | "kept" | "guard"; snapshotGuard?: boolean; failBenchmark?: boolean } = {}) {
  const writes: Write[] = [];
  const store: RecaptureStore = {
    async assertBackupColumn() {
      writes.push({ op: "assertBackupColumn", args: [] });
      if (options.column === false) throw new Error("cse_assignment_submissions has no snapshot_before_recapture column: apply migration supabase/migrations/20261120000000_cse115a_snapshot_before_recapture.sql first");
    },
    async backupSnapshot(...args) { writes.push({ op: "backupSnapshot", args }); return options.backup ?? "written"; },
    async writeSnapshot(...args) { writes.push({ op: "writeSnapshot", args }); return options.snapshotGuard ?? true; },
    async writeBenchmark(...args) {
      writes.push({ op: "writeBenchmark", args });
      if (options.failBenchmark) throw new Error("Could not save benchmark tasks: boom");
    },
    async requeueRepoCopy(...args) { writes.push({ op: "requeueRepoCopy", args }); return "reset"; },
  };
  return { store, writes };
}
const NOW = "2026-11-20T12:00:00.000Z";

function planned(sub: Submission, overrides: Partial<RecaptureInput> = {}): RecaptureWrites {
  return planRecapture(input(sub, overrides)).writes;
}

describe("applyRecapture", () => {
  it("writes in order: column check, backup, guarded snapshot with recapturedAt, benchmark rows, repo copy job", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore();
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: true, now: NOW });
    expect(writes.map((w) => w.op)).toEqual(["assertBackupColumn", "backupSnapshot", "writeSnapshot", "writeBenchmark", "requeueRepoCopy"]);
    expect(done).toEqual({ backupWritten: true, snapshotWritten: true, benchmarkTasksWritten: 1, benchmarkSourcesWritten: 1, repoCopy: "reset" });
    // The backup is the snapshot as read; the guard is its capturedAt and no recapturedAt.
    expect(writes[1]!.args).toEqual([SUBMISSION_ID, sub.snapshot, { capturedAt: sub.snapshot.capturedAt, recapturedAt: null }]);
    const next = writes[2]!.args[1] as SubmissionSnapshot & { recapturedAt: string };
    expect(next.recapturedAt).toBe(NOW);
    expect(next.capturedAt).toBe(sub.snapshot.capturedAt);
    expect(next.tasks[0]!.diffEnd).toBe("head");
    // Nothing else: no grade job, no status.
    expect(writes.some((w) => /grade|status/i.test(w.op))).toBe(false);
    expect(sub.status).toBe("graded");
  });

  it("an earlier backup is kept (written only when null) and the apply goes on", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore({ backup: "kept" });
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: false, now: NOW });
    expect(done.backupWritten).toBe(false);
    expect(done.snapshotWritten).toBe(true);
    expect(writes.map((w) => w.op)).toContain("writeSnapshot");
  });

  it("a second apply from a re-captured snapshot guards on its recapturedAt", async () => {
    const sub = submission([oldTask()]);
    (sub.snapshot as SubmissionSnapshot & { recapturedAt?: string }).recapturedAt = "2026-11-19T00:00:00.000Z";
    const { store, writes } = fakeStore({ backup: "kept" });
    await applyRecapture(store, sub, planned(sub), { repoCopies: false, now: NOW });
    expect(writes[2]!.args[2]).toEqual({ capturedAt: sub.snapshot.capturedAt, recapturedAt: "2026-11-19T00:00:00.000Z" });
  });

  it("the guard failing at the snapshot writes nothing after it", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore({ snapshotGuard: false });
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: true, now: NOW });
    expect(done.stopped).toBe(GUARD_MESSAGE);
    expect(writes.map((w) => w.op)).toEqual(["assertBackupColumn", "backupSnapshot", "writeSnapshot"]);
  });

  it("the guard failing at the backup writes nothing after it", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore({ backup: "guard" });
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: true, now: NOW });
    expect(done.stopped).toBe(GUARD_MESSAGE);
    expect(writes.map((w) => w.op)).toEqual(["assertBackupColumn", "backupSnapshot"]);
  });

  it("a missing column stops before any write, naming the migration", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore({ column: false });
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: true, now: NOW });
    expect(done.stopped).toMatch(/20261120000000_cse115a_snapshot_before_recapture\.sql/);
    expect(writes.map((w) => w.op)).toEqual(["assertBackupColumn"]);
  });

  it("a failed benchmark write stops there; the repo copy job is not queued", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore({ failBenchmark: true });
    const done = await applyRecapture(store, sub, planned(sub), { repoCopies: true, now: NOW });
    expect(done.stopped).toMatch(/Could not save the benchmark rows/);
    expect(done.snapshotWritten).toBe(true);
    expect(writes.map((w) => w.op)).not.toContain("requeueRepoCopy");
  });

  it("the repo copy job is requeued only for a changed base, and only with copies on", async () => {
    const task = oldTask();
    const sub = submission([task]);
    const keep = planned(sub, { sources: [source(1, "validated")], storedTasks: [sameRow(task)] });
    const sameBase = planned(sub, { sources: [source(1, "rejected")], storedTasks: [{ ...sameRow(task, MB), patch: "different" }] });
    const changed = planned(sub);
    for (const [writes, repoCopies, expected] of [
      [keep, true, "not needed"], [sameBase, true, "not needed"], [changed, false, "copies off"], [changed, true, "reset"],
    ] as const) {
      const fake = fakeStore();
      const done = await applyRecapture(fake.store, sub, writes, { repoCopies, now: NOW });
      expect(done.repoCopy).toBe(expected);
      expect(fake.writes.some((w) => w.op === "requeueRepoCopy")).toBe(expected === "reset");
    }
  });

  it("keep writes the source row only, never the task row", async () => {
    const task = oldTask();
    const sub = submission([task]);
    const { store, writes } = fakeStore();
    await applyRecapture(store, sub, planned(sub, { sources: [source(1, "validated")], storedTasks: [sameRow(task)] }), { repoCopies: true, now: NOW });
    const [tasks, sources] = writes.find((w) => w.op === "writeBenchmark")!.args as [BenchmarkInstance[], unknown[]];
    expect(tasks).toEqual([]);
    expect(sources).toHaveLength(1);
  });

  it("nothing re-captured (all errors or skips): only the column check", async () => {
    const sub = submission([oldTask()]);
    const { store, writes } = fakeStore();
    await applyRecapture(store, sub, planned(sub, { recaptured: new Map([[1, { ok: false, error: "x" }]]) }), { repoCopies: true, now: NOW });
    expect(writes.map((w) => w.op)).toEqual(["assertBackupColumn"]);
  });
});

describe("runRecapture: dry run and apply, one code path", () => {
  function db(): RecaptureDb & { writes: Write[] } {
    const { store, writes } = fakeStore();
    return Object.assign(store, {
      writes,
      loadBenchmarkState: async () => ({ sources: [source(1, "candidate"), source(2, "validated")], storedTasks: [sameRow(oldTask(2))] }),
      loadRepoMetrics: async () => ({ summary: "metrics" }),
      loadStudentEmail: async () => "student@example.invalid",
    });
  }

  it("returns the same plan for the same input; the dry run writes nothing", async () => {
    const sub = submission([oldTask(1), oldTask(2)]);
    const dryDb = db();
    const applyDb = db();
    const dry = await runRecapture(dryDb, gitHub().reader, sub, { apply: false, repoCopies: true, now: NOW });
    const applied = await runRecapture(applyDb, gitHub().reader, sub, { apply: true, repoCopies: true, now: NOW });
    expect(applied.plan).toEqual(dry.plan);
    expect(dry.done).toBeUndefined();
    expect(dryDb.writes).toEqual([]);
    expect(applied.done?.snapshotWritten).toBe(true);
    expect(dry.plan.tasks.map((t) => t.action)).toEqual(["replace", "keep"]);
  });

  it("a superseded submission reads no GitHub", async () => {
    const { reader, calls } = gitHub();
    const result = await runRecapture(db(), reader, submission([oldTask()], { superseded_at: "2026-10-05T00:00:00Z" }), { apply: true, repoCopies: true, now: NOW });
    expect(calls).toEqual([]);
    expect(result.plan.tasks[0]!.action).toBe("skip");
  });
});

describe("the list count and the page totals", () => {
  it("counts present tasks with no diffEnd", () => {
    expect(oldRuleCount({ s1: 1, e1: null, s2: 2, e2: "head", s3: null, e3: null })).toBe(1);
    expect(oldRuleCount({ s1: 1, e1: "merge_commit" })).toBe(0);
  });

  it("totals per action, code changed, errors; the copy line has counts only", async () => {
    const task = oldTask();
    const plan = planRecapture(input(submission([task, oldTask(2)]), { sources: [source(2, "validated")], storedTasks: [sameRow(oldTask(2))] })).plan;
    const totals = recaptureTotals([{ submissionId: "s1", plan }, { submissionId: "s2", error: "Could not check the submission." }]);
    expect(totals).toMatchObject({ submissions: 2, tasks: 2, codeChanged: 2, errors: 1, considerRegrade: 1, actions: { replace: 1, keep: 1, back_to_candidate: 0, skip: 0, error: 0 } });
    const line = copyTotalsLine(totals);
    expect(line).toBe("Old diffs checked (dry run): 2 submissions, 2 tasks: 1 replace, 1 keep, 0 back to candidate, 0 skip, 0 error. 2 with code files changed, 0 on the old range (no merge base), 1 errors, 1 unreleased submissions to consider for Regrade.");
    expect(line).not.toMatch(/team|proj|US-1|sub-/);
  });

  it("a released submission gets no Regrade note", () => {
    const plan = planRecapture(input(submission([oldTask()], { status: "released" }))).plan;
    expect(recaptureTotals([{ submissionId: "s", plan }]).considerRegrade).toBe(0);
  });
});
