import { noCodeFromFlags } from "@/lib/cse115a/noCodePr";
import { TASK_POINTS } from "@/lib/cse115a/rubric";
import { EXTRA_CODE_PRS_FLAG, WORK_PR_FLAG } from "@/lib/cse115a/workPr";

// The staff Benchmark page's task table (#445) and its summary of validation results (#444): one row per current
// task, its status in plain words, and the filters, search and sorting. Client-safe: no server imports. Staff only.
// Nothing here says whether a student consented; consent stays in the tiles, the totals line and the downloads.

// ---- What the list route sends ----

/** One current task, as the list route sends it. Never the spec, the patches, or anything about consent. */
export type TaskTableRow = {
  /** The benchmark source row's id; the detail route takes it. */
  id: string;
  submissionId: string;
  assignment: number;
  slot: number;
  /** The task's repository, `owner/repo`; null when the snapshot does not name one. */
  team: string | null;
  email: string;
  /** The user has a row in `cse_course_roles`. */
  staff: boolean;
  taskId: string | null;
  title: string | null;
  validationStatus: "candidate" | "validated" | "rejected";
  flags: string[];
  /** FAIL_TO_PASS's length. */
  provingTests: number;
  coverage: { status: "measured" | "partial" | "unavailable"; covered: number; executable: number } | null;
  untestedFiles: number;
  gold: "passed" | "failed" | "skipped" | null;
  /** effectiveTotal; null when the task has no grade yet. */
  grade: { total: number; released: boolean } | null;
  /** How many extra code PRs the snapshot lists (#437). */
  extraCodePrs: number;
  /** A Repo Metrics report is stored with the task. */
  hasReport: boolean;
  /** The stored report's own date (`analysis_timestamp`); null when it has none. */
  reportDate: string | null;
};

// ---- Plain words ----

/** Every page text of the table and the summary box, word for word. */
export const TASK_TABLE_TEXT = {
  summaryHeading: "Validation results",
  summaryNote: "Current attempts only: a task from an attempt that was later unlocked and submitted again is not counted. Click a row to show those tasks in the table.",
  summaryTotal: (total: number) => `Total: ${total} ${total === 1 ? "task" : "tasks"}`,
  tilesNote: "The tiles above count every captured task, older attempts included. The results and the table below count current attempts only.",
  tableHeading: "Tasks",
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} ${total === 1 ? "task" : "tasks"}`,
  loading: "Loading tasks…",
  noTasks: "No tasks captured yet.",
  noMatch: "No tasks match.",
  tableNote: "Click a row to open it; click again to close it. Click a column heading to sort; click again to reverse, a third time to go back to the original order. Rows with no value go last. The final grade is for reading only: it is not a filter, it does not change a status, and no download carries it.",
  loadFailed: (message: string) => `The task table could not be loaded: ${message}`,
  // Filters.
  assignmentLabel: "Assignment",
  allAssignments: "All assignments",
  assignmentOption: (number: number) => `Assignment ${number}`,
  teamLabel: "Team",
  allTeams: "All teams",
  statusLabel: "Status",
  allStatuses: "All results",
  changedLabel: "Changed by staff",
  changedAny: "Any",
  changedYes: "Yes",
  changedNo: "No",
  peopleLabel: "People",
  studentsOnly: "Students only",
  staffOnly: "Staff only",
  everyone: "Everyone",
  searchLabel: "Search",
  searchPlaceholder: "Email, team or task",
  // Columns.
  columns: {
    assignment: "Assignment",
    team: "Team",
    student: "Student",
    task: "Task",
    status: "Status",
    coverage: "Coverage",
    gold: "Gold check",
    grade: "Final grade",
    staffChanges: "Staff changes",
    repo: "Repo",
  },
  repoColumnNote: "Repo Metrics report stored at submit time",
  repoColumnTitle: "The Repo Metrics report stored with the task when it was submitted. It is not made again when staff change the task's PRs. Open a row for the link.",
  staffTag: "Staff",
  // Cells.
  provingTests: (count: number) => `${count} proving ${count === 1 ? "test" : "tests"}`,
  notMeasured: "Not measured",
  noRunnableLines: "No runnable changed lines",
  coverageLines: (covered: number, executable: number) => `${covered} of ${executable} changed lines`,
  partial: "partly measured",
  untestedFiles: (count: number) => `${count} untested ${count === 1 ? "file" : "files"}`,
  goldPassed: "Passed",
  goldFailed: "Failed",
  goldNotRun: "Not run",
  notGraded: "Not graded yet",
  notReleased: "not released",
  chosenByStaff: "Code PR chosen by staff",
  extraCodePrs: (count: number) => count > 0 ? `${count} extra code ${count === 1 ? "PR" : "PRs"}` : "Extra code PRs",
  report: "Report",
  noReport: "No report",
  asOf: (date: string) => `as of ${date}`,
  dateUnknown: "date unknown",
  openRow: (task: string) => `Open ${task}`,
  closeRow: (task: string) => `Close ${task}`,
  // The opened row.
  detailLoading: "Loading the task…",
  detailFailed: (message: string) => `This task could not be loaded: ${message}`,
  spec: "Spec",
  noSpec: "This task has no spec.",
  codePatch: "Code patch",
  testPatch: "Test patch",
  emptyPatch: "Empty.",
  copyPatch: (what: string) => `Copy the whole ${what}`,
  provingHeading: (count: number) => `Proving tests (${count})`,
  provingGuess: "Read from the test patch; no test run has proven them yet.",
  noProvingTests: "None.",
  stillPass: (count: number) => `${count} ${count === 1 ? "test still passes" : "tests still pass"} after the change.`,
  flagsHeading: "Flags",
  noFlags: "No flags.",
  validatedHeading: "Validation",
  validatedAt: (date: string) => `Validated on ${date}.`,
  validatedAtUnknown: "The validation time was not recorded.",
  repoFromGithub: "The validator read the repository from GitHub.",
  repoFromCopy: "The validator read the repository from the stored copy.",
  repoFromUnknown: "Where the validator read the repository from was not recorded.",
  untestedHeading: "Changed code files the proving tests do not run",
  noUntested: "None.",
  changedHeading: "Changed by staff",
  chosenLine: (chosen: number, submitted: number) => `Staff chose PR #${chosen} for this task's code. The submitted PR #${submitted} is kept as the task-file PR.`,
  extraLine: (pr: number) => `Staff added PR #${pr} as more of this task's code.`,
  extraNote: "The benchmark row is built from the main PR only.",
  reasonLine: (reason: string) => `Reason: ${reason || "none given"}`,
  byLine: (who: string, date: string) => `By ${who} on ${date}.`,
  reviewLink: "Open the review page",
  reportLink: "Open the Repo Metrics report",
  reportBeforeChange: "This report is from the original submission, before the staff change.",
} as const;

