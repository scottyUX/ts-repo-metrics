// Every AI grade kept, and the staff save recorded (#429): the migration's text, the grade job's two writes, the
// grade route's two columns, the Grader numbers using the grade staff saw, and the review page's history line.
// Everything runs against in-memory fakes; nothing reaches GitHub or Supabase. Every row, id, email, model and
// version here is made up. The migration's SQL itself was also run on a throwaway local Postgres (see the report).
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUBRIC, type CriterionName } from "@/lib/cse115a/rubric";
import { comparedGrade, graderStats, type GraderGradeInput } from "@/lib/cse115a/graderStats";
import { GRADER_TEXT, GraderView, noSaveTimeLine, regradedLine } from "@/components/cse115a/instructor/GraderPanel";
import { AiGradeHistory, aiGradeHistoryLabel, type AiGradeEntry } from "@/components/cse115a/instructor/AiGradeHistory";
import { supabaseJobStore } from "@/lib/cse115a/jobs/supabaseStore";
import { runNextJob, type Job, type JobStore } from "@/lib/cse115a/jobs/runner";
import type { TaskGrade } from "@/lib/cse115a/grader/gradeTask";

vi.mock("server-only", () => ({}));

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.resolve(ROOT, file), "utf8");

// ---- An in-memory PostgREST-like client with the two tables' unique keys ----

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  /** "table:op" -> error message, to fail one kind of request. */
  fail: {} as Record<string, string>,
  /** Called before each update runs, to change rows in between (a Regrade landing). */
  beforeUpdate: null as null | (() => void),
  calls: [] as Array<{ table: string; op: string; detail?: unknown }>,
}));

const UNIQUE: Record<string, string[]> = {
  cse_task_grades: ["assignment_submission_id", "task_slot"],
  cse_task_ai_grades: ["assignment_submission_id", "task_slot", "graded_at"],
};
const keyOf = (table: string, row: Row) => (UNIQUE[table] ?? ["id"]).map((column) => String(row[column])).join("|");

function fakeFrom(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let op: "select" | "update" | "upsert" = "select";
  let patch: Row = {};
  let upsertRows: Row[] = [];
  let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  let range: [number, number] = [0, 999];
  const rows = () => (db.tables[table] ??= []);
  const run = (): { data: Row[] | null; error: { message: string } | null } => {
    const failure = db.fail[`${table}:${op}`];
    if (failure) return { data: null, error: { message: failure } };
    if (op === "upsert") {
      db.calls.push({ table, op, detail: { rows: upsertRows, options: upsertOptions } });
      const conflict = upsertOptions.onConflict?.split(",");
      expect(conflict).toEqual(UNIQUE[table]);
      const written: Row[] = [];
      for (const row of upsertRows) {
        const existing = rows().find((item) => keyOf(table, item) === keyOf(table, row));
        if (existing && upsertOptions.ignoreDuplicates) continue;
        if (existing) Object.assign(existing, row);
        else rows().push({ ...row });
        written.push(row);
      }
      return { data: written, error: null };
    }
    if (op === "update") {
      db.beforeUpdate?.();
      const matched = rows().filter((row) => filters.every((keep) => keep(row)));
      db.calls.push({ table, op, detail: { patch, matched: matched.length } });
      for (const row of matched) Object.assign(row, patch);
      return { data: matched.map((row) => ({ ...row })), error: null };
    }
    db.calls.push({ table, op });
    const matched = rows().filter((row) => filters.every((keep) => keep(row)));
    return { data: matched.slice(range[0], range[1] + 1).map((row) => ({ ...row })), error: null };
  };
  const query = {
    select: () => query,
    order: () => query,
    upsert: (input: Row | Row[], options: typeof upsertOptions = {}) => { op = "upsert"; upsertRows = Array.isArray(input) ? input : [input]; upsertOptions = options; return query; },
    update: (input: Row) => { op = "update"; patch = input; return query; },
    eq: (column: string, value: unknown) => {
      filters.push((row) => (column.endsWith("_at") && typeof value === "string" && typeof row[column] === "string"
        ? Date.parse(row[column] as string) === Date.parse(value) : row[column] === value));
      return query;
    },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
    range: (from: number, to: number) => { range = [from, to]; return query; },
    maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
    single: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return query;
}
const fakeDb = { from: fakeFrom } as unknown as SupabaseClient;

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => ({ from: fakeFrom }) }));
vi.mock("@/lib/cse115a/instructorApi", () => ({
  guardSubmission: async () => ({ identity: { userId: "staff-1" }, course: { id: "course-1", slug: "CSE115A-Test", role: "ta" } }),
}));
vi.mock("@/lib/cse115a/repoCopyAccess", () => ({ supabaseCopyFiles: () => ({}), taskCodes: async () => [] }));

