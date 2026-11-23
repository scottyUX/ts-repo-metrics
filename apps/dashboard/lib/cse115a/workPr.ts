// Staff choose the PR that holds a task's code (#431). Some submitted tasks point at a PR that only adds or moves
// the task file, while the student's code was merged in an earlier PR. A grader picks that PR on the staff review
// page; the task then becomes a paired task made by staff: the PR the student pasted is recorded as the task-file
// PR (TaskFilePr, #403), and the chosen PR is the work PR (its diff, PR details, comments and checks). The spec, task
// path and validation saved at Submit stay. Client-safe: no server imports. The server side is
// benchmark/workPrChoice.ts and the route app/api/cse115a/instructor/submissions/[id]/work-pr.

import type { TaskFilePr } from "@/lib/cse115a/taskFilePr";

/** What the task pointed at before staff first chose a PR, so it can be put back by capturing that PR again. */
export type WorkPrBefore = {
  prNumber: number;
  prUrl: string;
  /** The student's own task-file PR when the task was already a paired task (#403), otherwise null. */
  taskFilePr: TaskFilePr | null;
  /** `prTaskFiles` as saved: the task files the submitted PR adds. The chosen PR's task is saved with none. */
  prTaskFiles: string[] | null;
  mergeCommitSha: string;
  baseCommit: string;
  baseCommitSource: string;
  headCommit: string | null;
  diffEnd: "head" | "merge_commit" | null;
  /** The old diff's file list (its `diff --git` paths, sorted); the diff text itself is not kept. */
  files: string[];
  diffBytes: number;
  diffTruncated: boolean;
};

/** Staff chose the PR that holds this task's code. Saved on the task snapshot. */
export type WorkPrChoice = {
  prNumber: number;
  prUrl: string;
  /** The staff member's email. */
  chosenBy: string;
  chosenAt: string;
  reason: string;
  /** The PR the code came from just before this choice: the submitted one, or an earlier staff choice. */
  replacedPrNumber: number;
  before: WorkPrBefore;
};

/** One line of history after an undo: who undid which choice, and when. */
export type WorkPrUndone = { undoneBy: string; undoneAt: string; prNumber: number; backToPrNumber: number };

/** #437: the last add or remove of an extra PR for a task's code. */
export type ExtraCodePrChange = { action: "added" | "removed"; prNumber: number; by: string; at: string };

/** #437: the PR whose commits the stored repo copy holds, when a staff change kept its base commit (a fix to #431). */
export type RepoCopyFrom = { prNumber: number; mergeCommitSha: string };

/** An extra PR as the pages read it (the snapshot's ExtraCodePr without its diff). */
type ExtraRef = { prNumber: number; title?: string; mergedAt?: string; addedBy?: string; addedAt?: string; reason?: string };

/** The minimum of a task snapshot this file reads. */
type ChoiceTask = {
  prNumber: number; workPrChoice?: WorkPrChoice | null; workPrUndone?: WorkPrUndone | null; taskFilePr?: TaskFilePr | null;
  extraCodePrs?: ExtraRef[] | null; extraCodePrChange?: ExtraCodePrChange | null;
};

/** The flag on a benchmark row whose task's code PR was chosen by staff. */
export const WORK_PR_FLAG = "work_pr_chosen_by_staff";

/** #437: the flag on a benchmark row whose task has extra PRs for its code. The row is still built from the main PR. */
export const EXTRA_CODE_PRS_FLAG = "extra_code_prs";

/** The latest change to where the task's code comes from: a staff choice or an undo, or null for neither. */
export function lastCodeChange(task: ChoiceTask): { at: string; fromPr: number; toPr: number; undo: boolean } | null {
  if (task.workPrChoice) return { at: task.workPrChoice.chosenAt, fromPr: task.workPrChoice.replacedPrNumber, toPr: task.prNumber, undo: false };
  if (task.workPrUndone) return { at: task.workPrUndone.undoneAt, fromPr: task.workPrUndone.prNumber, toPr: task.workPrUndone.backToPrNumber, undo: true };
  return null;
}

