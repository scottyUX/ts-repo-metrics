// #298 D: the instructor route that reports and saves repo copies. The guard, the course's rows, the
// store and the copier are fakes; nothing reaches GitHub or Supabase.
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoCopyResult, RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import type { SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";

const state = vi.hoisted(() => ({
  guard: null as unknown,
  tasks: [] as RepoCopyTask[],
  stored: new Set<string>(),
  copied: [] as string[],
  fail: new Set<string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/cse115a/instructorApi", () => ({ guardCourse: vi.fn(async () => (typeof state.guard === "function" ? state.guard() : state.guard)) }));
vi.mock("@/lib/cse115a/benchmark/loadCourseBenchmark", () => ({ loadCourseCopyTasks: vi.fn(async () => state.tasks) }));
vi.mock("@/lib/cse115a/benchmark/validation/snapshotStore", async (original) => {
  const real = await original<typeof import("@/lib/cse115a/benchmark/validation/snapshotStore")>();
  return {
    ...real,
    // The real check for the credentials, then an in-memory bucket.
    supabaseSnapshotStore: (env: Record<string, string | undefined>) => (real.storeCredentials(env) ? {
      has: async (id: string) => state.stored.has(id),
      upload: async () => "uploaded",
      download: async () => false,
    } satisfies SnapshotStore : null),
  };
});
vi.mock("@/lib/cse115a/benchmark/repoCopy", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/benchmark/repoCopy")>()),
  copyTaskRepo: async (task: RepoCopyTask): Promise<RepoCopyResult> => {
    state.copied.push(task.instance_id);
    if (state.fail.has(task.instance_id)) return { instance_id: task.instance_id, outcome: "failed", reason: "not_installed", line: `${task.repo} is private (or gone) and the course GitHub App is not installed on it. Install the App on the repository, then retry.` };
    state.stored.add(task.instance_id);
    return { instance_id: task.instance_id, outcome: "stored" };
  },
}));

const { GET, POST } = await import("@/app/api/cse115a/instructor/courses/[slug]/benchmark/repo-copies/route");

const params = { params: Promise.resolve({ slug: "cse115a-f26" }) };
const post = (body: unknown = {}) => POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);
const get = () => GET(new Request("http://localhost/x"), params);
const commit = "a".repeat(40);

beforeEach(() => {
  state.guard = { identity: {}, course: { id: "course-1", slug: "cse115a-f26" } };
  state.tasks = Array.from({ length: 6 }, (_, i) => ({ instance_id: `team__app-T-${i}`, repo: "team/app", base_commit: commit }));
  state.stored = new Set(["team__app-T-0"]);
  state.copied = [];
  state.fail = new Set();
  vi.stubEnv("CSE115A_REPO_COPIES", "on");
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
});
afterEach(() => vi.unstubAllEnvs());

describe("#298 D: the repo-copies route", () => {
  it("refuses someone who is not on the course staff, for reading and for copying", async () => {
    state.guard = () => ({ response: NextResponse.json({ error: "You are not on this course's staff." }, { status: 403 }) });
    for (const response of [await get(), await post()]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "You are not on this course's staff." });
    }
    expect(state.copied).toEqual([]);
  });

  it.each([["unset", undefined], ["off", "off"], ["'ON '", "ON "], ["1", "1"]])("switch %s: copying is refused, reading still works", async (_label, value) => {
    if (value === undefined) vi.stubEnv("CSE115A_REPO_COPIES", undefined as unknown as string);
    else vi.stubEnv("CSE115A_REPO_COPIES", value);
    const refused = await post();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "Repo copies are off on this site. Set CSE115A_REPO_COPIES=on in the site's settings to turn them on." });
    expect(state.copied).toEqual([]);
    const read = await get();
    expect(read.status).toBe(200);
    const body = await read.json();
    expect(body.enabled).toBe(false);
    expect(body.stored).toBe(1);
    expect(body.tasks.map((t: { instance_id: string; stored: boolean }) => [t.instance_id, t.stored])[0]).toEqual(["team__app-T-0", true]);
  });

  it("copies at most 3 per request, reports the rest, and goes on past a failure", async () => {
    state.fail = new Set(["team__app-T-1"]);
    const first = await post();
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(state.copied).toEqual(["team__app-T-1", "team__app-T-2", "team__app-T-3"]);
    expect(body.results.map((r: RepoCopyResult) => r.outcome)).toEqual(["failed", "stored", "stored"]);
    expect(body.results[0].line).toBe("team/app is private (or gone) and the course GitHub App is not installed on it. Install the App on the repository, then retry.");
    expect(body.remaining).toBe(2);
    // The page sends the failures back as skip; the next request does the rest.
    const second = await (await post({ skip: ["team__app-T-1"] })).json();
    expect(second.results.map((r: RepoCopyResult) => r.instance_id)).toEqual(["team__app-T-4", "team__app-T-5"]);
    expect(second.remaining).toBe(0);
    // Nothing in a response but ids, outcomes, reasons and lines.
    for (const result of [...body.results, ...second.results]) expect(Object.keys(result).sort()).toEqual(result.outcome === "failed" ? ["instance_id", "line", "outcome", "reason"] : ["instance_id", "outcome"]);
  });

  it("Retry copies one task of this course, and refuses one that is not", async () => {
    const one = await (await post({ instanceId: "team__app-T-3" })).json();
    expect(one).toEqual({ results: [{ instance_id: "team__app-T-3", outcome: "stored" }], remaining: null });
    expect(state.copied).toEqual(["team__app-T-3"]);
    const other = await post({ instanceId: "elsewhere-T-1" });
    expect(other.status).toBe(404);
  });

  it("says so when the site has no storage key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await get()).status).toBe(503);
    expect((await post()).status).toBe(503);
  });
});
