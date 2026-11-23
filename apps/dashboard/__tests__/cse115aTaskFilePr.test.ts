import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";
import { importTaskFromPullRequest, NeedTaskFilePrError } from "@/lib/cse115a/githubTaskImport";
import { prTaskFileGraderNotes, prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { buildMessages, graderInput, GRADER_PROMPT_VERSION } from "@/lib/cse115a/grader/llmGrader";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { exportJsonl } from "@/lib/cse115a/benchmark/exportJsonl";
import { runNextJob, type BenchmarkSave, type JobStore } from "@/lib/cse115a/jobs/runner";
import { captureSubmissionSnapshot, type SubmittedTaskRow, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import {
  PAIR_NOT_AUTHOR, recheckRequest, savedTaskFilePr, TASK_FILE_PR_BOX, TASK_FILE_PR_CARD_NOTE, taskFilePrCardLine, taskFilePrReviewLine,
} from "@/lib/cse115a/taskFilePr";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

vi.mock("server-only", () => ({}));

// A merged PR with no task file (the work PR, #12) paired with a merged PR that adds only the task file (the
// task-file PR, #13). All names are made up.
const REPO = "team/app";
const WORK_URL = "https://github.com/team/app/pull/12";
const FILE_URL = "https://github.com/team/app/pull/13";
const T7 = "docs/tasks/sprint-2/X-T-7.md";
const T8 = "docs/tasks/sprint-2/X-T-8.md";

function spec(id: string, options: { sprint?: number; hours?: number } = {}): string {
  return `---
id: ${id}
story: X
sprint: ${options.sprint ?? 2}
assignee: A. Student
estimate_hours: ${options.hours ?? 3}
---

# Task ${id}

## Description
Serves X.

## Specs
POST /api/thing returns 200.

## Requirements
Use the existing handler.

## Acceptance criteria
1. It returns 200.
`;
}

const DIFF = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n x\n+y\n"
  + "diff --git a/src/app.test.ts b/src/app.test.ts\n--- /dev/null\n+++ b/src/app.test.ts\n@@ -0,0 +1 @@\n+it(\"works\", () => {});\n";

const content = (text: string) => ({ encoding: "base64", size: text.length, content: Buffer.from(text).toString("base64") });
const pull = (fields: Record<string, unknown>) => ({
  state: "closed", merged_at: "2026-10-14T00:00:00Z", base: { sha: "main0" }, user: { login: "student" }, ...fields,
});

type Stub = {
  work?: Record<string, unknown>;
  workFiles?: Array<{ filename: string; status: string }>;
  /** Task-file PRs by number: the PR, its files, and the task file's text at its merge commit. */
  filePrs?: Record<number, { pr?: Record<string, unknown>; files?: Array<{ filename: string; status: string; previous_filename?: string }>; text?: string; folder?: string[] }>;
  routes?: Record<string, unknown>;
};

/** The work PR #12 and task-file PR #13 (X-T-7), unless overridden. Returns every path requested. */
function stub(options: Stub = {}): string[] {
  const filePrs = options.filePrs ?? { 13: {} };
  const routes: Record<string, unknown> = {
    "/repos/team/app/pulls/12": pull({ merge_commit_sha: "squash", title: "Add the thing", head: { ref: "feature/x-t-7", sha: "head12" }, ...options.work }),
    "/repos/team/app/pulls/12/files?per_page=100&page=1": options.workFiles ?? [{ filename: "src/app.ts", status: "modified" }, { filename: "src/app.test.ts", status: "added" }],
    "/repos/team/app/pulls/12/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/app/commits/first": { files: [{ filename: "src/app.ts" }], commit: { author: { email: "student@ucsc.edu" } } },
    "/repos/team/app/git/ref/tags/X-T-7-base": { object: { type: "commit", sha: "main0" } },
    "/repos/team/app/git/ref/tags/X-T-7-done": { object: { type: "commit", sha: "squash" } },
    "/repos/team/app/commits/squash/check-runs?per_page=100": { check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] },
    "/repos/team/app/commits/squash/status": { statuses: [] },
    "/repos/team/app/compare/main0...squash": DIFF,
    ...options.routes,
  };
  for (const [number, filePr] of Object.entries(filePrs)) {
    const path = filePr.files?.[0]?.filename ?? T7;
    const id = path.split("/").pop()!.replace(/\.md$/, "");
    const sha = `spec${number}`;
    routes[`/repos/team/app/pulls/${number}`] = pull({ merge_commit_sha: sha, title: `${id}: task file`, head: { ref: `${id}-task` }, ...filePr.pr });
    routes[`/repos/team/app/pulls/${number}/files?per_page=100&page=1`] = filePr.files ?? [{ filename: path, status: "added" }];
    routes[`/repos/team/app/contents/${path}?ref=${sha}`] = content(filePr.text ?? spec(id));
    routes[`/repos/team/app/contents/docs/tasks/sprint-2?ref=${sha}`] = (filePr.folder ?? [path.split("/").pop()!]).map((name) => ({ name, type: "file" }));
  }
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    requests.push(path);
    if (!(path in routes)) return new Response("{}", { status: 404 });
    const value = routes[path];
    return new Response(typeof value === "string" ? value : JSON.stringify(value));
  }));
  return requests;
}