beforeEach(() => {
  db.tables = {};
  db.fail = {};
  db.beforeUpdate = null;
  db.calls = [];
});
afterEach(() => { vi.useRealTimers(); });

// ---- Made-up grades ----

const SUB = "00000000-0000-4000-8000-000000000001";
function aiRubric(boxes: Partial<Record<CriterionName, number | null>> = {}) {
  return RUBRIC.map((row) => ({
    name: row.name, points: row.points, level: "full", awarded: row.name in boxes ? boxes[row.name]! : row.points,
    rationale: "made up", evidenceQuotes: [], needsReview: false, source: "llm",
  }));
}
const total = (rubric: Array<{ awarded: number | null }>) => rubric.reduce((sum, row) => sum + (row.awarded ?? 0), 0);
function taskGrade(slot: number, boxes: Partial<Record<CriterionName, number | null>> = {}, promptVersion = "prompt-v5"): TaskGrade {
  const rubric = aiRubric(boxes);
  return { slot, rubric, agentTotal: total(rubric), needsReview: false, model: "model-a", promptVersion } as unknown as TaskGrade;
}

// ---- 1. The migration ----

describe("20261123000000_cse115a_ai_grade_history.sql (#429)", () => {
  const sql = read("../../supabase/migrations/20261123000000_cse115a_ai_grade_history.sql");
  const code = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

  it("creates the history table with the cascade and the (submission, slot, graded_at) key", () => {
    expect(code).toContain("create table if not exists public.cse_task_ai_grades (");
    expect(code).toContain("assignment_submission_id uuid not null references public.cse_assignment_submissions(id) on delete cascade");
    for (const column of ["task_slot integer not null", "rubric jsonb not null", "agent_total numeric(5, 2) not null", "needs_review boolean not null",
      "model text not null", "prompt_version text not null", "graded_at timestamptz not null"]) expect(code).toContain(column);
    expect(code).toContain("unique (assignment_submission_id, task_slot, graded_at)");
  });

  it("turns row level security on with no policy and no client grant", () => {
    expect(code).toContain("alter table public.cse_task_ai_grades enable row level security;");
    expect(code).toContain("revoke all on public.cse_task_ai_grades from anon, authenticated;");
    expect(code).not.toMatch(/create policy|grant select|grant all|grant insert/i);
  });

  it("backfills from cse_task_grades and is safe to run twice", () => {
    expect(code).toMatch(/insert into public\.cse_task_ai_grades[\s\S]*from public\.cse_task_grades\s*on conflict \(assignment_submission_id, task_slot, graded_at\) do nothing;/);
    expect(code).toContain("add column if not exists instructor_saved_at timestamptz");
    expect(code).toContain("add column if not exists instructor_saw_graded_at timestamptz");
    expect(code).not.toMatch(/update public\.cse_task_grades/); // no backfill of the two columns
    expect(code.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });

  it("carries the undo statements in the header", () => {
    expect(sql).toContain("--   drop table if exists public.cse_task_ai_grades;");
    expect(sql).toContain("--   alter table public.cse_task_grades drop column if exists instructor_saved_at, drop column if exists instructor_saw_graded_at;");
    expect(sql).toContain("--   notify pgrst, 'reload schema';");
  });
});

// ---- 2. The grade job's writes ----

describe("saveGrades writes the history and the current grade (#429)", () => {
  it("writes each grade to both tables with the same graded_at, history first", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00.000Z"), toFake: ["Date"] });
    await supabaseJobStore(fakeDb).saveGrades(SUB, [taskGrade(1), taskGrade(2, { Specs: 1 })]);
    expect(db.calls.map((call) => `${call.table}:${call.op}`)).toEqual(["cse_task_ai_grades:upsert", "cse_task_grades:upsert"]);
    const [history, current] = db.calls.map((call) => call.detail as { rows: Row[]; options: { ignoreDuplicates?: boolean } });
    expect(history!.options.ignoreDuplicates).toBe(true);
    expect(current!.options.ignoreDuplicates).toBeUndefined();
    expect(history!.rows).toEqual(current!.rows);
    expect(db.tables.cse_task_ai_grades!.map((row) => [row.task_slot, row.graded_at, row.agent_total])).toEqual([[1, "2026-11-23T10:00:00.000Z", 10], [2, "2026-11-23T10:00:00.000Z", 9]]);
  });

  it("the same grades written twice (same graded_at) keep one history row each", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00.000Z"), toFake: ["Date"] });
    const store = supabaseJobStore(fakeDb);
    await store.saveGrades(SUB, [taskGrade(1)]);
    await store.saveGrades(SUB, [taskGrade(1)]);
    expect(db.tables.cse_task_ai_grades).toHaveLength(1);
    expect(db.tables.cse_task_grades).toHaveLength(1);
  });

  it("a Regrade adds a history row and replaces only the current grade's AI fields", async () => {
    const store = supabaseJobStore(fakeDb);
    vi.useFakeTimers({ now: new Date("2026-11-20T10:00:00.000Z"), toFake: ["Date"] });
    await store.saveGrades(SUB, [taskGrade(1, { Specs: 1 }, "prompt-v4")]);
    db.tables.cse_task_grades![0]!.instructor_total = 10; // a staff save in between is kept
    vi.setSystemTime(new Date("2026-11-23T10:00:00.000Z"));
    await store.saveGrades(SUB, [taskGrade(1, {}, "prompt-v5")]);
    expect(db.tables.cse_task_ai_grades!.map((row) => [row.prompt_version, row.agent_total])).toEqual([["prompt-v4", 9], ["prompt-v5", 10]]);
    expect(db.tables.cse_task_grades).toHaveLength(1);
    expect(db.tables.cse_task_grades![0]).toMatchObject({ prompt_version: "prompt-v5", graded_at: "2026-11-23T10:00:00.000Z", instructor_total: 10 });
  });

  it("a failed history write fails the job before cse_task_grades changes; the retry adds its own grade once", async () => {
    const jobs: Array<Job & { status: string }> = [{ id: "job-1", assignment_submission_id: SUB, kind: "grade", attempts: 0, status: "queued" }];
    const real = supabaseJobStore(fakeDb);
    const store: JobStore = {
      ...real,
      claim: async () => { const job = jobs.find((item) => item.status === "queued"); if (!job) return null; job.status = "running"; job.attempts += 1; return { ...job }; },
      loadSubmission: async () => ({ id: SUB, course_id: "c", user_id: "u", assignment_number: 2, status: "submitted", snapshot: { version: 1, capturedAt: "", tasks: [] } as never, superseded_at: null }),
      setSubmissionStatus: async () => {},
      finishJob: async (id, outcome) => { jobs.find((item) => item.id === id)!.status = outcome.status === "queued" ? "queued" : outcome.status; },
    };
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00.000Z"), toFake: ["Date"] });
    db.fail["cse_task_ai_grades:upsert"] = "connection reset";
    const first = await runNextJob(store, { grade: async () => [taskGrade(1)] });
    expect(first!.outcome).toMatchObject({ status: "queued", error: "Could not save the grade history: connection reset" });
    expect(db.tables.cse_task_grades ?? []).toHaveLength(0);
    expect(db.tables.cse_task_ai_grades ?? []).toHaveLength(0);
    delete db.fail["cse_task_ai_grades:upsert"];
    vi.setSystemTime(new Date("2026-11-23T10:01:00.000Z"));
    const second = await runNextJob(store, { grade: async () => [taskGrade(1)] });
    expect(second!.outcome).toEqual({ status: "succeeded" });
    expect(db.tables.cse_task_ai_grades!.map((row) => row.graded_at)).toEqual(["2026-11-23T10:01:00.000Z"]);
    expect(db.tables.cse_task_grades![0]!.graded_at).toBe("2026-11-23T10:01:00.000Z");
  });

  it("a failed current-grade write after the history write: the retry's grade is a second, newer history row, and the current one matches it", async () => {
    const store = supabaseJobStore(fakeDb);
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00.000Z"), toFake: ["Date"] });
    db.fail["cse_task_grades:upsert"] = "timeout";
    await expect(store.saveGrades(SUB, [taskGrade(1, { Specs: 1 })])).rejects.toThrow("Could not save grades: timeout");
    delete db.fail["cse_task_grades:upsert"];
    vi.setSystemTime(new Date("2026-11-23T10:01:00.000Z"));
    await store.saveGrades(SUB, [taskGrade(1)]);
    expect(db.tables.cse_task_ai_grades!.map((row) => row.graded_at)).toEqual(["2026-11-23T10:00:00.000Z", "2026-11-23T10:01:00.000Z"]);
    expect(db.tables.cse_task_grades![0]!.graded_at).toBe("2026-11-23T10:01:00.000Z");
  });
});

