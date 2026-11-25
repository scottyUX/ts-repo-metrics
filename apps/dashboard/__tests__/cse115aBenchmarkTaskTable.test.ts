// #444 and #445: the staff Benchmark page's summary of validation results and its table of every current task, with
// the two staff routes behind them; #449: the Consented column and counts, Sprint wording, heading help, the two
// benchmark columns, and the opened row's grade by box and Repo Metrics scores. The database and the sign-in are fakes;
// nothing reaches GitHub or Supabase. Names, emails, repos, PR numbers, task ids and reports are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changedByStaffLines, consentCounts, consentedCell, coverageCell, DEFAULT_FILTERS, FLAG_TEXT, flagText, goldCell, gradeBoxes, gradeBoxLines, gradeCell,
  matchesFilters, nextTaskSort, REASON_FLAG_PREFIX, REASON_TEXT, repoCell, reportDateText, sortTaskRows, staffChangeLines, statusCell, statusHelpLines,
  statusKey, statusLabel, statusMeaning, summarize, TASK_SORT_KEYS, TASK_TABLE_TEXT, taskCell, visibleRows, withStatus,
  type Filters, type GradeBox, type StatusKey, type TaskDetail, type TaskGrade, type TaskTableRow,
} from "@/lib/cse115a/benchmark/taskTable";
import { buildOverviewScoreStrip } from "@/lib/buildOverviewCards";
import { CONSENT_VERSION } from "@/lib/cse115a/consent";
import { REPORT_SCORE_IDS, reportScores, TASK_TABLE_CONSENT_COLUMNS, TASK_TABLE_TABLES } from "@/lib/cse115a/benchmark/loadTaskTable";
import type { RepoReport } from "@/lib/reportTypes";
import { REASON_FLAG_PREFIX as WRITEBACK_REASON_PREFIX } from "@/lib/cse115a/benchmark/validation/writeback";
import { noCodeFromFlags } from "@/lib/cse115a/noCodePr";
import { TASK_POINTS } from "@/lib/cse115a/rubric";
import { COLUMNS, GradeSection, Header, OpenedRow, ScoresSection, StatusHelp, SummaryBox, TaskCells, TaskDetailView } from "@/components/cse115a/instructor/BenchmarkTaskTable";
import { HelpTip, HelpTipView, nextTipOpen, tipPosition, type TipEvent } from "@/components/cse115a/instructor/HelpTip";
import { GET as listGet } from "@/app/api/cse115a/instructor/courses/[slug]/benchmark/tasks/route";
import { GET as detailGet } from "@/app/api/cse115a/instructor/courses/[slug]/benchmark/tasks/[id]/route";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  guard: "staff" as "staff" | "forbidden" | "signed-out",
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  fail: new Set<string>(),
  calls: [] as Array<{ table: string; columns: string }>,
  writes: 0,
}));

/** Picks `a,b,alias:x->y->>z` from a row like PostgREST does. */
function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns.split(",")) {
    const [alias, path] = column.includes(":") ? column.split(":") as [string, string] : [column, column];
    const parts = path.split(/->>?/);
    let value: unknown = row[parts[0]!];
    for (const part of parts.slice(1)) {
      value = value === null || value === undefined ? undefined : (value as Record<string, unknown>)[/^\d+$/.test(part) ? Number(part) : part];
    }
    out[alias] = value ?? null;
  }
  return out;
}

