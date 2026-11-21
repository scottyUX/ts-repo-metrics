// #418: the staff re-capture route. The guard, the database and GitHub are fakes; nothing reaches GitHub or
// Supabase. Ids are made up.
import { NextResponse } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  guard: null as unknown,
  listed: [] as Array<Record<string, unknown>>,
  submission: null as null | Record<string, unknown>,
  runs: [] as Array<{ apply: boolean; repoCopies: boolean; login: string | null }>,
  stopped: null as string | null,
  listFilters: [] as Array<[string, unknown]>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cse115a/instructorApi", () => ({ guardCourse: vi.fn(async () => (typeof state.guard === "function" ? state.guard() : state.guard)) }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabase: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { state.listFilters.push([column, value]); return query; },
        is: (column: string, value: unknown) => { state.listFilters.push([column, value]); return query; },
        order: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: state.listed, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/cse115a/jobs/supabaseStore", () => ({ supabaseJobStore: () => ({ loadSubmission: async () => state.submission }) }));
vi.mock("@/lib/cse115a/benchmark/recaptureStore", () => ({ supabaseRecaptureDb: () => ({}) }));
vi.mock("@/lib/cse115a/githubApp", () => ({
  githubAppConfig: () => ({ appId: "1", privateKey: "k", slug: "app" }),
  courseRepoReader: (login: string | null) => ({ login }),
}));
vi.mock("@/lib/cse115a/benchmark/recapture", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/benchmark/recapture")>()),
  runRecapture: async (_db: unknown, gh: { login: string | null }, submission: { id: string }, options: { apply: boolean; repoCopies: boolean }) => {
    state.runs.push({ ...options, login: gh.login });
    const plan = { submissionId: submission.id, assignmentNumber: 1, status: "graded", superseded: false, released: false, tasks: [] };
    if (!options.apply) return { plan };
    return { plan, done: { backupWritten: true, snapshotWritten: !state.stopped, benchmarkTasksWritten: 0, benchmarkSourcesWritten: 0, repoCopy: "not needed", ...(state.stopped ? { stopped: state.stopped } : {}) } };
  },
}));

const { GET, POST } = await import("@/app/api/cse115a/instructor/courses/[slug]/recapture/route");
const params = { params: Promise.resolve({ slug: "cse115a-f26" }) };
const post = (body: unknown) => POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);

beforeEach(() => {
  state.guard = { identity: { githubLogin: null }, course: { id: "course-1", slug: "cse115a-f26" } };
  state.listed = [
    { id: "sub-1", assignment_number: 1, status: "graded", s1: 1, e1: null, s2: 2, e2: null },
    { id: "sub-2", assignment_number: 1, status: "released", s1: 1, e1: "head", s2: 2, e2: null },
    { id: "sub-3", assignment_number: 2, status: "graded", s1: 1, e1: "head" },
  ];
  state.submission = { id: "sub-1", course_id: "course-1", user_id: "u", assignment_number: 1, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "x", tasks: [] } };
  state.runs = [];
  state.stopped = null;
  state.listFilters = [];
  vi.stubEnv("CSE115A_REPO_COPIES", "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("#418: the re-capture route", () => {
  it("refuses someone who is not on the course staff, for the list and for a re-capture", async () => {
    state.guard = () => ({ response: NextResponse.json({ error: "You are not on this course's staff." }, { status: 403 }) });
    for (const response of [await GET(new Request("http://localhost/x"), params), await post({ submissionId: "sub-1", apply: true })]) {
      expect(response.status).toBe(403);
    }
    expect(state.runs).toEqual([]);
  });

  it("lists the course's not-superseded submissions with at least one old-rule task, with counts", async () => {
    const response = await GET(new Request("http://localhost/x"), params);
    expect(await response.json()).toEqual({
      submissions: [
        { id: "sub-1", assignmentNumber: 1, status: "graded", oldRuleTasks: 2 },
        { id: "sub-2", assignmentNumber: 1, status: "released", oldRuleTasks: 1 },
      ],
      counts: { submissions: 2, tasks: 3 },
    });
    expect(state.listFilters).toEqual(expect.arrayContaining([["course_id", "course-1"], ["superseded_at", null]]));
  });

  it("refuses a submission from another course, and runs nothing", async () => {
    state.submission = { ...state.submission!, course_id: "course-2" };
    const response = await post({ submissionId: "sub-1", apply: true });
    expect(response.status).toBe(404);
    expect(state.runs).toEqual([]);
  });

  it("refuses a missing submission id", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("is a dry run unless apply is exactly true; reads with the course App reader", async () => {
    await post({ submissionId: "sub-1" });
    await post({ submissionId: "sub-1", apply: "yes" });
    await post({ submissionId: "sub-1", apply: true });
    expect(state.runs.map((run) => run.apply)).toEqual([false, false, true]);
    expect(state.runs.every((run) => run.repoCopies && run.login === "course-staff")).toBe(true);
  });

  it("a stopped apply is an error the page shows, with the plan and what was done", async () => {
    state.stopped = "The submission changed since it was read.";
    const response = await post({ submissionId: "sub-1", apply: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "The submission changed since it was read.", done: { snapshotWritten: false } });
  });
});
