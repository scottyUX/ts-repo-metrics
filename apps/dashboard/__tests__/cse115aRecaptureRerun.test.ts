// #418 follow-up: a failed apply repairs itself on a rerun. The snapshot is written last, so a failure at the
// benchmark rows (step 3) or at the snapshot (step 4) leaves the old-rule snapshot in place, and running the
// tool again ends in the same state as a clean apply. The database is an in-memory fake with the same upsert
// and guard rules as the real one; GitHub is a fake. Names, repos and ids are made up.
import { describe, expect, it } from "vitest";
import { buildInstance, type BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { RECAPTURED_SAME_PATCH_FLAG, runRecapture, type RecaptureDb, type RecapturedSnapshot } from "@/lib/cse115a/benchmark/recapture";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { SourceUpsert, StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import type { SubmissionSnapshot, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const MERGE = "m".repeat(40);
const OLD_BASE = "a".repeat(40);
const MB = "b".repeat(40);
const HEAD = "c".repeat(40);
const PR_BASE = "d".repeat(40);
const fileDiff = (path: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`;
const OLD_DIFF = fileDiff("src/cart.ts") + fileDiff("src/teammate.ts") + fileDiff("src/__tests__/cart.test.ts");
const NEW_DIFF = fileDiff("src/cart.ts") + fileDiff("src/__tests__/cart.test.ts");

function oldTask(slot: number): TaskSnapshot {
  return {
    slot, taskId: `US-1-T-${slot}`, prUrl: `https://github.com/team/proj/pull/${10 + slot}`, repoFullName: "team/proj", prNumber: 10 + slot,
    taskPath: `docs/tasks/sprint-1/US-1-T-${slot}.md`, specMarkdown: "# Task\n", spec: { id: `US-1-T-${slot}`, estimateHours: 2 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: `result-${slot}`,
    pr: { title: "t", body: "", headRef: "b", author: "student", mergedAt: "2026-10-01T00:00:00Z", baseSha: PR_BASE, mergeCommitSha: MERGE },
    baseCommit: OLD_BASE, baseCommitSource: "first_commit",
    diff: OLD_DIFF, diffBytes: Buffer.byteLength(OLD_DIFF), diffTruncated: false, diffError: null, comments: [], checks: [],
  };
}

const gh: GitHubReader = {
  async json<T>(path: string) {
    if (/\/pulls\/\d+$/.test(path)) return { title: "t", body: "", merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: MERGE, base: { sha: PR_BASE }, head: { ref: "b", sha: HEAD }, user: null } as T;
    if (path.includes("/commits?per_page=1")) return [{ sha: OLD_BASE }] as T;
    if (/\/commits\/[0-9a-f]{40}$/.test(path)) return { files: [{ filename: "docs/tasks/sprint-1/US-1-T-1.md" }] } as T;
    if (path.includes("/compare/")) return { merge_base_commit: { sha: MB } } as T;
    throw new Error(`unexpected ${path}`);
  },
  async text() {
    return NEW_DIFF;
  },
};

/** The instance a re-capture builds for a slot, for stored rows whose patches equal the new ones. */
function newInstance(slot: number): BenchmarkInstance {
  return buildInstance({ ...oldTask(slot), baseCommit: MB, baseCommitSource: "merge_base", diffEnd: "head", diff: NEW_DIFF }, 1, null, null).instance;
}

type Row = SourceUpsert & { validation_status: StoredSource["validation_status"] };
type State = {
  snapshot: RecapturedSnapshot;
  backup: SubmissionSnapshot | null;
  superseded_at: string | null;
  status: Submission["status"];
  sources: Map<string, Row>;
  tasks: Map<string, BenchmarkInstance>;
  job: { status: "queued" | "running" | "succeeded" | "failed" };
  gradeJobs: number;
};

/**
 * Four old-rule tasks: slot 1 with a candidate row (replace), slot 2 validated with the new patches already
 * (keep), slot 3 validated with an older patch (back to candidate), slot 4 with no rows yet (replace, a new
 * instance). The repo copy job already ran.
 */
function initialState(): State {
  const row = (slot: number, status: Row["validation_status"], flags: string[]): [string, Row] => [`sub-1:${slot}`, {
    instance_id: `team__proj-US-1-T-${slot}`, course_id: "course-1", user_id: "user-1", assignment_submission_id: "sub-1",
    task_slot: slot, flags, updated_at: "2026-10-02T00:00:00.000Z", validation_status: status,
  }];
  const stored = (slot: number, patch?: string): [string, BenchmarkInstance] => {
    const built = newInstance(slot);
    return [built.instance_id, { ...built, base_commit: OLD_BASE, environment_setup_commit: OLD_BASE, ...(patch ? { patch } : {}), harbor_env: { image: "x" } as never, validation_detail: { v: 1 } as never }];
  };
  return {
    snapshot: { version: 1, capturedAt: "2026-10-02T00:00:00.000Z", tasks: [oldTask(1), oldTask(2), oldTask(3), oldTask(4)] },
    backup: null,
    superseded_at: null,
    status: "graded",
    sources: new Map([row(1, "candidate", ["base_commit_from_first_commit"]), row(2, "validated", ["base_commit_from_first_commit", "harness_ok"]), row(3, "validated", ["base_commit_from_first_commit", "harness_ok"])]),
    tasks: new Map([stored(1, "old patch"), stored(2), stored(3, "older patch")]),
    job: { status: "succeeded" },
    gradeJobs: 0,
  };
}

/**
 * Where a write fails, once per entry: "source" at the second source row of a write, "tasks" right after the
 * task rows are written, "snapshot" before the snapshot is written.
 */
type Fail = "source" | "tasks" | "snapshot";

/** The fake database. Like the real one, a source row needs its task row (the foreign key). */
function fakeDb(state: State, fail: Fail[] = []): RecaptureDb {
  const holds = (guard: { capturedAt: string; recapturedAt: string | null }) => state.superseded_at === null
    && state.snapshot.capturedAt === guard.capturedAt && (state.snapshot.recapturedAt ?? null) === guard.recapturedAt;
  const failOnce = (step: Fail) => {
    const index = fail.indexOf(step);
    if (index < 0) return false;
    fail.splice(index, 1);
    return true;
  };
  return {
    async assertBackupColumn() {},
    async backupSnapshot(_id, snapshot, guard) {
      if (!holds(guard)) return "guard";
      if (state.backup !== null) return "kept";
      state.backup = structuredClone(snapshot);
      return "written";
    },
    async writeBenchmark(tasks, sources) {
      for (const task of tasks) state.tasks.set(task.instance_id, structuredClone(task));
      if (tasks.length && failOnce("tasks")) throw new Error("Could not save benchmark sources: connection reset");
      for (const [index, source] of sources.entries()) {
        if (index === 1 && failOnce("source")) throw new Error("Could not save benchmark sources: connection reset");
        if (!state.tasks.has(source.instance_id)) throw new Error("violates foreign key constraint cse_benchmark_task_sources_instance_id_fkey");
        const key = `${source.assignment_submission_id}:${source.task_slot}`;
        const existing = state.sources.get(key);
        // An upsert without validation_status keeps the stored one, and a new row starts as candidate.
        state.sources.set(key, { ...source, validation_status: source.validation_status ?? existing?.validation_status ?? "candidate" });
      }
    },
    async writeSnapshot(_id, snapshot, guard) {
      if (failOnce("snapshot")) throw new Error("Could not save the new snapshot: statement timeout");
      if (!holds(guard)) return false;
      state.snapshot = structuredClone(snapshot);
      return true;
    },
    async requeueRepoCopy() {
      if (state.job.status === "failed" || state.job.status === "succeeded") {
        state.job = { status: "queued" };
        return "reset";
      }
      return state.job.status === "running" ? "running" : "already queued";
    },
    async loadBenchmarkState(ids) {
      return {
        sources: [...state.sources.values()].filter((s) => ids.includes(s.instance_id)).map((s) => ({
          instance_id: s.instance_id, assignment_submission_id: s.assignment_submission_id, task_slot: s.task_slot,
          validation_status: s.validation_status, flags: [...s.flags], merge_commit: null,
        })),
        storedTasks: [...state.tasks.values()].filter((t) => ids.includes(t.instance_id))
          .map((t) => ({ instance_id: t.instance_id, base_commit: t.base_commit, patch: t.patch, test_patch: t.test_patch })),
      };
    },
    async loadRepoMetrics() { return null; },
    async loadStudentEmail() { return null; },
  };
}

/** The submission as the route loads it from the state. */
function loaded(state: State): Submission {
  return { id: "sub-1", course_id: "course-1", user_id: "user-1", assignment_number: 1, status: state.status, snapshot: structuredClone(state.snapshot), superseded_at: state.superseded_at };
}

/** The state without the times each apply stamps (`updated_at`, `recapturedAt`). */
function settled(state: State) {
  const { recapturedAt, ...snapshot } = state.snapshot;
  return {
    snapshot, recaptured: typeof recapturedAt === "string", backup: state.backup, status: state.status, job: state.job, gradeJobs: state.gradeJobs,
    sources: [...state.sources.values()].map((row) => ({ ...row, updated_at: undefined })).sort((a, b) => a.task_slot - b.task_slot),
    tasks: [...state.tasks.values()].sort((a, b) => a.instance_id.localeCompare(b.instance_id)),
  };
}

async function apply(state: State, fail: Fail[] = [], now = "2026-11-21T10:00:00.000Z") {
  return runRecapture(fakeDb(state, fail), gh, loaded(state), { apply: true, repoCopies: true, now });
}

async function cleanState() {
  const state = initialState();
  const result = await apply(state);
  expect(result.done?.stopped).toBeUndefined();
  return state;
}

describe("#418 follow-up: a failed apply repairs itself on a rerun", () => {
  it("a clean apply: replace, keep and back to candidate, the new snapshot last, the copy job requeued", async () => {
    const state = initialState();
    const before = structuredClone(state.snapshot);
    const result = await apply(state);
    expect(result.plan.tasks.map((t) => t.action)).toEqual(["replace", "keep", "back_to_candidate", "replace"]);
    expect(result.done).toEqual({ backupWritten: true, snapshotWritten: true, benchmarkTasksWritten: 3, benchmarkSourcesWritten: 4, repoCopy: "reset" });
    expect(state.backup).toEqual(before);
    expect(state.snapshot.tasks.every((t) => t.diffEnd === "head")).toBe(true);
    const sources = settled(state).sources;
    expect(sources.map((s) => s.validation_status)).toEqual(["candidate", "validated", "candidate", "candidate"]);
    expect(sources[1]!.flags).toEqual(["base_commit_from_first_commit", "harness_ok", RECAPTURED_SAME_PATCH_FLAG]);
    expect(sources[2]!.flags).not.toContain("harness_ok");
    // The kept task row is untouched; the other two hold the new instance with no recipe or detail.
    expect(state.tasks.get("team__proj-US-1-T-2")).toMatchObject({ base_commit: OLD_BASE, harbor_env: { image: "x" } });
    expect(state.tasks.get("team__proj-US-1-T-3")).toMatchObject({ base_commit: MB, harbor_env: null, validation_detail: null, patch: newInstance(3).patch });
    expect(state.tasks.get("team__proj-US-1-T-4")).toMatchObject({ base_commit: MB });
    expect(state.job.status).toBe("queued");
    expect(state.status).toBe("graded");
  });

  it.each([
    ["between the source rows, before any task row", "source" as Fail],
    ["after the task rows, before the new instance's source row", "tasks" as Fail],
  ])("a failure at step 3 (%s) leaves the snapshot unchanged; a rerun succeeds and ends as a clean apply does", async (_where, fail) => {
    const state = initialState();
    const before = structuredClone(state.snapshot);
    const failed = await apply(state, [fail]);
    expect(failed.done?.stopped).toMatch(/^Could not save the benchmark rows: .*connection reset/);
    expect(failed.done?.snapshotWritten).toBe(false);
    expect(state.snapshot).toEqual(before);
    expect(state.snapshot.tasks.every((t) => t.diffEnd === undefined)).toBe(true);
    expect(state.job.status).toBe("succeeded");
    // The settled source whose patch changed is never left settled over a replaced task row.
    const three = state.sources.get("sub-1:3")!;
    const threeRow = state.tasks.get("team__proj-US-1-T-3")!;
    expect(three.validation_status === "validated" && threeRow.patch === newInstance(3).patch).toBe(false);

    const rerun = await apply(state, [], "2026-11-21T11:00:00.000Z");
    expect(rerun.done?.stopped).toBeUndefined();
    expect(rerun.done?.backupWritten).toBe(false);
    expect(settled(state)).toEqual(settled(await cleanState()));
  });

  it("a failure at step 4 leaves the rows written and the snapshot old; a rerun ends in the same final state as a clean apply", async () => {
    const state = initialState();
    const before = structuredClone(state.snapshot);
    const failed = await apply(state, ["snapshot"]);
    expect(failed.done?.stopped).toMatch(/^Could not save the new snapshot: .*statement timeout/);
    expect(failed.done).toMatchObject({ backupWritten: true, snapshotWritten: false, benchmarkTasksWritten: 3, benchmarkSourcesWritten: 4, repoCopy: "not needed" });
    expect(state.snapshot).toEqual(before);
    const afterFailure = settled(state);
    expect(afterFailure.sources.map((s) => s.validation_status)).toEqual(["candidate", "validated", "candidate", "candidate"]);
    expect(state.job.status).toBe("succeeded");

    // The rerun sees the rows it wrote: candidate rows with the new patch (replace again), and the kept source
    // with its flag (keep again, the flag not added twice). The rows come out the same.
    const rerun = await apply(state, [], "2026-11-21T11:00:00.000Z");
    expect(rerun.done?.stopped).toBeUndefined();
    expect(rerun.plan.tasks.map((t) => [t.action, t.row])).toEqual([["replace", "candidate"], ["keep", "validated"], ["replace", "candidate"], ["replace", "candidate"]]);
    expect(rerun.plan.tasks.map((t) => t.baseChanged)).toEqual([true, false, true, true]);
    expect(rerun.done?.repoCopy).toBe("reset");
    const final = settled(state);
    expect(final.sources).toEqual(afterFailure.sources);
    expect(final.sources[1]!.flags.filter((f) => f === RECAPTURED_SAME_PATCH_FLAG)).toHaveLength(1);
    expect(final).toEqual(settled(await cleanState()));
  });

  it("a rerun after a clean apply finds nothing to do: every task is skipped and nothing changes", async () => {
    const state = await cleanState();
    const done = settled(state);
    const again = await apply(state, [], "2026-11-21T12:00:00.000Z");
    expect(again.plan.tasks.map((t) => t.action)).toEqual(["skip", "skip", "skip", "skip"]);
    expect(settled(state)).toEqual(done);
  });
});
