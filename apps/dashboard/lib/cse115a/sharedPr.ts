// A merged PR that adds two of the student's own task files counts as two tasks: one per slot, each with its
// own task file and grade, sharing one diff. A backup for PRs already merged; a task PR adds one task file.
// A task from a PR that adds more than one task file is marked even when the student uses only one of them,
// because its diff still holds the other file's work.

/**
 * Whether a PR's first commit holds only task files the PR adds, this task's among them. With one task file
 * that is exactly the one file; a PR that adds several may hold them together.
 */
export function firstCommitHoldsOnlyTaskFiles(
  firstCommitFiles: Array<{ filename: string }> | undefined | null,
  taskPath: string,
  addedTaskPaths: string[],
): boolean {
  if (!firstCommitFiles?.length) return false;
  const allowed = new Set([taskPath, ...addedTaskPaths]);
  return firstCommitFiles.every((file) => allowed.has(file.filename)) && firstCommitFiles.some((file) => file.filename === taskPath);
}

type SlotTask = { slot: number; taskId: string; prUrl: string };

/**
 * One task of a sprint. `prTaskFiles` are the task files its PR adds in the sprint folder, recorded at import
 * (facts_json); missing on tasks saved before it was recorded.
 */
export type PrTask = SlotTask & { taskPath: string; prTaskFiles?: string[] | null };

const samePr = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const fileName = (path: string) => path.split("/").pop()!;

/** The other task in the same sprint that comes from the same PR, or null. */
export function otherTaskInSamePr<T extends SlotTask>(tasks: T[], task: T): T | null {
  return tasks.find((other) => other.slot !== task.slot && samePr(other.prUrl, task.prUrl)) ?? null;
}

/**
 * Whether this task's PR adds more than one task file, and what the others are: the student's other task here,
 * and task files that are none of the student's tasks here. Null when the PR adds only this task file. The
 * recorded count decides; a task saved before it was recorded falls back to the other slot.
 */
export function prTaskFileSharing<T extends PrTask>(tasks: T[], task: T): { otherTask: T | null; unused: string[] } | null {
  const otherTask = otherTaskInSamePr(tasks, task);
  const recorded = task.prTaskFiles ?? null;
  const unused = recorded ? recorded.filter((path) => path !== task.taskPath && path !== otherTask?.taskPath) : [];
  const holdsMore = recorded ? recorded.length > 1 || otherTask !== null : otherTask !== null;
  return holdsMore ? { otherTask, unused } : null;
}

/** Whether this task's diff also holds another task file's work. Feeds the pr_holds_two_tasks benchmark flag. */
export function prHoldsMoreThanThisTask<T extends PrTask>(tasks: T[], task: T): boolean {
  return prTaskFileSharing(tasks, task) !== null;
}

/** Who reads the line: the student ("your tasks") or staff ("this student's tasks"). */
export type LineAudience = "student" | "staff";

function unusedLine(paths: string[], audience: LineAudience): string {
  const names = paths.map(fileName);
  const whose = audience === "student" ? "your" : "this student's";
  return names.length === 1
    ? `This PR also adds another task file, ${names[0]}, which is not one of ${whose} tasks here. Its work is in the same diff.`
    : `This PR also adds other task files, ${names.join(", ")}, which are not ${whose} tasks here. Their work is in the same diff.`;
}

/** The lines shown on the student's task card or the staff review page for a task whose PR adds more than one task file. */
export function prTaskFileLines<T extends PrTask>(tasks: T[], task: T, audience: LineAudience): string[] {
  const sharing = prTaskFileSharing(tasks, task);
  if (!sharing) return [];
  const lines: string[] = [];
  if (sharing.otherTask) {
    const [first, second] = [task, sharing.otherTask].sort((a, b) => a.slot - b.slot) as [T, T];
    lines.push(`This PR holds two tasks: ${first.taskId} (Task ${first.slot}) and ${second.taskId} (Task ${second.slot}). They share one diff.`);
  }
  if (sharing.unused.length) lines.push(unusedLine(sharing.unused, audience));
  return lines;
}

/** The grader's note for a task whose PR also holds the student's other task. */
export function sharedPrGraderNote(otherTaskId: string): string {
  return `This PR holds two tasks. The other task, ${otherTaskId}, has its own task file and grade; judge this task only against its own task file and acceptance criteria, and do not count the other task's work for or against it.`;
}

/** The grader's note for a task whose PR also adds task files that are none of the student's tasks here. */
export function unusedTaskFilesGraderNote(paths: string[]): string {
  const names = paths.map(fileName);
  const files = names.length === 1
    ? `another task file, ${names[0]}, which is not one of this student's tasks here; its work is`
    : `other task files, ${names.join(", ")}, which are none of this student's tasks here; their work is`;
  return `This PR also adds ${files} in the same diff. Judge this task only against its own task file and acceptance criteria, and do not count ${names.length === 1 ? "that file's" : "those files'"} work for or against it.`;
}

/** Every grader note for this task's PR: none when the PR adds only this task file. */
export function prTaskFileGraderNotes<T extends PrTask>(tasks: T[], task: T): string[] {
  const sharing = prTaskFileSharing(tasks, task);
  if (!sharing) return [];
  return [
    ...(sharing.otherTask ? [sharedPrGraderNote(sharing.otherTask.taskId)] : []),
    ...(sharing.unused.length ? [unusedTaskFilesGraderNote(sharing.unused)] : []),
  ];
}
