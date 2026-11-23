// Staff choose the PR that holds a task's code (#431), on the server. Three parts:
//
// - listWorkPrCandidates: the student's other merged PRs in the task's repository, likely ones first (read-only).
// - checkChosenPr: the rules a chosen or typed PR must meet (same repository, merged, opened by the task's student,
//   not the task's own PR, not used by another task; a sibling task's task-file PR may be chosen, #435).
// - runWorkPrChange: the preview, the apply and the undo, one code path. The task is captured again as a paired task
//   (captureWorkPrTask) and goes through the staff re-capture's plan and apply (recapture.ts, with `changedSlots`):
//   the guarded write, benchmark rows before the snapshot, the snapshot last, the repo-copy job requeued when the
//   base commit changes, and the keep / replace / back-to-candidate rule. No grade row, grade status or grade job is
//   written; staff press Regrade.

import { instanceId, isTaskFolderPath } from "@/lib/cse115a/benchmark/buildInstance";
import {
  applyRecapture, diffFileList, planRecapture, type RecaptureDb, type RecaptureDone, type TaskPlan,
} from "@/lib/cse115a/benchmark/recapture";
import { splitPatch } from "@/lib/cse115a/diff";
import { duplicateTaskMessage } from "@/lib/cse115a/duplicateTask";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { namedInSpec } from "@/lib/cse115a/grader/llmGrader";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import {
  captureWorkPrTask, readPull, samePrTaskPathsOf, type Pull, type RecaptureResult, type TaskSnapshot, type WorkPrTarget,
} from "@/lib/cse115a/submissionSnapshot";
import {
  benchmarkOutcomeLine, likelyReasons, orderCandidates, parsePrInput, previewSummary, WORK_PR_TEXT,
  type WorkPrBefore, type WorkPrCandidate,
} from "@/lib/cse115a/workPr";

/** At most this many candidates are listed. */
export const MAX_CANDIDATES = 30;
/** At most this many pages of 100 closed PRs are read for the list. */
export const MAX_LIST_PAGES = 3;

/** One task of the course that holds a PR: from a current submission's snapshot or from a saved task row. */
export type CourseTaskRef = {
  source: "submission" | "task_row";
  submissionId: string | null;
  userId: string;
  assignmentNumber: number;
  slot: number;
  repoFullName: string;
  prNumber: number;
  taskFilePrNumber: number | null;
};

/** A PR another task uses, and where, as the page says it. */
export type UsedPr = { repoFullName: string; prNumber: number; where: string };

/** The database side: the re-capture's, plus the course's tasks for the "used by another task" rule. */
export type WorkPrDb = RecaptureDb & {
  /** Every current submission's tasks and every saved task row in the course for this repository (any student). */
  loadCourseTaskRefs(courseId: string, repoFullName: string): Promise<CourseTaskRef[]>;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The PRs other tasks use, with where. This submission's other tasks come from its snapshot; this task's own task
 * row (which still holds the PR the student submitted) and this submission's rows from `refs` are left out.
 *
 * #435: a PR that another task of the same student in the same sprint uses only as its task-file PR (its code is in
 * a different PR) is not listed: it may hold this task's code. A PR any task uses for its code is always listed, and
 * so is every PR of another student's task or of another sprint. A task row still holds the PR the student
 * submitted; when staff have since made that PR the task's task-file PR, this submission's snapshot says so.
 */
