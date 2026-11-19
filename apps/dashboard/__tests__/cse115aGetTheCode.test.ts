// "Get the code" on the staff review page: which repo copy each task has (the submission detail
// route), the staff-only download route (a redirect to a 60-second Storage link), the command blocks,
// the run recipe, and the clone commands proved on real bundles written by the validator's bundleRepo.
// The database, the sign-in and the bucket are fakes; nothing reaches GitHub or Supabase.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CopyFiles } from "@/lib/cse115a/repoCopyAccess";
import type { TaskCode } from "@/lib/cse115a/getTheCode";

const SUB = "00000000-0000-4000-8000-000000000001";
const BASE = "abcdef0123456789abcdef0123456789abcdef01";
const ID1 = "team__app-T-1";
const ID2 = "team__app-T-2";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  identity: null as null | { userId: string; email: string; githubLogin: null },
  staff: new Map<string, "instructor" | "ta">(),
  tables: {} as Record<string, Row[]>,
  failTables: new Set<string>(),
  objects: new Set<string>(),
  storage: "ok" as "ok" | "returns-error" | "throws",
  signed: [] as Array<{ path: string; expiresIn: number; options: { download: string } }>,
}));

vi.mock("server-only", () => ({}));

/** A query builder over `state.tables` that understands the calls the routes make. */
function fakeDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const result = () => (state.failTables.has(table)
        ? { data: null, error: { message: `${table} is unavailable` } }
        : { data: (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null });
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
        order: () => query,
        single: async () => { const r = result(); return r.error ? r : { data: r.data![0] ?? null, error: r.data![0] ? null : { message: "no row" } }; },
        maybeSingle: async () => { const r = result(); return r.error ? r : { data: r.data![0] ?? null, error: null }; },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ getSupabase: () => fakeDb(), isSupabaseConfigured: () => true }));
vi.mock("@/lib/cse115a/server", () => ({
  getCourseIdentity: async () => state.identity,
  requireCourseStaff: async () => null,
  requireSubmissionStaff: async (identity: { email: string }, _id: string, options: { instructorOnly?: boolean } = {}) => {
    const role = state.staff.get(identity.email);
    if (!role || (options.instructorOnly && role !== "instructor")) return null;
    return { id: "course-1", slug: "cse115a-f26", title: "CSE 115A", term: "Fall 2026", assignment_count: 4, active: true, role };
  },
}));

const files: CopyFiles = {
  async exists(path) {
    if (state.storage === "throws") throw new Error("fetch failed: connect ECONNREFUSED");
    if (state.storage === "returns-error") return { data: false, error: { message: "Internal Server Error", statusCode: "500" } };
    // storage-js 2.97: a missing object is { data: false, error } with the response's 400 or 404 on originalError.
    return state.objects.has(path) ? { data: true, error: null } : { data: false, error: { message: "Object not found", originalError: { status: 400 } } };
  },
  async createSignedUrl(path, expiresIn, options) {
    state.signed.push({ path, expiresIn, options });
    return { data: { signedUrl: `https://example.invalid/storage/v1/object/sign/benchmark-snapshots/${path}?token=SECRET-TOKEN&download=${options.download}` }, error: null };
  },
};
vi.mock("@/lib/cse115a/repoCopyAccess", async (original) => ({
  ...(await original<typeof import("@/lib/cse115a/repoCopyAccess")>()),
  supabaseCopyFiles: () => files,
}));

const detailRoute = await import("@/app/api/cse115a/instructor/submissions/[id]/route");
const downloadRoute = await import("@/app/api/cse115a/instructor/submissions/[id]/repo-copy/route");
const text = await import("@/lib/cse115a/getTheCode");
const { GetTheCode } = await import("@/components/cse115a/instructor/GetTheCode");
const { fullSnapshotObject, snapshotObject, legacySnapshotObject } = await import("@/lib/cse115a/benchmark/validation/snapshotStore");
const { bundleRepo } = await import("@/lib/cse115a/benchmark/validation/runRow");