/** A date as the table shows it, "Nov 12" (UTC, so every viewer and a test read the same day); null when unreadable. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
}

/** "Nov 12, 2026", for the opened row. */
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}

/** "as of Nov 12", or "date unknown" when the report has no date of its own. Never the submit date. */
export function reportDateText(reportDate: string | null): string {
  const date = shortDate(reportDate);
  return date ? TASK_TABLE_TEXT.asOf(date) : TASK_TABLE_TEXT.dateUnknown;
}

// ---- Validation results ----

/** The same prefix as validation/writeback.ts's REASON_FLAG_PREFIX (a test checks); that file is not client-safe. */
export const REASON_FLAG_PREFIX = "validation_reason:";

/** Each reason the validator writes, as a short name and a plain sentence. */
export const REASON_TEXT: Record<string, { label: string; meaning: string }> = {
  regressions: { label: "breaks other tests", meaning: "Tests that passed before the student's change fail after it." },
  regression_skip: { label: "turns tests off", meaning: "The student's change skips tests that ran before it." },
  no_fail_to_pass: { label: "no proving test", meaning: "No test fails before the student's change and passes after it." },
  env_unsupported: { label: "repository not supported", meaning: "The validator cannot set up and run this repository's tests yet." },
  no_source_patch: { label: "no code", meaning: "The task's row changes no code, so there is nothing to check." },
  no_test_patch: { label: "no tests", meaning: "The task's row changes no test file, so nothing can prove the change." },
  env_error: { label: "test run failed", meaning: "Our test run failed; this says nothing about the student's work." },
};

/** The status of a row, first match wins: validated, rejected (by reason), no code, no tests, no result yet. */
export type StatusKey = "validated" | `rejected:${string}` | "no_code" | "no_tests" | "no_result";

