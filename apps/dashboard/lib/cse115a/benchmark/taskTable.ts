import { noCodeFromFlags } from "@/lib/cse115a/noCodePr";
import { RUBRIC, TASK_POINTS } from "@/lib/cse115a/rubric";
import { EXTRA_CODE_PRS_FLAG, WORK_PR_FLAG } from "@/lib/cse115a/workPr";

// The staff Benchmark page's task table (#445) and its summary of validation results (#444): one row per current
// task, its status in plain words, and the filters, search and sorting. Client-safe: no server imports. Staff only.
// Since #449 each row says whether its student consented, by the downloads' rule (`countsAsConsent`): a yes to the
// current, approved wording. Since #452 it is one of three values (Yes, No to the current wording, Not yet), never
// the wording version or a date; the box sorts every task into one result row and lists the tasks behind each count.

// ---- What the list route sends ----

/** A row's consent: Yes, No, or Not yet. */
export type ConsentValue = "yes" | "no" | "not_yet";

/** One rubric box's final points: the instructor's where edited, else the AI's; null when neither scored it. */
export type GradeBox = { name: string; points: number; awarded: number | null };

/** A task's grade as the table shows it. Display only: no filter, status or download reads it. */
export type TaskGrade = { total: number; released: boolean; boxes: GradeBox[] };

