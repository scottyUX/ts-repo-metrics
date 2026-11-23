// Staff add extra PRs for a task's code (#437), on the server. Students split one task over several PRs; the task
// keeps one main PR (`prNumber`, the student's or staff's choice through #431), and each extra PR adds to what staff
// and the AI see. The benchmark row is still built from the main PR only.
//
// - Add: the rules (checkChosenPr and usedPrs, as for a main PR, plus this task's own extra PRs and the limit), the
//   capture of the PR's own diff and checks (captureExtraCodePr), a preview that writes nothing, and the apply.
// - Remove: no preview; always applied.
//
// The writes, in order: (1) this submission's benchmark source row for the slot gains or loses the flag
// extra_code_prs (only when it has a row and the flag changes; its status, patches and other flags stay); (2) the
// snapshot, guarded as the re-capture's is, with only this task's `extraCodePrs` and `extraCodePrChange` changed and
// `recapturedAt` set. A failure at (2) leaves (1), which a rerun writes again to the same value. No grade row, grade
// status, grade job, task row or repo copy is written; staff press Regrade.

import { instanceId, isTaskFolderPath } from "@/lib/cse115a/benchmark/buildInstance";
import { diffFileList, GUARD_MESSAGE, snapshotGuard, type RecapturedSnapshot } from "@/lib/cse115a/benchmark/recapture";
import {
  checkChosenPr, NO_REASON, seenMatches, STALE_PAGE, usedPrs, type ExtraPrRequest, type Refusal, type WorkPrDb,
} from "@/lib/cse115a/benchmark/workPrChoice";
import { splitPatch } from "@/lib/cse115a/diff";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import {
  captureExtraCodePr, inMergeOrder, MAX_EXTRA_CODE_PRS, type ExtraCodePr, type TaskSnapshot,
} from "@/lib/cse115a/submissionSnapshot";
import {
  EXTRA_CODE_PRS_FLAG, extraBenchmarkLine, extraOverlapWarning, parsePrInput, previewSummary, WORK_PR_TEXT, type ExtraCodePrChange,
} from "@/lib/cse115a/workPr";

export const alreadyExtraMessage = (n: number) => `PR #${n} is already an extra PR of this task.`;
export const notExtraMessage = (n: number) => `PR #${n} is not an extra PR of this task.`;
export const mainPrMessage = (n: number) => `PR #${n} is this task's main PR.`;
export const taskFilePrMessage = (n: number) => `PR #${n} holds this task's task file, so it can't also be an extra PR for its code.`;

/** The preview of an extra PR: its own files and what happens to the benchmark row. */
export type ExtraPrPreview = {
  slot: number;
  prNumber: number;
  prUrl: string;
  title: string;
  mergedAt: string;
  files: string[];
  testFiles: number;
  /** Source files, without task files (docs/tasks/...), which are counted in `taskFiles`. */
  sourceFiles: number;
  taskFiles: number;
  diffTruncated: boolean;
  summary: string;
  benchmark: { row: StoredSource["validation_status"] | null; line: string };
  warnings: string[];
};

/** What an apply wrote, in order. */
export type ExtraPrDone = { benchmarkSourcesWritten: number; snapshotWritten: boolean };

export type ExtraPrResult =
  | Refusal
  | { ok: true; status: 200; body: { apply: false; preview: ExtraPrPreview } }
  | { ok: true; status: 200; body: { apply: true; preview: ExtraPrPreview | null; done: ExtraPrDone; message: string } };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The files an extra PR changes that the main PR or an earlier-listed extra PR also changes (task files left out),
 * with those PRs. Pure.
 */
export function overlapWith(task: TaskSnapshot, extra: Pick<ExtraCodePr, "prNumber" | "diff">): { files: string[]; prs: number[] } {
  const mine = new Set(diffFileList(extra.diff).filter((path) => !isTaskFolderPath(path)));
  const files = new Set<string>();
  const prs: number[] = [];
  const others = [{ prNumber: task.prNumber, diff: task.diff }, ...(task.extraCodePrs ?? []).filter((item) => item.prNumber !== extra.prNumber)];
  for (const other of others) {
    const shared = diffFileList(other.diff).filter((path) => mine.has(path));
    if (shared.length === 0) continue;
    prs.push(other.prNumber);
    for (const path of shared) files.add(path);
  }
  return { files: [...files].sort(), prs };
}