const params = { params: Promise.resolve({ id: SUB }) };
const recipe = {
  image: "node:24-bookworm", runners: ["vitest"], package_dir: "web",
  install_steps: [{ cwd: "", command: "npm ci" }], test_steps: [{ kind: "vitest", command: "npx vitest run --reporter=json" }],
  env: {}, services: [], node_source: null,
};

beforeEach(() => {
  state.identity = { userId: "user-staff", email: "ta@example.edu", githubLogin: null };
  state.staff = new Map([["ta@example.edu", "ta"], ["prof@example.edu", "instructor"]]);
  state.tables = {
    cse_assignment_submissions: [{
      id: SUB, course_id: "course-1", user_id: "user-student", assignment_number: 2, attempt: 1, status: "graded",
      snapshot: { version: 1, capturedAt: "2026-11-01T00:00:00Z", tasks: [{ slot: 1 }, { slot: 2 }] },
      submitted_at: "2026-11-01T00:00:00Z", superseded_at: null, unlock_reason: null,
    }],
    cse_course_memberships: [], cse_task_grades: [], cse_grading_jobs: [],
    cse_benchmark_task_sources: [{ assignment_submission_id: SUB, task_slot: 1, instance_id: ID1 }, { assignment_submission_id: SUB, task_slot: 2, instance_id: ID2 }],
    cse_benchmark_tasks: [{ instance_id: ID1, base_commit: BASE, harbor_env: recipe }, { instance_id: ID2, base_commit: BASE, harbor_env: null }],
  };
  state.failTables = new Set();
  state.objects = new Set();
  state.storage = "ok";
  state.signed = [];
});
afterEach(() => vi.restoreAllMocks());

async function detailCode(): Promise<TaskCode[]> {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await detailRoute.GET(new Request("http://localhost/x"), params);
  expect(response.status).toBe(200);
  return (await response.json()).code;
}

describe("1. the detail route reports each task's copy", () => {
  it.each([
    ["a .full copy", () => fullSnapshotObject(ID1, BASE), true],
    ["today's base-only name", () => snapshotObject(ID1, BASE), false],
    ["the legacy name", () => legacySnapshotObject(ID1), false],
  ])("%s", async (_label, object, complete) => {
    state.objects = new Set([object()]);
    const [one] = await detailCode();
    expect(one).toEqual({ slot: 1, instanceId: ID1, repoCopy: { stored: true, object: object(), complete }, runRecipe: expect.anything() });
  });

  it("takes the .full copy when several names are stored (the reader order)", async () => {
    state.objects = new Set([legacySnapshotObject(ID1), snapshotObject(ID1, BASE), fullSnapshotObject(ID1, BASE)]);
    expect((await detailCode())[0]!.repoCopy).toEqual({ stored: true, object: fullSnapshotObject(ID1, BASE), complete: true });
  });

  it("no copy", async () => {
    expect((await detailCode()).map((c) => c.repoCopy)).toEqual([text.NO_COPY, text.NO_COPY]);
  });

  it("no benchmark row: stored false, no instance", async () => {
    state.tables.cse_benchmark_task_sources = [];
    state.objects = new Set([fullSnapshotObject(ID1, BASE)]);
    expect(await detailCode()).toEqual([
      { slot: 1, instanceId: null, repoCopy: text.NO_COPY, runRecipe: null },
      { slot: 2, instanceId: null, repoCopy: text.NO_COPY, runRecipe: null },
    ]);
  });

  it.each([["returns an error", "returns-error"], ["throws", "throws"]] as const)("a Storage call that %s: stored false, the page still loads", async (_label, mode) => {
    state.storage = mode;
    const code = await detailCode();
    expect(code.map((c) => c.repoCopy)).toEqual([text.NO_COPY, text.NO_COPY]);
    expect(code[0]!.instanceId).toBe(ID1);
  });

  it("a benchmark table that cannot be read: stored false, the page still loads", async () => {
    state.failTables = new Set(["cse_benchmark_tasks"]);
    expect((await detailCode()).map((c) => c.repoCopy)).toEqual([text.NO_COPY, text.NO_COPY]);
  });
});