function fakeDb() {
  return {
    from(table: string) {
      const refuse = () => { state.writes++; throw new Error("the task table routes must not write"); };
      return {
        insert: refuse, update: refuse, upsert: refuse, delete: refuse,
        select(columns: string) {
          state.calls.push({ table, columns });
          const filters: Array<(row: Record<string, unknown>) => boolean> = [];
          let window: [number, number] | null = null;
          const query = {
            eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
            is(column: string, value: null) { filters.push((row) => (row[column] ?? null) === value); return query; },
            in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return query; },
            order() { return query; },
            range(from: number, to: number) { window = [from, to]; return query; },
            then(resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) {
              if (state.fail.has(table)) return Promise.resolve({ data: null, error: { message: "down" } }).then(resolve);
              let rows = (state.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
              if (window) rows = rows.slice(window[0], window[1] + 1);
              return Promise.resolve({ data: rows.map((row) => project(row, columns)), error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => fakeDb() }));
vi.mock("@/lib/cse115a/instructorApi", async () => {
  const { NextResponse } = await import("next/server");
  return {
    guardCourse: async () => state.guard === "staff"
      ? { identity: { userId: "staff-1" }, course: { id: "course-1", slug: "CSE115A-EX", assignment_count: 5 } }
      : { response: NextResponse.json({ error: state.guard === "forbidden" ? "You are not on this course's staff." : "Sign in with UCSC Google." }, { status: state.guard === "forbidden" ? 403 : 401 }) },
  };
});

// ---- Fixtures ----

const snapshotTask = (slot: number, taskId: string, title: string, repo: string, extra: Record<string, unknown> = {}) => ({
  slot, taskId, repoFullName: repo, spec: { title }, prNumber: 9, diff: "diff --git a/x b/x\n+SECRET_DIFF\n", ...extra,
});

const CHOICE = { prNumber: 12, prUrl: "https://github.com/kettle-co/kettle-app/pull/12", chosenBy: "ta-one@ucsc.edu", chosenAt: "2026-11-20T18:00:00Z", reason: "The code was merged in PR #12.", replacedPrNumber: 9, before: { prNumber: 9, taskFilePr: null, files: ["docs/tasks/x.md"] } };
const EXTRAS = [
  { prNumber: 14, title: "More kettle code", addedBy: "ta-one@ucsc.edu", addedAt: "2026-11-21T10:00:00Z", reason: "Part of the timer.", diff: "diff --git a/y b/y\n+EXTRA_DIFF\n" },
  { prNumber: 15, title: "Timer fix", addedBy: "prof-x@ucsc.edu", addedAt: "2026-11-22T10:00:00Z", reason: "", diff: "" },
];

const BOX_NAMES = ["Scope", "Specs", "Acceptance criteria", "Test quality", "Tests pass", "Process"];
const BOX_POINTS = [1, 2, 2, 2, 2, 1];
/** The AI's stored rubric, with a rationale and quote the routes must never send. */
const aiRubric = (awarded: Array<number | null>) => BOX_NAMES.map((name, index) => ({ name, points: BOX_POINTS[index], level: null, awarded: awarded[index], rationale: "SECRET_RATIONALE", evidenceQuotes: ["SECRET_QUOTE"], needsReview: false, source: "llm" }));
/** The instructor's edited rubric, stored in a different order from the rubric's. */
const editedRubric = (awarded: number[]) => BOX_NAMES.map((name, index) => ({ name, points: BOX_POINTS[index], awarded: awarded[index], note: "SECRET_NOTE" })).reverse();

/** A made-up stored Repo Metrics report: enough for the score strip, plus a part the route must never send. */
const REPORT = {
  filesAnalyzed: 12, source: { type: "github" }, analysis_timestamp: "2026-11-12T08:00:00Z", perFile: ["BIG"],
  git: { totalCommits: 12, commitsPerWeek: 2 }, profile: { testFiles: 3 }, complexity: { highComplexityFunctions: 2 }, duplication: { percentage: 1.5 },
};

function seed() {
  state.tables = {
    cse_course_memberships: [
      { course_id: "course-1", user_id: "u-ann", ucsc_email: "ann.example@ucsc.edu" },
      { course_id: "course-1", user_id: "u-bo", ucsc_email: "bo.example@ucsc.edu" },
      { course_id: "course-1", user_id: "u-ta", ucsc_email: "ta-one@ucsc.edu" },
      { course_id: "course-2", user_id: "u-zed", ucsc_email: "zed.example@ucsc.edu" },
    ],
    cse_course_roles: [{ course_id: "course-1", email: "ta-one@ucsc.edu", role: "ta" }],
    // Ann: a yes to the current wording (counts). Bo: a yes to an older wording (does not). The TA: no answer.
    cse_research_consent: [
      { course_id: "course-1", user_id: "u-ann", consented: true, consent_version: CONSENT_VERSION },
      { course_id: "course-1", user_id: "u-bo", consented: true, consent_version: "2026-09-01" },
      { course_id: "course-2", user_id: "u-zed", consented: true, consent_version: CONSENT_VERSION },
    ],
    cse_assignment_submissions: [
      { id: "sub-ann-1", course_id: "course-1", user_id: "u-ann", assignment_number: 1, submitted_at: "2026-11-10T00:00:00Z", superseded_at: null,
        snapshot: { tasks: [
          snapshotTask(1, "US-1-T-1", "Kettle alarm", "kettle-co/kettle-app", { workPrChoice: CHOICE, taskFilePr: { number: 9, url: "u", mergeSha: "m" }, extraCodePrs: EXTRAS }),
          snapshotTask(2, "US-1-T-2", "Boil timer", "kettle-co/kettle-app"),
        ] } },
      // An older attempt, unlocked and submitted again: left out.
      { id: "sub-ann-0", course_id: "course-1", user_id: "u-ann", assignment_number: 1, submitted_at: "2026-11-01T00:00:00Z", superseded_at: "2026-11-09T00:00:00Z",
        snapshot: { tasks: [snapshotTask(1, "US-1-T-1", "Kettle alarm", "kettle-co/kettle-app")] } },
      { id: "sub-bo-2", course_id: "course-1", user_id: "u-bo", assignment_number: 2, submitted_at: "2026-11-15T00:00:00Z", superseded_at: null,
        snapshot: { tasks: [snapshotTask(1, "US-2-T-1", "Teapot API", "teapot-co/teapot"), snapshotTask(3, "US-2-T-3", "Cosy cover", "teapot-co/teapot")] } },
      { id: "sub-ta-2", course_id: "course-1", user_id: "u-ta", assignment_number: 2, submitted_at: "2026-11-16T00:00:00Z", superseded_at: null,
        snapshot: { tasks: [snapshotTask(1, "US-9-T-1", "Staff trial", "teapot-co/teapot")] } },
      { id: "sub-zed", course_id: "course-2", user_id: "u-zed", assignment_number: 1, submitted_at: "2026-11-15T00:00:00Z", superseded_at: null, snapshot: { tasks: [snapshotTask(1, "US-0-T-1", "Other course", "other/other")] } },
    ],
    cse_benchmark_task_sources: [
      { id: "src-1", course_id: "course-1", instance_id: "kettle-co__kettle-app-US-1-T-1", user_id: "u-ann", assignment_submission_id: "sub-ann-1", task_slot: 1, validation_status: "validated", flags: ["work_pr_chosen_by_staff", "extra_code_prs", "untested_files"] },
      { id: "src-2", course_id: "course-1", instance_id: "kettle-co__kettle-app-US-1-T-2", user_id: "u-ann", assignment_submission_id: "sub-ann-1", task_slot: 2, validation_status: "rejected", flags: ["validation_reason:regressions"] },
      { id: "src-old", course_id: "course-1", instance_id: "kettle-co__kettle-app-US-1-T-1", user_id: "u-ann", assignment_submission_id: "sub-ann-0", task_slot: 1, validation_status: "candidate", flags: [] },
      { id: "src-3", course_id: "course-1", instance_id: "teapot-co__teapot-US-2-T-1", user_id: "u-bo", assignment_submission_id: "sub-bo-2", task_slot: 1, validation_status: "candidate", flags: ["task_files_dropped", "no_source_patch", "no_test_patch"] },
      { id: "src-4", course_id: "course-1", instance_id: "teapot-co__teapot-US-2-T-3", user_id: "u-bo", assignment_submission_id: "sub-bo-2", task_slot: 3, validation_status: "candidate", flags: ["no_test_patch"] },
      { id: "src-5", course_id: "course-1", instance_id: "teapot-co__teapot-US-9-T-1", user_id: "u-ta", assignment_submission_id: "sub-ta-2", task_slot: 1, validation_status: "candidate", flags: ["mystery_flag"] },
      { id: "src-z", course_id: "course-2", instance_id: "other__other-US-0-T-1", user_id: "u-zed", assignment_submission_id: "sub-zed", task_slot: 1, validation_status: "validated", flags: [] },
    ],
    cse_benchmark_tasks: [
      { instance_id: "kettle-co__kettle-app-US-1-T-1", problem_statement: "# Kettle alarm\n\nThe kettle **beeps**.", patch: "diff --git a/src/kettle.ts b/src/kettle.ts\n+beep()\n".repeat(200), test_patch: "diff --git a/test/kettle.test.ts b/test/kettle.test.ts\n+it('beeps')\n",
        FAIL_TO_PASS: ["test/kettle.test.ts > beeps", "test/kettle.test.ts > stops"], PASS_TO_PASS: ["a", "b", "c"],
        validation_detail: { fix_coverage: { status: "measured", files: [], lines_covered: 9, lines_executable: 12 }, untested_files: ["src/timer.ts", "src/led.ts"], untested_files_source: "coverage", repo_source: "snapshot", validated_at: "2026-11-18T09:30:00Z" },
        harbor_env: { gold: { status: "passed" } }, repo_metrics: REPORT },
      // A stored report the score rule cannot read (a duplication share that is not a number).
      { instance_id: "kettle-co__kettle-app-US-1-T-2", problem_statement: "Boil", patch: "p", test_patch: "t", FAIL_TO_PASS: ["x"], PASS_TO_PASS: [],
        validation_detail: null, harbor_env: { gold: { status: "failed" } }, repo_metrics: { filesAnalyzed: 3, source: { type: "github" }, duplication: { percentage: "lots" } } },
      { instance_id: "teapot-co__teapot-US-2-T-1", problem_statement: "Teapot", patch: "", test_patch: "", FAIL_TO_PASS: [], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
      { instance_id: "teapot-co__teapot-US-2-T-3", problem_statement: "Cover", patch: "c", test_patch: "", FAIL_TO_PASS: [], PASS_TO_PASS: [],
        validation_detail: { fix_coverage: { status: "partial", lines_covered: 1, lines_executable: 4 }, untested_files: [] }, harbor_env: { gold: { status: "skipped" } }, repo_metrics: { filesAnalyzed: 0, source: { type: "github" }, analysis_timestamp: "2026-10-30T23:59:00Z" } },
      { instance_id: "teapot-co__teapot-US-9-T-1", problem_statement: "", patch: "s", test_patch: "t", FAIL_TO_PASS: ["s1"], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
      { instance_id: "other__other-US-0-T-1", problem_statement: "x", patch: "x", test_patch: "x", FAIL_TO_PASS: [], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
    ],
    cse_task_grades: [
      { assignment_submission_id: "sub-ann-1", task_slot: 1, agent_total: 7, instructor_total: 8.5, released_at: "2026-11-19T00:00:00Z",
        rubric: aiRubric([1, 1, 1, 1, 2, 1]), instructor_rubric: editedRubric([1, 2, 1.5, 2, 1, 1]), instructor_notes: "SECRET_NOTE" },
      { assignment_submission_id: "sub-ann-1", task_slot: 2, agent_total: "6.5", instructor_total: null, released_at: null,
        rubric: aiRubric([1, 1.5, 2, null, 1, 1]), instructor_rubric: null },
      { assignment_submission_id: "sub-ann-0", task_slot: 1, agent_total: 2, instructor_total: null, released_at: null, rubric: aiRubric([0, 0, 0, 0, 1, 1]), instructor_rubric: null },
    ],
  };
}

beforeEach(() => {
  state.guard = "staff";
  state.fail = new Set();
  state.calls = [];
  state.writes = 0;
  seed();
});

const listRequest = () => listGet(new Request("http://localhost/api/cse115a/instructor/courses/CSE115A-EX/benchmark/tasks"), { params: Promise.resolve({ slug: "CSE115A-EX" }) });
const detailRequest = (id: string) => detailGet(new Request(`http://localhost/api/cse115a/instructor/courses/CSE115A-EX/benchmark/tasks/${id}`), { params: Promise.resolve({ slug: "CSE115A-EX", id }) });

async function listRows(): Promise<TaskTableRow[]> {
  const response = await listRequest();
  expect(response.status).toBe(200);
  return (await response.json() as { rows: TaskTableRow[] }).rows;
}

async function detail(id: string): Promise<TaskDetail> {
  const response = await detailRequest(id);
  expect(response.status).toBe(200);
  return (await response.json() as { task: TaskDetail }).task;
}

/** A row with every field, for the pure tests. */
function row(patch: Partial<TaskTableRow> = {}): TaskTableRow {
  return {
    id: "r", submissionId: "s", assignment: 1, slot: 1, team: "kettle-co/kettle-app", email: "ann.example@ucsc.edu", staff: false, consented: false, taskId: "US-1-T-1", title: "Kettle alarm",
    validationStatus: "candidate", flags: [], provingTests: 0, coverage: null, untestedFiles: 0, gold: null, grade: null, extraCodePrs: 0, hasReport: false, reportDate: null,
    ...patch,
  };
}

/** Every key, at any depth, of a JSON value. */
function allKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys));
  else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { keys.push(key); allKeys(inner, keys); }
  return keys;
}

const ROW_KEYS = ["id", "submissionId", "assignment", "slot", "team", "email", "staff", "consented", "taskId", "title", "validationStatus", "flags", "provingTests", "coverage", "untestedFiles", "gold", "grade", "extraCodePrs", "hasReport", "reportDate"].sort();

/** Walks a rendered element tree (function components called, hooks-free ones only; HelpTip is not) and returns every element. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((item) => elements(item, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode };
  if (typeof node.type === "function" && node.type !== HelpTip) elements((node.type as (props: unknown) => ReactNode)(node.props), out);
  elements(props.children, out);
  return out;
}

/** Six boxes with the given points, for the pure tests. */
const boxes = (awarded: Array<number | null>): GradeBox[] => BOX_NAMES.map((name, index) => ({ name, points: BOX_POINTS[index]!, awarded: awarded[index]! }));
const grade = (total: number, released: boolean, awarded: Array<number | null> = [1, 2, 2, 2, 2, 1]): TaskGrade => ({ total, released, boxes: boxes(awarded) });

// ---- 1. Summary of validation results (#444) ----

describe("1. summary of validation results", () => {
  it("each rule gives its row, in first-match order", () => {
    expect(statusKey(row({ validationStatus: "validated", flags: ["no_test_patch", "task_files_dropped", "no_source_patch"] }))).toBe("validated");
    expect(statusKey(row({ validationStatus: "rejected", flags: ["task_files_dropped", "no_source_patch", "no_test_patch", "validation_reason:no_test_patch"] }))).toBe("rejected:no_test_patch");
    expect(statusKey(row({ validationStatus: "rejected", flags: [] }))).toBe("rejected:no reason recorded");
    // The "no code" marker comes before "no tests" (a no-code PR also has no test patch).
    expect(statusKey(row({ flags: ["task_files_dropped", "no_source_patch", "no_test_patch"] }))).toBe("no_code");
    expect(statusKey(row({ flags: ["task_files_dropped", "no_source_patch", "no_test_patch", "diff_missing"] }))).toBe("no_tests");
    expect(statusKey(row({ flags: ["no_test_patch"] }))).toBe("no_tests");
    expect(statusKey(row({ flags: ["pr_holds_two_tasks"] }))).toBe("no_result");
  });

  it("uses the same no-code rule as noCodePr.ts and the same reason prefix as write-back", () => {
    for (const flags of [["task_files_dropped", "no_source_patch", "no_test_patch"], ["task_files_dropped", "no_source_patch", "no_test_patch", "ai_tool_files_dropped"], ["no_test_patch"]]) {
      expect(statusKey(row({ flags })) === "no_code").toBe(noCodeFromFlags(flags));
    }
    expect(REASON_FLAG_PREFIX).toBe(WRITEBACK_REASON_PREFIX);
  });

  it("rows add up to the total, one line per reason, with plain words and an unknown reason by its name", () => {
    const rows = [
      row({ validationStatus: "validated" }), row({ validationStatus: "validated" }),
      row({ validationStatus: "rejected", flags: ["validation_reason:regressions"] }),
      row({ validationStatus: "rejected", flags: ["validation_reason:no_fail_to_pass"] }),
      row({ validationStatus: "rejected", flags: ["validation_reason:cosmic_rays"] }),
      row({ flags: ["task_files_dropped", "no_source_patch", "no_test_patch"] }),
      row({ flags: ["no_test_patch"] }),
      row(), row(),
    ];
    const { lines, total } = summarize(rows);
    expect(total).toBe(9);
    expect(lines.reduce((sum, line) => sum + line.count, 0)).toBe(total);
    expect(lines.map((line) => [line.label, line.count, line.meaning])).toEqual([
      ["Validated", 2, "Its tests fail before the student's change and pass after it."],
      ["Not accepted: cosmic_rays", 1, "The validator gave the reason \"cosmic_rays\", which has no description here yet."],
      ["Not accepted: no proving test", 1, "No test fails before the student's change and passes after it."],
      ["Not accepted: breaks other tests", 1, "Tests that passed before the student's change fail after it."],
      ["No code in the PR", 1, "The PR holds only the task file. Staff can choose the PR that holds the code."],
      ["No tests in the PR", 1, "The PR changes code but no test file."],
      ["No result yet", 2, "Not run by the validator yet, or the run could not finish."],
    ]);
  });

  it("leaves older attempts out: the route's rows are current attempts only", async () => {
    const rows = await listRows();
    expect(rows.map((item) => item.id).sort()).toEqual(["src-1", "src-2", "src-3", "src-4", "src-5"]);
    expect(rows.some((item) => item.id === "src-old")).toBe(false);
    expect(summarize(rows).total).toBe(5);
    expect(TASK_TABLE_TEXT.summaryNote).toContain("Current attempts only");
  });

  it("a click on a summary row sets the table's status filter and keeps the others", () => {
    const filters: Filters = { ...DEFAULT_FILTERS, team: "kettle-co/kettle-app", search: "ann" };
    expect(withStatus(filters, "no_code")).toEqual({ ...filters, status: "no_code" });
    const picked: string[] = [];
    const rows = [row({ validationStatus: "validated" }), row({ flags: ["no_test_patch"] })];
    const buttons = elements(SummaryBox({ rows, selected: "all", onPick: (key) => picked.push(key) })).filter((element) => element.type === "button");
    expect(buttons).toHaveLength(2);
    (buttons[1]!.props as { onClick: () => void }).onClick();
    expect(picked).toEqual(["no_tests"]);
    const next = withStatus(DEFAULT_FILTERS, picked[0] as "no_tests");
    expect(visibleRows(rows, next, null)).toEqual([rows[1]]);
  });

  it("renders the box with counts, meanings and the total", () => {
    const markup = renderToStaticMarkup(createElement(SummaryBox, { rows: [row({ validationStatus: "validated" }), row()], selected: "validated", onPick: () => {} }));
    expect(markup).toContain("Validation results");
    expect(markup).toContain("Not run by the validator yet, or the run could not finish.");
    expect(markup).toContain("Total: 2 tasks");
    expect(markup).toContain("aria-pressed=\"true\"");
  });

  it("the tiles stay and the panel says they count older attempts too", () => {
    const panel = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkPanel.tsx"), "utf8");
    expect(panel).toContain("[\"Captured tasks\", counts.sources], [\"Unique instances\", counts.instances], [\"Consented\", counts.consented]");
    expect(panel).toContain("{TASK_TABLE_TEXT.tilesNote}");
    expect(TASK_TABLE_TEXT.tilesNote).toBe("The tiles above count every captured task, older attempts included. The results and the table below count current attempts only.");
  });
});

// ---- 2. The table (#445) ----

describe("2. table rows from the list route", () => {
  it("one row per current task across assignments, with team, student, staff tag, task and grade", async () => {
    const rows = await listRows();
    const byId = new Map(rows.map((item) => [item.id, item]));
    expect(new Set(rows.map((item) => item.assignment))).toEqual(new Set([1, 2]));
    const one = byId.get("src-1")!;
    expect(one).toMatchObject({ submissionId: "sub-ann-1", assignment: 1, slot: 1, team: "kettle-co/kettle-app", email: "ann.example@ucsc.edu", staff: false, taskId: "US-1-T-1", title: "Kettle alarm",
      validationStatus: "validated", provingTests: 2, coverage: { status: "measured", covered: 9, executable: 12 }, untestedFiles: 2, gold: "passed", grade: { total: 8.5, released: true }, extraCodePrs: 2, hasReport: true, reportDate: "2026-11-12T08:00:00Z" });
    // The instructor's points per box, read by name though stored in another order.
    expect(one.grade!.boxes).toEqual(boxes([1, 2, 1.5, 2, 1, 1]));
    expect(byId.get("src-2")).toMatchObject({ grade: { total: 6.5, released: false }, gold: "failed", coverage: null, hasReport: true, reportDate: null });
    expect(byId.get("src-2")!.grade!.boxes).toEqual(boxes([1, 1.5, 2, null, 1, 1]));
    expect(byId.get("src-3")).toMatchObject({ grade: null, hasReport: false, gold: null, team: "teapot-co/teapot" });
    // Task 3 sits at the snapshot's second position: matched by slot, not by position.
    expect(byId.get("src-4")).toMatchObject({ slot: 3, taskId: "US-2-T-3", title: "Cosy cover", gold: "skipped", coverage: { status: "partial", covered: 1, executable: 4 } });
    expect(byId.get("src-5")).toMatchObject({ email: "ta-one@ucsc.edu", staff: true });
  });

  it("holds no spec, no patch and no diff, and of consent only each row's yes or no; a new field fails this test", async () => {
    const response = await listRequest();
    const raw = await response.text();
    const body = JSON.parse(raw) as { rows: TaskTableRow[] };
    expect(Object.keys(body)).toEqual(["rows"]);
    for (const item of body.rows) expect(Object.keys(item).sort()).toEqual(ROW_KEYS);
    const keys = allKeys(body);
    // #449: `consented` is the one consent field (a boolean); never the answer, its version or its date.
    for (const key of keys) expect(key).not.toMatch(/consent_version|consentVersion|problem_statement|^patch$|test_patch|testPatch|exportable|download|rationale|note/i);
    for (const item of body.rows) expect(typeof item.consented).toBe("boolean");
    expect(keys.filter((key) => /consent/i.test(key)).every((key) => key === "consented")).toBe(true);
    for (const text of ["SECRET_DIFF", "EXTRA_DIFF", "beep()", "The kettle **beeps**", "BIG", "SECRET_RATIONALE", "SECRET_QUOTE", "SECRET_NOTE", "2026-09-01"]) expect(raw).not.toContain(text);
    // Reads consent once, three columns only, for this course; never selects the spec or the patches or the whole report.
    const consentCalls = state.calls.filter((call) => call.table === "cse_research_consent");
    expect(consentCalls.map((call) => call.columns)).toEqual(["user_id,consented,consent_version"]);
    expect(TASK_TABLE_CONSENT_COLUMNS).toBe("user_id,consented,consent_version");
    expect(TASK_TABLE_TABLES).toContain("cse_research_consent");
    expect(new Set(state.calls.map((call) => call.table))).toEqual(new Set(TASK_TABLE_TABLES));
    for (const call of state.calls) {
      for (const column of call.columns.split(",")) expect(column).not.toMatch(/^(problem_statement|patch|test_patch|repo_metrics|snapshot|validation_detail|harbor_env|rubric|instructor_rubric|instructor_notes)$/);
      expect(call.columns).not.toMatch(/->>?diff\b/);
    }
    expect(state.writes).toBe(0);
  });

  it("refuses a signed-in student and a signed-out visitor", async () => {
    state.guard = "forbidden";
    expect((await listRequest()).status).toBe(403);
    expect((await detailRequest("src-1")).status).toBe(403);
    state.guard = "signed-out";
    expect((await listRequest()).status).toBe(401);
    expect((await detailRequest("src-1")).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("a read error is a 500 with a message", async () => {
    state.fail.add("cse_task_grades");
    const response = await listRequest();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not load the tasks." });
  });
});

describe("2. each column's wording", () => {
  it("Status: validated with its proving tests, each candidate kind, rejected", () => {
    expect(statusCell(row({ validationStatus: "validated", provingTests: 3 }))).toEqual({ label: "Validated", detail: "3 proving tests" });
    expect(statusCell(row({ validationStatus: "validated", provingTests: 1 }))).toEqual({ label: "Validated", detail: "1 proving test" });
    expect(statusCell(row({ flags: ["task_files_dropped", "no_source_patch", "no_test_patch"] })).label).toBe("No code in the PR");
    expect(statusCell(row({ flags: ["no_test_patch"] })).label).toBe("No tests in the PR");
    expect(statusCell(row()).label).toBe("No result yet");
    expect(statusCell(row({ validationStatus: "rejected", flags: ["validation_reason:env_unsupported"] }))).toEqual({ label: "Not accepted: repository not supported", detail: null });
  });

  it("Coverage: measured, partly measured, not measured, and untested files", () => {
    expect(coverageCell(row({ coverage: { status: "measured", covered: 9, executable: 12 } }))).toEqual({ main: "75%", detail: "9 of 12 changed lines", untested: null });
    expect(coverageCell(row({ coverage: { status: "partial", covered: 1, executable: 4 }, untestedFiles: 1 }))).toEqual({ main: "25%", detail: "1 of 4 changed lines, partly measured", untested: "1 untested file" });
    expect(coverageCell(row({ coverage: null, untestedFiles: 2 }))).toEqual({ main: "Not measured", detail: null, untested: "2 untested files" });
    expect(coverageCell(row({ coverage: { status: "unavailable", covered: 0, executable: 0 } })).main).toBe("Not measured");
    expect(coverageCell(row({ coverage: { status: "measured", covered: 0, executable: 0 } })).main).toBe("No runnable changed lines");
  });

  it("Gold check: passed, failed, not run", () => {
    expect([goldCell("passed"), goldCell("failed"), goldCell("skipped"), goldCell(null)]).toEqual(["Passed", "Failed", "Not run", "Not run"]);
  });

  it("Final grade: graded, ungraded, unreleased", () => {
    expect(gradeCell(grade(8.5, true))).toEqual({ text: `8.5 / ${TASK_POINTS}`, unreleased: false });
    expect(gradeCell({ total: 6.5, released: false })).toEqual({ text: `6.5 / ${TASK_POINTS}`, unreleased: true });
    expect(gradeCell(null)).toEqual({ text: "Not graded yet", unreleased: false });
  });

  it("Staff changes: code PR chosen by staff, extra code PRs, both, none", () => {
    expect(staffChangeLines(row({ flags: ["work_pr_chosen_by_staff"] }))).toEqual(["Code PR chosen by staff"]);
    expect(staffChangeLines(row({ flags: ["extra_code_prs"], extraCodePrs: 2 }))).toEqual(["2 extra code PRs"]);
    expect(staffChangeLines(row({ flags: ["extra_code_prs"], extraCodePrs: 1 }))).toEqual(["1 extra code PR"]);
    expect(staffChangeLines(row({ flags: ["work_pr_chosen_by_staff", "extra_code_prs"], extraCodePrs: 2 }))).toEqual(["Code PR chosen by staff", "2 extra code PRs"]);
    expect(staffChangeLines(row())).toEqual([]);
  });

  it("Repo: the report's own date, date unknown, no report", () => {
    expect(repoCell(row({ hasReport: true, reportDate: "2026-11-12T08:00:00Z" }))).toEqual({ text: "Report", date: "as of Nov 12" });
    expect(repoCell(row({ hasReport: true, reportDate: null }))).toEqual({ text: "Report", date: "date unknown" });
    expect(reportDateText("not a date")).toBe("date unknown");
    expect(repoCell(row({ hasReport: false }))).toEqual({ text: "No report", date: null });
  });

  it("Task: the slot and the task as the review page names it", () => {
    expect(taskCell(row({ slot: 2, taskId: "US-1-T-2", title: "Boil timer" }))).toEqual({ slot: "Task 2", name: "US-1-T-2 · Boil timer" });
    expect(taskCell(row({ taskId: "US-1-T-2", title: null })).name).toBe("US-1-T-2");
  });

  it("renders a row's cells: staff tag, team link, consented, not released tag, the two empty columns", async () => {
    const rows = await listRows();
    const table = (item: TaskTableRow) => renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement(TaskCells, { row: item })))));
    const ann = table(rows.find((item) => item.id === "src-1")!);
    expect(ann).toContain("href=\"https://github.com/kettle-co/kettle-app\"");
    expect(ann).toContain("Validated");
    expect(ann).toContain("2 proving tests");
    expect(ann).toContain("75%");
    expect(ann).toContain("2 untested files");
    expect(ann).toContain("8.5 / 10");
    expect(ann).toContain("Code PR chosen by staff");
    expect(ann).toContain("2 extra code PRs");
    expect(ann).toContain("as of Nov 12");
    expect(ann).not.toContain(">Staff<");
    const ungraded = table(rows.find((item) => item.id === "src-2")!);
    expect(ungraded).toContain("not released");
    expect(ungraded).toContain("date unknown");
    expect(table(rows.find((item) => item.id === "src-5")!)).toContain(">Staff<");
    expect(table(rows.find((item) => item.id === "src-3")!)).toContain("Not graded yet");
    // Cells in column order: the Consented cell is fourth, after Student; the two benchmark cells read "Not set".
    const cells = (markup: string) => markup.split("<td").slice(1).map((cell) => cell.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "").replace(/<\/td>[\s\S]*/, ""));
    const annCells = cells(ann);
    expect(annCells).toHaveLength(COLUMNS.length);
    expect(annCells[3]).toBe("Yes");
    expect(annCells[9]).toBe("Not set");
    expect(annCells[10]).toBe("Not set");
    expect(cells(table(rows.find((item) => item.id === "src-3")!))[3]).toBe("No");
    // The Team cell stays on one line.
    expect(ann).toMatch(/<td class="whitespace-nowrap px-3 py-3"><a href="https:\/\/github.com\/kettle-co\/kettle-app"/);
  });

  it("the panel has no Newest rows; downloads and the consent line are unchanged", () => {
    const panel = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkPanel.tsx"), "utf8");
    expect(panel).not.toContain("Newest rows");
    expect(panel).not.toContain("no consent");
    expect(panel).not.toContain("row.consented");
    expect(panel).toContain(">Download JSONL</a>");
    expect(panel).toContain(">Validated only</a>");
    expect(panel).toContain(">Download Harbor tasks (.zip)</a>");
    expect(panel).toContain("consentTotalsLine(consentTotals)");
    const route = readFileSync(path.resolve(__dirname, "../app/api/cse115a/instructor/courses/[slug]/benchmark/route.ts"), "utf8");
    expect(route).not.toContain("preview");
  });
});

describe("2. filters, search, sorting and the Showing line", () => {
  const rows = [
    row({ id: "a", assignment: 1, team: "kettle-co/kettle-app", email: "ann.example@ucsc.edu", consented: true, title: "Kettle alarm", validationStatus: "validated", grade: grade(9, true), coverage: { status: "measured", covered: 1, executable: 2 }, gold: "passed", hasReport: true, reportDate: "2026-11-12T00:00:00Z" }),
    row({ id: "b", assignment: 2, team: "teapot-co/teapot", email: "bo.example@ucsc.edu", taskId: "US-2-T-1", title: "Teapot API", flags: ["work_pr_chosen_by_staff"], grade: grade(6, false), gold: "failed", hasReport: true, reportDate: null }),
    row({ id: "c", assignment: 2, team: "teapot-co/teapot", email: "ta-one@ucsc.edu", staff: true, title: "Staff trial", flags: ["no_test_patch"], coverage: { status: "measured", covered: 4, executable: 4 }, hasReport: true, reportDate: "2026-11-20T00:00:00Z" }),
    row({ id: "d", assignment: 1, team: "kettle-co/kettle-app", email: "cy.example@ucsc.edu", consented: true, title: "Boil timer", flags: ["extra_code_prs"], extraCodePrs: 1, validationStatus: "rejected" }),
  ];
  const ids = (filters: Partial<Filters>, sort: Parameters<typeof visibleRows>[2] = null) => visibleRows(rows, { ...DEFAULT_FILTERS, ...filters }, sort).map((item) => item.id);

  it("defaults to students only; staff only and everyone", () => {
    expect(ids({})).toEqual(["a", "b", "d"]);
    expect(ids({ people: "staff" })).toEqual(["c"]);
    expect(ids({ people: "everyone" })).toEqual(["a", "b", "c", "d"]);
  });

  it("assignment, team, status and changed by staff", () => {
    expect(ids({ assignment: 2, people: "everyone" })).toEqual(["b", "c"]);
    expect(ids({ team: "kettle-co/kettle-app" })).toEqual(["a", "d"]);
    expect(ids({ status: "validated" })).toEqual(["a"]);
    expect(ids({ status: "no_tests", people: "everyone" })).toEqual(["c"]);
    expect(ids({ changed: "yes" })).toEqual(["b", "d"]);
    expect(ids({ changed: "no" })).toEqual(["a"]);
  });

  it("search covers email, team and task title, any case, every word", () => {
    expect(ids({ search: "BO.example" })).toEqual(["b"]);
    expect(ids({ search: "kettle-co" })).toEqual(["a", "d"]);
    expect(ids({ search: "teapot api" })).toEqual(["b"]);
    expect(ids({ search: "boil" })).toEqual(["d"]);
    expect(ids({ search: "nothing-matches" })).toEqual([]);
  });

  it("the grade is not a filter: no filter reads it", () => {
    expect(Object.keys(DEFAULT_FILTERS).sort()).toEqual(["assignment", "changed", "consented", "people", "search", "status", "team"]);
    expect(matchesFilters(row({ grade: grade(0, false) }), DEFAULT_FILTERS)).toBe(true);
    expect(statusKey(row({ grade: grade(10, true) }))).toBe("no_result");
  });

  it("every column sorts; no value goes last both ways; three clicks go back", () => {
    for (const key of TASK_SORT_KEYS) {
      const sorted = sortTaskRows(rows, { key, direction: "asc" });
      expect(sorted).toHaveLength(rows.length);
    }
    expect(ids({ people: "everyone" }, { key: "grade", direction: "desc" })).toEqual(["a", "b", "c", "d"]);
    expect(ids({ people: "everyone" }, { key: "grade", direction: "asc" })).toEqual(["b", "a", "c", "d"]);
    expect(ids({ people: "everyone" }, { key: "coverage", direction: "desc" })).toEqual(["c", "a", "b", "d"]);
    expect(ids({ people: "everyone" }, { key: "repo", direction: "desc" })).toEqual(["c", "a", "b", "d"]);
    expect(ids({ people: "everyone" }, { key: "student", direction: "asc" })).toEqual(["a", "b", "d", "c"]);
    expect(ids({ people: "everyone" }, { key: "status", direction: "asc" })).toEqual(["a", "d", "c", "b"]);
    expect(ids({ people: "everyone" }, { key: "gold", direction: "asc" })).toEqual(["a", "b", "c", "d"]);
    expect(ids({ people: "everyone" }, { key: "staffChanges", direction: "asc" })).toEqual(["d", "b", "a", "c"]);
    expect(ids({ people: "everyone" }, { key: "assignment", direction: "desc" })).toEqual(["b", "c", "a", "d"]);
    expect(nextTaskSort(null, "student")).toEqual({ key: "student", direction: "asc" });
    expect(nextTaskSort({ key: "student", direction: "asc" }, "student")).toEqual({ key: "student", direction: "desc" });
    expect(nextTaskSort({ key: "student", direction: "desc" }, "student")).toBeNull();
    expect(nextTaskSort(null, "grade")).toEqual({ key: "grade", direction: "desc" });
  });

  it("the Showing line counts shown of all", () => {
    expect(TASK_TABLE_TEXT.showing(34, 141)).toBe("Showing 34 of 141 tasks");
    expect(TASK_TABLE_TEXT.showing(ids({}).length, rows.length)).toBe("Showing 3 of 4 tasks");
  });
});

// ---- 3. Opening a row ----

describe("3. opening a row", () => {
  it("the detail route returns the spec and both patches whole, the tests, flags, validation and staff changes", async () => {
    const task = await detail("src-1");
    const stored = state.tables.cse_benchmark_tasks![0]!;
    expect(task.problemStatement).toBe(stored.problem_statement);
    expect(task.patch).toBe(stored.patch);
    expect(task.patch.length).toBeGreaterThan(1500);
    expect(task.testPatch).toBe(stored.test_patch);
    expect(task.failToPass).toEqual(["test/kettle.test.ts > beeps", "test/kettle.test.ts > stops"]);
    expect(task.passToPass).toBe(3);
    expect(task.validation).toEqual({ validatedAt: "2026-11-18T09:30:00Z", repoSource: "snapshot", untestedFiles: ["src/timer.ts", "src/led.ts"] });
    expect(task.workPrChoice).toEqual({ prNumber: 12, submittedPrNumber: 9, reason: "The code was merged in PR #12.", chosenBy: "ta-one@ucsc.edu", chosenAt: "2026-11-20T18:00:00Z" });
    expect(task.extraCodePrs).toEqual([
      { prNumber: 14, reason: "Part of the timer.", addedBy: "ta-one@ucsc.edu", addedAt: "2026-11-21T10:00:00Z" },
      { prNumber: 15, reason: "", addedBy: "prof-x@ucsc.edu", addedAt: "2026-11-22T10:00:00Z" },
    ]);
    expect(task).toMatchObject({ hasReport: true, reportDate: "2026-11-12T08:00:00Z", submissionId: "sub-ann-1", slot: 1 });
    expect(allKeys(task).some((key) => /consent/i.test(key))).toBe(false);
    expect(JSON.stringify(task)).not.toMatch(/SECRET_DIFF|EXTRA_DIFF/);
    expect(state.calls.some((call) => call.table === "cse_research_consent")).toBe(false);
    expect(state.writes).toBe(0);
  });

  it("only a task of this course and only an existing one", async () => {
    expect((await detailRequest("src-z")).status).toBe(404);
    expect((await detailRequest("nope")).status).toBe(404);
    state.fail.add("cse_benchmark_tasks");
    expect((await detailRequest("src-1")).status).toBe(500);
  });

  const render = (task: TaskDetail, raw = false) => renderToStaticMarkup(createElement(TaskDetailView, { detail: task, raw }));

  it("shows the spec formatted and raw, both patches whole with Copy, the proving tests and the still-passing count", async () => {
    const task = await detail("src-1");
    const formatted = render(task);
    expect(formatted).toContain("<strong>beeps</strong>");
    expect(formatted).toContain(">Formatted</button>");
    const raw = render(task, true);
    expect(raw).toContain("The kettle **beeps**.");
    expect(raw).toContain("aria-pressed=\"true\"");
    expect(formatted).toContain("aria-label=\"Copy the whole code patch\"");
    expect(formatted).toContain("aria-label=\"Copy the whole test patch\"");
    expect(formatted).toContain("aria-label=\"Copy the task spec&#x27;s markdown\"");
    expect(formatted.split("+beep()").length - 1).toBe(200);
    expect(formatted).toContain("Proving tests (2)");
    expect(formatted).toContain("test/kettle.test.ts &gt; stops");
    expect(formatted).toContain("3 tests still pass after the change.");
    expect(formatted).toContain("Validated on Nov 18, 2026.");
    expect(formatted).toContain("The validator read the repository from the stored copy.");
    expect(formatted).toContain("src/timer.ts");
    expect(formatted).not.toContain(TASK_TABLE_TEXT.provingGuess);
  });

  it("a candidate's tests are marked as not yet proven", async () => {
    const markup = render(await detail("src-5"));
    expect(markup).toContain(TASK_TABLE_TEXT.provingGuess);
    expect(markup).toContain("This task has no spec.");
    expect(markup).not.toContain("Validated on");
  });

  it("flags in plain words; an unknown flag shows its name", async () => {
    expect(flagText("no_test_patch")).toBe("The PR changes no test file.");
    expect(flagText("validation_reason:regressions")).toBe("Not accepted: Tests that passed before the student's change fail after it.");
    expect(flagText("validation_reason:cosmic_rays")).toBe("Not accepted: cosmic_rays");
    expect(flagText("mystery_flag")).toBe("mystery_flag");
    const flags: string[] = ["base_commit_from_pr_base", "base_commit_from_first_commit", "base_commit_from_merge_base", "diff_from_merge_commit", "task_file_not_first", "task_files_dropped", "diff_missing", "diff_truncated", "no_test_patch", "no_source_patch", "no_tests_found", "pii_scrubbed_from_patch", "ai_tool_files_dropped", "pr_holds_two_tasks", "task_file_from_other_pr", "recaptured_same_patch", "work_pr_chosen_by_staff", "extra_code_prs", "proof_outside_test_patch", "untested_files", "harbor_gold_failed", "staff_rebuilt:merge-parent"];
    for (const flag of flags) expect(FLAG_TEXT[flag], flag).toBeTruthy();
    expect(render(await detail("src-5"))).toContain(">mystery_flag</li>");
    expect(render(await detail("src-1"))).toContain("Some changed code files are not run by the proving tests.");
  });

  it("both links, the report's date beside its link, and No report", async () => {
    const markup = render(await detail("src-1"));
    expect(markup).toContain("href=\"/cse115a/instructor/submissions/sub-ann-1\"");
    expect(markup).toContain(">Open the review page</a>");
    expect(markup).toContain("href=\"/cse115a/instructor/submissions/sub-ann-1/tasks/1/metrics\"");
    expect(markup).toContain(">Open the Repo Metrics report</a>");
    expect(markup).toContain("as of Nov 12");
    expect(render(await detail("src-2"))).toContain("date unknown");
    const none = render(await detail("src-3"));
    expect(none).toContain("No report");
    expect(none).not.toContain("Open the Repo Metrics report");
  });

  it("a failed load shows a message in the row; loading says so", () => {
    expect(renderToStaticMarkup(createElement(OpenedRow, { opened: { status: "failed", message: "Request failed (500)." }, raw: false, onRaw: () => {} })))
      .toContain("This task could not be loaded: Request failed (500).");
    expect(renderToStaticMarkup(createElement(OpenedRow, { opened: { status: "loading" }, raw: false, onRaw: () => {} }))).toContain("Loading the task…");
  });

  it("one request per open: the component asks the detail route only in toggle, once per row", () => {
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(component.match(/fetchJson</g)).toHaveLength(2);
    expect(component).toContain("if (opened[id]?.status === \"loaded\") return;");
  });

  const base: TaskDetail = {
    id: "x", submissionId: "sub-x", slot: 1, validationStatus: "candidate", flags: [], problemStatement: "Spec", patch: "p", testPatch: "t", failToPass: [], passToPass: 0,
    validation: null, workPrChoice: null, extraCodePrs: [], hasReport: true, reportDate: "2026-11-12T00:00:00Z", grade: null, scores: null,
  };
  const choice = { prNumber: 12, submittedPrNumber: 9, reason: "Code is in #12.", chosenBy: "ta-one@ucsc.edu", chosenAt: "2026-11-20T18:00:00Z" };
  const extras = [{ prNumber: 14, reason: "Timer part.", addedBy: "ta-one@ucsc.edu", addedAt: "2026-11-21T10:00:00Z" }];

  it("Changed by staff: a chosen PR", () => {
    expect(changedByStaffLines({ workPrChoice: choice, extraCodePrs: [] })).toEqual([
      { kind: "chosen", lines: ["Staff chose PR #12 for this task's code. The submitted PR #9 is kept as the task-file PR.", "Reason: Code is in #12.", "By ta-one@ucsc.edu on Nov 20, 2026."] },
    ]);
    const markup = render({ ...base, workPrChoice: choice });
    expect(markup).toContain("Changed by staff");
    expect(markup).toContain("This report is from the original submission, before the staff change.");
    expect(markup).not.toContain("The benchmark row is built from the main PR only.");
  });

  it("Changed by staff: extra PRs", () => {
    expect(changedByStaffLines({ workPrChoice: null, extraCodePrs: extras })).toEqual([
      { kind: "extra", lines: ["Staff added PR #14 as more of this task's code.", "Reason: Timer part.", "By ta-one@ucsc.edu on Nov 21, 2026."] },
      { kind: "note", lines: ["The benchmark row is built from the main PR only."] },
    ]);
    const markup = render({ ...base, extraCodePrs: extras });
    expect(markup).toContain("Staff added PR #14 as more of this task&#x27;s code.");
    expect(markup).toContain("The benchmark row is built from the main PR only.");
    expect(markup).toContain("This report is from the original submission, before the staff change.");
  });

  it("Changed by staff: both, from the route", async () => {
    const markup = render(await detail("src-1"));
    expect(markup).toContain("Staff chose PR #12 for this task&#x27;s code. The submitted PR #9 is kept as the task-file PR.");
    expect(markup).toContain("Staff added PR #14 as more of this task&#x27;s code.");
    expect(markup).toContain("Staff added PR #15 as more of this task&#x27;s code.");
    expect(markup).toContain("Reason: none given");
    expect(markup).toContain("By prof-x@ucsc.edu on Nov 22, 2026.");
    expect(markup).toContain("The benchmark row is built from the main PR only.");
    expect(markup).toContain("This report is from the original submission, before the staff change.");
  });

  it("an unchanged task has no Changed by staff block and no report note", () => {
    const markup = render(base);
    expect(markup).not.toContain("Changed by staff");
    expect(markup).not.toContain("before the staff change");
  });
});

// ---- 4. Polish (#449) ----

describe("4. Consented column and counts (#449)", () => {
  const consentFor = (answer: Record<string, unknown> | null) => {
    state.tables.cse_research_consent = answer ? [{ course_id: "course-1", user_id: "u-ann", ...answer }] : [];
  };
  const annRow = async () => (await listRows()).find((item) => item.id === "src-1")!;

  it("Yes only for a yes to the current, approved wording; No for a no, no answer, or a yes to an older wording", async () => {
    consentFor({ consented: true, consent_version: CONSENT_VERSION });
    expect((await annRow()).consented).toBe(true);
    consentFor({ consented: false, consent_version: CONSENT_VERSION });
    expect((await annRow()).consented).toBe(false);
    consentFor(null);
    expect((await annRow()).consented).toBe(false);
    consentFor({ consented: true, consent_version: "2026-09-01" });
    expect((await annRow()).consented).toBe(false);
    // Another course's yes does not count here.
    state.tables.cse_research_consent = [{ course_id: "course-2", user_id: "u-ann", consented: true, consent_version: CONSENT_VERSION }];
    expect((await annRow()).consented).toBe(false);
  });

  it("from the seeded route: Ann (current yes) Yes, Bo (older wording) No, the TA (no answer) No", async () => {
    const rows = await listRows();
    const by = (id: string) => rows.find((item) => item.id === id)!.consented;
    expect([by("src-1"), by("src-2"), by("src-3"), by("src-4"), by("src-5")]).toEqual([true, true, false, false, false]);
    expect([consentedCell(true), consentedCell(false)]).toEqual(["Yes", "No"]);
  });

  it("the Consented filter: Any, Yes, No", () => {
    const rows = [row({ id: "y", consented: true }), row({ id: "n", consented: false })];
    const ids = (consented: Filters["consented"]) => visibleRows(rows, { ...DEFAULT_FILTERS, consented }, null).map((item) => item.id);
    expect(ids("any")).toEqual(["y", "n"]);
    expect(ids("yes")).toEqual(["y"]);
    expect(ids("no")).toEqual(["n"]);
    expect([TASK_TABLE_TEXT.consentedLabel, TASK_TABLE_TEXT.consentedAny, TASK_TABLE_TEXT.consentedYes, TASK_TABLE_TEXT.consentedNo]).toEqual(["Consented", "Any", "Yes", "No"]);
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(component).toContain("<select value={filters.consented} onChange={(event) => set({ consented: event.target.value as Consented })}");
  });

  it("the Consented column sorts: Yes first ascending, No first descending, ties keep the server's order", () => {
    const rows = [row({ id: "n1" }), row({ id: "y1", consented: true }), row({ id: "n2" }), row({ id: "y2", consented: true })];
    expect(TASK_SORT_KEYS).toContain("consented");
    expect(nextTaskSort(null, "consented")).toEqual({ key: "consented", direction: "asc" });
    expect(sortTaskRows(rows, { key: "consented", direction: "asc" }).map((item) => item.id)).toEqual(["y1", "y2", "n1", "n2"]);
    expect(sortTaskRows(rows, { key: "consented", direction: "desc" }).map((item) => item.id)).toEqual(["n1", "n2", "y1", "y2"]);
  });

  it("the column follows Student, its heading sorts", () => {
    expect(COLUMNS.map((column) => column.label)).toEqual([
      "Sprint", "Team", "Student", "Consented", "Task", "Status", "Coverage (experimental)", "Gold check", "Final grade",
      "Benchmark grade", "Benchmark include", "Staff changes", "Repo",
    ]);
    expect(COLUMNS.find((column) => column.id === "consented")!.sort).toBe("consented");
  });

  it("two lines at the foot of the summary box, apart from the total, which they do not change", () => {
    const rows = [
      row({ validationStatus: "validated", consented: true }), row({ validationStatus: "validated", consented: true }),
      row({ validationStatus: "validated", consented: false }), row({ consented: true }), row({ validationStatus: "rejected", consented: true, flags: ["validation_reason:regressions"] }),
    ];
    expect(consentCounts(rows)).toEqual({ consented: 2, notConsented: 1 });
    const { lines, total } = summarize(rows);
    expect(total).toBe(5);
    expect(lines.reduce((sum, line) => sum + line.count, 0)).toBe(5);
    // Without consent on any row, the box's lines and total are the same.
    expect(summarize(rows.map((item) => ({ ...item, consented: false })))).toEqual({ lines, total });
    const markup = renderToStaticMarkup(createElement(SummaryBox, { rows, selected: "all", onPick: () => {} }));
    expect(markup).toContain("Total: 5 tasks");
    expect(markup).toContain("<p>Validated and consented: 2</p>");
    expect(markup).toContain("<p>Validated, not consented: 1</p>");
    expect(markup).toContain("A download holds a validated task only when its student consented.");
    expect(markup.indexOf("Total: 5 tasks")).toBeLessThan(markup.indexOf("Validated and consented"));
    // The two lines are not buttons: clicking the box's lines is unchanged.
    const buttons = elements(SummaryBox({ rows, selected: "all", onPick: () => {} })).filter((element) => element.type === "button");
    expect(buttons).toHaveLength(lines.length);
  });

  it("the download tests' rule is the same one: countsAsConsent, imported, not copied", () => {
    const loader = readFileSync(path.resolve(__dirname, "../lib/cse115a/benchmark/loadTaskTable.ts"), "utf8");
    expect(loader).toContain("import { countsAsConsent } from \"@/lib/cse115a/consent\";");
    expect(loader).not.toContain("CONSENT_VERSION");
  });
});

describe("4. wording: Sprint, Coverage (experimental), the line under Tasks (#449)", () => {
  it("Sprint in the heading and the filter; the Submissions page keeps Assignment", () => {
    expect(TASK_TABLE_TEXT.columns.assignment).toBe("Sprint");
    expect([TASK_TABLE_TEXT.assignmentLabel, TASK_TABLE_TEXT.allAssignments, TASK_TABLE_TEXT.assignmentOption(3)]).toEqual(["Sprint", "All sprints", "Sprint 3"]);
    expect(TASK_TABLE_TEXT.columns.coverage).toBe("Coverage (experimental)");
    const submissions = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/InstructorHome.tsx"), "utf8");
    expect(submissions).not.toContain("All sprints");
  });

  it("the line under the Tasks heading", () => {
    expect(TASK_TABLE_TEXT.tableIntro).toBe("This table joins each benchmark task to its grade and its validation result. The grade, coverage and gold check are shown here only and are not in the downloads.");
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(component).toContain("<h2 className=\"font-semibold\">{T.tableHeading}</h2>\n        <p className=\"mt-1 text-sm text-muted-foreground\">{T.tableIntro}</p>");
  });
});

describe("4. help on the headings (#449)", () => {
  const header = () => renderToStaticMarkup(createElement("table", null, createElement(Header, { sort: null, onSort: () => {} })));

  it("Status, Coverage, Gold check, Benchmark grade and Benchmark include have a ? button pointing at their panel", () => {
    const markup = header();
    for (const [id, label] of [["status", "Status"], ["coverage", "Coverage (experimental)"], ["gold", "Gold check"], ["benchmarkGrade", "Benchmark grade"], ["benchmarkInclude", "Benchmark include"]]) {
      expect(markup).toContain(`<button type="button" aria-label="What ${label} means" aria-describedby="help-${id}"`);
      expect(markup).toMatch(new RegExp(`<span id="help-${id}" role="tooltip" hidden=""`));
    }
    expect(markup.match(/role="tooltip"/g)).toHaveLength(5);
    // Not a title attribute alone: the help is in the page, named by aria-describedby.
    expect(markup).not.toMatch(/title="[^"]*proving tests ran/);
  });

  it("each panel's text", () => {
    const markup = header();
    expect(TASK_TABLE_TEXT.coverageHelp).toBe("Of the code lines this task changes, the share the proving tests ran. Measured by a coverage run in the validator. Experimental: nobody has checked these numbers by hand yet. \"Not measured\" means the coverage run has not been done for this task.");
    expect(TASK_TABLE_TEXT.goldHelp).toBe("Harbor is the format coding agents are run in. The gold check builds this task as a Harbor task and applies the student's own change. Passed means the task's tests pass there, so the task can be solved as packaged. Not run means it has not been tried yet. The Harbor download holds only tasks that passed.");
    expect(TASK_TABLE_TEXT.benchmarkGradeHelp).toBe("How good the task is as a benchmark item. It is separate from the student's grade and never changes it. Not scored yet.");
    expect(TASK_TABLE_TEXT.benchmarkIncludeHelp).toBe("Staff's decision to put the task in the benchmark or leave it out, with a reason. Not decided yet.");
    for (const text of [TASK_TABLE_TEXT.coverageHelp, TASK_TABLE_TEXT.goldHelp, TASK_TABLE_TEXT.benchmarkGradeHelp, TASK_TABLE_TEXT.benchmarkIncludeHelp]) {
      expect(markup).toContain(text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
    }
  });

  it("the Status help uses the summary box's own sentences, one line per result", () => {
    const lines = statusHelpLines();
    const keys: StatusKey[] = ["validated", ...Object.keys(REASON_TEXT).map((reason) => `rejected:${reason}` as StatusKey), "no_code", "no_tests", "no_result"];
    expect(lines).toEqual(keys.map((key) => ({ label: statusLabel(key), meaning: statusMeaning(key) })));
    expect(lines).toHaveLength(Object.keys(REASON_TEXT).length + 4);
    // The box's lines for the same results carry the very same words.
    const box = summarize([row({ validationStatus: "validated" }), row({ flags: ["no_test_patch"] }), row({ validationStatus: "rejected", flags: ["validation_reason:env_error"] })]).lines;
    for (const line of box) expect(lines).toContainEqual({ label: line.label, meaning: line.meaning });
    const markup = renderToStaticMarkup(createElement(StatusHelp));
    expect(markup).toContain("<span class=\"font-semibold\">Validated</span>: Its tests fail before the student&#x27;s change and pass after it.");
    expect(markup).toContain("Not run by the validator yet, or the run could not finish.");
    const source = readFileSync(path.resolve(__dirname, "../lib/cse115a/benchmark/taskTable.ts"), "utf8");
    // One source: the sentences appear once in the code.
    expect(source.split("Its tests fail before the student's change and pass after it.").length - 1).toBe(1);
  });

  it("opens on focus and on hover, closes on Esc, on blur and on moving away", () => {
    expect(nextTipOpen(false, "focus")).toBe(true);
    expect(nextTipOpen(false, "enter")).toBe(true);
    expect(nextTipOpen(false, "click")).toBe(true);
    expect(nextTipOpen(true, "click")).toBe(true);
    expect(nextTipOpen(true, "escape")).toBe(false);
    expect(nextTipOpen(true, "blur")).toBe(false);
    expect(nextTipOpen(true, "leave")).toBe(false);
    const events: TipEvent[] = [];
    const view = (open: boolean) => elements(HelpTipView({ id: "help-gold", open, position: null, onEvent: (event) => events.push(event), kind: "button", label: "What Gold check means", panel: TASK_TABLE_TEXT.goldHelp }));
    const closed = view(false);
    const wrapper = closed[0]!.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    const button = closed.find((element) => element.type === "button")!.props as { onFocus: () => void; onBlur: () => void; onKeyDown: (event: { key: string }) => void; onClick: (event: { stopPropagation: () => void }) => void; "aria-describedby": string };
    expect(button["aria-describedby"]).toBe("help-gold");
    button.onFocus();
    wrapper.onMouseEnter();
    wrapper.onMouseLeave();
    button.onBlur();
    // Esc on a closed panel does nothing; on an open one it closes it.
    button.onKeyDown({ key: "Escape" });
    const open = view(true).find((element) => element.type === "button")!.props as typeof button;
    open.onKeyDown({ key: "Enter" });
    open.onKeyDown({ key: "Escape" });
    // A click on "?" opens the help and never reaches the heading's sort button or the row.
    let stopped = false;
    open.onClick({ stopPropagation: () => { stopped = true; } });
    expect(events).toEqual(["focus", "enter", "leave", "blur", "escape", "click"]);
    expect(stopped).toBe(true);
    const panel = (state: boolean) => renderToStaticMarkup(HelpTipView({ id: "help-gold", open: state, position: null, onEvent: () => {}, kind: "button", label: "x", panel: "Gold" }));
    expect(panel(false)).toContain("role=\"tooltip\" hidden=\"\"");
    expect(panel(true)).not.toContain("hidden");
    // Esc anywhere closes an open panel too (a panel opened by hover has no focus).
    const tip = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/HelpTip.tsx"), "utf8");
    expect(tip).toContain("const onKey = (event: KeyboardEvent) => { if (event.key === \"Escape\") close(); };");
    expect(tipPosition({ bottom: 100, left: 2000 }, 1200)).toEqual({ top: 104, left: 1200 - 320 - 8 });
    expect(tipPosition({ bottom: 10, left: 0 }, 1200)).toEqual({ top: 14, left: 8 });
  });

  it("the heading still sorts: the ? sits beside the sort button, not in it, and the sort button still calls onSort", () => {
    const sorted: string[] = [];
    const tree = elements(Header({ sort: { key: "status", direction: "asc" }, onSort: (key) => sorted.push(key) }));
    const sortButtons = tree.filter((element) => element.type === "button");
    expect(sortButtons).toHaveLength(COLUMNS.filter((column) => column.sort).length);
    for (const button of sortButtons) (button.props as { onClick: () => void }).onClick();
    expect(sorted).toEqual(COLUMNS.filter((column) => column.sort).map((column) => column.sort));
    expect(tree.filter((element) => element.type === HelpTip)).toHaveLength(5);
    const markup = renderToStaticMarkup(createElement("table", null, createElement(Header, { sort: { key: "status", direction: "asc" }, onSort: () => {} })));
    expect(markup).toContain("aria-sort=\"ascending\"");
  });
});

describe("4. the two empty benchmark columns (#449)", () => {
  it("sit after Final grade and before Staff changes, read Not set in every row, do not sort or filter", async () => {
    const ids = COLUMNS.map((column) => column.id);
    expect(ids.indexOf("benchmarkGrade")).toBe(ids.indexOf("grade") + 1);
    expect(ids.indexOf("benchmarkInclude")).toBe(ids.indexOf("grade") + 2);
    expect(ids.indexOf("staffChanges")).toBe(ids.indexOf("grade") + 3);
    for (const id of ["benchmarkGrade", "benchmarkInclude"]) expect(COLUMNS.find((column) => column.id === id)!.sort).toBeUndefined();
    expect(TASK_SORT_KEYS).not.toContain("benchmarkGrade");
    expect(Object.keys(DEFAULT_FILTERS)).not.toContain("benchmarkGrade");
    for (const item of await listRows()) {
      const markup = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement(TaskCells, { row: item })))));
      expect(markup.match(/>Not set<\/td>/g)).toHaveLength(2);
      expect(Object.keys(item).some((key) => /benchmark/i.test(key))).toBe(false);
    }
    const header = renderToStaticMarkup(createElement("table", null, createElement(Header, { sort: null, onSort: () => {} })));
    expect(header).toContain("<span class=\"whitespace-nowrap\">Benchmark grade</span>");
    expect(header).not.toMatch(/aria-sort="none"[^>]*><span class="inline-flex items-center gap-1.5"><span class="whitespace-nowrap">Benchmark/);
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(component).toContain("// Placeholders (#449): no data, no route field and no migration yet");
  });
});

