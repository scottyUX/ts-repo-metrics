import { RUBRIC, type CriterionGrade, type CriterionName } from "@/lib/cse115a/rubric";
import { isTaskSlot, TASK_SLOTS, USUAL_TASKS_PER_SPRINT } from "@/lib/cse115a/taskSlots";

// Instructor edits to an agent grade, and the rules for releasing it. Shared
// by the instructor API and UI.

export type InstructorCriterion = { name: CriterionName; points: number; awarded: number; note: string };

export type TaskGradeRow = {
  task_slot: number;
  rubric: CriterionGrade[];
  agent_total: number | string;
  needs_review: boolean;
  model: string;
  prompt_version: string;
  graded_at: string;
  instructor_rubric: InstructorCriterion[] | null;
  instructor_total: number | string | null;
  instructor_notes: string | null;
  released_at: string | null;
};

const MAX_NOTE_CHARS = 2000;

/** Validates an instructor rubric: every criterion once, points in half steps within the criterion's maximum. */
export function parseInstructorRubric(raw: unknown): { rubric: InstructorCriterion[]; total: number } | { error: string } {
  if (!Array.isArray(raw)) return { error: "The rubric must be a list of criteria." };
  const byName = new Map<string, { awarded?: unknown; note?: unknown }>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return { error: "Each criterion needs a name." };
    const name = (item as { name: string }).name;
    if (byName.has(name)) return { error: `${name} appears twice.` };
    byName.set(name, item as { awarded?: unknown; note?: unknown });
  }
  const rubric: InstructorCriterion[] = [];
  for (const row of RUBRIC) {
    const item = byName.get(row.name);
    if (!item) return { error: `${row.name} is missing.` };
    const awarded = item.awarded;
    if (typeof awarded !== "number" || !Number.isFinite(awarded) || awarded < 0 || awarded > row.points || Math.round(awarded * 2) !== awarded * 2) {
      return { error: `${row.name} must be between 0 and ${row.points} in steps of 0.5.` };
    }
    const note = typeof item.note === "string" ? item.note.trim() : "";
    if (note.length > MAX_NOTE_CHARS) return { error: `The note for ${row.name} is too long.` };
    rubric.push({ name: row.name, points: row.points, awarded, note });
    byName.delete(row.name);
  }
  if (byName.size > 0) return { error: `Unknown criterion: ${[...byName.keys()][0]}.` };
  return { rubric, total: rubric.reduce((sum, row) => sum + row.awarded, 0) };
}

/** Points the student will see for a task: the instructor's if edited, else the agent's. */
export function effectiveTotal(grade: Pick<TaskGradeRow, "agent_total" | "instructor_total">): number {
  return Number(grade.instructor_total ?? grade.agent_total);
}

/** What a snapshot without a task list counts as: the usual two slots, as before #348. None exist. */
function slotsWithoutTaskList(): number[] {
  return TASK_SLOTS.slice(0, USUAL_TASKS_PER_SPRINT);
}

/**
 * Every task slot a submission's snapshot holds, up to MAX_TASKS_PER_SPRINT (#412). A snapshot without a task list
 * counts as both usual slots, as before #348.
 */
export function submittedSlots(snapshot: unknown): number[] {
  const tasks = (snapshot as { tasks?: unknown } | null | undefined)?.tasks;
  if (!Array.isArray(tasks)) return slotsWithoutTaskList();
  return tasks.map((task) => Number((task as { slot?: unknown } | null)?.slot)).filter(isTaskSlot).sort((a, b) => a - b);
}

/** Reasons a submission cannot be released yet; empty when it can. Only submitted slots need a grade (#348). */
export function releaseBlockers(grades: TaskGradeRow[], slots: number[]): string[] {
  const blockers: string[] = [];
  for (const slot of slots) {
    const grade = grades.find((row) => row.task_slot === slot);
    if (!grade) { blockers.push(`Task ${slot} has no grade yet.`); continue; }
    if (grade.instructor_rubric) continue;
    const unscored = grade.rubric.filter((row) => row.awarded === null).map((row) => row.name);
    if (unscored.length) blockers.push(`Task ${slot}: enter points for ${unscored.join(", ")}.`);
  }
  return blockers;
}

