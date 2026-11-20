import { MAX_TASKS_PER_PR, MAX_TASKS_PER_SPRINT, USUAL_TASKS_PER_SPRINT } from "@/lib/cse115a/taskSlots";

/** The smallest estimate a task may have, in hours. */
export const TASK_MIN_HOURS = 2;
/** The smallest estimate for one big task, which counts as the whole sprint: twice a regular task. */
export const BIG_TASK_MIN_HOURS = 2 * TASK_MIN_HOURS;

/** The regular estimate check: at least TASK_MIN_HOURS. Feeds estimateAtLeastTwoHours. */
export function estimateMeetsTaskMinimum(hours: number): boolean {
  return hours >= TASK_MIN_HOURS;
}

/** A saved task spec's estimate in hours, or null when it has none. */
export function specEstimateHours(spec: { estimateHours?: unknown } | null | undefined): number | null {
  const hours = spec?.estimateHours;
  return typeof hours === "number" && Number.isFinite(hours) ? hours : null;
}

/** Whether one task is big enough to count as the whole sprint. Hours are the only rule; a short one warns, it does not block. */
export function bigTaskEstimateOk(hours: number | null | undefined): boolean {
  return typeof hours === "number" && hours >= BIG_TASK_MIN_HOURS;
}

function hoursText(hours: number): string {
  const text = String(Number(hours.toFixed(2)));
  return `${text} ${hours === 1 ? "hour" : "hours"}`;
}

export type CiFact = { state: "none" | "passed" | "failed"; failed: number; total: number };

export type TaskFacts = {
  ci: CiFact;
  testFileCount: number | null;
  mergeSha: string;
  firstCommitSha: string | null;
  /** The PR number. */
  prNumber?: number | null;
  /**
   * Whether the PR's first commit holds only task files this PR adds, this task's among them. False for a paired
   * task. Missing on tasks saved before #266; null when the PR's commits could not be read.
   */
  firstCommitTaskOnly?: boolean | null;
  /** How many task files the PR adds in the sprint folder, and which. More than one marks the task's shared diff. */
  prTaskFileCount?: number;
  prTaskFiles?: string[];
  /** For a PR that adds several task files: who committed each, by path. No logins are stored. */
  prTaskFileCommitters?: Record<string, "student" | "someone_else" | "unknown">;
  /** For a merged PR with no task file: the separate PR that added the task file. The rest is this PR's. */
  taskFilePr?: { url: string; number: number; mergeSha: string };
};

export type ChecklistLine = {
  key: string;
  ok: boolean;
  label: string;
  detail: string | null;
};

/** The failing lines: "N to fix". */
export function linesToFix(lines: ChecklistLine[]): ChecklistLine[] {
  return lines.filter((line) => !line.ok);
}

/**
 * The one "task file first" rule (#392): the PR's first commit holds only task files this PR adds, this task's
 * among them (`firstCommitHoldsOnlyTaskFiles`), and the task is not paired with a separate task-file PR. No tag
 * is involved.
 */
export function taskFileFirst(firstCommitTaskOnly: boolean | null | undefined, taskFilePr: unknown): boolean {
  return firstCommitTaskOnly === true && !taskFilePr;
}

/**
 * Whether a saved task's file came first. Rows saved before #392 stored `specCommittedFirst` as false whenever the
 * base tag was missing, so the recorded first-commit fact decides when there is one; otherwise the saved value.
 */
export function savedTaskFileFirst(validation: Record<string, boolean> | null | undefined, facts: Partial<TaskFacts> | null | undefined): boolean {
  if (typeof facts?.firstCommitTaskOnly === "boolean") return taskFileFirst(facts.firstCommitTaskOnly, facts.taskFilePr);
  return validation?.specCommittedFirst === true;
}

type CheckLike = { source?: string; status: string; conclusion: string | null };

const PASSING = new Set(["success", "neutral", "skipped"]);

