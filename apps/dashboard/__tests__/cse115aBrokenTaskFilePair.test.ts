import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubReader } from "@/lib/cse115a/githubClient";
import { ChooseTaskFileError, importTaskFromPullRequest, NeedTaskFilePrError } from "@/lib/cse115a/githubTaskImport";
import { prTaskFileGraderNotes, prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { graderPatches } from "@/lib/cse115a/grader/llmGrader";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import {
  needTaskFileFixMessage, PAIR_FIX_NOT_AUTHOR, recheckRequest, savedTaskFilePr, TASK_FILE_FIX_BOX, TASK_FILE_FIX_CARD_NOTE,
  TASK_FILE_PR_CARD_NOTE, taskFilePrCardNote, taskFilePrReviewLine,
} from "@/lib/cse115a/taskFilePr";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

vi.mock("server-only", () => ({}));

// A merged PR (the work PR, #12) whose task file has format problems, paired with a merged PR that corrects or
// replaces only that file (the task-file PR, #13 or #14) (#420). All names are made up.
const REPO = "team/app";
const WORK_URL = "https://github.com/team/app/pull/12";
const FIX_URL = "https://github.com/team/app/pull/13";
const NEW_URL = "https://github.com/team/app/pull/14";
const T7 = "docs/tasks/sprint-2/X-T-7.md";
const T8 = "docs/tasks/sprint-2/X-T-8.md";
const T9 = "docs/tasks/sprint-2/X-T-9.md";

function spec(id: string): string {
  return `---
id: ${id}
story: X
sprint: 2
assignee: A. Student
estimate_hours: 3
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

/** The same file without its Specs section. */
const malformed = (id: string) => spec(id).replace("## Specs\nPOST /api/thing returns 200.\n\n", "");
const SPECS_PROBLEM = "The task file needs a nonempty “Specs” section.";

const DIFF = `diff --git a/${T7} b/${T7}\nnew file mode 100644\n--- /dev/null\n+++ b/${T7}\n@@ -0,0 +1 @@\n+id: X-T-7\n`
  + "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n x\n+y\n"
  + "diff --git a/src/app.test.ts b/src/app.test.ts\n--- /dev/null\n+++ b/src/app.test.ts\n@@ -0,0 +1 @@\n+it(\"works\", () => {});\n";

const content = (text: string) => ({ encoding: "base64", size: text.length, content: Buffer.from(text).toString("base64") });
const pull = (fields: Record<string, unknown>) => ({
  state: "closed", merged_at: "2026-10-14T00:00:00Z", base: { sha: "main0" }, user: { login: "student" }, ...fields,
});

type FilePr = { pr?: Record<string, unknown>; files?: Array<{ filename: string; status: string }>; text?: string };
type Stub = {
  work?: Record<string, unknown>;
  workFiles?: Array<{ filename: string; status: string }>;
  /** The work PR's task files at its merge commit, by path. */
  workTexts?: Record<string, string>;
  filePrs?: Record<number, FilePr>;
};

/**
 * The work PR #12 adds X-T-7 without a Specs section; #13 corrects it (modified), #14 adds a valid X-T-8 instead.
 * Returns every path requested.
 */
function stub(options: Stub = {}): string[] {
  const filePrs = options.filePrs ?? { 13: { files: [{ filename: T7, status: "modified" }] }, 14: { files: [{ filename: T8, status: "added" }] } };
  const workTexts = options.workTexts ?? { [T7]: malformed("X-T-7") };
  const routes: Record<string, unknown> = {
    "/repos/team/app/pulls/12": pull({ merge_commit_sha: "squash", title: "X-T-7: add the thing", head: { ref: "feature/x-t-7", sha: "head12" }, ...options.work }),
    "/repos/team/app/pulls/12/files?per_page=100&page=1": options.workFiles ?? [{ filename: T7, status: "added" }, { filename: "src/app.ts", status: "modified" }, { filename: "src/app.test.ts", status: "added" }],
    "/repos/team/app/pulls/12/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/app/commits/first": { files: [{ filename: T7 }] },
    "/repos/team/app/commits/squash/check-runs?per_page=100": { check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] },
    "/repos/team/app/commits/squash/status": { statuses: [] },
    "/repos/team/app/compare/main0...squash": DIFF,
  };
  routes["/repos/team/app/contents/docs/tasks/sprint-2?ref=squash"] = Object.keys(workTexts).map((file) => ({ name: file.split("/").pop()!, type: "file" }));
  for (const [path, text] of Object.entries(workTexts)) {
    routes[`/repos/team/app/contents/${path}?ref=squash`] = content(text);
    routes[`/repos/team/app/contents/${path}?ref=head12`] = content(text);
  }
  for (const [number, filePr] of Object.entries(filePrs)) {
    const path = filePr.files?.[0]?.filename ?? T7;
    const id = path.split("/").pop()!.replace(/\.md$/, "");
    const sha = `spec${number}`;
    routes[`/repos/team/app/pulls/${number}`] = pull({ merge_commit_sha: sha, title: `${id}: task file`, head: { ref: `${id}-task` }, ...filePr.pr });
    routes[`/repos/team/app/pulls/${number}/files?per_page=100&page=1`] = filePr.files ?? [{ filename: path, status: "modified" }];
    routes[`/repos/team/app/contents/${path}?ref=${sha}`] = content(filePr.text ?? spec(id));
    routes[`/repos/team/app/contents/docs/tasks/sprint-2?ref=${sha}`] = [...new Set([...Object.keys(workTexts), path])].map((file) => ({ name: file.split("/").pop()!, type: "file" }));
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

const importWork = (options: { taskFilePrUrl?: string; taskPath?: string } = {}, login = "student") =>
  importTaskFromPullRequest(WORK_URL, 2, githubReader("token"), login, options);

const NEED_FIX = `The task file in this merged PR, X-T-7.md, has problems:\n- ${SPECS_PROBLEM}\nA merged PR can't be changed, so open a new PR that corrects only that task file, merge it, and paste its link below. If you don't see a second box, refresh the page.`;

describe("1. a merged PR whose task file has format problems", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("without a task-file PR, asks for one and lists the problems", async () => {
    const requests = stub();
    const error = await importWork().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NeedTaskFilePrError);
    expect(error).toMatchObject({ code: "need_task_file_pr", reason: "task_file_problems", problems: [SPECS_PROBLEM], message: NEED_FIX, repoFullName: REPO, prNumber: 12 });
    expect(needTaskFileFixMessage(T7, [SPECS_PROBLEM])).toBe(NEED_FIX);
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });

  it("lists every problem, one per line", async () => {
    stub({ workTexts: { [T7]: "# Just a title\n" } });
    const error = await importWork().catch((caught: unknown) => caught) as NeedTaskFilePrError;
    expect(error).toBeInstanceOf(NeedTaskFilePrError);
    expect(error.problems.length).toBeGreaterThan(1);
    expect(error.message).toBe(needTaskFileFixMessage(T7, error.problems));
    for (const problem of error.problems) expect(error.message).toContain(`\n- ${problem}\n`);
  });

  it("with a task-file PR that modifies the file, imports the pair with the corrected spec", async () => {
    const requests = stub();
    const task = await importWork({ taskFilePrUrl: FIX_URL });
    expect(task).toMatchObject({ prUrl: WORK_URL, repoFullName: REPO, prNumber: 12, taskPath: T7, markdown: spec("X-T-7") });
    expect(task.spec).toMatchObject({ id: "X-T-7", estimateHours: 3, sprint: 2 });
    expect(task.validation).toEqual({
      prMerged: true, prAuthoredByStudent: true, prTitleHasTaskId: true, branchHasTaskId: true,
      specCommittedFirst: false, // A paired task is never "task file first", even though the work PR's first commit was the file.
      estimateAtLeastTwoHours: true,
    });
    expect(task.facts).toEqual({
      ci: { state: "passed", failed: 0, total: 1 }, testFileCount: 1, mergeSha: "squash", firstCommitSha: "first",
      firstCommitTaskOnly: false, prNumber: 12, prTaskFileCount: 1, prTaskFiles: [T7],
      taskFilePr: { url: FIX_URL, number: 13, mergeSha: "spec13", fixesTaskPath: T7 },
    });
    expect(requests).toContain(`/repos/team/app/contents/${T7}?ref=spec13`);
    expect(requests).toContain("/repos/team/app/contents/docs/tasks/sprint-2?ref=spec13");
    expect(requests).not.toContain("/repos/team/app/commits/first");
  });

  it("with a task-file PR that adds a new, valid file, imports that file as the task's", async () => {
    stub();
    const task = await importWork({ taskFilePrUrl: NEW_URL });
    expect(task).toMatchObject({ taskPath: T8, markdown: spec("X-T-8"), spec: { id: "X-T-8" } });
    expect(task.facts).toMatchObject({
      prTaskFileCount: 1, prTaskFiles: [T8], taskFilePr: { url: NEW_URL, number: 14, mergeSha: "spec14", fixesTaskPath: T7 },
    });
  });

  it("refuses a task-file PR whose file still has problems, with its problems", async () => {
    stub({ filePrs: { 13: { files: [{ filename: T7, status: "modified" }], text: malformed("X-T-7") } } });
    await expect(importWork({ taskFilePrUrl: FIX_URL })).rejects.toThrow(new Error(SPECS_PROBLEM));
  });

  it("refuses a task-file PR that touches a second file", async () => {
    stub({ filePrs: { 13: { files: [{ filename: T7, status: "modified" }, { filename: "src/a.ts", status: "modified" }] } } });
    await expect(importWork({ taskFilePrUrl: FIX_URL })).rejects.toThrow(new Error(
      "The task-file PR must add or correct one task file in docs/tasks/sprint-2/ and change nothing else. This one changes: docs/tasks/sprint-2/X-T-7.md, src/a.ts.",
    ));
  });

  it("an open PR with a malformed file keeps today's message, with no box", async () => {
    const open = { state: "open", merged_at: null, merge_commit_sha: null };
    const requests = stub({ work: open });
    for (const options of [{}, { taskFilePrUrl: FIX_URL }]) {
      const error = await importWork(options).catch((caught: unknown) => caught);
      expect(error).not.toBeInstanceOf(NeedTaskFilePrError);
      expect((error as Error).message).toBe(`This pull request is not merged yet. Before you merge, fix:\n- ${SPECS_PROBLEM}`);
      expect((error as { code?: string }).code).toBeUndefined();
    }
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });

  it("refuses someone else's PR, with its problems and why there is no box", async () => {
    const requests = stub({ work: { user: { login: "teammate" } } });
    const message = `${SPECS_PROBLEM}\n${PAIR_FIX_NOT_AUTHOR}`;
    expect(PAIR_FIX_NOT_AUTHOR).toBe("A merged PR whose task file has problems can be paired with a task-file PR only by the student who opened it.");
    for (const options of [{}, { taskFilePrUrl: FIX_URL }]) {
      const error = await importWork(options).catch((caught: unknown) => caught);
      expect(error).not.toBeInstanceOf(NeedTaskFilePrError);
      expect((error as Error).message).toBe(message);
    }
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });

  it("a PR whose task file passes ignores a task-file PR, as before", async () => {
    const requests = stub({ workTexts: { [T7]: spec("X-T-7") } });
    const task = await importWork({ taskFilePrUrl: FIX_URL });
    expect("taskFilePr" in task.facts).toBe(false);
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
  });
});

describe("2. several task files, the chosen one malformed", () => {
  afterEach(() => vi.unstubAllGlobals());
  const several: Stub = {
    workFiles: [{ filename: T7, status: "added" }, { filename: T9, status: "added" }, { filename: "src/app.ts", status: "modified" }],
    workTexts: { [T7]: malformed("X-T-7"), [T9]: spec("X-T-9") },
  };

  it("asks for the choice first, then offers the pair for the chosen file", async () => {
    const requests = stub(several);
    await expect(importWork()).rejects.toBeInstanceOf(ChooseTaskFileError);
    await expect(importWork({ taskFilePrUrl: FIX_URL })).rejects.toBeInstanceOf(ChooseTaskFileError);
    expect(requests.some((path) => path.includes("/pulls/13"))).toBe(false);
    await expect(importWork({ taskPath: T7 })).rejects.toMatchObject({ code: "need_task_file_pr", reason: "task_file_problems", message: NEED_FIX });
    // The other file imports as a normal task.
    await expect(importWork({ taskPath: T9 })).resolves.toMatchObject({ taskPath: T9, facts: { prTaskFiles: [T7, T9] } });
  });

  it("imports the pair for the chosen file, the other file listed as the PR's", async () => {
    stub(several);
    const task = await importWork({ taskPath: T7, taskFilePrUrl: NEW_URL });
    expect(task).toMatchObject({ taskPath: T8, spec: { id: "X-T-8" } });
    expect(task.facts).toMatchObject({
      prTaskFileCount: 2, prTaskFiles: [T8, T9], taskFilePr: { number: 14, fixesTaskPath: T7 },
      prTaskFileCommitters: { [T8]: "unknown", [T9]: "unknown" },
    });
    expect(Object.keys(task.facts.prTaskFileCommitters!)).not.toContain(T7);
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

describe("3. the Add PR route", () => {
  beforeEach(() => { state.rows = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("answers 409 need_task_file_pr with the reason and problems, then saves the pair", async () => {
    stub();
    expect(await addPr(1)).toEqual({ status: 409, body: { error: NEED_FIX, code: "need_task_file_pr", reason: "task_file_problems", problems: [SPECS_PROBLEM] } });
    const saved = await addPr(1, { taskFilePrUrl: FIX_URL });
    expect(saved.status).toBe(200);
    expect(saved.body.submission).toMatchObject({
      pr_url: WORK_URL, pr_number: 12, task_id: "X-T-7", task_path: T7, task_spec_markdown: spec("X-T-7"),
      facts_json: { taskFilePr: { url: FIX_URL, number: 13, mergeSha: "spec13", fixesTaskPath: T7 }, prTaskFiles: [T7] },
    });
  });

  it("Re-check re-imports the pair, also for a work PR with several task files", async () => {
    stub();
    const added = await addPr(1, { taskFilePrUrl: FIX_URL });
    const request = recheckRequest(added.body.submission as never);
    expect(request).toEqual({ prUrl: WORK_URL, taskPath: T7, taskFilePrUrl: FIX_URL });
    expect((await addPr(1, request)).body.submission).toMatchObject({ task_path: T7, facts_json: { taskFilePr: { number: 13, fixesTaskPath: T7 } } });

    state.rows = [];
    stub({
      workFiles: [{ filename: T7, status: "added" }, { filename: T9, status: "added" }],
      workTexts: { [T7]: malformed("X-T-7"), [T9]: spec("X-T-9") },
    });
    const pair = await addPr(1, { taskPath: T7, taskFilePrUrl: NEW_URL });
    expect(pair.status).toBe(200);
    const again = recheckRequest(pair.body.submission as never);
    expect(again).toEqual({ prUrl: WORK_URL, taskPath: T7, taskFilePrUrl: NEW_URL });
    expect((await addPr(1, again)).body.submission).toMatchObject({ task_path: T8, facts_json: { taskFilePr: { number: 14, fixesTaskPath: T7 } } });
    // The PR's other task file fills the second slot; a third task from the PR is refused.
    expect((await addPr(2, { taskPath: T9 })).status).toBe(200);
    expect(state.rows.map((row) => [row.task_slot, row.task_path])).toEqual([[1, T8], [2, T9]]);
    expect((await addPr(3, { taskPath: T7, taskFilePrUrl: FIX_URL })).body.error).toBe("At most two of your tasks can come from one PR, each with its own task file.");
  });

  it("blocks the work PR or the task-file PR another student already added, and keeps the task-ID rule", async () => {
    stub();
    state.rows = [otherStudent(12)];
    expect(await addPr(1)).toEqual({ status: 409, body: { error: TAKEN, code: "taken_by_another_student" } });
    state.rows = [otherStudent(13)];
    expect(await addPr(1, { taskFilePrUrl: FIX_URL })).toEqual({ status: 409, body: { error: TAKEN, code: "taken_by_another_student" } });
    state.rows = [otherStudent(40, "X-T-7")];
    expect((await addPr(1, { taskFilePrUrl: FIX_URL })).body.error).toBe("Task ID X-T-7 is already used by another student in team/app. Use a new task ID. If you think this is an error, please contact a TA.");
  });

  it("refuses the same task-file PR in another slot", async () => {
    stub();
    expect((await addPr(1, { taskFilePrUrl: FIX_URL })).status).toBe(200);
    expect(await addPr(2, { taskFilePrUrl: FIX_URL })).toEqual({ status: 409, body: { error: "X-T-7.md from this PR is already your Task 1. Each task needs its own task file.", code: "task_file_already_used" } });
  });

  it("refuses someone else's PR with a 422 and no box", async () => {
    stub({ work: { user: { login: "teammate" } } });
    expect(await addPr(1)).toEqual({ status: 422, body: { error: `${SPECS_PROBLEM}\n${PAIR_FIX_NOT_AUTHOR}` } });
  });
});

describe("4. page, card and review-page texts", () => {
  it("has the exact texts; the no-task-file texts are unchanged", () => {
    expect(TASK_FILE_FIX_BOX.heading).toBe("This merged PR's task file has problems");
    expect(TASK_FILE_FIX_BOX.text(2)).toBe("A merged PR can't be changed. Open a new PR that corrects only your task file in docs/tasks/sprint-2/, merge it, and paste its link here. Your task is graded on the code in the PR above.");
    expect(TASK_FILE_FIX_CARD_NOTE).toBe("The task file was corrected in a separate PR, after the work was merged, because the PR's own task file had problems.");
    expect(taskFilePrCardNote({ fixesTaskPath: T7 })).toBe(TASK_FILE_FIX_CARD_NOTE);
    expect(taskFilePrCardNote({})).toBe(TASK_FILE_PR_CARD_NOTE);
    expect(taskFilePrReviewLine(13, 12, T7)).toBe("Task file from a separate PR, #13. The work is in PR #12, whose own task file, X-T-7.md, had format problems, so the task file was corrected after the work.");
    expect(taskFilePrReviewLine(13, 12)).toBe("Task file from a separate PR, #13. The work is in PR #12, which has no task file, so the task file was written or added after the work.");
  });

  it("carries fixesTaskPath through savedTaskFilePr, and drops a malformed one", () => {
    const pair = { url: FIX_URL, number: 13, mergeSha: "spec13" };
    expect(savedTaskFilePr({ taskFilePr: { ...pair, fixesTaskPath: T7 } })).toEqual({ ...pair, fixesTaskPath: T7 });
    expect(savedTaskFilePr({ taskFilePr: { ...pair, fixesTaskPath: 7 } })).toEqual(pair);
  });

  it("the form picks the box from the route's answer and sends the chosen file with the pair", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../components/cse115a/CourseDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("imported.reason === \"task_file_problems\" && Array.isArray(imported.problems)");
    expect(source).toContain("{pairBox.problems ? (");
    expect(source).toContain("{TASK_FILE_FIX_BOX.heading}");
    expect(source).toContain("{TASK_FILE_PR_BOX.heading}");
    expect(source).toContain("...(pairBox.taskPath ? { taskPath: pairBox.taskPath } : {}), taskFilePrUrl:");
    expect(source).toContain("{taskFilePrCardNote(pair)}");
  });
});

// ---- Snapshot, benchmark and grader: the work PR's diff holds the old malformed task file. ----

function snapshot(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot: 1, taskId: "X-T-7", prUrl: WORK_URL, repoFullName: REPO, prNumber: 12, taskPath: T7,
    specMarkdown: spec("X-T-7"), spec: { id: "X-T-7", estimateHours: 3 } as TaskSpec, validation: { prMerged: true }, analysisResultId: "r1",
    pr: { title: "Add the thing", body: "", headRef: "feature/x-t-7", author: "student", mergedAt: "2026-10-14T00:00:00Z", baseSha: "main0", mergeCommitSha: "squash" },
    baseCommit: "main0", baseCommitSource: "pr_base", diff: DIFF, diffBytes: DIFF.length, diffTruncated: false, diffError: null, comments: [], checks: [],
    taskFilePr: { url: FIX_URL, number: 13, mergeSha: "spec13", fixesTaskPath: T7 }, prTaskFiles: [T7],
    ...overrides,
  };
}

describe("5. snapshot, benchmark row and grader", () => {
  it("the benchmark row drops the old task file; the grader reads it last", () => {
    const built = buildInstance(snapshot(), 2, null);
    expect(built.instance.patch).not.toContain("docs/tasks/");
    expect(built.flags).toContain("task_files_dropped");
    expect(built.flags).toContain("task_file_from_other_pr");
    const { patch } = graderPatches(DIFF, spec("X-T-7"));
    expect(patch.indexOf("src/app.ts")).toBeLessThan(patch.indexOf(T7));
  });

  it("adds no shared-PR line or grader note when the corrected file stands in for the PR's only task file", () => {
    for (const task of [snapshot(), snapshot({ taskPath: T8, taskId: "X-T-8", prTaskFiles: [T8] })]) {
      expect(prTaskFileLines([task], task, "student")).toEqual([]);
      expect(prTaskFileGraderNotes([task], task)).toEqual([]);
    }
  });
});
