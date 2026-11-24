import { isTaskFolderPath } from "@/lib/cse115a/benchmark/buildInstance";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import { isTaskSlot, TASK_SLOTS } from "@/lib/cse115a/taskSlots";

// The Submissions table's "no code in PR" marker (#440). A task whose submitted PR changes only task files
// (docs/tasks/...) has nothing to grade; staff then use "Use a different PR for the code" (#431). Worked out for one
// assignment by its own staff route, after the table has loaded, and never written anywhere.
//
// The answer comes from the benchmark source rows' flags first, which every captured task has (the benchmark job
// runs for every submission; export filters by consent): buildInstance drops task files and AI-tool files from the
// row and flags each, so a PR of only task files is exactly `task_files_dropped` with an empty patch and test_patch,
// no AI-tool files and a diff. Only a task with no source row yet (its benchmark job has not run) has its diff read,
// and only that task's diff.

/** The flags that together say a PR changes only task files (buildInstance). */
export const NO_CODE_FLAGS = { all: ["task_files_dropped", "no_source_patch", "no_test_patch"], none: ["ai_tool_files_dropped", "diff_missing"] } as const;

/** From a benchmark source row's flags: whether the task's PR changes only task files. */
export function noCodeFromFlags(flags: readonly string[]): boolean {
  return NO_CODE_FLAGS.all.every((flag) => flags.includes(flag)) && !NO_CODE_FLAGS.none.some((flag) => flags.includes(flag));
}

/** From the diff itself: at least one file changed, and every one is a task file. */
export function noCodeFromDiff(diff: unknown): boolean {
  if (typeof diff !== "string" || !diff) return false;
  const files = parseDiffFiles(diff);
  return files.length > 0 && files.every((file) => isTaskFolderPath(file.path));
}

/**
 * Per task position (the same positions as SNAPSHOT_SLOT_PATHS): its slot, whether staff chose its code PR (#431) and
 * whether staff added an extra PR for its code (#437). Small JSON paths only, never the diff.
 */
export const NO_CODE_TASK_PATHS = TASK_SLOTS.map((slot) => [
  `slot_${slot}:snapshot->tasks->${slot - 1}->slot`,
  `chosen_${slot}:snapshot->tasks->${slot - 1}->workPrChoice->prNumber`,
  `extra_${slot}:snapshot->tasks->${slot - 1}->extraCodePrs->0->prNumber`,
].join(",")).join(",");

/** The diff of the task at one position, read only for a task with no benchmark source row. */
export function diffPath(position: number): string {
  return `diff_${position}:snapshot->tasks->${position - 1}->>diff`;
}

export type NoCodeTaskRow = { id: string } & Record<string, unknown>;
export type NoCodeSourceRow = { assignment_submission_id: string; task_slot: number; flags: string[] | null };

/** The route's answer: submission ids and slot numbers only. */
export type NoCodeMarkers = {
  noCode: Array<{ submissionId: string; slots: number[] }>;
  chosenByStaff: Array<{ submissionId: string; slots: number[] }>;
};

/** What one run read, for the report and the tests. Never sent to the page. */
export type NoCodeReads = { tasks: number; fromFlags: number; fromDiffs: number; skipped: number };

type Task = { submissionId: string; position: number; slot: number };

/**
 * Sorts each task: staff chose its code PR (labelled, never marked), staff added extra PRs (has code, not marked),
 * answered by its source row's flags, or needing its diff read.
 */
export function planNoCode(rows: NoCodeTaskRow[], sources: NoCodeSourceRow[]) {
  const flagsBy = new Map(sources.map((row) => [`${row.assignment_submission_id}:${row.task_slot}`, row.flags ?? []]));
  const noCode: Task[] = [];
  const chosen: Task[] = [];
  const needDiff: Task[] = [];
  let tasks = 0;
  let fromFlags = 0;
  let skipped = 0;
  for (const row of rows) {
    for (const position of TASK_SLOTS) {
      const slot = Number(row[`slot_${position}`]);
      if (row[`slot_${position}`] === null || row[`slot_${position}`] === undefined || !isTaskSlot(slot)) continue;
      tasks++;
      const task = { submissionId: row.id, position, slot };
      if (row[`chosen_${position}`] !== null && row[`chosen_${position}`] !== undefined) { chosen.push(task); skipped++; continue; }
      if (row[`extra_${position}`] !== null && row[`extra_${position}`] !== undefined) { skipped++; continue; }
      const flags = flagsBy.get(`${row.id}:${slot}`);
      if (flags) { fromFlags++; if (noCodeFromFlags(flags)) noCode.push(task); continue; }
      needDiff.push(task);
    }
  }
  return { noCode, chosen, needDiff, reads: { tasks, fromFlags, fromDiffs: 0, skipped } };
}

function bySubmission(tasks: Task[]): Array<{ submissionId: string; slots: number[] }> {
  const map = new Map<string, number[]>();
  for (const task of tasks) map.set(task.submissionId, [...(map.get(task.submissionId) ?? []), task.slot]);
  return [...map].map(([submissionId, slots]) => ({ submissionId, slots: [...new Set(slots)].sort((a, b) => a - b) }));
}

/** The part of the Supabase client this file uses. */
type Query = PromiseLike<{ data: unknown[] | null; error: unknown }> & {
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  in(column: string, values: unknown[]): Query;
};
export type NoCodeDb = { from(table: string): { select(columns: string): Query } };

/**
 * The markers for one assignment's active submissions. Reads the small JSON paths of every submission, the flags of
 * their benchmark source rows, and the diff of only the tasks with no source row. Writes nothing.
 */
export async function loadNoCodeMarkers(db: NoCodeDb, courseId: string, assignmentNumber: number): Promise<{ ok: true; markers: NoCodeMarkers; reads: NoCodeReads } | { ok: false }> {
  const listed = await db.from("cse_assignment_submissions").select(`id,${NO_CODE_TASK_PATHS}`)
    .eq("course_id", courseId).eq("assignment_number", assignmentNumber).is("superseded_at", null);
  if (listed.error) return { ok: false };
  const rows = (listed.data ?? []) as NoCodeTaskRow[];
  const ids = rows.map((row) => row.id);
  const sources = ids.length ? await db.from("cse_benchmark_task_sources").select("assignment_submission_id,task_slot,flags").in("assignment_submission_id", ids) : { data: [], error: null };
  if (sources.error) return { ok: false };
  const plan = planNoCode(rows, (sources.data ?? []) as NoCodeSourceRow[]);

  if (plan.needDiff.length) {
    const positions = [...new Set(plan.needDiff.map((task) => task.position))].sort((a, b) => a - b);
    const needIds = [...new Set(plan.needDiff.map((task) => task.submissionId))];
    const diffs = await db.from("cse_assignment_submissions").select(`id,${positions.map(diffPath).join(",")}`).in("id", needIds);
    if (diffs.error) return { ok: false };
    const byId = new Map(((diffs.data ?? []) as NoCodeTaskRow[]).map((row) => [row.id, row]));
    for (const task of plan.needDiff) {
      plan.reads.fromDiffs++;
      if (noCodeFromDiff(byId.get(task.submissionId)?.[`diff_${task.position}`])) plan.noCode.push(task);
    }
  }
  return { ok: true, markers: { noCode: bySubmission(plan.noCode), chosenByStaff: bySubmission(plan.chosen) }, reads: plan.reads };
}