// ---- 3. The grade route records the staff save ----

function seedCurrent(gradedAt = "2026-11-20T10:00:00.000Z", extra: Row = {}) {
  db.tables.cse_task_grades = [{
    assignment_submission_id: SUB, task_slot: 1, rubric: aiRubric(), agent_total: "10.00", model: "model-a", prompt_version: "prompt-v4",
    graded_at: gradedAt, instructor_rubric: null, instructor_total: null, instructor_notes: null, instructor_saved_at: null, instructor_saw_graded_at: null, ...extra,
  }];
}
async function put(body: unknown) {
  const { PUT } = await import("@/app/api/cse115a/instructor/submissions/[id]/grade/route");
  return PUT(new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: SUB }) });
}
const staffRubric = () => RUBRIC.map((row) => ({ name: row.name, awarded: row.name === "Specs" ? 1 : row.points, note: "" }));

describe("PUT .../grade records when staff saved and which AI grade was on the task (#429)", () => {
  it("sets instructor_saved_at to now and instructor_saw_graded_at to the task's graded_at", async () => {
    seedCurrent();
    vi.useFakeTimers({ now: new Date("2026-11-23T12:00:00.000Z"), toFake: ["Date"] });
    const response = await put({ slot: 1, rubric: staffRubric(), notes: "" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ grade: expect.objectContaining({ task_slot: 1, instructor_total: 9 }) });
    expect(db.tables.cse_task_grades![0]).toMatchObject({ instructor_saved_at: "2026-11-23T12:00:00.000Z", instructor_saw_graded_at: "2026-11-20T10:00:00.000Z", updated_by: "staff-1" });
  });

  it("guards on graded_at: a Regrade landing between the read and the save makes it read again and record the new one", async () => {
    seedCurrent();
    let regraded = false;
    db.beforeUpdate = () => {
      if (regraded) return;
      regraded = true;
      Object.assign(db.tables.cse_task_grades![0]!, { graded_at: "2026-11-23T11:59:59.000Z", prompt_version: "prompt-v5" });
    };
    const response = await put({ slot: 1, rubric: staffRubric(), notes: "" });
    expect(response.status).toBe(200);
    const updates = db.calls.filter((call) => call.op === "update").map((call) => (call.detail as { matched: number }).matched);
    expect(updates).toEqual([0, 1]);
    expect(db.tables.cse_task_grades![0]!.instructor_saw_graded_at).toBe("2026-11-23T11:59:59.000Z");
  });

  it("gives up with a 409 after three Regrades in a row, saving nothing", async () => {
    seedCurrent();
    let n = 0;
    db.beforeUpdate = () => { n += 1; db.tables.cse_task_grades![0]!.graded_at = `2026-11-23T12:00:0${n}.000Z`; };
    const response = await put({ slot: 1, rubric: staffRubric(), notes: "" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "The AI kept regrading this task while saving. Reload the page and save again." });
    expect(db.tables.cse_task_grades![0]).toMatchObject({ instructor_rubric: null, instructor_saved_at: null, instructor_saw_graded_at: null });
  });

  it("'Use agent grade' (rubric null) clears both", async () => {
    seedCurrent("2026-11-20T10:00:00.000Z", { instructor_rubric: staffRubric(), instructor_total: 9, instructor_saved_at: "2026-11-21T00:00:00.000Z", instructor_saw_graded_at: "2026-11-20T10:00:00.000Z" });
    const response = await put({ slot: 1, rubric: null, notes: "" });
    expect(response.status).toBe(200);
    expect(db.tables.cse_task_grades![0]).toMatchObject({ instructor_rubric: null, instructor_total: null, instructor_saved_at: null, instructor_saw_graded_at: null });
  });

  it("still answers 409 for a task with no grade, with or without points", async () => {
    for (const rubric of [staffRubric(), null]) {
      const response = await put({ slot: 1, rubric, notes: "" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "This task has no agent grade yet. Regrade it first." });
    }
  });

  it("the review page sends nothing new", () => {
    const page = read("components/cse115a/instructor/SubmissionReview.tsx");
    expect(page).toContain("body: JSON.stringify({ slot: task.slot, rubric, notes: draft.overall })");
    expect(page).not.toMatch(/instructor_saved_at|instructor_saw_graded_at|sawGradedAt/);
  });
});