describe("2. the download route", () => {
  const download = (slot: string | null = "1") => downloadRoute.GET(new Request(`http://localhost/api/cse115a/instructor/submissions/${SUB}/repo-copy${slot === null ? "" : `?slot=${slot}`}`), params);

  it.each([["a TA", "ta@example.edu"], ["an instructor", "prof@example.edu"]])("%s gets a 302 to a 60-second signed link that saves as <instance_id>.bundle", async (_label, email) => {
    state.identity = { userId: "user-staff", email, githubLogin: null };
    state.objects = new Set([fullSnapshotObject(ID1, BASE)]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await download();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://example.invalid/storage/v1/object/sign/benchmark-snapshots/${fullSnapshotObject(ID1, BASE)}?token=SECRET-TOKEN&download=${ID1}.bundle`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.signed).toEqual([{ path: fullSnapshotObject(ID1, BASE), expiresIn: 60, options: { download: `${ID1}.bundle` } }]);
    expect(info.mock.calls).toEqual([[`Repo copy download: user user-staff submission ${SUB} slot 1 instance ${ID1}`]]);
    const line = String(info.mock.calls[0]![0]);
    expect(line).not.toMatch(/https?:|token|SECRET|sign/i);
  });

  it("an older copy is downloaded too", async () => {
    state.objects = new Set([legacySnapshotObject(ID1)]);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect((await download()).status).toBe(302);
    expect(state.signed[0]).toEqual({ path: legacySnapshotObject(ID1), expiresIn: 60, options: { download: `${ID1}.bundle` } });
  });

  it.each([
    ["a staff member of another course", { userId: "u2", email: "other@example.edu", githubLogin: null }, 403, "You are not on this course's staff."],
    ["a student", { userId: "user-student", email: "student@example.edu", githubLogin: null }, 403, "You are not on this course's staff."],
    ["someone signed out", null, 401, "Sign in with UCSC Google."],
  ])("%s is refused and no link is made", async (_label, identity, status, error) => {
    state.identity = identity;
    state.objects = new Set([fullSnapshotObject(ID1, BASE)]);
    const response = await download();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.signed).toEqual([]);
  });

  it("no copy, or no benchmark row: 404 with the text", async () => {
    for (const slot of ["1", "3"]) {
      const response = await download(slot);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "No repo copy is stored for this task." });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(state.signed).toEqual([]);
  });

  it("a missing or bad slot is 400; a Storage failure is 502 and makes no link", async () => {
    for (const slot of [null, "0", "x", "1.5"]) expect((await download(slot)).status).toBe(400);
    state.storage = "throws";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await download()).status).toBe(502);
    expect(state.signed).toEqual([]);
  });
});