/** The reason a rejected row carries; "no reason recorded" when it has no reason flag. */
export function rejectionReason(flags: readonly string[]): string {
  const flag = flags.find((item) => item.startsWith(REASON_FLAG_PREFIX));
  return flag ? flag.slice(REASON_FLAG_PREFIX.length) || "no reason recorded" : "no reason recorded";
}

/** Whether the row's flags are the "no code in PR" marker's (noCodePr.ts: task files only). */
export function isNoCode(flags: readonly string[]): boolean {
  return noCodeFromFlags(flags);
}

export function statusKey(row: Pick<TaskTableRow, "validationStatus" | "flags">): StatusKey {
  if (row.validationStatus === "validated") return "validated";
  if (row.validationStatus === "rejected") return `rejected:${rejectionReason(row.flags)}`;
  if (isNoCode(row.flags)) return "no_code";
  if (row.flags.includes("no_test_patch")) return "no_tests";
  return "no_result";
}

/** The status's words, as the summary box and the Status column both show them. */
export function statusLabel(key: StatusKey): string {
  if (key === "validated") return "Validated";
  if (key === "no_code") return "No code in the PR";
  if (key === "no_tests") return "No tests in the PR";
  if (key === "no_result") return "No result yet";
  const reason = key.slice("rejected:".length);
  return `Not accepted: ${REASON_TEXT[reason]?.label ?? reason}`;
}

/** The plain line of meaning beside each summary row. */
export function statusMeaning(key: StatusKey): string {
  if (key === "validated") return "Its tests fail before the student's change and pass after it.";
  if (key === "no_code") return "The PR holds only the task file. Staff can choose the PR that holds the code.";
  if (key === "no_tests") return "The PR changes code but no test file.";
  if (key === "no_result") return "Not run by the validator yet, or the run could not finish.";
  const reason = key.slice("rejected:".length);
  return REASON_TEXT[reason]?.meaning ?? `The validator gave the reason "${reason}", which has no description here yet.`;
}

/** Where a status sorts and lists: validated, the rejections by reason, then no code, no tests, no result. */
function statusRank(key: StatusKey): number {
  if (key === "validated") return 0;
  if (key.startsWith("rejected:")) return 1;
  return { no_code: 2, no_tests: 3, no_result: 4 }[key as "no_code" | "no_tests" | "no_result"];
}

export function compareStatus(a: StatusKey, b: StatusKey): number {
  return statusRank(a) - statusRank(b) || a.localeCompare(b);
}

export type SummaryLine = { key: StatusKey; label: string; meaning: string; count: number };