const importPair = (taskFilePrUrl?: string | null, login = "student", prUrl = WORK_URL) =>
  importTaskFromPullRequest(prUrl, 2, githubReader("token"), login, { taskFilePrUrl });

const NEED = "This merged PR does not add a task file in docs/tasks/sprint-2/. A merged PR can't be changed, so open a new PR that adds only your task file, merge it, and paste its link below. If you don't see a second box, refresh the page.";
const ONE_FILE = "The task-file PR must add or correct one task file in docs/tasks/sprint-2/ and change nothing else. This one changes: ";

describe("1. a merged PR with no task file and no second URL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for a task-file PR", async () => {
    stub();
    const error = await importPair().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NeedTaskFilePrError);
    expect(error).toMatchObject({ code: "need_task_file_pr", message: NEED, repoFullName: REPO, prNumber: 12 });
  });

  it("keeps the 'It changes X' sentence in front", async () => {
    stub({ workFiles: [{ filename: "src/app.ts", status: "modified" }, { filename: T7, status: "modified" }] });
    await expect(importPair()).rejects.toMatchObject({ code: "need_task_file_pr", message: `It changes X-T-7.md but does not add it; a PR's task file is one it adds. ${NEED}` });
  });

  it("refuses a student who did not open the work PR, with or without a second URL", async () => {
    const requests = stub({ work: { user: { login: "teammate" } } });
    await expect(importPair()).rejects.toThrow(new Error(PAIR_NOT_AUTHOR));
    await expect(importPair(FILE_URL)).rejects.toThrow(new Error(PAIR_NOT_AUTHOR));
    expect(PAIR_NOT_AUTHOR).toBe("A PR without a task file can be paired with a task-file PR only by the student who opened it.");
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });
});

describe("2. the pair imports", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes the task file from the task-file PR and everything else from the work PR", async () => {
    const requests = stub();
    const task = await importPair(FILE_URL);
    expect(task).toMatchObject({ prUrl: WORK_URL, repoFullName: REPO, prNumber: 12, taskPath: T7, markdown: spec("X-T-7") });
    expect(task.spec).toMatchObject({ id: "X-T-7", estimateHours: 3, sprint: 2 });
    expect(task.validation).toEqual({
      prMerged: true, prAuthoredByStudent: true,
      prTitleHasTaskId: false, // The work PR's title, not the task-file PR's (which has the ID).
      branchHasTaskId: true, specCommittedFirst: false, estimateAtLeastTwoHours: true,
    });
    expect(task.facts).toEqual({
      ci: { state: "passed", failed: 0, total: 1 }, testFileCount: 1, mergeSha: "squash", firstCommitSha: "first",
      firstCommitTaskOnly: false, prNumber: 12, prTaskFileCount: 0, prTaskFiles: [],
      taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" },
    });
    // The task file and its folder are read at the task-file PR's merge commit; the work PR's first commit is not read.
    expect(requests).toContain(`/repos/team/app/contents/${T7}?ref=spec13`);
    expect(requests).toContain("/repos/team/app/contents/docs/tasks/sprint-2?ref=spec13");
    expect(requests.some((path) => path.includes("ref=squash"))).toBe(false);
    expect(requests).not.toContain("/repos/team/app/commits/first");
    expect(requests).toContain("/repos/team/app/commits/squash/check-runs?per_page=100");
    // No tag is read for a pair either (#392).
    expect(requests.filter((path) => path.includes("/git/ref") || path.includes("/git/tags"))).toEqual([]);
  });

  it("keeps a fixable title check fixable on the work PR", async () => {
    stub({ work: { title: "X-T-7: add the thing" } });
    await expect(importPair(FILE_URL)).resolves.toMatchObject({ validation: { prTitleHasTaskId: true } });
  });
});

