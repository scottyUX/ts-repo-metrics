// A merged PR that adds no task file, or whose task file has format problems, can be paired with a second merged PR
// that adds or corrects only the task file. A backup for PRs already merged: a merged PR can't be changed. The task
// file comes from the second PR (the "task-file PR"); the code, tests, diff, analysis and checks come from the first
// (the "work PR"). Client-safe: no server imports.

/**
 * The task-file PR of a paired task, saved in facts_json and carried into the snapshot. `fixesTaskPath` is set when
 * the work PR's own task file had format problems: it is that file, which the task-file PR corrects or replaces.
 */
export type TaskFilePr = { url: string; number: number; mergeSha: string; fixesTaskPath?: string };

/** The saved task-file PR, or null for a normal task or a malformed value. */
export function savedTaskFilePr(facts: { taskFilePr?: unknown } | null | undefined): TaskFilePr | null {
  const value = facts?.taskFilePr as Partial<TaskFilePr> | null | undefined;
  if (!value || typeof value !== "object") return null;
  if (typeof value.url !== "string" || typeof value.number !== "number" || typeof value.mergeSha !== "string") return null;
  return {
    url: value.url, number: value.number, mergeSha: value.mergeSha,
    ...(typeof value.fixesTaskPath === "string" && value.fixesTaskPath ? { fixesTaskPath: value.fixesTaskPath } : {}),
  };
}

/** Why the route asks for a task-file PR: the work PR adds no task file, or its task file has format problems. */
export type NeedTaskFilePrReason = "no_task_file" | "task_file_problems";

export const NEED_TASK_FILE_PR_CODE = "need_task_file_pr";

/** Why a merged work PR needs a task-file PR. `changedNote` is the "It changes X but does not add it…" sentence. */
export function needTaskFilePrMessage(sprint: number, changedNote: string | null = null): string {
  const message = `This merged PR does not add a task file in docs/tasks/sprint-${sprint}/. A merged PR can't be changed, so open a new PR that adds only your task file, merge it, and paste its link below. If you don't see a second box, refresh the page.`;
  return changedNote ? `${changedNote} ${message}` : message;
}

/** Why a merged work PR whose task file has format problems needs a task-file PR: the problems, then what to do. */
export function needTaskFileFixMessage(taskPath: string, problems: string[]): string {
  const name = taskPath.split("/").pop()!;
  return `The task file in this merged PR, ${name}, has problems:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nA merged PR can't be changed, so open a new PR that corrects only that task file, merge it, and paste its link below. If you don't see a second box, refresh the page.`;
}

export const PAIR_NOT_AUTHOR = "A PR without a task file can be paired with a task-file PR only by the student who opened it.";

/** Follows the problem list for a merged PR with a malformed task file that the student did not open. */
export const PAIR_FIX_NOT_AUTHOR = "A merged PR whose task file has problems can be paired with a task-file PR only by the student who opened it.";

export const TASK_FILE_PR_BOX = {
  heading: "This merged PR has no task file",
  text: (sprint: number) => `A merged PR can't be changed. Open a new PR that adds only your task file (docs/tasks/sprint-${sprint}/<task ID>.md), merge it, and paste its link here. Your task is graded on the code in the PR above.`,
  label: "Task-file PR URL",
  button: "Add both PRs",
} as const;

/** The second box for a merged PR whose task file has problems; the label and button are TASK_FILE_PR_BOX's. */
export const TASK_FILE_FIX_BOX = {
  heading: "This merged PR's task file has problems",
  text: (sprint: number) => `A merged PR can't be changed. Open a new PR that corrects only your task file in docs/tasks/sprint-${sprint}/, merge it, and paste its link here. Your task is graded on the code in the PR above.`,
} as const;

/** The task card's second line for a paired task; the first is the two links. */
export const TASK_FILE_PR_CARD_NOTE = "The task file was added in a separate PR, after the work was merged.";

/** The card's second line when the work PR's own task file had format problems. */
export const TASK_FILE_FIX_CARD_NOTE = "The task file was corrected in a separate PR, after the work was merged, because the PR's own task file had problems.";

/** The card's second line for this pair. */
export function taskFilePrCardNote(pair: Pick<TaskFilePr, "fixesTaskPath">): string {
  return pair.fixesTaskPath ? TASK_FILE_FIX_CARD_NOTE : TASK_FILE_PR_CARD_NOTE;
}

/** The task card's link line, as text. The card links each PR number. */
export function taskFilePrCardLine(taskFilePrNumber: number, workPrNumber: number): string {
  return `Task file from PR #${taskFilePrNumber} · work from PR #${workPrNumber}`;
}

/**
 * The staff review page's line for a paired task. With `fixesTaskPath`, the work PR's own task file (that one) had
 * format problems and the task-file PR corrects or replaces it.
 */
export function taskFilePrReviewLine(taskFilePrNumber: number, workPrNumber: number, fixesTaskPath?: string): string {
  if (fixesTaskPath) {
    const name = fixesTaskPath.split("/").pop()!;
    return `Task file from a separate PR, #${taskFilePrNumber}. The work is in PR #${workPrNumber}, whose own task file, ${name}, had format problems, so the task file was corrected after the work.`;
  }
  return `Task file from a separate PR, #${taskFilePrNumber}. The work is in PR #${workPrNumber}, which has no task file, so the task file was written or added after the work.`;
}

/**
 * What Re-check sends for a saved task: the saved PR, and either the saved task-file PR (so a pair is re-imported
 * together) or the saved task file (so a PR with two task files stays on this slot's file). A pair that corrects
 * the work PR's own task file also sends that file, so a work PR with several task files skips the choice again.
 */
export function recheckRequest(saved: { pr_url: string; task_path: string; facts_json?: { taskFilePr?: unknown } | null }): {
  prUrl: string; taskPath?: string; taskFilePrUrl?: string;
} {
  const pair = savedTaskFilePr(saved.facts_json);
  if (!pair) return { prUrl: saved.pr_url, taskPath: saved.task_path };
  return pair.fixesTaskPath
    ? { prUrl: saved.pr_url, taskPath: pair.fixesTaskPath, taskFilePrUrl: pair.url }
    : { prUrl: saved.pr_url, taskFilePrUrl: pair.url };
}