/** One line per status the rows have, in rank order; the counts add up to the rows' total. */
export function summarize(rows: readonly Pick<TaskTableRow, "validationStatus" | "flags">[]): { lines: SummaryLine[]; total: number } {
  const counts = new Map<StatusKey, number>();
  for (const row of rows) {
    const key = statusKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const lines = [...counts].sort(([a], [b]) => compareStatus(a, b))
    .map(([key, count]) => ({ key, label: statusLabel(key), meaning: statusMeaning(key), count }));
  return { lines, total: rows.length };
}

/** The Status cell: the summary's words; for a validated row, the number of proving tests. */
export function statusCell(row: TaskTableRow): { label: string; detail: string | null } {
  const key = statusKey(row);
  return { label: statusLabel(key), detail: key === "validated" ? TASK_TABLE_TEXT.provingTests(row.provingTests) : null };
}

// ---- The other cells ----

/** The covered share of the executable changed lines, rounded; null when not measured or none were executable. */
export function coveragePercent(row: Pick<TaskTableRow, "coverage">): number | null {
  const coverage = row.coverage;
  if (!coverage || coverage.status === "unavailable" || coverage.executable <= 0) return null;
  return Math.round((coverage.covered / coverage.executable) * 100);
}

/** The Coverage cell's lines. */
export function coverageCell(row: TaskTableRow): { main: string; detail: string | null; untested: string | null } {
  const untested = row.untestedFiles > 0 ? TASK_TABLE_TEXT.untestedFiles(row.untestedFiles) : null;
  const coverage = row.coverage;
  if (!coverage || coverage.status === "unavailable") return { main: TASK_TABLE_TEXT.notMeasured, detail: null, untested };
  if (coverage.executable <= 0) return { main: TASK_TABLE_TEXT.noRunnableLines, detail: null, untested };
  const lines = TASK_TABLE_TEXT.coverageLines(coverage.covered, coverage.executable);
  return { main: `${coveragePercent(row)}%`, detail: coverage.status === "partial" ? `${lines}, ${TASK_TABLE_TEXT.partial}` : lines, untested };
}

export function goldCell(gold: TaskTableRow["gold"]): string {
  return gold === "passed" ? TASK_TABLE_TEXT.goldPassed : gold === "failed" ? TASK_TABLE_TEXT.goldFailed : TASK_TABLE_TEXT.goldNotRun;
}

/** "8.5 / 10" and whether to add the "not released" tag; "Not graded yet" without a grade. Display only. */
export function gradeCell(grade: TaskTableRow["grade"]): { text: string; unreleased: boolean } {
  if (!grade) return { text: TASK_TABLE_TEXT.notGraded, unreleased: false };
  return { text: `${Number(grade.total.toFixed(2))} / ${TASK_POINTS}`, unreleased: !grade.released };
}

/** The Staff changes cell's lines, from the row's flags (#431, #437); empty for an unchanged row. */
export function staffChangeLines(row: Pick<TaskTableRow, "flags" | "extraCodePrs">): string[] {
  const lines: string[] = [];
  if (row.flags.includes(WORK_PR_FLAG)) lines.push(TASK_TABLE_TEXT.chosenByStaff);
  if (row.flags.includes(EXTRA_CODE_PRS_FLAG)) lines.push(TASK_TABLE_TEXT.extraCodePrs(row.extraCodePrs));
  return lines;
}

export function changedByStaff(row: Pick<TaskTableRow, "flags">): boolean {
  return row.flags.includes(WORK_PR_FLAG) || row.flags.includes(EXTRA_CODE_PRS_FLAG);
}

/** The Repo cell: "Report" with its date, or "No report". */
export function repoCell(row: Pick<TaskTableRow, "hasReport" | "reportDate">): { text: string; date: string | null } {
  return row.hasReport ? { text: TASK_TABLE_TEXT.report, date: reportDateText(row.reportDate) } : { text: TASK_TABLE_TEXT.noReport, date: null };
}

/** The Task cell: "Task 2" and the task as the review page names it, `<id> · <title>`. */
export function taskCell(row: Pick<TaskTableRow, "slot" | "taskId" | "title">): { slot: string; name: string } {
  const name = [row.taskId, row.title].filter((part) => part && part.trim()).join(" · ");
  return { slot: `Task ${row.slot}`, name };
}

/** The repository's name, the part after the owner. */
export function teamName(fullName: string): string {
  return fullName.slice(fullName.indexOf("/") + 1);
}

// ---- Flags in plain words ----

/** One sentence per flag a row can carry. A flag with no entry shows its name. */
export const FLAG_TEXT: Record<string, string> = {
  base_commit_from_pr_base: "The row starts at the PR's base, an older capture rule, so the task file may not have come before the code.",
  base_commit_from_first_commit: "The row starts at the PR's first commit, an older capture rule.",
  base_commit_from_merge_base: "The row starts where the PR branched off, as GitHub's Files changed shows it.",
  diff_from_merge_commit: "The change was read up to the merge commit, because the branch point could not be read.",
  task_file_not_first: "The task file was not committed on its own before the code.",
  task_files_dropped: "Task files (docs/tasks/) were left out of the patch, since the spec already holds their text.",
  diff_missing: "The PR's change could not be read.",
  diff_truncated: "The PR's change was over 1 MB and was cut off.",
  no_test_patch: "The PR changes no test file.",
  no_source_patch: "The PR changes no code outside its tests.",
  no_tests_found: "The test patch adds no test the app could find.",
  pii_scrubbed_from_patch: "Names or emails were removed from the code, which can change what a test checks.",
  ai_tool_files_dropped: "AI tool folders were left out of the patch.",
  pr_holds_two_tasks: "The PR holds two tasks' work, so downloads leave this row out until it is split.",
  task_file_from_other_pr: "The task file came from a separate PR, merged after the code.",
  recaptured_same_patch: "Staff read this task's change again with the newer rule and it came out the same, so the row was kept.",
  work_pr_chosen_by_staff: "Staff chose the PR that holds this task's code.",
  extra_code_prs: "Staff added more PRs for this task's code. The row is built from the main PR only.",
  proof_outside_test_patch: "A proving test is in a file the test patch does not touch.",
  untested_files: "Some changed code files are not run by the proving tests.",
  harbor_gold_failed: "The Harbor gold check failed.",
  "staff_rebuilt:merge-parent": "Staff rebuilt this row from the merge commit's first parent.",
};

/** A flag in plain words: its sentence, a rejection's reason, or the flag's own name when it has no entry. */
export function flagText(flag: string): string {
  if (flag.startsWith(REASON_FLAG_PREFIX)) {
    const reason = flag.slice(REASON_FLAG_PREFIX.length);
    return `Not accepted: ${REASON_TEXT[reason]?.meaning ?? reason}`;
  }
  return FLAG_TEXT[flag] ?? flag;
}

// ---- Filters, search and sorting ----

export type People = "students" | "staff" | "everyone";
export type Changed = "any" | "yes" | "no";
export type Filters = { assignment: number | "all"; team: string | "all"; status: StatusKey | "all"; changed: Changed; people: People; search: string };

export const DEFAULT_FILTERS: Filters = { assignment: "all", team: "all", status: "all", changed: "any", people: "students", search: "" };

/** What the table searches: the email, the team (`owner/repo`) and the task as the Task cell shows it. */
function searchText(row: TaskTableRow): string {
  return [row.email, row.team ?? "", taskCell(row).name].join("\n").toLowerCase();
}

export function matchesFilters(row: TaskTableRow, filters: Filters): boolean {
  if (filters.assignment !== "all" && row.assignment !== filters.assignment) return false;
  if (filters.team !== "all" && row.team !== filters.team) return false;
  if (filters.status !== "all" && statusKey(row) !== filters.status) return false;
  if (filters.changed !== "any" && changedByStaff(row) !== (filters.changed === "yes")) return false;
  if (filters.people === "students" && row.staff) return false;
  if (filters.people === "staff" && !row.staff) return false;
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length && !words.every((word) => searchText(row).includes(word))) return false;
  return true;
}