// ---- 4. The Grader numbers use the grade staff saw ----

const RELEASED = "2026-11-21T12:00:00.000Z";
function compared(options: {
  aiPrompt?: string; ai?: Partial<Record<CriterionName, number | null>>; staff?: Partial<Record<CriterionName, number>> | null;
  gradedAt?: string; savedAt?: string | null; sawGradedAt?: string | null; seen?: { prompt: string; ai: Partial<Record<CriterionName, number | null>>; gradedAt: string } | null;
} = {}): GraderGradeInput {
  const rubric = aiRubric(options.ai);
  const staff = options.staff === null || options.staff === undefined ? null
    : RUBRIC.map((row) => ({ name: row.name, awarded: options.staff![row.name] ?? row.points, note: "" }));
  const seenRubric = options.seen ? aiRubric(options.seen.ai) : null;
  return {
    submissionKey: `s-${Math.random()}`, assignmentNumber: 3, submittedAt: "2026-11-18T12:00:00.000Z", superseded: false,
    rubric, agentTotal: total(rubric).toFixed(2), model: "model-a", promptVersion: options.aiPrompt ?? "prompt-v5",
    gradedAt: options.gradedAt ?? "2026-11-19T12:00:00.000Z",
    instructorRubric: staff, instructorTotal: staff ? String(total(staff)) : null, releasedAt: RELEASED,
    instructorSavedAt: options.savedAt ?? null, instructorSawGradedAt: options.sawGradedAt ?? null,
    seen: options.seen && seenRubric ? { rubric: seenRubric, agentTotal: total(seenRubric).toFixed(2), model: "model-a", promptVersion: options.seen.prompt, gradedAt: options.seen.gradedAt } : null,
  };
}
const allRow = <T extends { assignment: number | null }>(rows: T[]) => rows.find((row) => row.assignment === null)!;

