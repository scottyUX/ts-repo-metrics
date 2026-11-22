// Re-captures the diffs of submissions saved before the PR-own-diff rule (#382), for staff (#418). A task
// saved then has no `diffEnd`: its diff ran from the PR's first commit or base to the merge commit, so it can
// hold a teammate's files. This re-runs today's diff capture on the saved task (recaptureTaskDiff) and changes
// only the diff fields; the spec, validation, comments, checks and PR details saved at Submit stay. Grades,
// grade status and grading jobs are never touched.
//
// One code path for the dry run and the apply: planRecapture is pure (tested without a database) and returns
// the view staff see plus the writes; the dry run returns the view, applyRecapture executes the writes in a
// fixed order and stops at the first failure.
//
// Benchmark rows: a candidate row (or none) is replaced. A validated or rejected row is kept untouched only
// when the new `patch` and `test_patch` are byte-for-byte the stored ones (the source gains the flag
// `recaptured_same_patch`); otherwise it is replaced and goes back to candidate.

import { parseDiffFiles } from "@/lib/cse115a/diff";
import { buildInstance, instanceId, isTaskFolderPath, type BenchmarkInstance, type BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import type { SourceUpsert, StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { RepoCopyRequeue, Submission } from "@/lib/cse115a/jobs/runner";
import { prHoldsMoreThanThisTask } from "@/lib/cse115a/sharedPr";
import { TASK_SLOTS } from "@/lib/cse115a/taskSlots";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { isOldRuleTask, recaptureTaskDiff, samePrTaskPathsOf, type RecaptureResult, type SubmissionSnapshot, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";

export const RECAPTURED_SAME_PATCH_FLAG = "recaptured_same_patch" satisfies BuildFlag;

/** The migration that adds `cse_assignment_submissions.snapshot_before_recapture`; an apply needs it first. */
export const SNAPSHOT_BACKUP_MIGRATION = "supabase/migrations/20261120000000_cse115a_snapshot_before_recapture.sql";

/** A saved snapshot after a re-capture: the top-level time of the last apply. */
export type RecapturedSnapshot = SubmissionSnapshot & { recapturedAt?: string };

/** The stored `cse_benchmark_tasks` row of an instance, as far as the plan reads it. */
export type StoredTaskRow = { instance_id: string; base_commit: string; patch: string; test_patch: string };

export type RecaptureAction = "skip" | "error" | "replace" | "keep" | "back_to_candidate";

/** One side of a task's diff, old (saved) or new (re-captured). */
export type DiffSide = {
  baseCommitSource: TaskSnapshot["baseCommitSource"];
  baseCommit: string;
  /** Where the diff ends; null on the old side (saved before #382: the merge commit). */
  diffEnd: TaskSnapshot["diffEnd"] | null;
  files: string[];
  diffBytes: number;
  diffTruncated: boolean;
};

export type TaskPlan = {
  task: { slot: number; instanceId: string };
  old: DiffSide;
  /** Null for skip and error. */
  new: DiffSide | null;
  filesRemoved: string[];
  filesAdded: string[];
  /** The two file lists differ in a file outside docs/tasks/. */
  codeChanged: boolean;
  /** This submission's source row for the slot: its validation status, or null when there is none. */
  row: StoredSource["validation_status"] | null;
  action: RecaptureAction;
  /** Why, for skip and error. */
  reason?: string;
  /**
   * A repo copy under the new base commit's name may be missing (replace and back_to_candidate only): the new
   * base differs from the stored row's base_commit, or there is no stored row, or it differs from the saved
   * task's own baseCommit. The last case is a rerun after an apply that wrote the rows but not the snapshot:
   * the row already holds the new base, but the copy job was never requeued.
   */
  baseChanged: boolean;
  /** The re-capture could not read the merge base and used the old range, ending at the merge commit. */
  fallback: boolean;
};

export type RecapturePlan = {
  submissionId: string;
  assignmentNumber: number;
  status: Submission["status"];
  superseded: boolean;
  released: boolean;
  tasks: TaskPlan[];
};

/** What an apply writes, from the plan. Not sent to the page (it holds diffs and instances). */
export type RecaptureWrites = {
  /** The saved snapshot with the re-captured tasks (no `recapturedAt` yet); null when no task was re-captured. */
  snapshot: SubmissionSnapshot | null;
  /** Instances to upsert into cse_benchmark_tasks (replace and back_to_candidate), harbor_env and validation_detail null. */
  tasks: BenchmarkInstance[];
  /** Source rows to upsert, one per replace, back_to_candidate or keep. */
  sources: SourceUpsert[];
  /** Instances whose base commit changed: the submission's repo_copy job must run again. */
  baseChanged: string[];
  /**
   * Instances whose cse_benchmark_tasks row is already stored. Their source rows are written before the task
   * rows, so a validated or rejected source is sent back to candidate before its task row is replaced: an
   * apply that fails in between never leaves a settled source over a replaced row, which a rerun would take for
   * "same patch" and keep. Sources of new instances come after the task rows (the foreign key needs the row).
   */
  storedInstances: string[];
};

export type RecaptureInput = {
  submission: Submission;
  /** The re-capture of each old-rule task, by slot; a task not in the map is not re-captured. */
  recaptured: Map<number, RecaptureResult>;
  /** Source rows stored for the submission's instances (any submission); only this submission's rows are read. */
  sources: StoredSource[];
  /** The stored cse_benchmark_tasks rows of the submission's instances. */
  storedTasks: StoredTaskRow[];
  /** The Repo Metrics report of each task, by analysisResultId, as runBenchmark loads it. */
  repoMetrics: Map<string, unknown>;
  studentEmail: string | null;
  now: string;
};

/** The paths a diff touches, from its `diff --git` headers (diff.ts parseDiffFiles), sorted. */
export function diffFileList(diff: string): string[] {
  return [...new Set(parseDiffFiles(diff).map((file) => file.path))].sort();
}

function side(task: TaskSnapshot): DiffSide {
  return {
    baseCommitSource: task.baseCommitSource,
    baseCommit: task.baseCommit,
    diffEnd: task.diffEnd ?? null,
    files: diffFileList(task.diff),
    diffBytes: task.diffBytes,
    diffTruncated: task.diffTruncated,
  };
}

/**
 * The plan for one submission. Pure: the dry run returns `plan`, the apply executes `writes`. Only this
 * submission's source rows are read or written; other source rows of the same instance (older, superseded
 * attempts) are left as they are.
 */
export function planRecapture(input: RecaptureInput): { plan: RecapturePlan; writes: RecaptureWrites } {
  const { submission } = input;
  const saved = [...submission.snapshot.tasks].sort((a, b) => a.slot - b.slot);
  const superseded = submission.superseded_at !== null;
  const newTasks = saved.map((task) => {
    const result = input.recaptured.get(task.slot);
    return !superseded && isOldRuleTask(task) && result?.ok ? result.task : task;
  });
  const anyRecaptured = newTasks.some((task, index) => task !== saved[index]);
  const snapshot: SubmissionSnapshot | null = anyRecaptured ? { ...submission.snapshot, tasks: newTasks } : null;
  const writes: RecaptureWrites = { snapshot, tasks: [], sources: [], baseChanged: [], storedInstances: [] };

  const tasks: TaskPlan[] = saved.map((task, index) => {
    const id = instanceId(task.repoFullName, task.taskId);
    const source = input.sources.find((s) => s.assignment_submission_id === submission.id && s.task_slot === task.slot) ?? null;
    const base: TaskPlan = {
      task: { slot: task.slot, instanceId: id },
      old: side(task),
      new: null,
      filesRemoved: [],
      filesAdded: [],
      codeChanged: false,
      row: source?.validation_status ?? null,
      action: "skip",
      baseChanged: false,
      fallback: false,
    };
    if (superseded) return { ...base, reason: "The submission is superseded." };
    if (!isOldRuleTask(task)) return { ...base, reason: "Already saved on the PR-own-diff rule." };
    const result = input.recaptured.get(task.slot);
    if (!result) return { ...base, action: "error", reason: `Task ${task.slot} was not re-captured.` };
    if (!result.ok) return { ...base, action: "error", reason: result.error };

    const next = newTasks[index]!;
    const nextSide = side(next);
    const oldFiles = new Set(base.old.files);
    const newFiles = new Set(nextSide.files);
    const filesRemoved = base.old.files.filter((file) => !newFiles.has(file));
    const filesAdded = nextSide.files.filter((file) => !oldFiles.has(file));
    const codeChanged = [...filesRemoved, ...filesAdded].some((file) => !isTaskFolderPath(file));

    // The instance as runBenchmark builds it today, from the new snapshot's tasks.
    const built = buildInstance(next, submission.assignment_number, input.repoMetrics.get(next.analysisResultId) ?? null, input.studentEmail,
      { prHoldsTwoTasks: prHoldsMoreThanThisTask(newTasks, next) });
    const stored = input.storedTasks.find((row) => row.instance_id === built.instance.instance_id) ?? null;
    const upsert: SourceUpsert = {
      instance_id: built.instance.instance_id,
      course_id: submission.course_id,
      user_id: submission.user_id,
      assignment_submission_id: submission.id,
      task_slot: next.slot,
      flags: built.flags,
      updated_at: input.now,
    };
    if (stored !== null && !writes.storedInstances.includes(stored.instance_id)) writes.storedInstances.push(stored.instance_id);
    const settled = source !== null && source.validation_status !== "candidate";
    const samePatches = stored !== null && stored.patch === built.instance.patch && stored.test_patch === built.instance.test_patch;
    let action: RecaptureAction;
    if (settled && samePatches) {
      // Kept: the task row is not written at all; the source keeps its status and flags and gains one flag.
      action = "keep";
      writes.sources.push({
        ...upsert,
        flags: source.flags.includes(RECAPTURED_SAME_PATCH_FLAG) ? source.flags : [...source.flags, RECAPTURED_SAME_PATCH_FLAG],
        validation_status: source.validation_status,
      });
    } else {
      action = settled ? "back_to_candidate" : "replace";
      writes.tasks.push({ ...built.instance, harbor_env: null, validation_detail: null });
      // replace: a candidate row stays candidate and a new row starts so; back_to_candidate says so.
      writes.sources.push(settled ? { ...upsert, validation_status: "candidate" } : upsert);
    }
    const baseChanged = action !== "keep"
      && (stored === null || stored.base_commit !== built.instance.base_commit || task.baseCommit !== built.instance.base_commit);
    if (baseChanged) writes.baseChanged.push(built.instance.instance_id);
    return {
      ...base,
      task: { slot: task.slot, instanceId: built.instance.instance_id },
      new: nextSide,
      filesRemoved,
      filesAdded,
      codeChanged,
      action,
      baseChanged,
      fallback: next.diffEnd === "merge_commit",
    };
  });

  return {
    plan: {
      submissionId: submission.id,
      assignmentNumber: submission.assignment_number,
      status: submission.status,
      superseded,
      released: submission.status === "released",
      tasks,
    },
    writes,
  };
}

/** What an apply did, in order. */
export type RecaptureDone = {
  /** True when snapshot_before_recapture was written by this apply (it was null). */
  backupWritten: boolean;
  snapshotWritten: boolean;
  benchmarkTasksWritten: number;
  benchmarkSourcesWritten: number;
  /** The repo_copy job: what was done to it, or why not. */
  repoCopy: "not needed" | "copies off" | RepoCopyRequeue;
  /** Set when the apply stopped before the end: the step and its message. Nothing after it was written. */
  stopped?: string;
};


/** The database calls an apply makes; tests hand in a fake. */
export type RecaptureStore = {
  /** Throws a clear error naming SNAPSHOT_BACKUP_MIGRATION when the column is missing. */
  assertBackupColumn(): Promise<void>;
  /**
   * Writes `snapshot_before_recapture` = `snapshot` where it is null, guarded like writeSnapshot. Returns
   * "written", "kept" (already set) or "guard" (the row is superseded or its snapshot is no longer the one read).
   */
  backupSnapshot(submissionId: string, snapshot: SubmissionSnapshot, guard: SnapshotGuard): Promise<"written" | "kept" | "guard">;
  /** Writes the new snapshot where the guard holds; false when no row matched. */
  writeSnapshot(submissionId: string, snapshot: RecapturedSnapshot, guard: SnapshotGuard): Promise<boolean>;
  /** Upserts instances and source rows, as saveBenchmark writes them (one upsert per source row). */
  writeBenchmark(tasks: BenchmarkInstance[], sources: SourceUpsert[]): Promise<void>;
  /** Makes the submission's repo_copy job run again (inserted when missing; a failed or succeeded one reset to queued). */
  requeueRepoCopy(submissionId: string): Promise<RepoCopyRequeue>;
};

/** The snapshot an apply read: the row must still be not superseded and hold this snapshot. */
export type SnapshotGuard = { capturedAt: string; recapturedAt: string | null };

export function snapshotGuard(snapshot: RecapturedSnapshot): SnapshotGuard {
  return { capturedAt: snapshot.capturedAt, recapturedAt: snapshot.recapturedAt ?? null };
}

/**
 * Executes the writes for one submission, in order, stopping at the first failure: (1) the column check;
 * (2) the backup, only where null, under the guard, which is also the guard check before any other write;
 * (3) the benchmark task and source rows; (4) the new snapshot under the guard, last; (5) the repo_copy job
 * (only for a changed base and only with copies on). Step 3 writes the source rows of instances already
 * stored, then the task rows, then the source rows of new instances (see `storedInstances`). Until step 4 the snapshot is still the old-rule one, so
 * a failure at step 3 or 4 leaves the submission in the list and a rerun redoes it: the plan then sees the rows
 * step 3 wrote (a candidate row with the new patch is replaced by the same row; a kept source already has its
 * flag) and ends in the same state as a clean apply. No grade job is queued and `status` is not changed. A
 * failed step or guard is reported in `stopped`, with what was done before it; nothing after it is written.
 */
export async function applyRecapture(
  store: RecaptureStore, submission: Submission, writes: RecaptureWrites, options: { repoCopies: boolean; now: string },
): Promise<RecaptureDone> {
  const done: RecaptureDone = { backupWritten: false, snapshotWritten: false, benchmarkTasksWritten: 0, benchmarkSourcesWritten: 0, repoCopy: "not needed" };
  let step = "check for the snapshot_before_recapture column";
  try {
    await store.assertBackupColumn();
    if (!writes.snapshot) return done;
    const guard = snapshotGuard(submission.snapshot as RecapturedSnapshot);
    step = "save snapshot_before_recapture";
    const backup = await store.backupSnapshot(submission.id, submission.snapshot, guard);
    if (backup === "guard") return { ...done, stopped: GUARD_MESSAGE };
    done.backupWritten = backup === "written";
    if (writes.tasks.length || writes.sources.length) {
      step = "save the benchmark rows";
      // Sources of stored instances first (a demotion to candidate lands before its row is replaced), then
      // the task rows, then sources of new instances.
      const first = writes.sources.filter((s) => writes.storedInstances.includes(s.instance_id));
      const after = writes.sources.filter((s) => !writes.storedInstances.includes(s.instance_id));
      if (first.length) {
        await store.writeBenchmark([], first);
        done.benchmarkSourcesWritten += first.length;
      }
      if (writes.tasks.length || after.length) {
        await store.writeBenchmark(writes.tasks, after);
        done.benchmarkTasksWritten = writes.tasks.length;
        done.benchmarkSourcesWritten += after.length;
      }
    }
    step = "save the new snapshot";
    // A guard failing here comes after the rows: the submission was superseded or re-captured by someone else
    // in between. The rows are what a clean apply writes for this snapshot (a superseded attempt's rows are
    // kept like any other's), and a submission still listed is redone by a rerun.
    const next: RecapturedSnapshot = { ...writes.snapshot, recapturedAt: options.now };
    if (!(await store.writeSnapshot(submission.id, next, guard))) return { ...done, stopped: GUARD_MESSAGE };
    done.snapshotWritten = true;
    if (writes.baseChanged.length) {
      step = "queue the repo copy job again";
      done.repoCopy = options.repoCopies ? await store.requeueRepoCopy(submission.id) : "copies off";
    }
    return done;
  } catch (error) {
    return { ...done, stopped: `Could not ${step}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export const GUARD_MESSAGE = "The submission changed since it was read (superseded, or re-captured by someone else). Nothing more was written; check it again.";

/** The task slots of a saved snapshot that are old-rule (no `diffEnd`). */
export function oldRuleSlots(snapshot: SubmissionSnapshot | null | undefined): number[] {
  return (snapshot?.tasks ?? []).filter((task) => isOldRuleTask(task)).map((task) => task.slot);
}

/** What the route reads besides the submission, and the writes; tests hand in a fake. */
export type RecaptureDb = RecaptureStore & {
  /** This submission's source rows and every stored source and task row of the given instances. */
  loadBenchmarkState(instanceIds: string[]): Promise<{ sources: StoredSource[]; storedTasks: StoredTaskRow[] }>;
  loadRepoMetrics(analysisResultId: string): Promise<unknown>;
  loadStudentEmail(courseId: string, userId: string): Promise<string | null>;
};

/** Re-captures each old-rule task of a submission that is not superseded, one at a time; an error in one task never drops the other. */
export async function recaptureSubmissionTasks(gh: GitHubReader, submission: Submission): Promise<Map<number, RecaptureResult>> {
  const out = new Map<number, RecaptureResult>();
  if (submission.superseded_at !== null) return out;
  const tasks = submission.snapshot.tasks ?? [];
  for (const task of tasks) {
    if (!isOldRuleTask(task)) continue;
    try {
      out.set(task.slot, await recaptureTaskDiff(gh, task, samePrTaskPathsOf(tasks, task)));
    } catch (error) {
      out.set(task.slot, { ok: false, error: `Task ${task.slot}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) });
    }
  }
  return out;
}