describe("4. the opened row's grade and scores (#449)", () => {
  it("each box's final points: the instructor's where edited, else the AI's; a box nobody scored says so", () => {
    expect(gradeBoxes([{ name: "Specs", awarded: 2 }, { name: "Scope", awarded: 0 }], [
      { name: "Scope", awarded: 1 }, { name: "Specs", awarded: 1 }, { name: "Acceptance criteria", awarded: 2 }, { name: "Test quality", awarded: null }, { name: "Tests pass", awarded: 2 }, { name: "Process", awarded: 1 },
    ])).toEqual(boxes([0, 2, 2, null, 2, 1]));
    expect(gradeBoxLines(grade(8.5, true, [1, 2, 1.5, 2, 1, 1]))).toEqual([
      "Scope: 1 / 1", "Specs: 2 / 2", "Acceptance criteria: 1.5 / 2", "Test quality: 2 / 2", "Tests pass: 1 / 2", "Process: 1 / 1",
    ]);
    expect(gradeBoxLines(grade(5, false, [1, 1, 1, null, 1, 1]))[3]).toBe("Test quality: not scored / 2");
    expect(gradeBoxLines(null)).toEqual([]);
  });

  it("the detail route sends the grade by box and the total, and never the rationales or notes", async () => {
    const task = await detail("src-1");
    expect(task.grade).toEqual({ total: 8.5, released: true, boxes: boxes([1, 2, 1.5, 2, 1, 1]) });
    expect((await detail("src-2")).grade).toEqual({ total: 6.5, released: false, boxes: boxes([1, 1.5, 2, null, 1, 1]) });
    expect((await detail("src-3")).grade).toBeNull();
    const raw = JSON.stringify(await detail("src-1"));
    for (const text of ["SECRET_RATIONALE", "SECRET_QUOTE", "SECRET_NOTE", "BIG", "perFile"]) expect(raw).not.toContain(text);
    for (const call of state.calls.filter((item) => item.table === "cse_task_grades")) {
      for (const column of call.columns.split(",")) expect(column).not.toMatch(/^(rubric|instructor_rubric|instructor_notes)$/);
    }
    expect(state.writes).toBe(0);
  });

  it("shows six boxes, the total and not released under Grade; Not graded yet without a grade", async () => {
    const released = renderToStaticMarkup(createElement(GradeSection, { grade: (await detail("src-1")).grade }));
    expect(released).toContain("<h4 class=\"font-medium\">Grade</h4>");
    for (const line of ["Scope: 1 / 1", "Specs: 2 / 2", "Acceptance criteria: 1.5 / 2", "Test quality: 2 / 2", "Tests pass: 1 / 2", "Process: 1 / 1"]) expect(released).toContain(`<li>${line}</li>`);
    expect(released).toContain("Total: 8.5 / 10");
    expect(released).not.toContain("not released");
    const unreleased = renderToStaticMarkup(createElement(GradeSection, { grade: (await detail("src-2")).grade }));
    expect(unreleased).toContain("Total: 6.5 / 10");
    expect(unreleased).toContain("not released");
    expect(unreleased).toContain("Test quality: not scored / 2");
    expect(renderToStaticMarkup(createElement(GradeSection, { grade: null }))).toContain("Not graded yet");
    expect(renderToStaticMarkup(createElement(TaskDetailView, { detail: await detail("src-1") }))).toContain("Total: 8.5 / 10");
  });

  it("the same six lines are the Final grade cell's hover and focus text", async () => {
    const rows = await listRows();
    const one = rows.find((item) => item.id === "src-1")!;
    const markup = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement(TaskCells, { row: one })))));
    expect(markup).toContain("<span tabindex=\"0\" aria-describedby=\"grade-boxes-src-1\"");
    const panel = markup.match(/<span id="grade-boxes-src-1" role="tooltip" hidden=""[^>]*>(.*?)<\/span>/)![1]!;
    expect(panel.match(/<li[^>]*>([^<]+)<\/li>/g)!.map((item) => item.replace(/<[^>]+>/g, ""))).toEqual(gradeBoxLines(one.grade));
    // No grade: no hover text.
    const ungraded = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement(TaskCells, { row: rows.find((item) => item.id === "src-3")! })))));
    expect(ungraded).not.toContain("grade-boxes-");
  });

  it("the Repo Metrics scores, worked out on the server by the metrics page's rule, with the report's date", async () => {
    const task = await detail("src-1");
    const strip = buildOverviewScoreStrip(REPORT as unknown as RepoReport, false).items;
    expect(task.scores).toEqual(REPORT_SCORE_IDS.map((id) => {
      const item = strip.find((entry) => entry.id === id)!;
      return { id, title: item.title, score: item.score };
    }));
    expect(task.scores!.map((item) => item.title)).toEqual(["Commit Habits", "Testing", "Code Quality", "Code Complexity"]);
    expect(task.scores!.find((item) => item.id === "code-complexity")!.score).toBeNull();
    const markup = renderToStaticMarkup(createElement(ScoresSection, { detail: task }));
    expect(markup).toContain("Repo Metrics scores");
    expect(markup).toContain("as of Nov 12");
    expect(markup).toContain(`<dt class="text-muted-foreground">Commit Habits</dt><dd class="font-medium tabular-nums">${task.scores![0]!.score}</dd>`);
    expect(markup).toContain("<dd class=\"font-medium tabular-nums\">Not measured</dd>");
    // The opened row keeps the link to the report.
    expect(renderToStaticMarkup(createElement(TaskDetailView, { detail: task }))).toContain(">Open the Repo Metrics report</a>");
    // The detail route reads the stored report; the list never does.
    expect(state.calls.some((call) => call.table === "cse_benchmark_tasks" && call.columns.split(",").includes("repo_metrics"))).toBe(true);
  });

  it("no scores: a report that cannot be scored says so and keeps the link; no report shows nothing", async () => {
    const broken = await detail("src-2");
    expect(broken.hasReport).toBe(true);
    expect(broken.scores).toBeNull();
    const markup = renderToStaticMarkup(createElement(TaskDetailView, { detail: broken }));
    expect(markup).toContain("The scores could not be worked out from the stored report.");
    expect(markup).toContain(">Open the Repo Metrics report</a>");
    const none = await detail("src-3");
    expect(none.scores).toBeNull();
    expect(renderToStaticMarkup(createElement(TaskDetailView, { detail: none }))).not.toContain("Repo Metrics scores");
    expect(reportScores(null)).toBeNull();
    expect(reportScores(["not", "a", "report"])).toBeNull();
    // A report the analysis skipped has no Testing or Code Quality, as on the metrics page.
    expect(reportScores({ ...REPORT, analysisSkipped: true })!.map((item) => item.title)).toEqual(["Commit Habits", "Code Complexity"]);
  });

  it("the scores load with the opened row, not with the list", async () => {
    const rows = await listRows();
    for (const item of rows) expect(Object.keys(item)).not.toContain("scores");
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(component.match(/fetchJson</g)).toHaveLength(2);
  });
});