/**
 * The line above the rubric when the AI grade is older than the last change to the task's code, or null. Worked
 * out from what is saved: the grade's `graded_at` against the time of the choice or undo (#431), or of the last add
 * or remove of an extra PR (#437). When both are newer than the grade, the later one is named.
 */
export function staleAiGradeLine(task: ChoiceTask, gradedAt: string | null | undefined): string | null {
  if (!gradedAt) return null;
  const graded = Date.parse(gradedAt);
  if (!Number.isFinite(graded)) return null;
  const newer = (at: string | undefined) => {
    const time = at ? Date.parse(at) : NaN;
    return Number.isFinite(time) && graded < time ? time : null;
  };
  const change = lastCodeChange(task);
  const choiceAt = change ? newer(change.at) : null;
  const extra = task.extraCodePrChange ?? null;
  const extraAt = extra ? newer(extra.at) : null;
  if (extra && extraAt !== null && (choiceAt === null || extraAt >= choiceAt)) {
    return `This AI grade was made before PR #${extra.prNumber} was ${extra.action === "added" ? "added to" : "removed from"} this task's code. Press Regrade.`;
  }
  if (!change || choiceAt === null) return null;
  return `This AI grade was made on PR #${change.fromPr}, before the code was switched ${change.undo ? "back " : ""}to PR #${change.toPr}. Press Regrade.`;
}

/** A date as the page shows it, e.g. "Nov 22, 2026" (UTC, so a test and every viewer read the same day). */
export function choiceDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : iso;
}

/** The review page's line for a task whose code PR staff chose; it replaces the paired-task line. */
export function workPrChoiceLine(task: ChoiceTask & { workPrChoice: WorkPrChoice }): string {
  const choice = task.workPrChoice;
  const submitted = choice.before.prNumber;
  const when = choiceDate(choice.chosenAt);
  if (choice.before.taskFilePr) {
    return `Code from PR #${task.prNumber}, chosen by staff on ${when}. The student submitted PR #${submitted} for the code and PR #${choice.before.taskFilePr.number} for the task file.`;
  }
  return `Code from PR #${task.prNumber}, chosen by staff on ${when}. The student submitted PR #${submitted}, which holds the task file.`;
}

/** The task header's line for a staff-made pair; it takes the place of the paired-task line (taskFilePrReviewLine). */
export function workPrHeaderLine(task: ChoiceTask & { workPrChoice: WorkPrChoice }): string {
  const taskFile = task.taskFilePr?.number ?? task.workPrChoice.before.prNumber;
  return `Paired by staff: the code is from PR #${task.prNumber}, which staff chose, and the task file is from PR #${taskFile}, which the student submitted.`;
}

export function workPrReasonLine(choice: WorkPrChoice): string {
  return `Reason, from ${choice.chosenBy}: ${choice.reason}`;
}

export function workPrUndoneLine(undone: WorkPrUndone): string {
  return `Staff chose PR #${undone.prNumber} for the code; ${undone.undoneBy} undid it on ${choiceDate(undone.undoneAt)}.`;
}

/** "Get the code" for a staff-chosen task: which PR the commands check out. */
export function getTheCodeChoiceNote(task: ChoiceTask & { workPrChoice: WorkPrChoice }): string {
  const taskFile = task.taskFilePr?.number ?? task.workPrChoice.before.prNumber;
  return `These commands check out the merge commit of PR #${task.prNumber}, which staff chose as the PR that holds this task's code. The task file is in PR #${taskFile}.`;
}

/** The grader's note for a staff-chosen task (added to its input like the other per-task notes, so GRADER_PROMPT_VERSION is unchanged). */
export function workPrGraderNote(workPrNumber: number, taskFilePrNumber: number): string {
  return `The code and tests below are from PR #${workPrNumber}, which course staff chose as the PR that holds this task's work. The task file was submitted in a separate PR, #${taskFilePrNumber}, so it is not in this diff. Judge the code and tests in PR #${workPrNumber} against that task file.`;
}