describe("graderStats compares the final with the AI grade staff saw (#429)", () => {
  // Staff saw prompt-v4 giving Specs 1 and raised it to 2; after release a prompt-v5 Regrade gave Specs 2.
  const regradedAfterSave = () => compared({
    aiPrompt: "prompt-v5", gradedAt: "2026-11-23T10:00:00.000Z", staff: { Specs: 2 },
    savedAt: "2026-11-20T12:00:00.000Z", sawGradedAt: "2026-11-19T12:00:00.000Z",
    seen: { prompt: "prompt-v4", ai: { Specs: 1 }, gradedAt: "2026-11-19T12:00:00.000Z" },
  });

  it("a task regraded after a recorded staff save is compared with the grade staff saw and grouped under its version", () => {
    const stats = graderStats({ submissions: [], grades: [regradedAfterSave()] });
    expect(stats.comparedTasks).toBe(1);
    expect(stats.regradedAfterRelease).toBe(0);
    expect(stats.totals.filter((row) => row.assignment !== null).map((row) => [row.promptVersion, row.released, row.higher, row.pointsAdded])).toEqual([["prompt-v4", 1, 1, 1]]);
    const specs = stats.boxes.find((table) => table.box === "Specs")!;
    expect(allRow(specs.rows)).toMatchObject({ tasks: 1, higher: 1, same: 0, pointsAdded: 1 });
    // What the AI gave stays the newest grade.
    expect(stats.aiGave.find((row) => row.box === "Specs")).toMatchObject({ full: 1, half: 0 });
    // Progress still counts it as regraded after release.
    expect(stats.progress[0]).toMatchObject({ released: 1, regradedAfterRelease: 1 });
  });

  it("the same task with no recorded save is as before: left out and counted on the regraded line", () => {
    const old = { ...regradedAfterSave(), instructorSavedAt: null, instructorSawGradedAt: null, seen: null };
    const stats = graderStats({ submissions: [], grades: [old] });
    expect(stats.comparedTasks).toBe(0);
    expect(stats.regradedAfterRelease).toBe(1);
    expect(comparedGrade(old)).toBeNull();
  });

  it("a task regraded before release after a recorded save: compared with the grade staff saw, not the newest", () => {
    const grade = compared({
      aiPrompt: "prompt-v5", gradedAt: "2026-11-20T18:00:00.000Z", staff: { Specs: 2 },
      savedAt: "2026-11-20T12:00:00.000Z", sawGradedAt: "2026-11-19T12:00:00.000Z",
      seen: { prompt: "prompt-v4", ai: { Specs: 1 }, gradedAt: "2026-11-19T12:00:00.000Z" },
    });
    expect(comparedGrade(grade)).toMatchObject({ promptVersion: "prompt-v4", agentTotal: "9.00" });
    const before = graderStats({ submissions: [], grades: [{ ...grade, instructorSavedAt: null, instructorSawGradedAt: null, seen: null }] });
    expect(allRow(before.totals)).toMatchObject({ same: 1, higher: 0 }); // what the page showed before: staff vs. the newest
    expect(allRow(graderStats({ submissions: [], grades: [grade] }).totals)).toMatchObject({ same: 0, higher: 1 });
  });

  it("a recorded save that saw the newest grade is compared with it, even when that grade came after release", () => {
    const grade = compared({ gradedAt: "2026-11-23T10:00:00.000Z", staff: { Specs: 1 }, savedAt: "2026-11-23T11:00:00.000Z", sawGradedAt: "2026-11-23T10:00:00.000Z" });
    expect(comparedGrade(grade)).toBe(grade);
    const stats = graderStats({ submissions: [], grades: [grade] });
    expect([stats.comparedTasks, stats.regradedAfterRelease, allRow(stats.totals).lower]).toEqual([1, 0, 1]);
  });

  it("a recorded save whose history entry was not found falls back to today's rule", () => {
    const missing = { ...regradedAfterSave(), seen: null };
    expect(comparedGrade(missing)).toBeNull();
    const notRegraded = compared({ staff: { Specs: 1 }, savedAt: "2026-11-20T12:00:00.000Z", sawGradedAt: "2026-11-18T12:00:00.000Z" });
    expect(comparedGrade(notRegraded)).toBe(notRegraded);
  });

  it("counts compared tasks with staff points but no recorded save time", () => {
    const stats = graderStats({ submissions: [], grades: [
      compared({ staff: { Specs: 1 } }), // an older save: no time
      compared({ staff: { Specs: 1 }, savedAt: "2026-11-20T12:00:00.000Z", sawGradedAt: "2026-11-19T12:00:00.000Z" }),
      compared(), // never saved by staff
      { ...compared({ staff: { Specs: 1 } }), releasedAt: null }, // not compared
    ] });
    expect([stats.comparedTasks, stats.noSaveTime]).toEqual([3, 1]);
  });
});