export function usedPrs(refs: CourseTaskRef[], submission: Submission, slot: number): UsedPr[] {
  const out: UsedPr[] = [];
  const add = (repoFullName: string, prNumber: number | null | undefined, where: string) => {
    if (typeof prNumber === "number") out.push({ repoFullName, prNumber, where });
  };
  const tasks = submission.snapshot.tasks ?? [];
  for (const task of tasks) {
    if (task.slot === slot) continue;
    const where = `Task ${task.slot} of this submission`;
    // Its task-file PR is not added: the same student's task in this sprint uses it only for the task file.
    add(task.repoFullName, task.prNumber, where);
  }
  for (const ref of refs) {
    if (ref.source === "submission" && ref.submissionId === submission.id) continue;
    const ownStudent = ref.userId === submission.user_id;
    const ownSprint = ownStudent && ref.assignmentNumber === submission.assignment_number;
    if (ref.source === "task_row" && ownSprint && ref.slot === slot) continue;
    const where = ownStudent
      ? ownSprint ? `this student's Task ${ref.slot} in this sprint` : `this student's Task ${ref.slot} in Sprint ${ref.assignmentNumber}`
      : `another student's Task ${ref.slot} in Sprint ${ref.assignmentNumber}`;
    if (!ownSprint) {
      add(ref.repoFullName, ref.prNumber, where);
      add(ref.repoFullName, ref.taskFilePrNumber, where);
      continue;
    }
    const now = ref.source === "task_row" ? tasks.find((task) => task.slot === ref.slot && same(task.repoFullName, ref.repoFullName)) : undefined;
    const nowTaskFileOnly = now !== undefined && now.taskFilePr?.number === ref.prNumber && now.prNumber !== ref.prNumber;
    // The row's own task-file PR (a pair the student made) holds only that task's task file, so it is not added.
    if (!nowTaskFileOnly) add(ref.repoFullName, ref.prNumber, where);
  }
  return out;
}

/**
 * Where another task uses this PR, or null. The comparison is the students' duplicate check (duplicateTaskMessage):
 * the same repository, ignoring case, and the same PR number.
 */
export function usedBy(used: UsedPr[], repoFullName: string, prNumber: number): string | null {
  const hit = used.find((row) => duplicateTaskMessage([{ repo_full_name: row.repoFullName, pr_number: row.prNumber, task_id: "" }], { repoFullName, prNumber, taskId: null }) !== null);
  return hit ? hit.where : null;
}

type ListedPull = { number: number; title: string; body: string | null; merged_at: string | null; head: { ref: string }; user: { login: string } | null };

/** The PRs a task's own choice already holds: its PR and its task-file PR. They are never candidates. */
function ownPrs(task: TaskSnapshot): Set<number> {
  return new Set([task.prNumber, ...(task.taskFilePr ? [task.taskFilePr.number] : [])]);
}

/**
 * The student's merged PRs in the task's repository, newest merged first, likely ones first, at most
 * MAX_CANDIDATES, without the task's own PRs. The student is the author saved in the snapshot (`pr.author`); when
 * it is unknown every merged PR is listed and `authorKnown` is false. GitHub calls: up to MAX_LIST_PAGES pages of
 * closed PRs (stopping at a short page), then one file list per candidate; `calls` counts them.
 */
export async function listWorkPrCandidates(gh: GitHubReader, task: TaskSnapshot, used: UsedPr[]): Promise<{ candidates: WorkPrCandidate[]; authorKnown: boolean; calls: number }> {
  const repo = `/repos/${task.repoFullName}`;
  const author = task.pr.author;
  const own = ownPrs(task);
  let calls = 0;
  const merged: ListedPull[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    calls++;
    const pulls = (await gh.json<ListedPull[]>(`${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`)) ?? [];
    for (const pull of pulls) {
      if (!pull.merged_at || own.has(pull.number)) continue;
      if (author && !same(pull.user?.login ?? "", author)) continue;
      merged.push(pull);
    }
    if (pulls.length < 100) break;
  }
  const newest = merged.sort((a, b) => Date.parse(b.merged_at!) - Date.parse(a.merged_at!) || b.number - a.number).slice(0, MAX_CANDIDATES);
  const spec = task.specMarkdown.toLowerCase();
  calls += newest.length;
  const candidates = await Promise.all(newest.map(async (pull): Promise<WorkPrCandidate> => {
    const files = ((await gh.json<Array<{ filename: string }>>(`${repo}/pulls/${pull.number}/files?per_page=100`)) ?? []).map((file) => file.filename);
    const reasons = likelyReasons({ title: pull.title, branch: pull.head.ref, body: pull.body }, files, task.taskId, (path) => namedInSpec(spec, path));
    return {
      number: pull.number, title: pull.title, branch: pull.head.ref, mergedAt: pull.merged_at!,
      filesChanged: files.length, filesCapped: files.length >= 100,
      likely: reasons.length > 0, reasons, usedBy: usedBy(used, task.repoFullName, pull.number),
    };
  }));
  return { candidates: orderCandidates(candidates), authorKnown: Boolean(author), calls };
}