/**
 * The sprint score: the average of every submitted task's total (#412). One big task is the sprint score, two
 * tasks are averaged, three to MAX_TASKS_PER_SPRINT are all averaged, so an extra task can lower the score as well
 * as raise it. None gives 0. The one function for every place a sprint score is shown.
 */
export function sprintScore(taskTotals: number[]): number {
  if (taskTotals.length === 0) return 0;
  return taskTotals.reduce((sum, total) => sum + total, 0) / taskTotals.length;
}

/** The sprint score once every submitted slot has a total; null while one is missing, so a two-task submission is never scored as one task. */
export function submittedSprintScore(slots: number[], totalFor: (slot: number) => number | null | undefined): number | null {
  if (slots.length === 0) return null;
  const totals: number[] = [];
  for (const slot of slots) {
    const total = totalFor(slot);
    if (total === null || total === undefined || !Number.isFinite(total)) return null;
    totals.push(total);
  }
  return sprintScore(totals);
}

/**
 * The JSON paths the instructor list selects instead of the snapshot, so it never loads the diffs: one per
 * possible task (`slot_1:snapshot->tasks->0->slot`, … up to MAX_TASKS_PER_SPRINT).
 */
export const SNAPSHOT_SLOT_PATHS = TASK_SLOTS.map((slot) => `slot_${slot}:snapshot->tasks->${slot - 1}->slot`).join(",");

/**
 * #440: each task's repository (its team) as a JSON path, `repo_1:snapshot->tasks->0->>repoFullName`, … the same
 * positions as SNAPSHOT_SLOT_PATHS, so the list reads the team without the diffs.
 */
export const SNAPSHOT_REPO_PATHS = TASK_SLOTS.map((slot) => `repo_${slot}:snapshot->tasks->${slot - 1}->>repoFullName`).join(",");

/** The values SNAPSHOT_REPO_PATHS selected from one row, in order. */
export function snapshotRepoPathValues(row: Record<string, unknown>): unknown[] {
  return TASK_SLOTS.map((slot) => row[`repo_${slot}`]);
}

/** The values SNAPSHOT_SLOT_PATHS selected from one row, in order. */
export function snapshotSlotPathValues(row: Record<string, unknown>): unknown[] {
  return TASK_SLOTS.map((slot) => row[`slot_${slot}`]);
}

/**
 * Submitted slots from the snapshot's task slots, selected as JSON paths (SNAPSHOT_SLOT_PATHS): every one present,
 * up to MAX_TASKS_PER_SPRINT (#412). None present: both usual slots, as submittedSlots.
 */
export function slotsFromSnapshotPaths(...paths: unknown[]): number[] {
  const slots = paths.filter((slot) => slot !== null && slot !== undefined).map(Number).filter(isTaskSlot);
  return slots.length ? [...new Set(slots)].sort((a, b) => a - b) : slotsWithoutTaskList();
}

export type StudentCriterion = { name: CriterionName; points: number; awarded: number; rationale: string; note: string };
export type StudentTaskGrade = { slot: number; total: number; criteria: StudentCriterion[]; notes: string; releasedAt: string };

/** What a student sees for a released task: instructor points where edited, the agent's rationale, and instructor notes. */
export function studentGradeView(grade: TaskGradeRow): StudentTaskGrade | null {
  if (!grade.released_at) return null;
  const criteria = RUBRIC.map((row) => {
    const agent = grade.rubric.find((item) => item.name === row.name);
    const edited = grade.instructor_rubric?.find((item) => item.name === row.name);
    return {
      name: row.name,
      points: row.points,
      awarded: edited?.awarded ?? agent?.awarded ?? 0,
      rationale: agent?.rationale ?? "",
      note: edited?.note ?? "",
    };
  });
  return { slot: grade.task_slot, total: effectiveTotal(grade), criteria, notes: grade.instructor_notes ?? "", releasedAt: grade.released_at };
}