describe("3. each task-file PR refusal, in order", () => {
  afterEach(() => vi.unstubAllGlobals());
  const cases: Array<[string, Stub, string, string]> = [
    ["another repository", {}, "https://github.com/team/other/pull/13", "The task-file PR must be in the same repository as your work PR (team/app)."],
    ["not a PR URL", {}, "https://github.com/team/app/issues/13", "The task-file PR must be in the same repository as your work PR (team/app)."],
    ["the work PR itself", {}, WORK_URL, "Paste a different PR: this one is your work PR."],
    ["not merged", { filePrs: { 13: { pr: { state: "open", merged_at: null, merge_commit_sha: null } } } }, FILE_URL, "The task-file PR is not merged yet. Merge it, then add it here again."],
    ["another author", { filePrs: { 13: { pr: { user: { login: "teammate" } } } } }, FILE_URL, "The task-file PR must be opened from your GitHub account."],
    ["extra files", { filePrs: { 13: { files: [{ filename: T7, status: "added" }, { filename: "src/a.ts", status: "added" }] } } }, FILE_URL,
      `${ONE_FILE}docs/tasks/sprint-2/X-T-7.md, src/a.ts.`],
    ["many files", { filePrs: { 13: { files: [T7, "a", "b", "c", "d", "e", "f"].map((filename) => ({ filename, status: "added" })) } } }, FILE_URL,
      `${ONE_FILE}docs/tasks/sprint-2/X-T-7.md, a, b, c, d, and 2 more.`],
    // A modified or renamed task file is taken since #420 (a PR that corrects a malformed task file); a removed one is not.
    ["a removed task file", { filePrs: { 13: { files: [{ filename: T7, status: "removed" }] } } }, FILE_URL, `${ONE_FILE}docs/tasks/sprint-2/X-T-7.md.`],
    // A rename is checked at its new path (GitHub's filename), which must be a task file in this sprint's folder.
    ["a rename out of the sprint folder", { filePrs: { 13: { files: [{ filename: "docs/tasks/sprint-3/X-T-7.md", status: "renamed", previous_filename: T7 }] } } }, FILE_URL,
      `${ONE_FILE}docs/tasks/sprint-3/X-T-7.md.`],
    ["a rename to a name that is not a task ID", { filePrs: { 13: { files: [{ filename: "docs/tasks/sprint-2/notes.md", status: "renamed", previous_filename: T7 }] } } }, FILE_URL,
      `${ONE_FILE}docs/tasks/sprint-2/notes.md.`],
    ["the wrong sprint folder", { filePrs: { 13: { files: [{ filename: "docs/tasks/sprint-3/X-T-7.md", status: "added" }] } } }, FILE_URL,
      `${ONE_FILE}docs/tasks/sprint-3/X-T-7.md.`],
    ["a task file with format problems", { filePrs: { 13: { text: spec("X-T-7").replace("## Specs", "## Steps") } } }, FILE_URL,
      "The task file needs a nonempty “Specs” section."],
    ["a task file for another sprint", { filePrs: { 13: { text: spec("X-T-7", { sprint: 3 }) } } }, FILE_URL, "The task file sprint must be 2."],
    ["a task file not in the folder on its merge commit", { filePrs: { 13: { folder: ["Y-T-1.md"] } } }, FILE_URL,
      "The task file is not in docs/tasks/sprint-2/ on the merge commit."],
  ];
  it.each(cases)("refuses %s", async (_label, options, url, message) => {
    stub(options);
    await expect(importPair(url)).rejects.toThrow(new Error(message));
  });

  it("accepts a renamed task file, with and without edits to its content, read at its new path", async () => {
    const notes = "docs/tasks/sprint-2/notes.md";
    // Without edits: the file's text is what it was under its old name.
    let requests = stub({ filePrs: { 13: { files: [{ filename: T7, status: "renamed", previous_filename: notes }], text: spec("X-T-7") } } });
    await expect(importPair(FILE_URL)).resolves.toMatchObject({ taskPath: T7, markdown: spec("X-T-7"), facts: { taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" } } });
    expect(requests).toContain(`/repos/team/app/contents/${T7}?ref=spec13`);
    expect(requests.some((path) => path.includes("notes.md"))).toBe(false);
    // With edits, and from any old name (here another task ID's file).
    const edited = spec("X-T-7").replace("Serves X.", "Serves X, and now Y.");
    requests = stub({ filePrs: { 13: { files: [{ filename: T7, status: "renamed", previous_filename: "docs/tasks/sprint-2/Z-T-1.md" }], text: edited } } });
    await expect(importPair(FILE_URL)).resolves.toMatchObject({ taskPath: T7, markdown: edited, spec: { id: "X-T-7" } });
  });

  it("checks the repository before reading anything about the task-file PR", async () => {
    const requests = stub({ filePrs: { 13: { pr: { merged_at: null, merge_commit_sha: null } } } });
    await expect(importPair("https://github.com/team/other/pull/12")).rejects.toThrow("same repository");
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });
});

describe("4–6. PRs that never take the pairing path", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("4. a work PR that adds a task file imports as today, with or without a second URL", async () => {
    const files = [{ filename: "src/app.ts", status: "modified" }, { filename: T7, status: "added" }];
    stub({ workFiles: files, routes: { [`/repos/team/app/contents/${T7}?ref=squash`]: content(spec("X-T-7")), "/repos/team/app/contents/docs/tasks/sprint-2?ref=squash": [{ name: "X-T-7.md", type: "file" }] } });
    const plain = await importPair();
    const requests = stub({ workFiles: files, routes: { [`/repos/team/app/contents/${T7}?ref=squash`]: content(spec("X-T-7")), "/repos/team/app/contents/docs/tasks/sprint-2?ref=squash": [{ name: "X-T-7.md", type: "file" }] } });
    const withUrl = await importPair(FILE_URL);
    expect(withUrl).toEqual(plain);
    expect("taskFilePr" in plain.facts).toBe(false);
    expect(plain.facts.prTaskFiles).toEqual([T7]);
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });

  it("5. a single wrongly named .md in the sprint folder gets the second box with its problems, and pairs (#420); two stay refused", async () => {
    const notes = "docs/tasks/sprint-2/notes.md";
    const requests = stub({ workFiles: [{ filename: notes, status: "added" }], routes: { [`/repos/team/app/contents/${notes}?ref=squash`]: content(spec("X-T-7")) } });
    const naming = "The file is named “notes.md” but the id inside it is “X-T-7”. Name the file X-T-7.md.";
    await expect(importPair()).rejects.toMatchObject({
      code: "need_task_file_pr", reason: "task_file_problems", problems: [naming],
      message: `The task file in this merged PR, notes.md, has problems:\n- ${naming}\nA merged PR can't be changed, so open a new PR that corrects only that task file, merge it, and paste its link below. If you don't see a second box, refresh the page.`,
    });
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
    const paired = await importPair(FILE_URL);
    expect(paired).toMatchObject({ taskPath: T7, spec: { id: "X-T-7" } });
    expect(paired.facts).toMatchObject({ prTaskFiles: [T7], taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13", fixesTaskPath: notes } });
    // An open PR and someone else's PR are refused with the problems, and get no box.
    stub({ work: { state: "open", merged_at: null, merge_commit_sha: null, head: { ref: "feature/x-t-7", sha: "head12" } }, workFiles: [{ filename: notes, status: "added" }], routes: { [`/repos/team/app/contents/${notes}?ref=head12`]: content(spec("X-T-7")) } });
    await expect(importPair(FILE_URL)).rejects.toThrow(new Error(`This pull request is not merged yet. Before you merge, fix:\n- ${naming}`));
    stub({ work: { user: { login: "teammate" } }, workFiles: [{ filename: notes, status: "added" }], routes: { [`/repos/team/app/contents/${notes}?ref=squash`]: content(spec("X-T-7")) } });
    for (const url of [undefined, FILE_URL]) {
      const error = await importPair(url).catch((caught: unknown) => caught);
      expect(error).not.toBeInstanceOf(NeedTaskFilePrError);
      expect((error as Error).message).toBe(`${naming}\nA merged PR whose task file has problems can be paired with a task-file PR only by the student who opened it.`);
    }
    const twoRequests = stub({ workFiles: [{ filename: notes, status: "added" }, { filename: "docs/tasks/sprint-2/plan.md", status: "added" }] });
    const two = await importPair(FILE_URL).catch((caught: unknown) => caught);
    expect(two).not.toBeInstanceOf(NeedTaskFilePrError);
    expect((two as Error).message).toBe("No task file was found in docs/tasks/sprint-2/ in this PR. It adds 2 other .md files there (notes.md, plan.md); a task file is named after its task ID, for example US-2-T-1.md.");
    expect(twoRequests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });

  it("6. an open PR with no task file is told to add it before merging, with no pairing", async () => {
    const open = { state: "open", merged_at: null, merge_commit_sha: null };
    stub({ work: open });
    const error = await importPair(FILE_URL).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(NeedTaskFilePrError);
    expect((error as Error).message).toBe("This pull request is not merged yet. Before you merge, fix:\n- No task file was found in docs/tasks/sprint-2/ in this PR. Add your task file to this PR before you merge.");
    expect((error as { code?: string }).code).toBeUndefined();
    stub({ work: open, workFiles: [{ filename: T7, status: "modified" }] });
    await expect(importPair()).rejects.toThrow(new Error("This pull request is not merged yet. Before you merge, fix:\n- No task file was found in docs/tasks/sprint-2/ in this PR. It changes X-T-7.md but does not add it; a PR's task file is one it adds. Add your task file to this PR before you merge."));
  });
});

// ---- The Add PR route, with an in-memory table. ----

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => fakeDb() }));
vi.mock("@/lib/cse115a/server", () => ({
  getCourseIdentity: async () => ({ userId: "user-student", githubLogin: "student" }),
  getEnrolledCourse: async () => ({ id: "course-1", slug: "CSE115A", assignment_count: 5 }),
  getActiveAssignmentSubmission: async () => null,
  lockedAssignmentMessage: (n: number) => `Sprint ${n} is submitted.`,
  TASK_SUBMISSION_COLUMNS: "*",
}));
vi.mock("@/lib/cse115a/githubApp", async () => {
  const client = await import("@/lib/cse115a/githubClient");
  class CourseRepoAccessError extends Error { code = "github_app_not_installed"; }
  return { CourseRepoAccessError, courseRepoReader: () => client.githubReader("token") };
});

type Row = Record<string, unknown>;
function fakeDb() {
  return {
    from() {
      const filters: Array<(row: Row) => boolean> = [];
      const match = () => state.rows.filter((row) => filters.every((filter) => filter(row)));
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
        ilike: (column: string, value: string) => { filters.push((row) => String(row[column]).toLowerCase() === value.toLowerCase()); return query; },
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: match(), error: null }).then(resolve, reject),
        upsert: (row: Row) => {
          state.rows = [...state.rows.filter((other) => !(other.user_id === row.user_id && other.assignment_number === row.assignment_number && other.task_slot === row.task_slot)), row];
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      };
      return query;
    },
  };
}