export type Refusal = { ok: false; status: number; error: string };
type Checked = { ok: true; pull: Pull; prNumber: number; prUrl: string; warnings: string[] };

export const NOT_A_PR = "Type a PR number, like 12, or the PR's GitHub link.";

/**
 * The rules a chosen or typed PR must meet, in order: a PR number or link; the task's repository; not this task's
 * PR or task-file PR; not used by another task; it exists and is merged; the task's student opened it. When the
 * author is not saved, the last rule can't be checked and the answer carries a warning instead. Reads one PR.
 */
export async function checkChosenPr(gh: GitHubReader, task: TaskSnapshot, input: unknown, used: UsedPr[]): Promise<Checked | Refusal> {
  const parsed = parsePrInput(input);
  if (!parsed) return { ok: false, status: 400, error: NOT_A_PR };
  const n = parsed.number;
  if (parsed.repoFullName && !same(parsed.repoFullName, task.repoFullName)) {
    return { ok: false, status: 409, error: `That PR is in another repository, ${parsed.repoFullName}. This task's repository is ${task.repoFullName}.` };
  }
  if (n === task.prNumber) return { ok: false, status: 409, error: `PR #${n} is the PR this task already uses.` };
  if (task.taskFilePr && n === task.taskFilePr.number) {
    return {
      ok: false, status: 409,
      error: task.workPrChoice && task.workPrChoice.before.prNumber === n
        ? `PR #${n} is the PR the student submitted, which holds the task file. To take the code from it again, press Undo.`
        : `PR #${n} holds this task's task file.`,
    };
  }
  const where = usedBy(used, task.repoFullName, n);
  if (where) return { ok: false, status: 409, error: `PR #${n} is already used by ${where}.` };
  let pull: Pull | null;
  try {
    pull = await readPull(gh, task.repoFullName, n);
  } catch (error) {
    return { ok: false, status: 502, error: `PR #${n} could not be read: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400) };
  }
  if (!pull) return { ok: false, status: 404, error: `PR #${n} was not found in ${task.repoFullName}.` };
  if (!pull.merged_at || !pull.merge_commit_sha) return { ok: false, status: 409, error: `PR #${n} is not merged. Only a merged PR can hold the task's code.` };
  const author = task.pr.author;
  const opener = pull.user?.login ?? null;
  const warnings: string[] = [];
  if (author) {
    if (!opener || !same(opener, author)) return { ok: false, status: 409, error: `PR #${n} was opened by ${opener ?? "an unknown account"}, not by the task's student (${author}).` };
  } else {
    warnings.push(`The task's PR author is not saved, so it can't be checked that the student opened PR #${n}.`);
  }
  return { ok: true, pull, prNumber: n, prUrl: `https://github.com/${task.repoFullName}/pull/${n}`, warnings };
}

/** What the task pointed at before the first staff choice, from the saved task. The diff text is not kept. */
export function beforeOf(task: TaskSnapshot): WorkPrBefore {
  return {
    prNumber: task.prNumber,
    prUrl: task.prUrl,
    taskFilePr: task.taskFilePr ?? null,
    prTaskFiles: Array.isArray(task.prTaskFiles) ? task.prTaskFiles : null,
    mergeCommitSha: task.pr.mergeCommitSha,
    baseCommit: task.baseCommit,
    baseCommitSource: task.baseCommitSource,
    headCommit: task.headCommit ?? null,
    diffEnd: task.diffEnd ?? null,
    files: diffFileList(task.diff),
    diffBytes: task.diffBytes,
    diffTruncated: task.diffTruncated,
  };
}

export const STALE_PAGE = "This page is out of date: the task changed since you opened it. Reload the page and try again.";
export const NOTHING_TO_UNDO = "Staff have not chosen a PR for this task, so there is nothing to undo.";
export const NO_REASON = "Give a reason. It is saved with the change.";

/**
 * The refusal when undoing this task's choice would put its code back to a PR another task of this submission now
 * takes its code from (#435).
 */
export function undoBlockedMessage(prNumber: number, holderSlot: number, slot: number, holderChosenByStaff: boolean): string {
  return holderChosenByStaff
    ? `PR #${prNumber} now holds the code of Task ${holderSlot}, which staff chose. Undo Task ${holderSlot}'s choice first, then undo this one.`
    : `PR #${prNumber} now holds the code of Task ${holderSlot}, so Task ${slot} can't take its code from it again.`;
}

/** What the page saw when it was loaded: the task's PR and the snapshot's last re-capture time. */
export type SeenState = { prNumber: number; recapturedAt: string | null };

export type WorkPrRequest =
  | { kind: "choose"; slot: number; pr: unknown; reason: string; apply: boolean; seen: SeenState | null }
  | { kind: "undo"; slot: number; seen: SeenState | null };

/** The preview's answer: the chosen PR's own files and what happens to the benchmark row. */
export type WorkPrPreview = {
  slot: number;
  prNumber: number;
  prUrl: string;
  title: string;
  files: string[];
  testFiles: number;
  /** Source files, without task files (docs/tasks/...), which are counted in `taskFiles` (#435). */
  sourceFiles: number;
  taskFiles: number;
  diffTruncated: boolean;
  summary: string;
  benchmark: { action: TaskPlan["action"]; row: TaskPlan["row"]; line: string; baseChanged: boolean };
  warnings: string[];
};

export type WorkPrResult =
  | Refusal
  | { ok: true; status: 200; body: { apply: false; preview: WorkPrPreview } }
  | { ok: true; status: 200; body: { apply: true; preview: WorkPrPreview; done: RecaptureDone; message: string } };

function seenMatches(task: TaskSnapshot, submission: Submission, seen: SeenState | null): boolean {
  if (!seen) return false;
  const recapturedAt = (submission.snapshot as { recapturedAt?: string }).recapturedAt ?? null;
  return seen.prNumber === task.prNumber && (seen.recapturedAt ?? null) === recapturedAt;
}

/**
 * The preview, the apply and the undo, one code path: capture the task from the target PR, plan it with the
 * re-capture's plan (only this slot), and with `apply` (always for an undo) execute the re-capture's writes.
 * `by` is the staff member's email. A stale page (the task's PR or the snapshot's re-capture time is not what the
 * page saw) is refused before anything is read from GitHub; the apply's guard covers a change after this read.
 */
export async function runWorkPrChange(
  db: WorkPrDb, gh: GitHubReader, submission: Submission, request: WorkPrRequest,
  options: { by: string; repoCopies: boolean; now?: string },
): Promise<WorkPrResult> {
  const now = options.now ?? new Date().toISOString();
  const tasks = submission.snapshot.tasks ?? [];
  const task = tasks.find((item) => item.slot === request.slot);
  if (!task) return { ok: false, status: 404, error: `This submission has no Task ${request.slot}.` };
  if (submission.superseded_at !== null) return { ok: false, status: 409, error: WORK_PR_TEXT.readOnly };
  const applying = request.kind === "undo" || request.apply;
  if ((applying || request.seen) && !seenMatches(task, submission, request.seen)) return { ok: false, status: 409, error: STALE_PAGE };

  let target: WorkPrTarget;
  let pull: Pull;
  let warnings: string[] = [];
  let next: (captured: TaskSnapshot) => TaskSnapshot;
  if (request.kind === "choose") {
    const reason = request.reason.trim();
    if (!reason) return { ok: false, status: 400, error: NO_REASON };
    const used = usedPrs(await db.loadCourseTaskRefs(submission.course_id, task.repoFullName), submission, task.slot);
    const checked = await checkChosenPr(gh, task, request.pr, used);
    if (!checked.ok) return checked;
    pull = checked.pull;
    warnings = checked.warnings;
    // The PR the student submitted becomes the task-file PR; a task the student already paired keeps its own.
    target = {
      prNumber: checked.prNumber,
      prUrl: checked.prUrl,
      taskFilePr: task.taskFilePr ?? { url: task.prUrl, number: task.prNumber, mergeSha: task.pr.mergeCommitSha },
      prTaskFiles: [],
    };
    next = (captured) => {
      const out: TaskSnapshot = {
        ...captured,
        workPrChoice: {
          prNumber: checked.prNumber, prUrl: checked.prUrl, chosenBy: options.by, chosenAt: now, reason,
          replacedPrNumber: task.prNumber, before: task.workPrChoice?.before ?? beforeOf(task),
        },
      };
      delete out.workPrUndone;
      return out;
    };
  } else {
    const choice = task.workPrChoice;
    if (!choice) return { ok: false, status: 409, error: NOTHING_TO_UNDO };
    const before = choice.before;
    // #435: the PR this undo goes back to may since have been chosen as another task's code PR. Undoing would give
    // two tasks the same code PR, so that task's choice is undone first.
    const holder = tasks.find((other) => other.slot !== task.slot && same(other.repoFullName, task.repoFullName) && other.prNumber === before.prNumber);
    if (holder) return { ok: false, status: 409, error: undoBlockedMessage(before.prNumber, holder.slot, task.slot, Boolean(holder.workPrChoice)) };
    let read: Pull | null;
    try {
      read = await readPull(gh, task.repoFullName, before.prNumber);
    } catch (error) {
      return { ok: false, status: 502, error: `PR #${before.prNumber} could not be read: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400) };
    }
    if (!read?.merged_at || read.merge_commit_sha !== before.mergeCommitSha) {
      return { ok: false, status: 409, error: `PR #${before.prNumber} no longer has the merge commit saved before, so it can't be put back automatically.` };
    }
    pull = read;
    target = { prNumber: before.prNumber, prUrl: before.prUrl, taskFilePr: before.taskFilePr ?? undefined, prTaskFiles: before.prTaskFiles };
    next = (captured) => {
      const out: TaskSnapshot = {
        ...captured,
        workPrUndone: { undoneBy: options.by, undoneAt: now, prNumber: task.prNumber, backToPrNumber: before.prNumber },
      };
      delete out.workPrChoice;
      return out;
    };
  }

  const samePr = target.taskFilePr ? [] : samePrTaskPathsOf(tasks, { slot: task.slot, prUrl: target.prUrl });
  let captured: RecaptureResult;
  try {
    captured = await captureWorkPrTask(gh, task, target, pull, samePr);
  } catch (error) {
    return { ok: false, status: 502, error: `PR #${target.prNumber} could not be read: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400) };
  }
  if (!captured.ok) return { ok: false, status: 502, error: captured.error };
  const changed = next(captured.task);

  const { sources, storedTasks } = await db.loadBenchmarkState([...new Set(tasks.map((item) => instanceId(item.repoFullName, item.taskId)))]);
  const repoMetrics = new Map<string, unknown>([[changed.analysisResultId, await db.loadRepoMetrics(changed.analysisResultId)]]);
  const studentEmail = await db.loadStudentEmail(submission.course_id, submission.user_id);
  const { plan, writes } = planRecapture({
    submission, recaptured: new Map([[task.slot, { ok: true, task: changed }]]), sources, storedTasks, repoMetrics, studentEmail, now,
    changedSlots: new Set([task.slot]),
  });
  const planned = plan.tasks.find((item) => item.task.slot === task.slot)!;
  const split = splitPatch(changed.diff);
  const files = diffFileList(changed.diff);
  const taskFiles = split.sourceFiles.filter(isTaskFolderPath).length;
  const sourceFiles = split.sourceFiles.length - taskFiles;
  const action = planned.action as "replace" | "keep" | "back_to_candidate";
  const preview: WorkPrPreview = {
    slot: task.slot,
    prNumber: target.prNumber,
    prUrl: target.prUrl,
    title: changed.pr.title,
    files,
    testFiles: split.testFiles.length,
    sourceFiles,
    taskFiles,
    diffTruncated: changed.diffTruncated,
    summary: previewSummary(target.prNumber, files.length, split.testFiles.length, sourceFiles, taskFiles),
    benchmark: { action: planned.action, row: planned.row, line: benchmarkOutcomeLine(target.prNumber, action, planned.row), baseChanged: planned.baseChanged },
    warnings,
  };
  if (!applying) return { ok: true, status: 200, body: { apply: false, preview } };
  const done = await applyRecapture(db, submission, writes, { repoCopies: options.repoCopies, now });
  if (done.stopped) return { ok: false, status: 409, error: done.stopped };
  return {
    ok: true, status: 200,
    body: { apply: true, preview, done, message: request.kind === "undo" ? WORK_PR_TEXT.undone(target.prNumber) : WORK_PR_TEXT.saved },
  };
}
