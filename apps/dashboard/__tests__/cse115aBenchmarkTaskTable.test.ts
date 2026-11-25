// #444 and #445: the staff Benchmark page's summary of validation results and its table of every current task, with
// the two staff routes behind them. The database and the sign-in are fakes; nothing reaches GitHub or Supabase.
// Names, emails, repos, PR numbers and task ids are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changedByStaffLines, coverageCell, DEFAULT_FILTERS, FLAG_TEXT, flagText, goldCell, gradeCell, matchesFilters, nextTaskSort, REASON_FLAG_PREFIX,
  repoCell, reportDateText, sortTaskRows, staffChangeLines, statusCell, statusKey, summarize, TASK_SORT_KEYS, TASK_TABLE_TEXT, taskCell,
  visibleRows, withStatus, type Filters, type TaskDetail, type TaskTableRow,
} from "@/lib/cse115a/benchmark/taskTable";
import { REASON_FLAG_PREFIX as WRITEBACK_REASON_PREFIX } from "@/lib/cse115a/benchmark/validation/writeback";
import { noCodeFromFlags } from "@/lib/cse115a/noCodePr";
import { TASK_POINTS } from "@/lib/cse115a/rubric";
import { OpenedRow, SummaryBox, TaskCells, TaskDetailView } from "@/components/cse115a/instructor/BenchmarkTaskTable";
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