export function summarizeCi(checks: CheckLike[]): CiFact {
  const finished = checks.filter((check) => {
    if (check.source === "status") {
      return check.conclusion === "success" || check.conclusion === "failure" || check.conclusion === "error";
    }
    return check.status === "completed";
  });
  if (finished.length === 0) return { state: "none", failed: 0, total: 0 };
  const failed = finished.filter((check) => !PASSING.has(check.conclusion ?? "")).length;
  return { state: failed === 0 ? "passed" : "failed", failed, total: finished.length };
}

export function ciFactText(facts: Partial<TaskFacts> | null | undefined): string {
  const ci = facts?.ci;
  if (!ci || ci.state === "none" || ci.total === 0) return "No CI found (optional)";
  if (ci.state === "passed") return "GitHub Actions: passed";
  return `GitHub Actions: ${ci.failed} of ${ci.total} failed`;
}

export function testFactText(facts: Partial<TaskFacts> | null | undefined): string | null {
  if (typeof facts?.testFileCount !== "number") return null;
  if (facts.testFileCount === 0) return "No test files in this PR";
  return `Test files in this PR: ${facts.testFileCount}`;
}

/** Ready: task file first, opened from the student's account, task ID in title and branch, estimate. No tags. */
export function sprintReady(validation: Record<string, boolean> | null | undefined, facts: Partial<TaskFacts> | null | undefined): boolean {
  if (!validation) return false;
  return Boolean(
    savedTaskFileFirst(validation, facts) &&
    validation.prAuthoredByStudent &&
    validation.prTitleHasTaskId &&
    validation.branchHasTaskId &&
    validation.estimateAtLeastTwoHours
  );
}

export function processChecklist(
  validation: Record<string, boolean>,
  facts: Partial<TaskFacts> | null | undefined,
): ChecklistLine[] {
  const titleOk = Boolean(validation.prTitleHasTaskId);
  const branchOk = Boolean(validation.branchHasTaskId);
  const titleBranchDetail = !titleOk && !branchOk
    ? "Edit the PR title on GitHub, then Re-check. The branch name can't be fixed on this PR."
    : !titleOk
      ? "Edit the PR title on GitHub, then Re-check."
      : "Can't be fixed on this PR.";
  const firstOk = savedTaskFileFirst(validation, facts);

  return [
    {
      key: "specCommittedFirst",
      ok: firstOk,
      label: "Task file committed alone, first",
      detail: firstOk ? null : "Can't be fixed on this PR. The spec must come first; use a new task.",
    },
    {
      key: "prAuthoredByStudent",
      ok: Boolean(validation.prAuthoredByStudent),
      label: "Opened from your GitHub account",
      detail: validation.prAuthoredByStudent ? null : "Can't be fixed on this PR.",
    },
    {
      key: "taskIdInTitleAndBranch",
      ok: titleOk && branchOk,
      label: "Task ID in the PR title and branch",
      detail: titleOk && branchOk ? null : titleBranchDetail,
    },
    {
      key: "estimateAtLeastTwoHours",
      ok: Boolean(validation.estimateAtLeastTwoHours),
      label: `Estimate is at least ${TASK_MIN_HOURS} hours`,
      detail: validation.estimateAtLeastTwoHours ? null : "Can't be fixed on this PR. The estimate is in the merged task file.",
    },
  ];
}

/** Re-check ignores whatever is in the box and uses the saved PR. Add uses only what was typed. */
export function resolvePullRequestUrl(input: string, saved: string | null | undefined, action: "add" | "recheck"): string {
  if (action === "recheck") return (saved ?? "").trim();
  return input.trim();
}