/** This submission's source row for the slot, or null. */
async function slotSource(db: WorkPrDb, submission: Submission, task: TaskSnapshot): Promise<StoredSource | null> {
  const { sources } = await db.loadBenchmarkState([instanceId(task.repoFullName, task.taskId)]);
  return sources.find((source) => source.assignment_submission_id === submission.id && source.task_slot === task.slot) ?? null;
}

/** The two writes (see the top of the file). Never throws: a failure is `stopped`, with what was written before it. */
async function writeExtras(
  db: WorkPrDb, submission: Submission, task: TaskSnapshot, nextExtras: ExtraCodePr[], change: ExtraCodePrChange,
  source: StoredSource | null, now: string,
): Promise<ExtraPrDone & { stopped?: string }> {
  const done: ExtraPrDone = { benchmarkSourcesWritten: 0, snapshotWritten: false };
  let step = "save the benchmark flag";
  try {
    if (source) {
      const has = source.flags.includes(EXTRA_CODE_PRS_FLAG);
      const flags = nextExtras.length ? (has ? source.flags : [...source.flags, EXTRA_CODE_PRS_FLAG]) : source.flags.filter((flag) => flag !== EXTRA_CODE_PRS_FLAG);
      if (flags.length !== source.flags.length) {
        // validation_status is left out, so the stored row keeps its status (writeBenchmarkRows upserts one row).
        await db.writeBenchmark([], [{
          instance_id: source.instance_id, course_id: submission.course_id, user_id: submission.user_id,
          assignment_submission_id: submission.id, task_slot: task.slot, flags, updated_at: now,
        }]);
        done.benchmarkSourcesWritten = 1;
      }
    }
    step = "save the new snapshot";
    const nextTask: TaskSnapshot = { ...task, extraCodePrChange: change };
    if (nextExtras.length) nextTask.extraCodePrs = nextExtras;
    else delete nextTask.extraCodePrs;
    const snapshot: RecapturedSnapshot = {
      ...submission.snapshot,
      tasks: submission.snapshot.tasks.map((item) => (item.slot === task.slot ? nextTask : item)),
      recapturedAt: now,
    };
    if (!(await db.writeSnapshot(submission.id, snapshot, snapshotGuard(submission.snapshot as RecapturedSnapshot)))) return { ...done, stopped: GUARD_MESSAGE };
    done.snapshotWritten = true;
    return done;
  } catch (error) {
    return { ...done, stopped: `Could not ${step}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) };
  }
}

/**
 * Add (preview or apply) or remove an extra PR. `by` is the staff member's email. A stale page (the task's PR, the
 * snapshot's re-capture time or the task's extra PRs are not what the page saw) is refused before anything is read
 * from GitHub; the snapshot guard covers a change after this read. GitHub calls: an add reads the PR, its merge base,
 * its diff, its check runs and its commit status (5, the preview and the apply alike); a remove makes none.
 */
export async function runExtraPrChange(
  db: WorkPrDb, gh: GitHubReader, submission: Submission, request: ExtraPrRequest, options: { by: string; now?: string },
): Promise<ExtraPrResult> {
  const now = options.now ?? new Date().toISOString();
  const tasks = submission.snapshot.tasks ?? [];
  const task = tasks.find((item) => item.slot === request.slot);
  if (!task) return { ok: false, status: 404, error: `This submission has no Task ${request.slot}.` };
  if (submission.superseded_at !== null) return { ok: false, status: 409, error: WORK_PR_TEXT.readOnly };
  const applying = request.kind === "removeExtra" || request.apply;
  if ((applying || request.seen) && !seenMatches(task, submission, request.seen)) return { ok: false, status: 409, error: STALE_PAGE };
  const extras = task.extraCodePrs ?? [];

  if (request.kind === "removeExtra") {
    const n = typeof request.prNumber === "string" ? parsePrInput(request.prNumber)?.number : request.prNumber;
    const removed = typeof n === "number" ? extras.find((extra) => extra.prNumber === n) : undefined;
    if (!removed) return { ok: false, status: 409, error: notExtraMessage(typeof n === "number" ? n : Number.NaN) };
    const source = await slotSource(db, submission, task);
    const done = await writeExtras(db, submission, task, extras.filter((extra) => extra !== removed),
      { action: "removed", prNumber: removed.prNumber, by: options.by, at: now }, source, now);
    if (done.stopped) return { ok: false, status: 409, error: done.stopped };
    return { ok: true, status: 200, body: { apply: true, preview: null, done, message: WORK_PR_TEXT.extraRemoved(removed.prNumber) } };
  }

  const reason = request.reason.trim();
  if (!reason) return { ok: false, status: 400, error: NO_REASON };
  if (extras.length >= MAX_EXTRA_CODE_PRS) return { ok: false, status: 409, error: WORK_PR_TEXT.extraMax(MAX_EXTRA_CODE_PRS) };
  const parsed = parsePrInput(request.pr);
  if (parsed && (!parsed.repoFullName || same(parsed.repoFullName, task.repoFullName))) {
    if (parsed.number === task.prNumber) return { ok: false, status: 409, error: mainPrMessage(parsed.number) };
    if (task.taskFilePr?.number === parsed.number) return { ok: false, status: 409, error: taskFilePrMessage(parsed.number) };
    if (extras.some((extra) => extra.prNumber === parsed.number)) return { ok: false, status: 409, error: alreadyExtraMessage(parsed.number) };
  }
  const used = usedPrs(await db.loadCourseTaskRefs(submission.course_id, task.repoFullName), submission, task.slot);
  const checked = await checkChosenPr(gh, task, request.pr, used);
  if (!checked.ok) return checked;

  let captured: Awaited<ReturnType<typeof captureExtraCodePr>>;
  try {
    captured = await captureExtraCodePr(gh, task, checked.prNumber, checked.pull, { addedBy: options.by, addedAt: now, reason });
  } catch (error) {
    return { ok: false, status: 502, error: `PR #${checked.prNumber} could not be read: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400) };
  }
  if (!captured.ok) return { ok: false, status: 502, error: captured.error };
  const extra = captured.extra;

  const files = diffFileList(extra.diff);
  const split = splitPatch(extra.diff);
  const taskFiles = split.sourceFiles.filter(isTaskFolderPath).length;
  const sourceFiles = split.sourceFiles.length - taskFiles;
  const overlap = overlapWith(task, extra);
  const source = await slotSource(db, submission, task);
  const row = source?.validation_status ?? null;
  const preview: ExtraPrPreview = {
    slot: task.slot,
    prNumber: extra.prNumber,
    prUrl: extra.prUrl,
    title: extra.title,
    mergedAt: extra.mergedAt,
    files,
    testFiles: split.testFiles.length,
    sourceFiles,
    taskFiles,
    diffTruncated: extra.diffTruncated,
    summary: previewSummary(extra.prNumber, files.length, split.testFiles.length, sourceFiles, taskFiles),
    benchmark: { row, line: extraBenchmarkLine(row) },
    warnings: [...checked.warnings, ...(overlap.files.length ? [extraOverlapWarning(extra.prNumber, overlap.files, overlap.prs)] : [])],
  };
  if (!request.apply) return { ok: true, status: 200, body: { apply: false, preview } };
  const done = await writeExtras(db, submission, task, inMergeOrder([...extras, extra]),
    { action: "added", prNumber: extra.prNumber, by: options.by, at: now }, source, now);
  if (done.stopped) return { ok: false, status: 409, error: done.stopped };
  return { ok: true, status: 200, body: { apply: true, preview, done, message: WORK_PR_TEXT.extraAdded(extra.prNumber) } };
}