describe("3. the command blocks and the section", () => {
  const render = (code: TaskCode | undefined) => renderToStaticMarkup(createElement(GetTheCode, { submissionId: SUB, slot: 1, repoFullName: "team/app", mergeCommit: "1234567890abcdef1234567890abcdef12345678", code }))
    .replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
  const code = (repoCopy: TaskCode["repoCopy"], runRecipe: TaskCode["runRecipe"] = null): TaskCode => ({ slot: 1, instanceId: ID1, repoCopy, runRecipe });

  it("the exact command text", () => {
    expect(text.githubCommands("team/app", "1234567890abcdef1234567890abcdef12345678")).toBe(
      "git clone https://github.com/team/app.git\ncd app\ngit checkout --detach 1234567890abcdef1234567890abcdef12345678");
    expect(text.storedCopyCommands(ID1, true)).toBe([
      `git clone -b hecate-snapshot ~/Downloads/${ID1}.bundle ${ID1}`,
      `cd ${ID1}`,
      `git fetch ~/Downloads/${ID1}.bundle 'refs/hecate/*:refs/hecate/*'`,
      "git checkout --detach refs/hecate/merge",
    ].join("\n"));
    expect(text.storedCopyCommands(ID1, false)).toBe(`git clone -b hecate-snapshot ~/Downloads/${ID1}.bundle ${ID1}\ncd ${ID1}`);
  });

  it("a complete copy: the GitHub block with the task's repo and merge commit, the link, all four lines and the refs line", () => {
    const html = render(code({ stored: true, object: fullSnapshotObject(ID1, BASE), complete: true }));
    expect(html).toMatch(/^<details class="[^"]*"><summary[^>]*>Get the code<\/summary>/);
    expect(html).not.toContain("<details open");
    expect(html).toContain(text.githubCommands("team/app", "1234567890abcdef1234567890abcdef12345678"));
    expect(html).toContain("Works when the repository is public or your GitHub account can read it.");
    expect(html).toContain(`<a href="/api/cse115a/instructor/submissions/${SUB}/repo-copy?slot=1" class="text-primary underline">Download repo copy</a>`);
    expect(html).toContain(text.storedCopyCommands(ID1, true));
    expect(html).toContain("hecate-snapshot is where the task started; refs/hecate/pr-head is the PR's last commit; refs/hecate/merge is the merge commit.");
    expect(html).not.toContain("This older copy");
    expect(html).toContain("This is student code. Run it in a container or a throwaway VM, not directly on your machine.");
  });

  it("an older copy: two lines and its note", () => {
    const html = render(code({ stored: true, object: legacySnapshotObject(ID1), complete: false }));
    expect(html).toContain(`>${text.storedCopyCommands(ID1, false)}</pre>`);
    expect(html).not.toContain("git fetch");
    expect(html).toContain("This older copy holds the repository only up to where the task started.");
    expect(html).not.toContain("refs/hecate/merge is the merge commit");
  });

  it.each([["no copy", code(text.NO_COPY)], ["no entry at all", undefined]])("%s: the GitHub block, the note, no link, the warning", (_label, entry) => {
    const html = render(entry);
    expect(html).toContain("git clone https://github.com/team/app.git");
    expect(html).toContain("No repo copy is stored for this task yet.");
    expect(html).not.toContain("Download repo copy");
    expect(html).not.toContain("/repo-copy");
    expect(html).toContain("This is student code.");
  });
});

describe("5. the run recipe", () => {
  const render = (runRecipe: TaskCode["runRecipe"]) => renderToStaticMarkup(createElement(GetTheCode, { submissionId: SUB, slot: 1, repoFullName: "team/app", mergeCommit: null, code: { slot: 1, instanceId: ID1, repoCopy: text.NO_COPY, runRecipe } }));

  it("shows the image, installs and test command only when harbor_env is stored", async () => {
    const parsed = text.runRecipeFrom(recipe);
    expect(text.runRecipeText(parsed!)).toBe([
      "Image: node:24-bookworm",
      "Install:",
      "  npm ci (in the repository root)",
      "Tests (in web):",
      "  npx vitest run --reporter=json",
    ].join("\n"));
    const html = render(parsed);
    expect(html).toContain("How to run its tests");
    expect(html).toContain("From the validator&#x27;s run of this task");
    expect(html).toContain("Image: node:24-bookworm");
    expect(text.runRecipeFrom(null)).toBeNull();
    expect(text.runRecipeFrom({})).toBeNull();
    expect(render(null)).not.toContain("How to run its tests");
    expect(render(null)).not.toContain("Image:");
    // Through the detail route: slot 1 has a recipe, slot 2's harbor_env is null.
    const [one, two] = await detailCode();
    expect(one!.runRecipe).toEqual({ image: "node:24-bookworm", packageDir: "web", installSteps: [{ cwd: "", command: "npm ci" }], testCommands: ["npx vitest run --reporter=json"] });
    expect(two!.runRecipe).toBeNull();
  });
});