export function submitAction(addedCount: number, readyCount: number, sprint: number): { disabled: boolean; label: string; reason: string | null } {
  if (addedCount < 1) {
    return { disabled: true, label: `Submit Sprint ${sprint}`, reason: "Add a task to submit." };
  }
  // One big task can be submitted on its own; it counts as the whole sprint (#348).
  if (addedCount === 1) return { disabled: false, label: `Submit Sprint ${sprint} with one task`, reason: null };
  // Every added task is submitted (#412), so every one must be ready for the plain label.
  if (readyCount >= addedCount) return { disabled: false, label: `Submit Sprint ${sprint}`, reason: null };
  return { disabled: false, label: `Submit Sprint ${sprint} anyway`, reason: null };
}

/** The submit bar's line. With one task, `oneTaskHours` is its saved estimate (null when it has none). */
export function submitBarText(addedCount: number, readyCount: number, oneTaskHours: number | null = null): string {
  if (addedCount === 1) {
    if (bigTaskEstimateOk(oneTaskHours)) return "1 task added · one big task counts as the whole sprint";
    const says = oneTaskHours === null ? "this one has no estimate" : `this one says ${String(Number(oneTaskHours.toFixed(2)))}`;
    return `1 task added · one big task needs an estimate of ${BIG_TASK_MIN_HOURS} hours or more (${says}). Add a second task, or submit anyway and a grader will check its size.`;
  }
  return `${readyCount} of ${Math.max(addedCount, USUAL_TASKS_PER_SPRINT)} ready · You can change your submission until the sprint closes.`;
}

/** The submit dialog's text for two tasks or more; three or more add the extra-task warning on the page (#412). */
export function manyTasksConfirmText(count: number): string {
  if (count <= USUAL_TASKS_PER_SPRINT) return "Both tasks lock when you submit. You can still change your submission until the sprint closes.";
  return `All ${count} tasks lock when you submit. You can still change your submission until the sprint closes.`;
}

/** What the released sprint score is, after "Graded <date> · ": right for one, two, or more tasks (#412). */
export function releasedScoreBasis(taskCount: number): string {
  if (taskCount === 1) return "your one big task";
  if (taskCount === USUAL_TASKS_PER_SPRINT) return "the average of your two tasks";
  return `the average of all ${taskCount} of your tasks`;
}

/** The submit dialog's text for one task, with the size warning when its estimate is under BIG_TASK_MIN_HOURS. */
export function oneTaskConfirmText(hours: number | null): string {
  const base = "You are submitting one big task. It counts as the whole sprint, scored out of 10. You can still change your submission and add a second task until the sprint closes.";
  if (bigTaskEstimateOk(hours)) return base;
  const estimate = hours === null ? "It has no estimate" : `Its estimate is ${hoursText(hours)}`;
  return `${base} ${estimate}; one big task needs ${BIG_TASK_MIN_HOURS} or more. A grader will check its size.`;
}

/** The staff review page's line for a one-task submission; `warn` when the estimate is under BIG_TASK_MIN_HOURS. */
export function oneTaskReviewLine(hours: number | null): { text: string; warn: boolean } {
  const estimate = hours === null ? "none" : hoursText(hours);
  if (bigTaskEstimateOk(hours)) return { text: `One-task sprint: this task is the sprint score. Estimate: ${estimate}.`, warn: false };
  return { text: `One-task sprint: this task is the sprint score. Estimate: ${estimate} (one big task needs ${BIG_TASK_MIN_HOURS} or more).`, warn: true };
}

/** The staff review page's line for three or more tasks (#412); null for one or two. */
export function manyTasksReviewLine(count: number): string | null {
  return count > USUAL_TASKS_PER_SPRINT ? `${count} tasks: the sprint score is the average of all ${count}.` : null;
}

/**
 * The staff review page's base line for a task: its base commit and where the diff starts. `merge_base` is a
 * capture after #382; the other sources keep the text they had before.
 */
export function baseCommitLine(baseCommit: string, source: string): string {
  const short = baseCommit.slice(0, 7);
  if (source === "merge_base") return `base ${short} (where the PR's branch left its base; the PR's own changes, as on GitHub)`;
  if (source === "pr_base") return `base ${short} (PR base; the task file was not first)`;
  return `base ${short} (PR's first commit, the task file alone)`;
}

