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

/** Who made the commit that added a task file: the student, another GitHub account, or not known. */
export type TaskFileCommitter = "student" | "someone_else" | "unknown";

/**
 * One task of a sprint. `prTaskFiles` are the task files its PR adds in the sprint folder, recorded at import
 * (facts_json); missing on tasks saved before it was recorded. `prTaskFileCommitters` says who committed each, for
 * a PR that adds several; missing on older tasks.
 */
export type PrTask = SlotTask & { taskPath: string; prTaskFiles?: string[] | null; prTaskFileCommitters?: Record<string, TaskFileCommitter> | null };

const samePr = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const fileName = (path: string) => path.split("/").pop()!;

/**
 * Every other task in the same sprint that comes from the same PR, by slot. A sprint can hold up to
 * MAX_TASKS_PER_SPRINT tasks (#412), but at most two come from one PR, so this is at most one task.
 */
export function otherTasksInSamePr<T extends SlotTask>(tasks: T[], task: T): T[] {
  return tasks.filter((other) => other.slot !== task.slot && samePr(other.prUrl, task.prUrl)).sort((a, b) => a.slot - b.slot);
}

/** The other task in the same sprint that comes from the same PR, or null. */
export function otherTaskInSamePr<T extends SlotTask>(tasks: T[], task: T): T | null {
  return otherTasksInSamePr(tasks, task)[0] ?? null;
}

/**
 * Whether this task's PR adds more than one task file, and what the others are: the student's other tasks here
 * from that PR, and task files that are none of the student's tasks here. Null when the PR adds only this task
 * file. The recorded count decides; a task saved before it was recorded falls back to the other slots.
 */
export function prTaskFileSharing<T extends PrTask>(tasks: T[], task: T): { otherTask: T | null; otherTasks: T[]; unused: string[] } | null {
  const otherTasks = otherTasksInSamePr(tasks, task);
  const otherTask = otherTasks[0] ?? null;
  const recorded = task.prTaskFiles ?? null;
  const theirs = new Set([task.taskPath, ...otherTasks.map((other) => other.taskPath)]);
  const unused = recorded ? recorded.filter((path) => !theirs.has(path)) : [];
  const holdsMore = recorded ? recorded.length > 1 || otherTask !== null : otherTask !== null;
  return holdsMore ? { otherTask, otherTasks, unused } : null;
}

/** "A and B", or "A, B and C". */
function listed(items: string[]): string {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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

const COMMITTER_WORDS: Record<TaskFileCommitter, string> = { student: "this student", someone_else: "someone else", unknown: "not confirmed" };

/**
 * Staff only: who committed the PR's task files, when it was recorded and at least one is not the student's.
 * Asks staff to check this task's own file when its committer is not known.
 */
function committersLine(task: PrTask): string | null {
  const committers = task.prTaskFileCommitters;
  if (!committers || typeof committers !== "object") return null;
  const paths = task.prTaskFiles?.length ? task.prTaskFiles : Object.keys(committers);
  const whoOf = (path: string): TaskFileCommitter => committers[path] ?? "unknown";
  if (paths.length === 0 || paths.every((path) => whoOf(path) === "student")) return null;
  const line = `Who committed this PR's task files: ${paths.map((path) => `${fileName(path)}, ${COMMITTER_WORDS[whoOf(path)]}`).join("; ")}.`;
  return whoOf(task.taskPath) === "unknown" ? `${line} Check that ${fileName(task.taskPath)} is this student's own.` : line;
}

/** The lines shown on the student's task card or the staff review page for a task whose PR adds more than one task file. */
export function prTaskFileLines<T extends PrTask>(tasks: T[], task: T, audience: LineAudience): string[] {
  const sharing = prTaskFileSharing(tasks, task);
  if (!sharing) return [];
  const lines: string[] = [];
  if (sharing.otherTasks.length === 1) {
    const [first, second] = [task, sharing.otherTasks[0]!].sort((a, b) => a.slot - b.slot) as [T, T];
    lines.push(`This PR holds two tasks: ${first.taskId} (Task ${first.slot}) and ${second.taskId} (Task ${second.slot}). They share one diff.`);
  } else if (sharing.otherTasks.length > 1) {
    // Not offered (at most two tasks from one PR), but said right if the rows ever hold more.
    const all = [task, ...sharing.otherTasks].sort((a, b) => a.slot - b.slot);
    lines.push(`This PR holds ${all.length} tasks: ${listed(all.map((item) => `${item.taskId} (Task ${item.slot})`))}. They share one diff.`);
  }
  if (sharing.unused.length) lines.push(unusedLine(sharing.unused, audience));
  const committers = audience === "staff" ? committersLine(task) : null;
  if (committers) lines.push(committers);
  return lines;
}

/** The grader's note for a task whose PR also holds the student's other task, or other tasks. */
export function sharedPrGraderNote(otherTaskId: string | string[]): string {
  const ids = Array.isArray(otherTaskId) ? otherTaskId : [otherTaskId];
  if (ids.length === 1) {
    return `This PR holds two tasks. The other task, ${ids[0]}, has its own task file and grade; judge this task only against its own task file and acceptance criteria, and do not count the other task's work for or against it.`;
  }
  return `This PR holds ${ids.length + 1} tasks. The other tasks, ${listed(ids)}, each have their own task file and grade; judge this task only against its own task file and acceptance criteria, and do not count the other tasks' work for or against it.`;
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
    ...(sharing.otherTasks.length ? [sharedPrGraderNote(sharing.otherTasks.map((other) => other.taskId))] : []),
    ...(sharing.unused.length ? [unusedTaskFilesGraderNote(sharing.unused)] : []),
  ];
}