/** Clicking a summary row: the table shows that status, every other filter as it was. */
export function withStatus(filters: Filters, key: StatusKey): Filters {
  return { ...filters, status: key };
}

/** The assignment numbers in the rows, ascending. */
export function assignmentOptions(rows: readonly TaskTableRow[]): number[] {
  return [...new Set(rows.map((row) => row.assignment))].sort((a, b) => a - b);
}

/** The teams in the rows, by name and then by `owner/repo`, as the Submissions table orders them. */
export function teamOptions(rows: readonly TaskTableRow[]): string[] {
  const all = [...new Set(rows.map((row) => row.team).filter((team): team is string => Boolean(team)))];
  return all.sort((a, b) => teamName(a).toLowerCase().localeCompare(teamName(b).toLowerCase()) || a.toLowerCase().localeCompare(b.toLowerCase()));
}

export type TaskSortKey = "assignment" | "team" | "student" | "task" | "status" | "coverage" | "gold" | "grade" | "staffChanges" | "repo";
export type TaskSort = { key: TaskSortKey; direction: "asc" | "desc" } | null;

export const TASK_SORT_KEYS: readonly TaskSortKey[] = ["assignment", "team", "student", "task", "status", "coverage", "gold", "grade", "staffChanges", "repo"];

/** Numeric columns sort descending first, like the Submissions table's scores. */
const NUMERIC_KEYS: readonly TaskSortKey[] = ["coverage", "grade", "repo"];

export function isNumericColumn(key: TaskSortKey): boolean {
  return NUMERIC_KEYS.includes(key);
}

function sortValue(row: TaskTableRow, key: TaskSortKey): string | number | null {
  switch (key) {
    case "assignment": return row.assignment;
    case "team": return row.team ? `${teamName(row.team).toLowerCase()} ${row.team.toLowerCase()}` : null;
    case "student": return row.email.toLowerCase();
    case "task": return `${String(row.slot).padStart(2, "0")} ${taskCell(row).name.toLowerCase()}`;
    case "status": {
      const status = statusKey(row);
      return `${statusRank(status)} ${status}`;
    }
    case "coverage": return coveragePercent(row);
    case "gold": return row.gold === "passed" ? 0 : row.gold === "failed" ? 1 : null;
    case "grade": return row.grade ? row.grade.total : null;
    case "staffChanges": return staffChangeLines(row).join(" ").toLowerCase() || null;
    case "repo": {
      // Rows with a dated report first, by that date; a report with no date and no report have no value.
      const time = row.hasReport && row.reportDate ? Date.parse(row.reportDate) : NaN;
      return Number.isFinite(time) ? time : null;
    }
  }
}

