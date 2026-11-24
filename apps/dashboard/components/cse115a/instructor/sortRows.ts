import type { SubmissionStatus } from "./shared";
import { isTaskSlot, TASK_SLOTS, USUAL_TASKS_PER_SPRINT } from "@/lib/cse115a/taskSlots";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";

/** One student's row on the instructor Submissions table. */
export type SubmissionRow = {
  userId: string;
  email: string;
  submission: null | {
    id: string;
    attempt: number;
    status: SubmissionStatus;
    submittedAt: string;
    /** #440: the distinct repositories (`owner/repo`) of the student's tasks, sorted by name. Missing on older responses. */
    teams?: string[];
    tasks: Array<{ slot: number; agentTotal: number | null; instructorTotal: number | null; needsReview: boolean }>;
    agentSprint: number | null;
    sprint: number | null;
    needsReview: boolean;
    jobError: string | null;
  };
};

/** A task column's sort key: `task1`, `task2`, … one per slot up to MAX_TASKS_PER_SPRINT (#412). */
export type TaskSortKey = `task${number}`;
export type SortKey = "student" | "team" | "submitted" | "status" | TaskSortKey | "sprint";

export function taskSortKey(slot: number): TaskSortKey {
  return `task${slot}`;
}

/** The slot a task column sorts by, or null for any other column. */
function taskSortSlot(key: SortKey): number | null {
  const slot = key.startsWith("task") ? Number(key.slice("task".length)) : NaN;
  return isTaskSlot(slot) ? slot : null;
}

export const SORT_KEYS: readonly SortKey[] = ["student", "team", "submitted", "status", ...TASK_SLOTS.map(taskSortKey), "sprint"];

/**
 * The task columns the table shows: Task 1 and Task 2 always, and a column for each further slot only when at
 * least one listed submission has a task in it (#412).
 */
export function taskColumnSlots(rows: SubmissionRow[]): number[] {
  const used = new Set(rows.flatMap((row) => row.submission?.tasks.map((task) => task.slot) ?? []));
  return TASK_SLOTS.filter((slot) => slot <= USUAL_TASKS_PER_SPRINT || used.has(slot));
}
export type SortDirection = "asc" | "desc";
export type Sort = { key: SortKey; direction: SortDirection } | null;

/** Status in the order work moves through it; "needs review" sits just before a plain "Ready for review". */
function statusRank(row: SubmissionRow): number {
  const submission = row.submission;
  if (!submission) return 0;
  if (submission.status === "graded" && submission.needsReview) return 4;
  return { submitted: 1, grading: 2, grading_failed: 3, graded: 5, released: 6 }[submission.status];
}

/** A row's teams as the table shows them; none for a student with no submission. */
export function rowTeams(row: SubmissionRow): string[] {
  return row.submission?.teams ?? [];
}

/** The repository's name, the part after the owner. */
export function teamName(fullName: string): string {
  return fullName.slice(fullName.indexOf("/") + 1);
}

/**
 * What the Team column sorts by (#440): the repository names, then the full names, so one team's students sit
 * together and two teams with the same repository name under different owners stay apart. Null (last) for none.
 */
function teamSortValue(row: SubmissionRow): string | null {
  const teams = rowTeams(row);
  if (!teams.length) return null;
  return `${teams.map((team) => teamName(team).toLowerCase()).join(", ")} ${teams.map((team) => team.toLowerCase()).join(", ")}`;
}

/** The teams of the listed rows for the Team filter, sorted by name and then by `owner/repo`. */
export function teamOptions(rows: SubmissionRow[]): string[] {
  const all = [...new Set(rows.flatMap(rowTeams))];
  return all.sort((a, b) => teamName(a).toLowerCase().localeCompare(teamName(b).toLowerCase()) || a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** The Team filter: every row for "all", else the rows on that team (a student on two teams is under both). */
export function matchesTeam(row: SubmissionRow, team: string | "all"): boolean {
  return team === "all" || rowTeams(row).includes(team);
}

/** #440: what the no-code-prs route answers, by submission id: the slots marked "no code in PR" and those staff chose. */
export type Markers = { noCode: Map<string, number[]>; chosen: Map<string, number[]> };
export type MarkerBody = { noCode: Array<{ submissionId: string; slots: number[] }>; chosenByStaff: Array<{ submissionId: string; slots: number[] }> };

export function markersFrom(body: MarkerBody): Markers {
  return {
    noCode: new Map(body.noCode.map((item) => [item.submissionId, item.slots])),
    chosen: new Map(body.chosenByStaff.map((item) => [item.submissionId, item.slots])),
  };
}

/** The "Needs a code PR" filter: at least one task marked "no code in PR". False until the markers have loaded. */
export function needsCodePr(row: SubmissionRow, markers: Markers | null): boolean {
  return Boolean(row.submission && markerLines(row, markers).some((line) => line.noCode));
}

/** "Task 1: no code in PR" and "Task 2: code PR chosen by staff" for one row, in slot order. */
export function markerLines(row: SubmissionRow, markers: Markers | null): Array<{ slot: number; text: string; noCode: boolean }> {
  if (!row.submission || !markers) return [];
  const noCode = markers.noCode.get(row.submission.id) ?? [];
  const chosen = markers.chosen.get(row.submission.id) ?? [];
  return [
    ...noCode.filter((slot) => !chosen.includes(slot)).map((slot) => ({ slot, text: REVIEW_TEXT.noCode(slot), noCode: true })),
    ...chosen.map((slot) => ({ slot, text: REVIEW_TEXT.chosenByStaff(slot), noCode: false })),
  ].sort((a, b) => a.slot - b.slot);
}

/** The score the table shows for a task: the instructor's total when there is one, else the agent's draft. */
export function shownTaskTotal(row: SubmissionRow, slot: number): number | null {
  const task = row.submission?.tasks.find((item) => item.slot === slot);
  if (!task) return null;
  return task.instructorTotal ?? task.agentTotal ?? null;
}

function value(row: SubmissionRow, key: SortKey): string | number | null {
  switch (key) {
    case "student": return row.email.toLowerCase();
    case "team": return teamSortValue(row);
    case "submitted": return row.submission ? Date.parse(row.submission.submittedAt) : null;
    case "status": return statusRank(row);
    case "sprint": return row.submission?.sprint ?? null;
  }
  const slot = taskSortSlot(key);
  return slot === null ? null : shownTaskTotal(row, slot);
}

/**
 * The rows in the chosen order. Rows with no value for the column (not submitted, not graded yet) always go last,
 * in either direction. Ties keep the order the server sent, so a second click never shuffles equal rows. `null`
 * keeps the server's order.
 */
export function sortRows(rows: SubmissionRow[], sort: Sort): SubmissionRow[] {
  if (!sort) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: value(row, sort.key) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const compared = typeof a.value === "string" ? a.value.localeCompare(b.value as string) : a.value - (b.value as number);
      return compared !== 0 ? sign * compared : a.index - b.index;
    })
    .map((item) => item.row);
}

/** The next sort after clicking a column: ascending first (descending for scores), then the other way, then off. */
export function nextSort(current: Sort, key: SortKey): Sort {
  const first: SortDirection = taskSortSlot(key) !== null || key === "sprint" || key === "submitted" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, direction: first };
  if (current.direction === first) return { key, direction: first === "asc" ? "desc" : "asc" };
  return null;
}
