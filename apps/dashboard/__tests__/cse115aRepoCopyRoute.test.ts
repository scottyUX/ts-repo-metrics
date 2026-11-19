// #298 D: the instructor route that reports repo copies and queues repo_copy jobs. The guard, the
// course's rows, the store and the job table are fakes; the copier throws if called, because the route
// must never clone. Nothing reaches GitHub or Supabase.
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CopyJobRow } from "@/lib/cse115a/benchmark/repoCopyJobs";
import type { SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

type Task = { instance_id: string; repo: string; base_commit: string; assignment_submission_id: string };

const state = vi.hoisted(() => ({
  guard: null as unknown,
  tasks: [] as Task[],
  stored: new Set<string>(),
  jobs: new Map<string, CopyJobRow>(),
  queued: [] as string[][],
  queueFails: false,
  cloned: 0,
  lists: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/cse115a/instructorApi", () => ({ guardCourse: vi.fn(async () => (typeof state.guard === "function" ? state.guard() : state.guard)) }));
vi.mock("@/lib/cse115a/benchmark/loadCourseBenchmark", () => ({ loadCourseCopyTasks: vi.fn(async () => state.tasks) }));
vi.mock("@/lib/cse115a/benchmark/validation/snapshotStore", async (original) => {
  const real = await original<typeof import("@/lib/cse115a/benchmark/validation/snapshotStore")>();
  return {
    ...real,
    supabaseSnapshotStore: (env: Record<string, string | undefined>) => (real.storeCredentials(env) ? {
      has: async (id: string) => state.stored.has(id),
      upload: async () => { throw new Error("the route must not upload"); },
      download: async () => false,
      list: async () => { state.lists++; return new Set(state.tasks.filter((t) => state.stored.has(t.instance_id)).map((t) => real.fullSnapshotObject(t.instance_id, t.base_commit))); },
    } satisfies SnapshotStore : null),
  };
});
vi.mock("@/lib/cse115a/benchmark/repoCopy", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/benchmark/repoCopy")>()),
  copyTaskRepo: async () => { state.cloned++; throw new Error("the route must not clone"); },
}));
vi.mock("@/lib/cse115a/benchmark/repoCopyJobs", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/benchmark/repoCopyJobs")>()),
  supabaseRepoCopyJobs: () => ({
    states: async (ids: string[]) => new Map([...state.jobs].filter(([id]) => ids.includes(id))),
    queue: async (ids: string[]) => {
      if (state.queueFails) throw new Error("new row violates check constraint");
      state.queued.push(ids);
    },
  }),
}));

const { GET, POST } = await import("@/app/api/cse115a/instructor/courses/[slug]/benchmark/repo-copies/route");

const params = { params: Promise.resolve({ slug: "cse115a-f26" }) };
const post = (body: unknown = {}) => POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);
const get = () => GET(new Request("http://localhost/x"), params);
const commit = "a".repeat(40);
const job = (sub: string, status: CopyJobRow["status"], last_error: string | null = null): [string, CopyJobRow] => [sub, { assignment_submission_id: sub, status, last_error, attempts: 1 }];

beforeEach(() => {
  state.guard = { identity: {}, course: { id: "course-1", slug: "cse115a-f26" } };
  // Ten tasks in ten submissions: T-0 stored, T-1 queued, T-2 running, T-3 failed, the rest without a copy.
  state.tasks = Array.from({ length: 10 }, (_, i) => ({ instance_id: `team__app-T-${i}`, repo: "team/app", base_commit: commit, assignment_submission_id: `sub-${i}` }));
  state.stored = new Set(["team__app-T-0"]);
  state.jobs = new Map([job("sub-1", "queued"), job("sub-2", "running"), job("sub-3", "failed", "Repo copy failed: team__app-T-3: Timed out: the clone took longer than 30 s.")]);
  state.queued = [];
  state.queueFails = false;
  state.cloned = 0;
  state.lists = 0;
  vi.stubEnv("CSE115A_REPO_COPIES", "on");
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
});
afterEach(() => vi.unstubAllEnvs());

describe("#298 D: the repo-copies route", () => {
  it("refuses someone who is not on the course staff, for reading and for queuing", async () => {
    state.guard = () => ({ response: NextResponse.json({ error: "You are not on this course's staff." }, { status: 403 }) });
    for (const response of [await get(), await post()]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "You are not on this course's staff." });
    }
    expect(state.queued).toEqual([]);
  });

  it("shows each task as stored, queued, running, failed with its reason, or missing", async () => {
    const body = await (await get()).json();
    expect(body.enabled).toBe(true);
    expect(body.tasks.slice(0, 5).map((t: { state: string; reason: string | null }) => [t.state, t.reason])).toEqual([
      ["stored", null], ["queued", null], ["running", null], ["failed", "Repo copy failed: team__app-T-3: Timed out: the clone took longer than 30 s."], ["missing", null],
    ]);
    // Ten tasks, one listing of the bucket.
    expect(state.lists).toBe(1);
  });

  it.each([["unset", undefined], ["off", "off"], ["'ON '", "ON "], ["1", "1"]])("switch %s: queuing is refused, reading still works", async (_label, value) => {
    vi.stubEnv("CSE115A_REPO_COPIES", value as string);
    const refused = await post();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "Repo copies are off on this site. Set CSE115A_REPO_COPIES=on in the site's settings to turn them on." });
    expect(state.queued).toEqual([]);
    const read = await get();
    expect(read.status).toBe(200);
    expect((await read.json()).enabled).toBe(false);
  });

  it("Save missing queues one job per submission with a missing or failed task, with no cap, and clones nothing", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(state.queued).toEqual([["sub-3", "sub-4", "sub-5", "sub-6", "sub-7", "sub-8", "sub-9"]]);
    expect(body).toEqual({ queued: ["team__app-T-3", "team__app-T-4", "team__app-T-5", "team__app-T-6", "team__app-T-7", "team__app-T-8", "team__app-T-9"], submissions: 7 });
    expect(state.cloned).toBe(0);
  });

  it("Retry queues that task's submission and clones nothing; a task not in the course is 404", async () => {
    expect(await (await post({ instanceId: "team__app-T-3" })).json()).toEqual({ queued: ["team__app-T-3"], submissions: 1 });
    expect(state.queued).toEqual([["sub-3"]]);
    expect((await post({ instanceId: "elsewhere-T-1" })).status).toBe(404);
    expect(state.cloned).toBe(0);
  });

  it("says so when the jobs cannot be queued, or the site has no storage key", async () => {
    state.queueFails = true;
    const failed = await post();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Could not queue repo copy jobs. Has the repo_copy migration been applied?" });
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await get()).status).toBe(503);
    expect((await post()).status).toBe(503);
  });
});