describe("the Grader page's new wording (#429)", () => {
  it("has the reworded limits and the no-save-time line", () => {
    expect(GRADER_TEXT.limits).toEqual([
      "Every AI grade is now kept, but a score a Regrade replaced before the history began is gone, and this page does not yet compare two grader versions on the same task.",
      "A staff save records its time and the AI grade on the task at that moment; a task regraded after it is compared with that grade and grouped under its version. Saves made before save times were kept have none, so a task regraded after one of them may compare staff's numbers with an AI score they did not see.",
      "The AI grade recorded is the one on the task when Save was pressed; a Regrade that finished while the review page was open is not noticed.",
      "The reason for a change is not stored.",
    ]);
    expect(noSaveTimeLine(4, 12)).toBe("4 of 12 compared tasks have staff points with no recorded save time (saved before save times were kept), so they are compared with the newest AI grade.");
    expect(noSaveTimeLine(1, 1)).toBe("1 of 1 compared task has staff points with no recorded save time (saved before save times were kept), so it is compared with the newest AI grade.");
    expect(noSaveTimeLine(0, 3)).toBe("0 of 3 compared tasks have staff points with no recorded save time (saved before save times were kept), so they are compared with the newest AI grade.");
  });

  it("shows the no-save-time line when tasks are compared, and not when none are", () => {
    const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    const shown = text(renderToStaticMarkup(createElement(GraderView, { heading: "x", stats: graderStats({ submissions: [], grades: [compared({ staff: { Specs: 1 } }), compared()] }) })));
    expect(shown).toContain(noSaveTimeLine(1, 2));
    expect(shown).toContain(regradedLine(0));
    for (const line of [GRADER_TEXT.intro, ...GRADER_TEXT.limits, GRADER_TEXT.progressNote]) expect(shown).toContain(line);
    const none = text(renderToStaticMarkup(createElement(GraderView, { heading: "x", stats: graderStats({ submissions: [], grades: [{ ...compared(), releasedAt: null }] }) })));
    expect(none).not.toContain("no recorded save time");
  });
});

