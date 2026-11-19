import type { SubmissionStatus } from "./shared";

/** One student's row on the instructor Submissions table. */
export type SubmissionRow = {
  userId: string;
  email: string;
  submission: null | {
    id: string;
    attempt: number;
    status: SubmissionStatus;
    submittedAt: string;
    tasks: Array<{ slot: number; agentTotal: number | null; instructorTotal: number | null; needsReview: boolean }>;
    agentSprint: number | null;
    sprint: number | null;
    needsReview: boolean;
    jobError: string | null;
  };
};

export const SORT_KEYS = ["student", "submitted", "status", "task1", "task2", "sprint"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type Sort = { key: SortKey; direction: SortDirection } | null;

/** Status in the order work moves through it; "needs review" sits just before a plain "Ready for review". */
function statusRank(row: SubmissionRow): number {
  const submission = row.submission;
  if (!submission) return 0;
  if (submission.status === "graded" && submission.needsReview) return 4;
  return { submitted: 1, grading: 2, grading_failed: 3, graded: 5, released: 6 }[submission.status];
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
    case "submitted": return row.submission ? Date.parse(row.submission.submittedAt) : null;
    case "status": return statusRank(row);
    case "task1": return shownTaskTotal(row, 1);
    case "task2": return shownTaskTotal(row, 2);
    case "sprint": return row.submission?.sprint ?? null;
  }
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
  const first: SortDirection = key === "task1" || key === "task2" || key === "sprint" || key === "submitted" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, direction: first };
  if (current.direction === first) return { key, direction: first === "asc" ? "desc" : "asc" };
  return null;
}