describe("4. the commands open a real bundle written by bundleRepo", () => {
  const exec = promisify(execFile);
  let dir: string;
  let home: string;
  const env = () => ({ ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(home, ".gitconfig-none"), GIT_TERMINAL_PROMPT: "0" });
  const git = async (cwd: string, ...args: string[]) => (await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, env: env() })).stdout.trim();
  /** Runs a command block as written, one shell, stopping at the first failing line. */
  const sh = (cwd: string, script: string) => exec("sh", ["-ec", script], { cwd, env: env() });
  let base: string;
  let prHead: string;
  let merge: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "hecate-get-code-"));
    home = join(dir, "home");
    await mkdir(join(home, "Downloads"), { recursive: true });
    const repo = join(dir, "repo");
    await mkdir(repo);
    await git(repo, "init", "-q", "-b", "main");
    await git(repo, "commit", "-q", "--allow-empty", "-m", "base");
    base = await git(repo, "rev-parse", "HEAD");
    await git(repo, "checkout", "-q", "-b", "feature");
    await git(repo, "commit", "-q", "--allow-empty", "-m", "the PR's work");
    prHead = await git(repo, "rev-parse", "HEAD");
    await git(repo, "checkout", "-q", "main");
    await git(repo, "commit", "-q", "--allow-empty", "-m", "someone else on main");
    await git(repo, "merge", "-q", "--no-ff", "-m", "merge the PR", "feature");
    merge = await git(repo, "rev-parse", "HEAD");
    await git(repo, "update-ref", "refs/hecate/pr-head", prHead);
    await git(repo, "update-ref", "refs/hecate/merge", merge);
    // The website's complete copy, one made without the merge commit, and the validator's base-only copy.
    await bundleRepo(repo, base, join(home, "Downloads", `${ID1}.bundle`), undefined, ["refs/hecate/pr-head", "refs/hecate/merge"]);
    await bundleRepo(repo, base, join(home, "Downloads", `${ID2}.bundle`), undefined, ["refs/hecate/pr-head"]);
    await bundleRepo(repo, base, join(home, "Downloads", "team__app-T-3.bundle"));
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("a complete copy: every line runs; the merge commit is checked out and every ref is there", async () => {
    const work = join(dir, "a");
    await mkdir(work);
    await sh(work, text.storedCopyCommands(ID1, true));
    const clone = join(work, ID1);
    expect(await git(clone, "rev-parse", "HEAD")).toBe(merge);
    expect(await git(clone, "rev-parse", "hecate-snapshot")).toBe(base);
    expect(await git(clone, "rev-parse", "refs/hecate/pr-head")).toBe(prHead);
    expect(await git(clone, "rev-parse", "refs/hecate/merge")).toBe(merge);
  });

  it("a copy without refs/hecate/merge: the clone and fetch work and pr-head is there; only the merge checkout fails", async () => {
    const work = join(dir, "b");
    await mkdir(work);
    const lines = text.storedCopyCommands(ID2, true).split("\n");
    await sh(work, lines.slice(0, 3).join("\n"));
    const clone = join(work, ID2);
    expect(await git(clone, "rev-parse", "refs/hecate/pr-head")).toBe(prHead);
    await expect(sh(clone, lines[3]!)).rejects.toThrow();
    await sh(clone, "git checkout --detach refs/hecate/pr-head");
    expect(await git(clone, "rev-parse", "HEAD")).toBe(prHead);
  });

  it("an older copy: the two lines leave the clone at the base commit", async () => {
    const work = join(dir, "c");
    await mkdir(work);
    await sh(work, text.storedCopyCommands("team__app-T-3", false));
    expect(await git(join(work, "team__app-T-3"), "rev-parse", "HEAD")).toBe(base);
    expect(await git(join(work, "team__app-T-3"), "for-each-ref", "refs/hecate")).toBe("");
  });
});

describe("6. nothing student-facing carries the copy or the route", () => {
  const root = join(__dirname, "..");
  async function sourceFiles(folder: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) out.push(...await sourceFiles(path));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it("student pages, student components and the student API never mention repoCopy, the route, or the new modules", async () => {
    const folders = ["app/cse115a", "app/api/cse115a", "components/cse115a"].map((f) => join(root, f));
    for (const folder of folders) expect((await stat(folder)).isDirectory()).toBe(true);
    const student = (await Promise.all(folders.map(sourceFiles))).flat()
      .filter((path) => !relative(root, path).split("/").includes("instructor"));
    expect(student.length).toBeGreaterThan(10);
    for (const path of student) {
      const source = await readFile(path, "utf8");
      expect(source, relative(root, path)).not.toMatch(/repoCopy|repo-copy|getTheCode|repoCopyAccess|GetTheCode/);
    }
  });
});