// ---- 5. The loader reads the seen entry from the history ----

describe("loadGraderStats reads the grade staff saw from cse_task_ai_grades (#429)", () => {
  it("attaches the matching history entry and reads the history only for submissions that need it", async () => {
    const other = "00000000-0000-4000-8000-000000000002";
    db.tables = {
      cse_assignment_submissions: [SUB, other].map((id) => ({
        id, course_id: "course-1", assignment_number: 3, submitted_at: "2026-11-18T12:00:00.000Z", superseded_at: null,
        slot_1: 1, slot_2: null, slot_3: null, slot_4: null, slot_5: null, slot_6: null,
      })),
      cse_task_grades: [
        { assignment_submission_id: SUB, task_slot: 1, rubric: aiRubric(), agent_total: "10.00", model: "model-a", prompt_version: "prompt-v5",
          graded_at: "2026-11-23T10:00:00+00:00", instructor_rubric: RUBRIC.map((row) => ({ name: row.name, awarded: row.points, note: "" })), instructor_total: "10.00",
          released_at: RELEASED, instructor_saved_at: "2026-11-20T12:00:00+00:00", instructor_saw_graded_at: "2026-11-19T12:00:00+00:00" },
        { assignment_submission_id: other, task_slot: 1, rubric: aiRubric(), agent_total: "10.00", model: "model-a", prompt_version: "prompt-v5",
          graded_at: "2026-11-19T12:00:00+00:00", instructor_rubric: null, instructor_total: null, released_at: RELEASED, instructor_saved_at: null, instructor_saw_graded_at: null },
      ],
      cse_task_ai_grades: [
        { assignment_submission_id: SUB, task_slot: 1, rubric: aiRubric({ Specs: 1 }), agent_total: "9.00", model: "model-a", prompt_version: "prompt-v4", graded_at: "2026-11-19T12:00:00.000+00:00" },
        { assignment_submission_id: SUB, task_slot: 1, rubric: aiRubric(), agent_total: "10.00", model: "model-a", prompt_version: "prompt-v5", graded_at: "2026-11-23T10:00:00+00:00" },
      ],
    };
    const { loadGraderStats } = await import("@/lib/cse115a/loadGraderStats");
    const stats = await loadGraderStats(fakeDb, "course-1");
    expect(stats.totals.filter((row) => row.assignment !== null).map((row) => [row.promptVersion, row.released, row.same, row.higher])).toEqual([
      ["prompt-v4", 1, 0, 1],
      ["prompt-v5", 1, 1, 0],
    ]);
    expect(db.calls.filter((call) => call.table === "cse_task_ai_grades")).toHaveLength(1);
  });
});