/**
 * The rows in the chosen order, as sortRows.ts does it: rows with no value for the column go last in either
 * direction, ties keep the server's order, and `null` keeps the server's order.
 */
export function sortTaskRows(rows: readonly TaskTableRow[], sort: TaskSort): TaskTableRow[] {
  if (!sort) return [...rows];
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, sort.key) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const compared = typeof a.value === "string" ? a.value.localeCompare(b.value as string) : a.value - (b.value as number);
      return compared !== 0 ? sign * compared : a.index - b.index;
    })
    .map((item) => item.row);
}

/** The next sort after clicking a column: first direction, then the other, then off (sortRows.ts's nextSort). */
export function nextTaskSort(current: TaskSort, key: TaskSortKey): TaskSort {
  const first = isNumericColumn(key) ? "desc" : "asc";
  if (!current || current.key !== key) return { key, direction: first };
  if (current.direction === first) return { key, direction: first === "asc" ? "desc" : "asc" };
  return null;
}

/** The rows the table shows, filtered and sorted. */
export function visibleRows(rows: readonly TaskTableRow[], filters: Filters, sort: TaskSort): TaskTableRow[] {
  return sortTaskRows(rows.filter((row) => matchesFilters(row, filters)), sort);
}

// ---- The opened row ----

/** One staff-added extra PR, as the detail route sends it. */
export type ExtraPrDetail = { prNumber: number; reason: string; addedBy: string; addedAt: string };

/** What the detail route sends for one task. Never anything about consent. */
export type TaskDetail = {
  id: string;
  submissionId: string;
  slot: number;
  validationStatus: TaskTableRow["validationStatus"];
  flags: string[];
  problemStatement: string;
  patch: string;
  testPatch: string;
  failToPass: string[];
  passToPass: number;
  validation: null | { validatedAt: string | null; repoSource: "github" | "snapshot" | null; untestedFiles: string[] };
  workPrChoice: null | { prNumber: number; submittedPrNumber: number; reason: string; chosenBy: string; chosenAt: string };
  extraCodePrs: ExtraPrDetail[];
  hasReport: boolean;
  reportDate: string | null;
};

export function reviewHref(submissionId: string): string {
  return `/cse115a/instructor/submissions/${encodeURIComponent(submissionId)}`;
}

export function metricsHref(submissionId: string, slot: number): string {
  return `/cse115a/instructor/submissions/${encodeURIComponent(submissionId)}/tasks/${slot}/metrics`;
}

/** The "Changed by staff" block's lines, or [] for a task staff did not change. */
export function changedByStaffLines(detail: Pick<TaskDetail, "workPrChoice" | "extraCodePrs">): Array<{ kind: "chosen" | "extra" | "note"; lines: string[] }> {
  const blocks: Array<{ kind: "chosen" | "extra" | "note"; lines: string[] }> = [];
  const choice = detail.workPrChoice;
  if (choice) {
    blocks.push({ kind: "chosen", lines: [
      TASK_TABLE_TEXT.chosenLine(choice.prNumber, choice.submittedPrNumber),
      TASK_TABLE_TEXT.reasonLine(choice.reason),
      TASK_TABLE_TEXT.byLine(choice.chosenBy, longDate(choice.chosenAt) ?? choice.chosenAt),
    ] });
  }
  for (const extra of detail.extraCodePrs) {
    blocks.push({ kind: "extra", lines: [
      TASK_TABLE_TEXT.extraLine(extra.prNumber),
      TASK_TABLE_TEXT.reasonLine(extra.reason),
      TASK_TABLE_TEXT.byLine(extra.addedBy, longDate(extra.addedAt) ?? extra.addedAt),
    ] });
  }
  if (detail.extraCodePrs.length) blocks.push({ kind: "note", lines: [TASK_TABLE_TEXT.extraNote] });
  return blocks;
}

/** The validated block's repository line. */
export function repoSourceLine(source: "github" | "snapshot" | null): string {
  return source === "github" ? TASK_TABLE_TEXT.repoFromGithub : source === "snapshot" ? TASK_TABLE_TEXT.repoFromCopy : TASK_TABLE_TEXT.repoFromUnknown;
}