/**
 * The dry run and the apply, one code path: re-capture, load the stored rows, plan; with `apply`, execute the
 * writes. The plan returned is the same either way for the same GitHub answers and stored rows.
 */
export async function runRecapture(
  db: RecaptureDb, gh: GitHubReader, submission: Submission,
  options: { apply: boolean; repoCopies: boolean; now?: string },
): Promise<{ plan: RecapturePlan; done?: RecaptureDone }> {
  const now = options.now ?? new Date().toISOString();
  const recaptured = await recaptureSubmissionTasks(gh, submission);
  const tasks = submission.snapshot.tasks ?? [];
  const { sources, storedTasks } = await db.loadBenchmarkState([...new Set(tasks.map((task) => instanceId(task.repoFullName, task.taskId)))]);
  const repoMetrics = new Map<string, unknown>();
  let studentEmail: string | null = null;
  if ([...recaptured.values()].some((result) => result.ok)) {
    for (const task of tasks) {
      if (recaptured.get(task.slot)?.ok && !repoMetrics.has(task.analysisResultId)) repoMetrics.set(task.analysisResultId, await db.loadRepoMetrics(task.analysisResultId));
    }
    studentEmail = await db.loadStudentEmail(submission.course_id, submission.user_id);
  }
  const { plan, writes } = planRecapture({ submission, recaptured, sources, storedTasks, repoMetrics, studentEmail, now });
  if (!options.apply) return { plan };
  return { plan, done: await applyRecapture(db, submission, writes, { repoCopies: options.repoCopies, now }) };
}

/**
 * The login the route gives courseRepoReader. courseRepoToken only checks that a login is there; the token is
 * the course App's installation token for the repository itself (repoInstallationToken), which reads a private
 * repo the team installed the App on, whoever asks. The login is never sent to GitHub, so staff need no linked
 * GitHub account.
 */
export const STAFF_READER_LOGIN = "course-staff";

/** Each task's slot and diffEnd as JSON paths, so the list never loads diffs: `s1`/`e1` for the first task, and so on. */
export const RECAPTURE_TASK_PATHS = TASK_SLOTS.map((slot) => `s${slot}:snapshot->tasks->${slot - 1}->slot,e${slot}:snapshot->tasks->${slot - 1}->diffEnd`).join(",");

/** How many tasks of a row listed with RECAPTURE_TASK_PATHS are old-rule: present (a slot) with no diffEnd. */
export function oldRuleCount(row: Record<string, unknown>): number {
  return TASK_SLOTS.filter((slot) => row[`s${slot}`] !== null && row[`s${slot}`] !== undefined
    && (row[`e${slot}`] === null || row[`e${slot}`] === undefined)).length;
}