// ---- 6. The review page's history line ----

function entry(gradedAt: string, prompt: string, boxes: Partial<Record<CriterionName, number | null>> = {}): AiGradeEntry {
  const rubric = aiRubric(boxes);
  return { task_slot: 1, rubric, agent_total: total(rubric).toFixed(2), model: "model-a", prompt_version: prompt, graded_at: gradedAt };
}

describe("the review page shows the AI grade history (#429)", () => {
  it("shows nothing for zero or one AI grade", () => {
    expect(renderToStaticMarkup(createElement(AiGradeHistory, { entries: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(AiGradeHistory, { entries: [entry("2026-11-19T12:00:00Z", "prompt-v4")] }))).toBe("");
  });

  it("with two or more, one closed line opening a table of date, model, prompt version, total and the six boxes, newest first", () => {
    const html = renderToStaticMarkup(createElement(AiGradeHistory, { entries: [
      entry("2026-11-19T12:00:00Z", "prompt-v4", { Specs: 1, "Test quality": null }),
      entry("2026-11-23T10:00:00Z", "prompt-v5"),
    ] }));
    expect(html).toMatch(/^<details[^>]*>(?!.*\bopen\b)/);
    expect(html).toContain(`<summary class="cursor-pointer px-3 py-2 text-sm font-medium">${aiGradeHistoryLabel(2)}</summary>`);
    expect(aiGradeHistoryLabel(2)).toBe("Graded 2 times by the AI");
    for (const head of ["Date", "Model", "Prompt version", "Total", ...RUBRIC.map((row) => row.name)]) expect(html).toContain(`>${head}</th>`);
    expect(html.indexOf("prompt-v5")).toBeLessThan(html.indexOf("prompt-v4"));
    expect(html).toContain(">7 / 10<"); // prompt-v4: Specs 1 of 2 and Test quality blank
    expect(html).toContain(">—<"); // the blank box
    expect(html).not.toMatch(/<input|<button|<textarea/);
  });

  it("the review page puts it under each task's rubric with that task's entries", () => {
    const page = read("components/cse115a/instructor/SubmissionReview.tsx");
    expect(page.indexOf("<AiGradeHistory entries={aiGrades} />")).toBeGreaterThan(page.indexOf("{RUBRIC.map((row) => {"));
    expect(page.indexOf("<AiGradeHistory entries={aiGrades} />")).toBeLessThan(page.indexOf("Notes to the student"));
    expect(page).toContain("aiGrades={(detail.aiGrades ?? []).filter((item) => item.task_slot === task.slot)}");
  });

  it("the submission route returns every AI grade of the submission, and an empty list when the lookup fails", async () => {
    db.tables = {
      cse_assignment_submissions: [{ id: SUB, course_id: "course-1", user_id: "user-1", assignment_number: 3, attempt: 1, status: "graded", snapshot: { tasks: [{ slot: 1 }] }, submitted_at: "2026-11-18T12:00:00Z", superseded_at: null, unlock_reason: null }],
      cse_course_memberships: [], cse_task_grades: [], cse_grading_jobs: [],
      cse_task_ai_grades: [entry("2026-11-19T12:00:00Z", "prompt-v4"), entry("2026-11-23T10:00:00Z", "prompt-v5")].map((row) => ({ ...row, assignment_submission_id: SUB })),
    };
    const { GET } = await import("@/app/api/cse115a/instructor/submissions/[id]/route");
    const call = async () => (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: SUB }) })).json() as Promise<{ aiGrades: AiGradeEntry[] }>;
    expect((await call()).aiGrades.map((row) => row.prompt_version).sort()).toEqual(["prompt-v4", "prompt-v5"]);
    db.fail["cse_task_ai_grades:select"] = "relation does not exist";
    expect((await call()).aiGrades).toEqual([]);
    const route = read("app/api/cse115a/instructor/submissions/[id]/route.ts");
    expect(route).toContain('const AI_GRADE_COLUMNS = "task_slot,rubric,agent_total,model,prompt_version,graded_at";');
  });
});