function seed() {
  state.tables = {
    cse_course_memberships: [
      { course_id: "course-1", user_id: "u-ann", ucsc_email: "ann.example@ucsc.edu" },
      { course_id: "course-1", user_id: "u-bo", ucsc_email: "bo.example@ucsc.edu" },
      { course_id: "course-1", user_id: "u-ta", ucsc_email: "ta-one@ucsc.edu" },
      { course_id: "course-2", user_id: "u-zed", ucsc_email: "zed.example@ucsc.edu" },
    ],
    cse_course_roles: [{ course_id: "course-1", email: "ta-one@ucsc.edu", role: "ta" }],
    cse_research_consent: [{ course_id: "course-1", user_id: "u-ann", consented: true, consent_version: "v1" }],
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
        harbor_env: { gold: { status: "passed" } }, repo_metrics: { filesAnalyzed: 12, source: { type: "github" }, analysis_timestamp: "2026-11-12T08:00:00Z", perFile: ["BIG"] } },
      { instance_id: "kettle-co__kettle-app-US-1-T-2", problem_statement: "Boil", patch: "p", test_patch: "t", FAIL_TO_PASS: ["x"], PASS_TO_PASS: [],
        validation_detail: null, harbor_env: { gold: { status: "failed" } }, repo_metrics: { filesAnalyzed: 3, source: { type: "github" } } },
      { instance_id: "teapot-co__teapot-US-2-T-1", problem_statement: "Teapot", patch: "", test_patch: "", FAIL_TO_PASS: [], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
      { instance_id: "teapot-co__teapot-US-2-T-3", problem_statement: "Cover", patch: "c", test_patch: "", FAIL_TO_PASS: [], PASS_TO_PASS: [],
        validation_detail: { fix_coverage: { status: "partial", lines_covered: 1, lines_executable: 4 }, untested_files: [] }, harbor_env: { gold: { status: "skipped" } }, repo_metrics: { filesAnalyzed: 0, source: { type: "github" }, analysis_timestamp: "2026-10-30T23:59:00Z" } },
      { instance_id: "teapot-co__teapot-US-9-T-1", problem_statement: "", patch: "s", test_patch: "t", FAIL_TO_PASS: ["s1"], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
      { instance_id: "other__other-US-0-T-1", problem_statement: "x", patch: "x", test_patch: "x", FAIL_TO_PASS: [], PASS_TO_PASS: [], validation_detail: null, harbor_env: null, repo_metrics: null },
    ],
    cse_task_grades: [
      { assignment_submission_id: "sub-ann-1", task_slot: 1, agent_total: 7, instructor_total: 8.5, released_at: "2026-11-19T00:00:00Z" },
      { assignment_submission_id: "sub-ann-1", task_slot: 2, agent_total: "6.5", instructor_total: null, released_at: null },
      { assignment_submission_id: "sub-ann-0", task_slot: 1, agent_total: 2, instructor_total: null, released_at: null },
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
    id: "r", submissionId: "s", assignment: 1, slot: 1, team: "kettle-co/kettle-app", email: "ann.example@ucsc.edu", staff: false, taskId: "US-1-T-1", title: "Kettle alarm",
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

const ROW_KEYS = ["id", "submissionId", "assignment", "slot", "team", "email", "staff", "taskId", "title", "validationStatus", "flags", "provingTests", "coverage", "untestedFiles", "gold", "grade", "extraCodePrs", "hasReport", "reportDate"].sort();

/** Walks a rendered element tree (function components called, hooks-free ones only) and returns every element. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((item) => elements(item, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode };
  if (typeof node.type === "function") elements((node.type as (props: unknown) => ReactNode)(node.props), out);
  elements(props.children, out);
  return out;
}

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
    expect(byId.get("src-2")).toMatchObject({ grade: { total: 6.5, released: false }, gold: "failed", coverage: null, hasReport: true, reportDate: null });
    expect(byId.get("src-3")).toMatchObject({ grade: null, hasReport: false, gold: null, team: "teapot-co/teapot" });
    // Task 3 sits at the snapshot's second position: matched by slot, not by position.
    expect(byId.get("src-4")).toMatchObject({ slot: 3, taskId: "US-2-T-3", title: "Cosy cover", gold: "skipped", coverage: { status: "partial", covered: 1, executable: 4 } });
    expect(byId.get("src-5")).toMatchObject({ email: "ta-one@ucsc.edu", staff: true });
  });

  it("holds no spec, no patch, no diff and nothing about consent; a new field fails this test", async () => {
    const response = await listRequest();
    const raw = await response.text();
    const body = JSON.parse(raw) as { rows: TaskTableRow[] };
    expect(Object.keys(body)).toEqual(["rows"]);
    for (const item of body.rows) expect(Object.keys(item).sort()).toEqual(ROW_KEYS);
    const keys = allKeys(body);
    for (const key of keys) expect(key).not.toMatch(/consent|problem_statement|^patch$|test_patch|testPatch|exportable|download/i);
    for (const text of ["SECRET_DIFF", "EXTRA_DIFF", "beep()", "The kettle **beeps**", "BIG"]) expect(raw).not.toContain(text);
    // Never reads consent, and never selects the spec or the patches or the whole report.
    expect(state.calls.some((call) => call.table === "cse_research_consent")).toBe(false);
    for (const call of state.calls) {
      for (const column of call.columns.split(",")) expect(column).not.toMatch(/^(problem_statement|patch|test_patch|repo_metrics|snapshot|validation_detail|harbor_env)$/);
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
    expect(gradeCell({ total: 8.5, released: true })).toEqual({ text: `8.5 / ${TASK_POINTS}`, unreleased: false });
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

  it("renders a row's cells: staff tag, team link, not released tag, no consent words", async () => {
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
    for (const item of rows) expect(table(item)).not.toMatch(/consent/i);
  });

  it("the panel has no per-row consent and no Newest rows; downloads and the consent line are unchanged", () => {
    const panel = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkPanel.tsx"), "utf8");
    const component = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkTaskTable.tsx"), "utf8");
    expect(panel).not.toContain("Newest rows");
    expect(panel).not.toContain("no consent");
    expect(panel).not.toContain("row.consented");
    // The code, not its comments (the header comment says the table shows nothing about consent).
    const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/consent/i);
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
    row({ id: "a", assignment: 1, team: "kettle-co/kettle-app", email: "ann.example@ucsc.edu", title: "Kettle alarm", validationStatus: "validated", grade: { total: 9, released: true }, coverage: { status: "measured", covered: 1, executable: 2 }, gold: "passed", hasReport: true, reportDate: "2026-11-12T00:00:00Z" }),
    row({ id: "b", assignment: 2, team: "teapot-co/teapot", email: "bo.example@ucsc.edu", taskId: "US-2-T-1", title: "Teapot API", flags: ["work_pr_chosen_by_staff"], grade: { total: 6, released: false }, gold: "failed", hasReport: true, reportDate: null }),
    row({ id: "c", assignment: 2, team: "teapot-co/teapot", email: "ta-one@ucsc.edu", staff: true, title: "Staff trial", flags: ["no_test_patch"], coverage: { status: "measured", covered: 4, executable: 4 }, hasReport: true, reportDate: "2026-11-20T00:00:00Z" }),
    row({ id: "d", assignment: 1, team: "kettle-co/kettle-app", email: "cy.example@ucsc.edu", title: "Boil timer", flags: ["extra_code_prs"], extraCodePrs: 1, validationStatus: "rejected" }),
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
    expect(Object.keys(DEFAULT_FILTERS).sort()).toEqual(["assignment", "changed", "people", "search", "status", "team"]);
    expect(matchesFilters(row({ grade: { total: 0, released: false } }), DEFAULT_FILTERS)).toBe(true);
    expect(statusKey(row({ grade: { total: 10, released: true } }))).toBe("no_result");
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
    validation: null, workPrChoice: null, extraCodePrs: [], hasReport: true, reportDate: "2026-11-12T00:00:00Z",
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