export type SubmitTaskRow = { task_slot: number; task_id: string; pr_url: string; task_path: string; analysis_result_id: string | null };

/** "Task 2 and Task 4", or "Task 1, Task 3 and Task 5". */
function taskNames(tasks: SubmitTaskRow[]): string {
  const names = tasks.map((task) => `Task ${task.task_slot}`);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Why these task rows can't be submitted, or null when they can: 1 to MAX_TASKS_PER_SPRINT tasks (#412), each
 * analyzed; every pair must differ in task ID, and no two may use the same task file from the same PR. Two tasks
 * may share a PR only with two different task files, as a merged PR that holds two tasks does, and at most
 * MAX_TASKS_PER_PR tasks come from one PR. Two tasks keep the messages they had (#348); more name the tasks.
 */
export function submitTasksError(tasks: SubmitTaskRow[]): string | null {
  if (tasks.length < 1) return "Add and analyze at least one merged task PR first.";
  if (tasks.length > MAX_TASKS_PER_SPRINT) {
    return `A sprint can have at most ${MAX_TASKS_PER_SPRINT} tasks, and this one has ${tasks.length}. Remove a task, then submit.`;
  }
  const sorted = [...tasks].sort((a, b) => a.task_slot - b.task_slot);
  const unanalyzed = sorted.find((task) => !task.analysis_result_id);
  if (unanalyzed) return `Task ${unanalyzed.task_slot} (${unanalyzed.task_id}) has not been analyzed yet. Re-check it, then submit.`;
  const two = sorted.length === 2;
  const samePr = (a: SubmitTaskRow, b: SubmitTaskRow) => a.pr_url.toLowerCase() === b.pr_url.toLowerCase();
  const pairs = sorted.flatMap((first, index) => sorted.slice(index + 1).map((second) => [first, second] as const));
  const sameFile = pairs.find(([first, second]) => samePr(first, second) && first.task_path === second.task_path);
  if (sameFile) {
    return two
      ? "Your two tasks use the same task file from the same PR. Each task needs its own task file."
      : `${taskNames([...sameFile])} use the same task file from the same PR. Each task needs its own task file.`;
  }
  const sameId = pairs.find(([first, second]) => first.task_id === second.task_id);
  if (sameId) {
    return two
      ? "Your two tasks must have different task IDs."
      : `${taskNames([...sameId])} have the same task ID, ${sameId[0].task_id}. Each task needs its own task ID.`;
  }
  const crowded = sorted.map((task) => sorted.filter((other) => samePr(task, other))).find((group) => group.length > MAX_TASKS_PER_PR);
  if (crowded) {
    return `${taskNames(crowded)} come from the same PR. At most ${MAX_TASKS_PER_PR} of your tasks can come from one PR, each with its own task file.`;
  }
  return null;
}

export function sprintTabLabel(number: number, options: { submitted: boolean; released: boolean; score: number | null }): string {
  if (options.released && options.score != null) {
    const score = String(Number(options.score.toFixed(2)));
    return `Sprint ${number} · Graded ${score}`;
  }
  if (options.submitted) return `Sprint ${number} · Submitted`;
  return `Sprint ${number}`;
}

export function firstOpenSprint(count: number, isSubmitted: (number: number) => boolean): number {
  for (let number = 1; number <= count; number++) {
    if (!isSubmitted(number)) return number;
  }
  return 1;
}

/**
 * Whether a student may withdraw a submitted sprint to change it: before the
 * sprint's deadline and before a grade is released. A sprint without a
 * deadline stays open.
 */
export function canChangeSubmission(status: string, dueAt: string | null | undefined, now: Date = new Date()): boolean {
  if (status === "released") return false;
  if (!dueAt) return true;
  const due = new Date(dueAt);
  return Number.isNaN(due.valueOf()) || now < due;
}