/** The Process rationale for a staff-chosen task: the paired rule (not "task file first"), flagged for review. */
export function workPrProcessRationale(workPrNumber: number, taskFilePrNumber: number | null): string {
  const taskFile = taskFilePrNumber === null ? "a separate PR" : `a separate PR, #${taskFilePrNumber}`;
  return `The code is in PR #${workPrNumber}, which course staff chose, and the task file is in ${taskFile}. Whether the task file came before the code can't be read from one PR, so a person checks Process.`;
}

/** "PR #5", "PR #5 and PR #6", "PR #5, PR #6 and PR #8". */
export function prList(numbers: number[]): string {
  const items = numbers.map((n) => `PR #${n}`);
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * #437: the grader's note for a task with extra PRs (a per-task note, so GRADER_PROMPT_VERSION is unchanged). The
 * diffs it is given are the main PR's, then each extra PR's in merge order.
 */
export function extraCodePrsGraderNote(mainPrNumber: number, extraPrNumbers: number[]): string {
  const extras = extraPrNumbers.map((n) => `#${n}`);
  const named = extras.length === 1 ? `PR ${extras[0]}` : `PRs ${extras.slice(0, -1).join(", ")} and ${extras[extras.length - 1]}`;
  return `This task's code is in PR #${mainPrNumber} plus ${named}, as course staff recorded. The test and source diffs below are PR #${mainPrNumber}'s followed by ${extras.length === 1 ? "that PR's" : "those PRs'"}, in the order they were merged, so a file changed in more than one of these PRs appears once for each. Judge the task on all of them together.`;
}

/** #437: the grader's note for an extra PR whose diff was cut off. */
export function extraCodePrTruncatedNote(prNumber: number): string {
  return `The diff of PR #${prNumber} was over 1 MB and was cut off.`;
}

/** #437: an extra PR in the list under the main PR. */
export function extraCodePrLine(extra: Required<Pick<ExtraRef, "prNumber" | "title" | "mergedAt" | "addedBy" | "addedAt">>): string {
  return `PR #${extra.prNumber} ${extra.title} · merged ${choiceDate(extra.mergedAt)} · added by ${extra.addedBy} on ${choiceDate(extra.addedAt)}`;
}

export function extraCodePrReasonLine(reason: string): string {
  return `Reason: ${reason}`;
}

/** #437: "Get the code" for a task with extra PRs: the commands and the stored copy are the main PR only. */
export function getTheCodeExtrasNote(mainPrNumber: number, extraPrNumbers: number[]): string {
  return `The stored copy and these commands hold PR #${mainPrNumber} only. This task's code is also in ${prList(extraPrNumbers)}, which they do not include.`;
}

/** #437 (a fix to #431): the stored copy was made for an earlier PR at the same base commit, so it was not made again. */
export function repoCopyFromNote(copyPrNumber: number, prNumber: number): string {
  return `This stored copy was made for PR #${copyPrNumber}, before staff chose PR #${prNumber} for this task's code. Both start at the same commit, so the copy was not made again: its refs/hecate/merge is PR #${copyPrNumber}'s merge commit. For PR #${prNumber}, use From GitHub above.`;
}

/** #437: a staff change of the main PR is refused while the task has extra PRs. */
export function extrasFirstMessage(extraPrNumbers: number[]): string {
  return `This task has extra PRs for its code (${prList(extraPrNumbers)}). Remove them first, then change or undo the main PR.`;
}

/** #437: what the preview of an extra PR says will happen to the task's benchmark row. */
export function extraBenchmarkLine(row: "candidate" | "validated" | "rejected" | null): string {
  return row === null
    ? `This task has no benchmark row yet. When it gets one, it is built from the main PR only and carries the flag ${EXTRA_CODE_PRS_FLAG}.`
    : `Its benchmark row stays ${row}, built from the main PR only (its patches don't change); it carries the flag ${EXTRA_CODE_PRS_FLAG}.`;
}

/** #437: a file the extra PR changes that the main PR or an earlier extra PR also changes. */
export function extraOverlapWarning(prNumber: number, files: string[], otherPrs: number[]): string {
  const shown = files.slice(0, 3).join(", ") + (files.length > 3 ? ` and ${files.length - 3} more` : "");
  return `PR #${prNumber} also changes ${shown}, which ${prList(otherPrs)} ${otherPrs.length === 1 ? "changes" : "change"} too. The AI sees each PR's change to ${files.length === 1 ? "that file" : "those files"} in turn, in merge order.`;
}

/** Page texts, word for word. */
export const WORK_PR_TEXT = {
  open: "Use a different PR for the code",
  heading: "Choose the PR that holds this task's code",
  intro: "The task file, its spec and the checks saved at Submit stay. Only where the code comes from changes. Nothing is regraded until you press Regrade.",
  listLabel: "The student's other merged PRs in this repository, likely ones first:",
  unknownAuthor: "The task's PR author is not saved, so every merged PR in the repository is listed.",
  noCandidates: "No other merged PRs by this student were found.",
  loading: "Loading the student's merged PRs…",
  typedLabel: "Or type a PR number",
  reasonLabel: "Reason (required, kept with the record)",
  preview: "Preview",
  use: "Use this PR",
  confirmUse: (pr: number) => `Yes, take the code from PR #${pr}`,
  cancel: "Cancel",
  close: "Close",
  saved: "Saved. Press Regrade to grade this task on the new code.",
  undo: "Undo",
  confirmUndo: (pr: number) => `Yes, put the code back to PR #${pr}`,
  undone: (pr: number) => `Undone. The code is from PR #${pr} again. Press Regrade to grade this task on it.`,
  previewFirst: "Preview this PR first.",
  truncated: "The diff was over 1 MB and was cut off.",
  likely: "Likely",
  usedBy: (where: string) => `Used by ${where}`,
  readOnly: "This attempt was unlocked and is read-only.",
  // #437: extra PRs for the task's code.
  extraOpen: "Add another PR for the code",
  extraHeading: "Add another PR that holds part of this task's code",
  extraIntro: "The task keeps its main PR. The AI reads the main PR's diff and then each extra PR's, in merge order. The benchmark row, the stored copy and \"Get the code\" stay the main PR's. Nothing is regraded until you press Regrade.",
  extraListHeading: "Extra PRs for this task's code",
  extraAdd: "Add this PR",
  confirmExtra: (pr: number) => `Yes, add PR #${pr} to this task's code`,
  extraAdded: (pr: number) => `Added PR #${pr}. Press Regrade to grade this task on all of its PRs.`,
  extraRemove: "Remove",
  confirmRemove: (pr: number) => `Yes, remove PR #${pr}`,
  extraRemoved: (pr: number) => `Removed PR #${pr}. Press Regrade to grade this task without it.`,
  attached: "Already added to this task",
  extraMax: (max: number) => `This task already has ${max} extra PRs, the most it can have.`,
  extraDiffHeading: (pr: number, title: string) => `PR #${pr}: ${title} (extra PR for this task's code)`,
  mainDiffHeading: (pr: number, title: string) => `PR #${pr}: ${title} (main PR)`,
  extraChecksHeading: (pr: number) => `CI on PR #${pr}'s merge commit`,
} as const;

/**
 * "PR #8 changes 5 files: 2 test files and 3 source files." Task files (docs/tasks/...) are counted on their own,
 * "..., 1 source file and 1 task file.", and only when there are any (#435: a chosen PR can hold another task's
 * task file, which is not this task's code).
 */
export function previewSummary(prNumber: number, files: number, testFiles: number, sourceFiles: number, taskFiles = 0): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = taskFiles > 0
    ? `${plural(testFiles, "test file")}, ${plural(sourceFiles, "source file")} and ${plural(taskFiles, "task file")}`
    : `${plural(testFiles, "test file")} and ${plural(sourceFiles, "source file")}`;
  return `PR #${prNumber} changes ${plural(files, "file")}: ${parts}.`;
}

