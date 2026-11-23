// #431: the work-PR route. The guard, the database and GitHub are fakes; nothing reaches GitHub or Supabase.
// Ids are made up.
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  guard: null as unknown,
  submission: null as null | Record<string, unknown>,
  runs: [] as Array<{ request: unknown; by: string; login: string | null }>,
  lists: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cse115a/instructorApi", () => ({ guardSubmission: vi.fn(async () => (typeof state.guard === "function" ? state.guard() : state.guard)) }));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/cse115a/jobs/supabaseStore", () => ({ supabaseJobStore: () => ({ loadSubmission: async () => state.submission }) }));
vi.mock("@/lib/cse115a/benchmark/workPrChoiceStore", () => ({ supabaseWorkPrDb: () => ({ loadCourseTaskRefs: async () => [] }) }));
vi.mock("@/lib/cse115a/githubApp", () => ({
  githubAppConfig: () => ({ appId: "1", privateKey: "k", slug: "app" }),
  courseRepoReader: (login: string | null) => ({ login }),
}));
vi.mock("@/lib/cse115a/benchmark/workPrChoice", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/benchmark/workPrChoice")>()),
  listWorkPrCandidates: async () => { state.lists++; return { candidates: [], authorKnown: false, calls: 1 }; },
  runWorkPrChange: async (_db: unknown, gh: { login: string | null }, _submission: unknown, request: unknown, options: { by: string }) => {
    state.runs.push({ request, by: options.by, login: gh.login });
    return { ok: true, status: 200, body: { apply: false, preview: {} } };
  },
}));

const { GET, POST } = await import("@/app/api/cse115a/instructor/submissions/[id]/work-pr/route");
const ID = "11111111-2222-4333-8444-555555555555";
const params = { params: Promise.resolve({ id: ID }) };
const get = (slot = "1") => GET(new Request(`http://localhost/x?slot=${slot}`), params);
const post = (body: unknown) => POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);

beforeEach(() => {
  state.guard = { identity: { email: "ta-one@ucsc.edu", githubLogin: null }, course: { id: "course-1", slug: "cse115a-f26" } };
  state.submission = { id: ID, course_id: "course-1", user_id: "u", assignment_number: 4, status: "graded", superseded_at: null,
    snapshot: { version: 1, capturedAt: "x", tasks: [{ slot: 1, repoFullName: "team-kappa/shop", prNumber: 7, pr: { author: null } }] } };
  state.runs = [];
  state.lists = 0;
});

describe("#431: the work-PR route", () => {
  it("refuses a caller who is not staff of the submission's course (including staff of another course), for the list and for a change", async () => {
    state.guard = () => ({ response: NextResponse.json({ error: "You are not on this course's staff." }, { status: 403 }) });
    for (const response of [await get(), await post({ slot: 1, pr: 5, reason: "r", apply: true }), await post({ slot: 1, undo: true })]) {
      expect(response.status).toBe(403);
    }
    expect(state.runs).toEqual([]);
    expect(state.lists).toBe(0);
  });

  it("refuses a submission outside the guarded course", async () => {
    state.submission = { ...state.submission!, course_id: "course-2" };
    expect((await get()).status).toBe(404);
    expect((await post({ slot: 1, pr: 5, reason: "r" })).status).toBe(404);
    expect(state.runs).toEqual([]);
  });

  it("needs a slot; lists with the course App reader and says when the author is unknown", async () => {
    expect((await get("x")).status).toBe(400);
    expect((await post({ pr: 5 })).status).toBe(400);
    const listed = await get();
    expect(await listed.json()).toMatchObject({ slot: 1, repoFullName: "team-kappa/shop", authorKnown: false, note: "The task's PR author is not saved, so every merged PR in the repository is listed." });
  });

  it("is a preview unless apply is exactly true; undo is its own request; the staff email is recorded", async () => {
    await post({ slot: 1, pr: 5, reason: "r" });
    await post({ slot: "1", prNumber: 5, reason: "r", apply: "yes" });
    await post({ slot: 1, pr: 5, reason: "r", apply: true, seen: { prNumber: 7, recapturedAt: null } });
    await post({ slot: 1, undo: true, seen: { prNumber: 5 } });
    expect(state.runs.map((run) => run.request)).toEqual([
      { kind: "choose", slot: 1, pr: 5, reason: "r", apply: false, seen: null },
      { kind: "choose", slot: 1, pr: 5, reason: "r", apply: false, seen: null },
      { kind: "choose", slot: 1, pr: 5, reason: "r", apply: true, seen: { prNumber: 7, recapturedAt: null } },
      { kind: "undo", slot: 1, seen: { prNumber: 5, recapturedAt: null } },
    ]);
    expect(state.runs.every((run) => run.by === "ta-one@ucsc.edu" && run.login === "course-staff")).toBe(true);
  });
});
