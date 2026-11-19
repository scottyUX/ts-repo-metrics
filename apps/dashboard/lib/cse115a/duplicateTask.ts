// Each PR, and each task ID within a repository, belongs to one student in a course (#336).

export type OtherStudentTask = { repo_full_name: string; pr_number: number; task_id: string };

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Why another student's task blocks this one, or null. Repository names and task IDs are compared without case.
 * A null `taskId` checks the PR only, before the student has chosen which of its task files this task is.
 */
export function duplicateTaskMessage(
  others: OtherStudentTask[],
  task: { repoFullName: string; prNumber: number; taskId: string | null },
): string | null {
  const sameRepo = others.filter((row) => sameText(row.repo_full_name, task.repoFullName));
  if (sameRepo.some((row) => row.pr_number === task.prNumber)) {
    return "This PR is already added by another student in this course. Each PR counts for one student's task. If you think this is an error, please contact a TA.";
  }
  if (task.taskId !== null && sameRepo.some((row) => sameText(row.task_id, task.taskId!))) {
    return `Task ID ${task.taskId} is already used by another student in ${task.repoFullName}. Use a new task ID. If you think this is an error, please contact a TA.`;
  }
  return null;
}

export type OwnTask = { assignment_number: number; task_slot: number; repo_full_name: string; pr_number: number; task_path: string };
export type TaskTarget = { assignmentNumber: number; slot: number; repoFullName: string; prNumber: number };

/** The student's other tasks from the same PR: every slot but the one being filled. */
export function ownTasksFromSamePr(own: OwnTask[], target: TaskTarget): OwnTask[] {
  return own.filter((row) => sameText(row.repo_full_name, target.repoFullName) && row.pr_number === target.prNumber
    && !(row.assignment_number === target.assignmentNumber && row.task_slot === target.slot));
}

function slotName(row: OwnTask, assignmentNumber: number): string {
  return row.assignment_number === assignmentNumber ? `Task ${row.task_slot}` : `Task ${row.task_slot} in Sprint ${row.assignment_number}`;
}

/**
 * Why this student can't use this PR's task file in this slot, or null. The same PR may fill both slots only
 * with two different task files that it adds (a merged PR that holds two tasks), and at most two of its task
 * files can be used, one per slot.
 */
export function ownTaskConflict(own: OwnTask[], target: TaskTarget & { taskPath: string }): string | null {
  const samePr = ownTasksFromSamePr(own, target);
  const sameFile = samePr.find((row) => row.task_path === target.taskPath);
  if (sameFile) {
    const name = target.taskPath.split("/").pop();
    return `${name} from this PR is already your ${slotName(sameFile, target.assignmentNumber)}. Each task needs its own task file.`;
  }
  if (samePr.length >= 2) return "At most two task files from one PR can be used, one for each task.";
  return null;
}

/**
 * The message for a unique-key refusal on save. Until 20261118000000_cse115a_two_tasks_one_pr.sql is applied,
 * the database takes each PR once per student, so a second task from the same PR is refused there.
 */
export function saveConflictMessage(error: { message?: string; details?: string }): string {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (text.includes("pr_url") && !text.includes("task_path")) {
    return "Two tasks from one PR can't be saved yet: the course database still takes each PR once per student. Please contact a TA.";
  }
  return "This task ID or PR is already submitted in another slot.";
}