export type BenchmarkOutcome = "replace" | "keep" | "back_to_candidate";

/** What the preview says will happen to the task's benchmark row. */
export function benchmarkOutcomeLine(prNumber: number, action: BenchmarkOutcome, row: "candidate" | "validated" | "rejected" | null): string {
  if (action === "keep") return `Its benchmark row is ${row ?? "validated"}, and PR #${prNumber} gives the same patches, so the row is kept as it is.`;
  if (action === "back_to_candidate") return `Its benchmark row is ${row ?? "validated"}; it will be rebuilt from PR #${prNumber} and go back to candidate.`;
  return row === null
    ? `A benchmark row will be made from PR #${prNumber}, as a candidate.`
    : `Its benchmark row will be rebuilt from PR #${prNumber} and stay a candidate.`;
}

/** One candidate PR in the chooser's list. */
export type WorkPrCandidate = {
  number: number;
  title: string;
  branch: string;
  mergedAt: string;
  /** The files the PR changes, as GitHub lists them (at most 100 are read). */
  filesChanged: number;
  filesCapped: boolean;
  likely: boolean;
  reasons: string[];
  /** Set when another task already uses this PR: where. Such a PR can't be chosen. */
  usedBy: string | null;
  /** #437: already one of this task's extra PRs. Listed, but it can't be added again. */
  attached?: boolean;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `text` names the task ID as a whole word, ignoring case. */
export function namesTaskId(text: string | null | undefined, taskId: string): boolean {
  if (!text || !taskId) return false;
  return new RegExp(`(^|[^a-z0-9])${escape(taskId.toLowerCase())}([^a-z0-9]|$)`).test(text.toLowerCase());
}

/**
 * Why a PR is a likely holder of the task's code: its title, branch or description names the task ID, or it
 * changes a file the task file names (`namedInSpec`, the grader's own rule). Empty when it is not likely.
 */
export function likelyReasons(
  pull: { title: string; branch: string; body: string | null },
  files: string[], taskId: string, namedInSpec: (path: string) => boolean,
): string[] {
  const reasons: string[] = [];
  if (namesTaskId(pull.title, taskId)) reasons.push(`The title names ${taskId}.`);
  if (namesTaskId(pull.branch.replace(/[/_]/g, "-"), taskId)) reasons.push(`The branch names ${taskId}.`);
  if (namesTaskId(pull.body, taskId)) reasons.push(`The description names ${taskId}.`);
  const named = files.filter((path) => !/^docs\/tasks\//.test(path) && namedInSpec(path));
  if (named.length) {
    const shown = named.slice(0, 3).join(", ");
    reasons.push(`It changes ${shown}${named.length > 3 ? ` and ${named.length - 3} more` : ""}, which the task file names.`);
  }
  return reasons;
}

/** Likely first, then newest merged first. Pure. */
export function orderCandidates(candidates: WorkPrCandidate[]): WorkPrCandidate[] {
  return [...candidates].sort((a, b) => Number(b.likely) - Number(a.likely) || Date.parse(b.mergedAt) - Date.parse(a.mergedAt) || b.number - a.number);
}

/**
 * A PR as staff type it: a number, "#12", or a GitHub PR URL. Returns the number and, for a URL, its repository;
 * null when it is none of these.
 */
export function parsePrInput(input: unknown): { number: number; repoFullName: string | null } | null {
  if (typeof input === "number") return Number.isInteger(input) && input > 0 ? { number: input, repoFullName: null } : null;
  if (typeof input !== "string") return null;
  const text = input.trim();
  const plain = /^#?(\d{1,9})$/.exec(text);
  if (plain) return Number(plain[1]) > 0 ? { number: Number(plain[1]), repoFullName: null } : null;
  const url = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/i.exec(text);
  if (url) return { number: Number(url[3]), repoFullName: `${url[1]}/${url[2]}` };
  return null;
}
