// A merged PR that adds no task file can be paired with a second merged PR that adds only the task file. A backup
// for PRs already merged: a merged PR can't be changed. The task file comes from the second PR (the "task-file PR");
// the code, tests, diff, analysis and checks come from the first (the "work PR"). Client-safe: no server imports.

/** The task-file PR of a paired task, saved in facts_json and carried into the snapshot. */
export type TaskFilePr = { url: string; number: number; mergeSha: string };

/** The saved task-file PR, or null for a normal task or a malformed value. */
export function savedTaskFilePr(facts: { taskFilePr?: unknown } | null | undefined): TaskFilePr | null {
  const value = facts?.taskFilePr as Partial<TaskFilePr> | null | undefined;
  if (!value || typeof value !== "object") return null;
  if (typeof value.url !== "string" || typeof value.number !== "number" || typeof value.mergeSha !== "string") return null;
  return { url: value.url, number: value.number, mergeSha: value.mergeSha };
}

export const NEED_TASK_FILE_PR_CODE = "need_task_file_pr";

/** Why a merged work PR needs a task-file PR. `changedNote` is the "It changes X but does not add it…" sentence. */
export function needTaskFilePrMessage(sprint: number, changedNote: string | null = null): string {
  const message = `This merged PR does not add a task file in docs/tasks/sprint-${sprint}/. A merged PR can't be changed, so open a new PR that adds only your task file, merge it, and paste its link below. If you don't see a second box, refresh the page.`;
  return changedNote ? `${changedNote} ${message}` : message;
}

export const PAIR_NOT_AUTHOR = "A PR without a task file can be paired with a task-file PR only by the student who opened it.";

export const TASK_FILE_PR_BOX = {
  heading: "This merged PR has no task file",
  text: (sprint: number) => `A merged PR can't be changed. Open a new PR that adds only your task file (docs/tasks/sprint-${sprint}/<task ID>.md), merge it, and paste its link here. Your task is graded on the code in the PR above.`,
  label: "Task-file PR URL",
  button: "Add both PRs",
} as const;

/** The task card's second line for a paired task; the first is the two links. */
export const TASK_FILE_PR_CARD_NOTE = "The task file was added in a separate PR, after the work was merged.";

/** The task card's link line, as text. The card links each PR number. */
export function taskFilePrCardLine(taskFilePrNumber: number, workPrNumber: number): string {
  return `Task file from PR #${taskFilePrNumber} · work from PR #${workPrNumber}`;
}

/** The staff review page's line for a paired task. */
export function taskFilePrReviewLine(taskFilePrNumber: number, workPrNumber: number): string {
  return `Task file from a separate PR, #${taskFilePrNumber}. The work is in PR #${workPrNumber}, which has no task file, so the task file was written or added after the work.`;
}

/**
 * What Re-check sends for a saved task: the saved PR, and either the saved task-file PR (so a pair is re-imported
 * together) or the saved task file (so a PR with two task files stays on this slot's file).
 */
export function recheckRequest(saved: { pr_url: string; task_path: string; facts_json?: { taskFilePr?: unknown } | null }): {
  prUrl: string; taskPath?: string; taskFilePrUrl?: string;
} {
  const pair = savedTaskFilePr(saved.facts_json);
  return pair ? { prUrl: saved.pr_url, taskFilePrUrl: pair.url } : { prUrl: saved.pr_url, taskPath: saved.task_path };
}