/** One current task, as the list route sends it. Never the spec or the patches. */
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
  /**
   * `yes`: the downloads' rule (`countsAsConsent`), a yes to the current, approved wording. `no`: a no to the current
   * wording. `not_yet`: no answer, or an answer to an older wording.
   */
  consent: ConsentValue;
  taskId: string | null;
  title: string | null;
  validationStatus: "candidate" | "validated" | "rejected";
  flags: string[];
  /** FAIL_TO_PASS's length. */
  provingTests: number;
  coverage: { status: "measured" | "partial" | "unavailable"; covered: number; executable: number } | null;
  untestedFiles: number;
  gold: "passed" | "failed" | "skipped" | null;
  /** effectiveTotal and each box's final points; null when the task has no grade yet. */
  grade: TaskGrade | null;
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
  summaryNote: "Current attempts only: a task from an attempt that was later unlocked and submitted again is not counted. Each task is in one row. Show tasks lists them, each with a link to its review page.",
  summaryTotal: (total: number, people: People) => `Total: ${total} ${total === 1 ? "task" : "tasks"} (${PEOPLE_TOTAL[people]})`,
  countSplit: (decided: number, lastRun: number) => `${decided} decided, ${lastRun} from the last run`,
  showTasks: "Show tasks",
  hideTasks: "Hide tasks",
  showTasksLabel: (count: number, label: string) => `Show the ${count} ${count === 1 ? "task" : "tasks"}: ${label}`,
  hideTasksLabel: (label: string) => `Hide the tasks: ${label}`,
  listHeading: (label: string) => `Tasks with this result: ${label}`,
  showInTable: "Show in the table",
  showInTableLabel: (label: string) => `Show in the table the tasks with this result: ${label}`,
  decided: "(decided)",
  notAccepted: (label: string) => `Not accepted: ${label}`,
  lastRun: (label: string) => `No result yet · last run: ${label}`,
  notAcceptedHelp: "Staff wrote this result back as the validator's decision.",
  lastRunHelp: "The validator's last run of the task ended this way. The task is still waiting for a result.",
  tilesNote: "The tiles above count every captured task, older attempts included. The results and the table below count current attempts only.",
  consentCountsNote: "A download holds a validated task only when its student consented.",
  validatedConsented: (count: number) => `Validated and consented: ${count}`,
  validatedNotConsented: (count: number) => `Validated, not consented: ${count}`,
  tableHeading: "Tasks",
  tableIntro: "This table joins each benchmark task to its grade and its validation result. The grade, coverage and gold check are shown here only and are not in the downloads.",
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} ${total === 1 ? "task" : "tasks"}`,
  loading: "Loading tasks…",
  noTasks: "No tasks captured yet.",
  noMatch: "No tasks match.",
  tableNote: "Click a row to open it; click again to close it. Click a column heading to sort; click again to reverse, a third time to go back to the original order. Rows with no value go last. The final grade is for reading only: it is not a filter, it does not change a status, and no download carries it.",
  loadFailed: (message: string) => `The task table could not be loaded: ${message}`,
  // Filters.
  // "Sprint" here only; the number is the assignment number, and the Submissions page keeps "Assignment".
  assignmentLabel: "Sprint",
  allAssignments: "All sprints",
  assignmentOption: (number: number) => `Sprint ${number}`,
  teamLabel: "Team",
  allTeams: "All teams",
  statusLabel: "Status",
  allStatuses: "All results",
  consentLabel: "Consent",
  consentAny: "Any",
  consentYes: "Yes",
  consentNo: "No",
  consentNotYet: "Not yet",
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
    assignment: "Sprint",
    team: "Team",
    who: "Who",
    consent: "Consent",
    task: "Task",
    status: "Status",
    coverage: "Coverage",
    gold: "Gold check",
    grade: "Final grade",
    score: "Score",
    include: "Include",
    staffChanges: "Staff changes",
    repo: "Repo",
  },
  repoHelp: "The Repo Metrics report stored with the task when it was submitted. It is not made again when staff change the task's PRs. Open a row for the link.",
  staffTag: "Staff",
  // Help beside a heading ("?"). The Status help is built from statusLabel and statusMeaning (statusHelpLines).
  helpLabel: (column: string) => `What ${column} means`,
  coverageHelp: "Of the code lines this task changes, the share the proving tests ran. Measured by a coverage run in the validator. Experimental: nobody has checked these numbers by hand yet. \"Not measured\" means the coverage run has not been done for this task.",
  goldHelp: "Harbor is the format coding agents are run in. The gold check builds this task as a Harbor task and applies the student's own change. Passed means the task's tests pass there, so the task can be solved as packaged. Not run means it has not been tried yet. The Harbor download holds only tasks that passed.",
  scoreHelp: "How good the task is as a benchmark item. It is separate from the student's grade and never changes it. Not scored yet.",
  includeHelp: "Staff's decision to put the task in the benchmark or leave it out, with a reason. Not decided yet.",
  notSet: "Not set",
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
  gradeBoxesLabel: (task: string) => `Grade by box for ${task}`,
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
  testsHeading: "Tests and criteria",
  coverageHeading: "Coverage",
  coverageNotMeasured: "Not measured yet.",
  coverageNoRunnable: "The coverage run found no runnable changed lines. This can be a limit of the coverage run for this repository.",
  coverageUnavailable: "The coverage run could not measure this task.",
  coveragePartial: "Partly measured.",
  coverageReason: (reason: string) => `The coverage run says: ${reason}`,
  coverageFileStates: { run: "run by the proving tests", not_run: "not run", not_measured: "not measured", no_code: "no runnable changed lines" },
  coverageFilesTotal: (filesRun: number, filesChanged: number) => `In total, the proving tests run ${filesRun} of ${filesChanged} changed code ${filesChanged === 1 ? "file" : "files"}.`,
  coverageLinesTotal: (covered: number, executable: number) => `In the files they run, they run ${covered} of ${executable} changed lines.`,
  criteriaNote: "Which acceptance criteria each test checks is not shown here yet.",
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
  gradeHeading: "Grade",
  gradeBoxLine: (name: string, awarded: number | null, points: number) => `${name}: ${awarded === null ? "not scored" : formatNumber(awarded)} / ${points}`,
  gradeTotal: (total: number) => `Total: ${formatNumber(total)} / ${TASK_POINTS}`,
  scoresHeading: "Repo Metrics scores",
  scoreNotMeasured: "Not measured",
  scoresFailed: "The scores could not be worked out from the stored report.",
} as const;

/** How the total line names the People filter's choice. */
const PEOPLE_TOTAL: Record<People, string> = { students: "students only", staff: "staff only", everyone: "everyone" };

/** Points as the table shows them: at most two decimals, no trailing zeros. */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

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
/** The same prefix as validation/writeback.ts's ATTEMPT_FLAG_PREFIX (a test checks): the validator's last run, not a verdict (#452). */
export const ATTEMPT_FLAG_PREFIX = "validation_attempt:";

/**
 * The rows of the "Validation results" box (#452), in its order. Every task is in exactly one. The box, the Status
 * cell, the Status filter and the Status help all use these labels and meanings. `other` holds a rejection or a last
 * run whose reason this page does not know; it is shown only when it has tasks.
 */
export type StatusKey =
  | "validated" | "no_tests" | "no_fail_to_pass" | "regressions" | "regression_skip" | "no_code"
  | "never_loaded" | "env_unsupported" | "env_error" | "not_tried" | "other";

export type ResultRow = { key: StatusKey; label: string; meaning: string };

/** The box's rows: label and the plain sentence the box and the Status help show. */
export const RESULTS: readonly ResultRow[] = [
  { key: "validated", label: "Validated", meaning: "Its tests fail before the student's change and pass after it." },
  { key: "no_tests", label: "No tests in the PR", meaning: "The PR changes no test file, so nothing can prove the change." },
  { key: "no_fail_to_pass", label: "No test proves the change", meaning: "No test fails before the student's change and passes after it." },
  { key: "regressions", label: "The change breaks other tests", meaning: "Tests that passed before the student's change fail after it." },
  { key: "regression_skip", label: "The change turns tests off", meaning: "The student's change skips tests that ran before it." },
  { key: "no_code", label: "No code in the submitted PR", meaning: "The submitted PR changes no code outside its tests, often only the task file. Staff can choose the PR that holds the code." },
  { key: "never_loaded", label: "A test file never loaded", meaning: "A test file from the PR did not load after the change, so its tests could not run. This is usually the validator's setup, not the student's work." },
  { key: "env_unsupported", label: "Repository type not supported", meaning: "The validator cannot set up and run this repository's tests yet." },
  { key: "env_error", label: "Our run failed", meaning: "Our test run failed; this says nothing about the student's work." },
  { key: "not_tried", label: "Not tried yet", meaning: "The validator has not run this task yet." },
  { key: "other", label: "Another result", meaning: "The validator gave a reason this page has no description for yet; the Status cell shows its name." },
];

const RESULT_BY_KEY = new Map(RESULTS.map((result) => [result.key, result]));

/** The result row each validator reason belongs to, for a rejection (`validation_reason:`) and a last run (`validation_attempt:`) alike. */
export const REASON_RESULT: Record<string, StatusKey> = {
  no_test_patch: "no_tests",
  no_fail_to_pass: "no_fail_to_pass",
  regressions: "regressions",
  regression_skip: "regression_skip",
  no_source_patch: "no_code",
  test_file_never_loaded: "never_loaded",
  env_unsupported: "env_unsupported",
  env_error: "env_error",
};

/** The reason a rejected row carries; "no reason recorded" when it has no reason flag. */
export function rejectionReason(flags: readonly string[]): string {
  const flag = flags.find((item) => item.startsWith(REASON_FLAG_PREFIX));
  return flag ? flag.slice(REASON_FLAG_PREFIX.length) || "no reason recorded" : "no reason recorded";
}

/** The reason of the validator's last run, from the row's attempt flag; null without one. */
export function attemptReason(flags: readonly string[]): string | null {
  const flag = flags.find((item) => item.startsWith(ATTEMPT_FLAG_PREFIX));
  return flag ? flag.slice(ATTEMPT_FLAG_PREFIX.length) || null : null;
}

/** Whether the row's flags are the "no code in PR" marker's (noCodePr.ts: task files only). */
export function isNoCode(flags: readonly string[]): boolean {
  return noCodeFromFlags(flags);
}

/**
 * Where a row's result comes from: a verdict staff wrote back (`decided`, status rejected), the validator's last run
 * on a candidate (`last_run`), the capture's own flags on a candidate (`capture`), or neither.
 */
export type ResultKind = "validated" | "decided" | "last_run" | "capture" | "none";

export type RowResult = { key: StatusKey; kind: ResultKind; reason: string | null };

/**
 * A row's result, first match wins: validated; a rejection by its reason; a candidate's last run by its reason; a
 * candidate with the "no code" marker; a candidate with the `no_test_patch` flag; else not tried yet. A decision or a
 * run comes before the capture's flags, since it is the newer word on the task.
 */
export function rowResult(row: Pick<TaskTableRow, "validationStatus" | "flags">): RowResult {
  if (row.validationStatus === "validated") return { key: "validated", kind: "validated", reason: null };
  if (row.validationStatus === "rejected") {
    const reason = rejectionReason(row.flags);
    return { key: REASON_RESULT[reason] ?? "other", kind: "decided", reason };
  }
  const attempt = attemptReason(row.flags);
  if (attempt) return { key: REASON_RESULT[attempt] ?? "other", kind: "last_run", reason: attempt };
  if (isNoCode(row.flags)) return { key: "no_code", kind: "capture", reason: null };
  if (row.flags.includes("no_test_patch")) return { key: "no_tests", kind: "capture", reason: null };
  return { key: "not_tried", kind: "none", reason: null };
}

export function statusKey(row: Pick<TaskTableRow, "validationStatus" | "flags">): StatusKey {
  return rowResult(row).key;
}

/** The result's label, as the box, the filter and the help show it. */
export function statusLabel(key: StatusKey): string {
  return RESULT_BY_KEY.get(key)?.label ?? key;
}

/** The result's plain sentence, as the Status help shows it. */
export function statusMeaning(key: StatusKey): string {
  return RESULT_BY_KEY.get(key)?.meaning ?? "";
}

/** "Our run failed" → "our run failed", for use after "Not accepted:" and "last run:". */
function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** A label for use inside a sentence; an unknown reason by its own name. */
function inlineLabel(result: RowResult): string {
  return result.key === "other" ? result.reason ?? "" : lowerFirst(statusLabel(result.key));
}

/** The Status cell's main words: the box's label, with "Not accepted:" for a decision and "No result yet · last run:" for a run. */
export function resultText(result: RowResult): string {
  if (result.kind === "decided") return TASK_TABLE_TEXT.notAccepted(inlineLabel(result));
  if (result.kind === "last_run") return TASK_TABLE_TEXT.lastRun(inlineLabel(result));
  return statusLabel(result.key);
}

/**
 * The Status heading's help: one line per result, with the box's labels and sentences, then what "Not accepted" and
 * "last run" mean. Every reason the validator writes has its row.
 */
export function statusHelpLines(): Array<{ label: string; meaning: string }> {
  return [
    ...RESULTS.map((result) => ({ label: result.label, meaning: result.meaning })),
    { label: TASK_TABLE_TEXT.notAccepted("…"), meaning: TASK_TABLE_TEXT.notAcceptedHelp },
    { label: TASK_TABLE_TEXT.lastRun("…"), meaning: TASK_TABLE_TEXT.lastRunHelp },
  ];
}

/** Where a result sorts and lists: the box's order. */
function statusRank(key: StatusKey): number {
  return RESULTS.findIndex((result) => result.key === key);
}

const KIND_RANK: Record<ResultKind, number> = { validated: 0, decided: 1, last_run: 2, capture: 3, none: 4 };

export function compareStatus(a: StatusKey, b: StatusKey): number {
  return statusRank(a) - statusRank(b);
}

export type SummaryLine = ResultRow & {
  count: number;
  /** Rejected rows: a verdict staff wrote back. */
  decided: number;
  /** Candidates whose result is the validator's last run. */
  lastRun: number;
  /** The rows, for the opened list. */
  tasks: TaskTableRow[];
};

/** Rows always shown, even with 0 tasks. */
const ALWAYS_SHOWN: readonly StatusKey[] = ["validated", "not_tried"];

/** One line per result in the box's order, a line with no tasks left out (but Validated and Not tried yet); the counts add up to the total. */
export function summarize(rows: readonly TaskTableRow[]): { lines: SummaryLine[]; total: number } {
  const lines = RESULTS.map((result): SummaryLine => ({ ...result, count: 0, decided: 0, lastRun: 0, tasks: [] }));
  const byKey = new Map(lines.map((line) => [line.key, line]));
  for (const row of rows) {
    const result = rowResult(row);
    const line = byKey.get(result.key)!;
    line.count++;
    if (result.kind === "decided") line.decided++;
    if (result.kind === "last_run") line.lastRun++;
    line.tasks.push(row);
  }
  return { lines: lines.filter((line) => line.count > 0 || ALWAYS_SHOWN.includes(line.key)), total: rows.length };
}

/** The small text under a count, only when it holds both decided and last-run tasks: "3 decided, 6 from the last run". */
export function countSplit(line: Pick<SummaryLine, "decided" | "lastRun">): string | null {
  return line.decided > 0 && line.lastRun > 0 ? TASK_TABLE_TEXT.countSplit(line.decided, line.lastRun) : null;
}

/** One line of an opened list: "Sprint 3 · Task 2 · <team> · <email>", with "(decided)" after a rejected one. */
export function taskListLine(row: Pick<TaskTableRow, "assignment" | "slot" | "team" | "email" | "validationStatus">): string {
  const line = [TASK_TABLE_TEXT.assignmentOption(row.assignment), `Task ${row.slot}`, row.team ? teamName(row.team) : "—", row.email || "—"].join(" · ");
  return row.validationStatus === "rejected" ? `${line} ${TASK_TABLE_TEXT.decided}` : line;
}

/** An opened list's rows: by sprint, task, team and email. */
export function taskListRows(tasks: readonly TaskTableRow[]): TaskTableRow[] {
  return [...tasks].sort((a, b) => a.assignment - b.assignment || a.slot - b.slot || (a.team ?? "").localeCompare(b.team ?? "") || a.email.localeCompare(b.email));
}

/** The two lines at the foot of the summary box: validated tasks whose student consented ("Yes"), and the rest. */
export function consentCounts(rows: readonly Pick<TaskTableRow, "validationStatus" | "consent">[]): { consented: number; notConsented: number } {
  const validated = rows.filter((row) => row.validationStatus === "validated");
  const consented = validated.filter((row) => row.consent === "yes").length;
  return { consented, notConsented: validated.length - consented };
}

/** The Status cell: the result's words; for a validated row, the number of proving tests. */
export function statusCell(row: TaskTableRow): { label: string; detail: string | null } {
  const result = rowResult(row);
  return { label: resultText(result), detail: result.key === "validated" ? TASK_TABLE_TEXT.provingTests(row.provingTests) : null };
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
export function gradeCell(grade: Pick<TaskGrade, "total" | "released"> | null): { text: string; unreleased: boolean } {
  if (!grade) return { text: TASK_TABLE_TEXT.notGraded, unreleased: false };
  return { text: `${formatNumber(grade.total)} / ${TASK_POINTS}`, unreleased: !grade.released };
}

/** The six "Scope: 1 / 1" lines, in rubric order, for the Final grade cell's hover text and the opened row. */
export function gradeBoxLines(grade: Pick<TaskGrade, "boxes"> | null): string[] {
  if (!grade) return [];
  return grade.boxes.map((box) => TASK_TABLE_TEXT.gradeBoxLine(box.name, box.awarded, box.points));
}

/**
 * Each rubric box's final points, as the review page's grade form reads them (draftFrom): the instructor's points for
 * a box they edited, else the AI's. `edited` and `ai` are the stored rubrics' `{ name, awarded }` entries.
 */
export function gradeBoxes(edited: ReadonlyArray<{ name: string; awarded: number | null }> | null, ai: ReadonlyArray<{ name: string; awarded: number | null }>): GradeBox[] {
  return RUBRIC.map((row) => {
    const mine = edited?.find((item) => item.name === row.name);
    const theirs = ai.find((item) => item.name === row.name);
    return { name: row.name, points: row.points, awarded: mine ? mine.awarded : theirs?.awarded ?? null };
  });
}

/** The Consent cell. */
export function consentCell(consent: ConsentValue): string {
  return consent === "yes" ? TASK_TABLE_TEXT.consentYes : consent === "no" ? TASK_TABLE_TEXT.consentNo : TASK_TABLE_TEXT.consentNotYet;
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
  for (const [prefix, kind] of [[REASON_FLAG_PREFIX, "decided"], [ATTEMPT_FLAG_PREFIX, "last_run"]] as const) {
    if (!flag.startsWith(prefix)) continue;
    const reason = flag.slice(prefix.length);
    const key = REASON_RESULT[reason];
    const meaning = key ? statusMeaning(key) : reason;
    return kind === "decided" ? `Not accepted: ${meaning}` : `Last run: ${meaning}`;
  }
  return FLAG_TEXT[flag] ?? flag;
}

// ---- Filters, search and sorting ----

export type People = "students" | "staff" | "everyone";
export type Changed = "any" | "yes" | "no";
export type ConsentFilter = "any" | ConsentValue;
export type Filters = { assignment: number | "all"; team: string | "all"; status: StatusKey | "all"; consent: ConsentFilter; changed: Changed; people: People; search: string };

export const DEFAULT_FILTERS: Filters = { assignment: "all", team: "all", status: "all", consent: "any", changed: "any", people: "students", search: "" };

/** What the table searches: the email, the team (`owner/repo`) and the task as the Task cell shows it. */
function searchText(row: TaskTableRow): string {
  return [row.email, row.team ?? "", taskCell(row).name].join("\n").toLowerCase();
}

/** The People filter alone, which the "Validation results" box follows too. */
export function matchesPeople(row: Pick<TaskTableRow, "staff">, people: People): boolean {
  return people === "everyone" || row.staff === (people === "staff");
}

export function matchesFilters(row: TaskTableRow, filters: Filters): boolean {
  if (filters.assignment !== "all" && row.assignment !== filters.assignment) return false;
  if (filters.team !== "all" && row.team !== filters.team) return false;
  if (filters.status !== "all" && statusKey(row) !== filters.status) return false;
  if (filters.consent !== "any" && row.consent !== filters.consent) return false;
  if (filters.changed !== "any" && changedByStaff(row) !== (filters.changed === "yes")) return false;
  if (!matchesPeople(row, filters.people)) return false;
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length && !words.every((word) => searchText(row).includes(word))) return false;
  return true;
}

/** "Show in the table" in a box row's list: the table shows that status, every other filter as it was. */
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

export type TaskSortKey = "assignment" | "team" | "who" | "consent" | "task" | "status" | "coverage" | "gold" | "grade" | "staffChanges" | "repo";
export type TaskSort = { key: TaskSortKey; direction: "asc" | "desc" } | null;

export const TASK_SORT_KEYS: readonly TaskSortKey[] = ["assignment", "team", "who", "consent", "task", "status", "coverage", "gold", "grade", "staffChanges", "repo"];

/** Numeric columns sort descending first, like the Submissions table's scores. */
const NUMERIC_KEYS: readonly TaskSortKey[] = ["coverage", "grade", "repo"];

export function isNumericColumn(key: TaskSortKey): boolean {
  return NUMERIC_KEYS.includes(key);
}

function sortValue(row: TaskTableRow, key: TaskSortKey): string | number | null {
  switch (key) {
    case "assignment": return row.assignment;
    case "team": return row.team ? `${teamName(row.team).toLowerCase()} ${row.team.toLowerCase()}` : null;
    case "who": return row.email.toLowerCase();
    // Yes, then No, then Not yet when ascending.
    case "consent": return row.consent === "yes" ? 0 : row.consent === "no" ? 1 : 2;
    case "task": return `${String(row.slot).padStart(2, "0")} ${taskCell(row).name.toLowerCase()}`;
    case "status": {
      // The box's order, then decided before last run before the capture's flags.
      const result = rowResult(row);
      return statusRank(result.key) * 10 + KIND_RANK[result.kind];
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

/** One Repo Metrics score, as the metrics page's score strip shows it (buildOverviewScoreStrip); null is "Not measured". */
export type ReportScore = { id: string; title: string; score: number | null };

/** What the detail route sends for one task. Never anything about consent: the list row already has its yes or no. */
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
  /** The stored coverage run (`validation_detail.fix_coverage`), as the validator wrote it; null when there is none. */
  coverage: CoverageDetail | null;
  workPrChoice: null | { prNumber: number; submittedPrNumber: number; reason: string; chosenBy: string; chosenAt: string };
  extraCodePrs: ExtraPrDetail[];
  hasReport: boolean;
  reportDate: string | null;
  /** The task's grade with each box's final points; null when it has no grade yet. */
  grade: TaskGrade | null;
  /**
   * Commit Habits, Testing, Code Quality and Code Complexity from the stored report, worked out on the server. Null
   * with no report, or when the stored report could not be scored. The report itself is never sent.
   */
  scores: ReportScore[] | null;
};

/** One changed code file of a stored coverage run. `covered` and `executable` are null when the run does not hold them. */
export type CoverageFileDetail = { path: string; state: "run" | "not_run" | "not_measured" | "no_code"; covered: number | null; executable: number | null };

/** What the opened row shows of a stored coverage run: nothing recomputed, only what the validator stored. */
export type CoverageDetail = {
  status: "measured" | "partial" | "unavailable";
  reason: string | null;
  files: CoverageFileDetail[];
  filesChanged: number;
  filesRun: number;
  linesCovered: number;
  linesExecutable: number;
};

/** One file's line in "Tests and criteria": its state in words, and its lines when the run holds them. */
export function coverageFileLine(file: CoverageFileDetail): { path: string; state: string; lines: string | null } {
  return {
    path: file.path,
    state: TASK_TABLE_TEXT.coverageFileStates[file.state],
    lines: file.covered !== null && file.executable !== null ? TASK_TABLE_TEXT.coverageLines(file.covered, file.executable) : null,
  };
}

/** The coverage block's sentences, in order, under the file list. */
export function coverageNotes(coverage: CoverageDetail | null): string[] {
  if (!coverage) return [TASK_TABLE_TEXT.coverageNotMeasured];
  const reason = coverage.reason ? [TASK_TABLE_TEXT.coverageReason(coverage.reason)] : [];
  if (coverage.status === "unavailable") return [TASK_TABLE_TEXT.coverageUnavailable, ...reason];
  const totals: string[] = [];
  if (coverage.filesChanged > 0) totals.push(TASK_TABLE_TEXT.coverageFilesTotal(coverage.filesRun, coverage.filesChanged));
  if (coverage.linesExecutable > 0) totals.push(TASK_TABLE_TEXT.coverageLinesTotal(coverage.linesCovered, coverage.linesExecutable));
  // 0 executable lines with every changed file run (or none with a runnable line): the run found nothing to measure.
  else if (coverage.filesRun === coverage.filesChanged) totals.push(TASK_TABLE_TEXT.coverageNoRunnable);
  return coverage.status === "partial" ? [...totals, TASK_TABLE_TEXT.coveragePartial, ...reason] : totals;
}

/** A score as the opened row shows it: the number, or "Not measured". */
export function scoreText(score: number | null): string {
  return score === null ? TASK_TABLE_TEXT.scoreNotMeasured : String(score);
}

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
