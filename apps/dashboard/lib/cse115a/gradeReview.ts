import { RUBRIC, type CriterionGrade, type CriterionName } from "@/lib/cse115a/rubric";

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

/** Reasons a submission cannot be released yet; empty when it can. */
export function releaseBlockers(grades: TaskGradeRow[]): string[] {
  const blockers: string[] = [];
  for (const slot of [1, 2]) {
    const grade = grades.find((row) => row.task_slot === slot);
    if (!grade) { blockers.push(`Task ${slot} has no grade yet.`); continue; }
    if (grade.instructor_rubric) continue;
    const unscored = grade.rubric.filter((row) => row.awarded === null).map((row) => row.name);
    if (unscored.length) blockers.push(`Task ${slot}: enter points for ${unscored.join(", ")}.`);
  }
  return blockers;
}

/** Sprint score: the average of the two best task scores; a missing task counts as 0. */
export function sprintScore(taskTotals: Array<number | null | undefined>): number {
  const best = taskTotals.map((total) => total ?? 0).sort((a, b) => b - a).slice(0, 2);
  while (best.length < 2) best.push(0);
  return (best[0]! + best[1]!) / 2;
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