async function addPr(slot: number, body: Record<string, unknown> = {}) {
  const { POST } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
  const request = new Request("http://localhost/api/cse115a/assignments/2/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseSlug: "CSE115A", slot, prUrl: WORK_URL, ...body }),
  });
  const response = (await POST(request, { params: Promise.resolve({ number: "2" }) }))!;
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const otherStudent = (prNumber: number, taskId = "Z-T-1") => ({ course_id: "course-1", user_id: "user-other", assignment_number: 2, task_slot: 1, repo_full_name: REPO, pr_number: prNumber, task_id: taskId, task_path: `docs/tasks/sprint-2/${taskId}.md` });
const TAKEN = "This PR is already added by another student in this course. Each PR counts for one student's task. If you think this is an error, please contact a TA.";

describe("7. the Add PR route", () => {
  beforeEach(() => { state.rows = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("answers 409 need_task_file_pr, then saves the pair", async () => {
    stub();
    expect(await addPr(1)).toEqual({ status: 409, body: { error: NEED, code: "need_task_file_pr" } });
    const saved = await addPr(1, { taskFilePrUrl: FILE_URL });
    expect(saved.status).toBe(200);
    expect(saved.body.submission).toMatchObject({
      pr_url: WORK_URL, repo_full_name: REPO, pr_number: 12, task_id: "X-T-7", task_path: T7, task_spec_markdown: spec("X-T-7"),
      task_spec_json: { id: "X-T-7" }, facts_json: { taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" }, prTaskFileCount: 0, prTaskFiles: [] },
    });
  });

  it("blocks a work PR another student already added, before asking for the second PR", async () => {
    stub();
    state.rows = [otherStudent(12)];
    expect(await addPr(1)).toEqual({ status: 409, body: { error: TAKEN, code: "taken_by_another_student" } });
    expect(await addPr(1, { taskFilePrUrl: FILE_URL })).toEqual({ status: 409, body: { error: TAKEN, code: "taken_by_another_student" } });
  });

  it("blocks a task-file PR another student already added", async () => {
    stub();
    state.rows = [otherStudent(13)];
    expect(await addPr(1, { taskFilePrUrl: FILE_URL })).toEqual({ status: 409, body: { error: TAKEN, code: "taken_by_another_student" } });
  });

  it("keeps the task-ID rule", async () => {
    stub();
    state.rows = [otherStudent(40, "X-T-7")];
    expect((await addPr(1, { taskFilePrUrl: FILE_URL })).body.error).toBe("Task ID X-T-7 is already used by another student in team/app. Use a new task ID. If you think this is an error, please contact a TA.");
  });

  it("refuses the same student's task-file PR used in another slot or sprint", async () => {
    stub();
    const own = { course_id: "course-1", user_id: "user-student", repo_full_name: REPO, task_id: "Q-T-1", task_path: "docs/tasks/sprint-3/Q-T-1.md" };
    state.rows = [{ ...own, assignment_number: 3, task_slot: 1, pr_number: 30, facts_json: { taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" } } }];
    expect(await addPr(1, { taskFilePrUrl: FILE_URL })).toEqual({ status: 409, body: { error: "That PR is already used by your Task 1 in Sprint 3.", code: "task_file_already_used" } });
    state.rows = [{ ...own, assignment_number: 2, task_slot: 2, pr_number: 13, facts_json: {} }];
    expect(await addPr(1, { taskFilePrUrl: FILE_URL })).toEqual({ status: 409, body: { error: "That PR is already used by your Task 2.", code: "task_file_already_used" } });
  });

  it("re-adding the same pair to the same slot is not a conflict", async () => {
    stub();
    expect((await addPr(1, { taskFilePrUrl: FILE_URL })).status).toBe(200);
    expect((await addPr(1, { taskFilePrUrl: FILE_URL })).status).toBe(200);
  });

  it("saves two tasks from one work PR with two task-file PRs, one per slot", async () => {
    stub({ filePrs: { 13: {}, 14: { files: [{ filename: T8, status: "added" }] } } });
    expect((await addPr(1, { taskFilePrUrl: FILE_URL })).status).toBe(200);
    const second = await addPr(2, { taskFilePrUrl: "https://github.com/team/app/pull/14" });
    expect(second.status).toBe(200);
    expect(state.rows.map((row) => [row.task_slot, row.pr_number, row.task_path])).toEqual([[1, 12, T7], [2, 12, T8]]);
    // The same task-file PR can't be the second slot's too.
    expect((await addPr(2, { taskFilePrUrl: FILE_URL })).body.error).toBe("X-T-7.md from this PR is already your Task 1. Each task needs its own task file.");
  });
});

describe("8. Re-check and Change PR", () => {
  beforeEach(() => { state.rows = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("Re-check sends the saved task-file PR, and the route re-imports the pair", async () => {
    stub();
    const added = await addPr(1, { taskFilePrUrl: FILE_URL });
    const saved = added.body.submission as { pr_url: string; task_path: string; facts_json: { taskFilePr?: unknown } };
    const request = recheckRequest(saved);
    expect(request).toEqual({ prUrl: WORK_URL, taskFilePrUrl: FILE_URL });
    const again = await addPr(1, request);
    expect(again.status).toBe(200);
    expect(again.body.submission).toMatchObject({ pr_number: 12, task_path: T7, facts_json: { taskFilePr: { number: 13 } } });
  });

  it("Re-check of a normal task sends the saved task file, as before", () => {
    expect(recheckRequest({ pr_url: WORK_URL, task_path: T7, facts_json: { prTaskFiles: [T7] } as never })).toEqual({ prUrl: WORK_URL, taskPath: T7 });
    expect(recheckRequest({ pr_url: WORK_URL, task_path: T7, facts_json: null })).toEqual({ prUrl: WORK_URL, taskPath: T7 });
  });

  it("the form wires Re-check, Change PR and the first box as specified", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../components/cse115a/CourseDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("recheckRequest(savedTask)");
    expect(source).toContain("onClick={() => startChangingPr(slot)}");
    const startOver = source.slice(source.indexOf("function startChangingPr"), source.indexOf("async function signOut"));
    for (const reset of ["setPrInputs", "setTaskFileChoices", "setTaskFilePrBox", "setTaskFilePrInputs", "setSlotError"]) expect(startOver).toContain(reset);
    // Editing the first URL clears the box, as with the choice form.
    expect(source).toContain("setTaskFileChoices((previous) => ({ ...previous, [slot]: null })); setTaskFilePrBox((previous) => ({ ...previous, [slot]: null })); }}");
    expect(source).toContain("if (imported.code === NEED_TASK_FILE_PR_CODE)");
    expect(source).toContain("{TASK_FILE_PR_BOX.heading}");
  });
});

describe("9. card and review-page lines", () => {
  it("has the exact texts", () => {
    expect(TASK_FILE_PR_BOX).toMatchObject({ heading: "This merged PR has no task file", label: "Task-file PR URL", button: "Add both PRs" });
    expect(TASK_FILE_PR_BOX.text(2)).toBe("A merged PR can't be changed. Open a new PR that adds only your task file (docs/tasks/sprint-2/<task ID>.md), merge it, and paste its link here. Your task is graded on the code in the PR above.");
    expect(taskFilePrCardLine(13, 12)).toBe("Task file from PR #13 · work from PR #12");
    expect(TASK_FILE_PR_CARD_NOTE).toBe("The task file was added in a separate PR, after the work was merged.");
    expect(taskFilePrReviewLine(13, 12)).toBe("Task file from a separate PR, #13. The work is in PR #12, which has no task file, so the task file was written or added after the work.");
  });

  it("shows only for a paired task", async () => {
    expect(savedTaskFilePr({ taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" } })).toEqual({ url: FILE_URL, number: 13, mergeSha: "spec13" });
    expect(savedTaskFilePr({ prTaskFiles: [T7] } as never)).toBeNull();
    expect(savedTaskFilePr(null)).toBeNull();
    const { readFileSync } = await import("node:fs");
    const card = readFileSync(new URL("../components/cse115a/CourseDashboard.tsx", import.meta.url), "utf8");
    expect(card).toContain("{pair && prNumber ? (");
    const review = readFileSync(new URL("../components/cse115a/instructor/SubmissionReview.tsx", import.meta.url), "utf8");
    // #431: a staff-made pair shows its own line first (workPrHeaderLine); every other paired task shows this one.
    expect(review).toContain(": task.taskFilePr ? <p className=\"mt-2 text-sm text-amber-700 dark:text-amber-300\">{taskFilePrReviewLine(task.taskFilePr.number, task.prNumber, task.taskFilePr.fixesTaskPath)}</p> : null}");
  });

  it("adds no shared-PR line for a paired task alone in its PR", () => {
    const task = snapshot(1, "X-T-7", { taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" }, prTaskFiles: [] });
    expect(prTaskFileLines([task], task, "student")).toEqual([]);
    expect(prTaskFileLines([task], task, "staff")).toEqual([]);
  });
});

// ---- Snapshot, benchmark and grader. ----

function snapshot(slot: number, taskId: string, overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot, taskId, prUrl: WORK_URL, repoFullName: REPO, prNumber: 12, taskPath: `docs/tasks/sprint-2/${taskId}.md`,
    specMarkdown: spec(taskId), spec: { id: taskId, estimateHours: 3 } as TaskSpec, validation: { prMerged: true }, analysisResultId: `r${slot}`,
    pr: { title: "Add the thing", body: "", headRef: "feature/x-t-7", author: "student", mergedAt: "2026-10-14T00:00:00Z", baseSha: "main0", mergeCommitSha: "squash" },
    baseCommit: "main0", baseCommitSource: "pr_base", diff: DIFF, diffBytes: DIFF.length, diffTruncated: false, diffError: null, comments: [], checks: [],
    ...overrides,
  };
}

function row(facts: SubmittedTaskRow["facts_json"]): SubmittedTaskRow {
  return {
    task_slot: 1, task_id: "X-T-7", pr_url: WORK_URL, repo_full_name: REPO, pr_number: 12, task_path: T7,
    task_spec_markdown: spec("X-T-7"), task_spec_json: { id: "X-T-7" } as TaskSpec, validation_json: { prMerged: true }, analysis_result_id: "r1",
    facts_json: facts,
  };
}

/** The work PR only: any read of #13 or of a task file throws. */
function workReader(firstCommitFiles: string[] = ["src/app.ts"]): { reader: GitHubReader; paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    reader: {
      async json<T>(path: string) {
        paths.push(path);
        if (path.includes("/pulls/13") || path.includes("/contents/")) throw new Error(`unexpected read: ${path}`);
        if (/\/pulls\/12$/.test(path)) return { title: "Add the thing", body: "", merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "squash", base: { sha: "main0" }, head: { ref: "feature/x-t-7" }, user: { login: "student" } } as T;
        if (path.includes("/commits?per_page=1")) return [{ sha: "first" }] as T;
        if (path.endsWith("/commits/first")) return { files: firstCommitFiles.map((filename) => ({ filename })) } as T;
        return [] as T;
      },
      async text(path: string) { paths.push(path); return DIFF; },
    },
  };
}

describe("10. snapshot and benchmark row", () => {
  const pair = { url: FILE_URL, number: 13, mergeSha: "spec13" };

  it("carries taskFilePr; the spec is the saved one and the diff is the work PR's", async () => {
    const { reader, paths } = workReader();
    const snap = await captureSubmissionSnapshot(reader, [row({ prTaskFileCount: 0, prTaskFiles: [], taskFilePr: pair })]);
    expect(snap.tasks[0]).toMatchObject({ taskFilePr: pair, specMarkdown: spec("X-T-7"), diff: DIFF, prNumber: 12, baseCommit: "main0", baseCommitSource: "pr_base" });
    expect(paths.every((path) => !path.includes("/pulls/13"))).toBe(true);
    const normal = await captureSubmissionSnapshot(workReader().reader, [row({ prTaskFileCount: 1, prTaskFiles: [T7] })]);
    expect("taskFilePr" in normal.tasks[0]!).toBe(false);
  });

  it("never takes the work PR's first commit as the base for a paired task", async () => {
    const snap = await captureSubmissionSnapshot(workReader([T7]).reader, [row({ prTaskFiles: [], taskFilePr: pair })]);
    expect(snap.tasks[0]!.baseCommitSource).toBe("pr_base");
  });

  it("flags the row task_file_from_other_pr, which stays exportable; a normal row is unchanged", async () => {
    const paired = buildInstance(snapshot(1, "X-T-7", { taskFilePr: pair }), 2, null);
    const normal = buildInstance(snapshot(1, "X-T-7"), 2, null);
    expect(paired.flags).toEqual([...normal.flags, "task_file_from_other_pr"]);
    expect(normal.flags).not.toContain("task_file_from_other_pr");
    expect(paired.instance).toEqual(normal.instance);
    const jsonl = exportJsonl([{ instance: paired.instance, sources: [{ consented: true, validationStatus: "candidate", flags: paired.flags }] }]);
    expect(jsonl).toBe(exportJsonl([{ instance: normal.instance, sources: [{ consented: true, validationStatus: "candidate", flags: normal.flags }] }]));
    expect(jsonl).toContain("\"instance_id\":\"team__app-X-T-7\"");

    let saved: BenchmarkSave[] = [];
    const store: JobStore = {
      claim: async () => ({ id: "j", assignment_submission_id: "s", kind: "benchmark", attempts: 1 }),
      loadSubmission: async () => ({ id: "s", course_id: "c", user_id: "u", assignment_number: 2, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "", tasks: [snapshot(1, "X-T-7", { taskFilePr: pair })] } }),
      setSubmissionStatus: async () => {}, saveGrades: async () => {}, finishJob: async () => {},
      loadRepoMetrics: async () => null, loadStudentEmail: async () => null,
      saveBenchmark: async (_submission, rows) => { saved = rows; },
    };
    await runNextJob(store, { grade: async () => [] });
    expect(saved[0]!.flags).toContain("task_file_from_other_pr");
    expect(saved[0]!.flags).not.toContain("pr_holds_two_tasks");
  });
});

describe("11. grader input", () => {
  it("is the same as for a normal task with that spec and diff; the prompt version is unchanged", () => {
    const paired = snapshot(1, "X-T-7", { taskFilePr: { url: FILE_URL, number: 13, mergeSha: "spec13" }, prTaskFiles: [] });
    const normal = snapshot(1, "X-T-7", { prTaskFiles: [T7] });
    const pairedInput = graderInput(paired, prTaskFileGraderNotes([paired], paired));
    expect(pairedInput).toEqual(graderInput(normal, prTaskFileGraderNotes([normal], normal)));
    expect(buildMessages(pairedInput)).toEqual(buildMessages(graderInput(normal)));
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v6");
  });
});
