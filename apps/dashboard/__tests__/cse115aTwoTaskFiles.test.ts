import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";
import { ChooseTaskFileError, importTaskFromPullRequest, SEVERAL_TASK_FILES_NOT_AUTHOR } from "@/lib/cse115a/githubTaskImport";
import { duplicateTaskMessage, ownTaskConflict, saveConflictMessage, type OwnTask } from "@/lib/cse115a/duplicateTask";
import { firstCommitHoldsOnlyTaskFiles, otherTaskInSamePr, prHoldsMoreThanThisTask, prTaskFileGraderNotes, prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { buildMessages, graderInput, GRADER_PROMPT_VERSION } from "@/lib/cse115a/grader/llmGrader";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { exportJsonl, isExportable } from "@/lib/cse115a/benchmark/exportJsonl";
import { runNextJob, type BenchmarkSave, type JobStore } from "@/lib/cse115a/jobs/runner";
import { captureSubmissionSnapshot, type SubmittedTaskRow, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

vi.mock("server-only", () => ({}));

// A merged PR that adds two of the student's task files in sprint 2 and, through a merge from main, modifies a
// teammate's task file in sprint 3.
const REPO = "team/app";
const PR_URL = "https://github.com/team/app/pull/12";
const T7 = "docs/tasks/sprint-2/X-T-7.md";
const T8 = "docs/tasks/sprint-2/X-T-8.md";
const TEAMMATE = "docs/tasks/sprint-3/Y-T-1.md";

function spec(id: string, sprint: number, hours: number): string {
  return `---
id: ${id}
story: X
sprint: ${sprint}
assignee: A. Student
estimate_hours: ${hours}
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

## Tests
| Test | Asserts | Criterion |
|---|---|---|
| ${id} returns 200 | HTTP 200 | 1 |
`;
}

type PrFile = { filename: string; status: string };
const TWO_TASK_FILES: PrFile[] = [
  { filename: "src/app.ts", status: "added" },
  { filename: "src/app.test.ts", status: "added" },
  { filename: T7, status: "added" },
  { filename: T8, status: "added" },
  { filename: TEAMMATE, status: "modified" },
];

/** A PR in team/app, number 12, by `author`. Files and contents are at the squash commit (merged) or "head1" (open). */
function stubPull(options: { files?: PrFile[]; firstCommitFiles?: string[]; author?: string; open?: boolean; contents?: Record<string, string> } = {}) {
  const files = options.files ?? TWO_TASK_FILES;
  const ref = options.open ? "head1" : "squash";
  const contents = options.contents ?? { [T7]: spec("X-T-7", 2, 4), [T8]: spec("X-T-8", 2, 5), [TEAMMATE]: spec("Y-T-1", 3, 3) };
  const routes: Record<string, unknown> = {
    "/repos/team/app/pulls/12": {
      state: options.open ? "open" : "closed",
      merged_at: options.open ? null : "2026-10-14T00:00:00Z", merge_commit_sha: options.open ? null : "squash",
      title: "X-T-7 and X-T-8", user: { login: options.author ?? "student" }, head: { ref: "feature/x", sha: "head1" }, base: { sha: "main0" },
    },
    "/repos/team/app/pulls/12/files?per_page=100&page=1": files,
    "/repos/team/app/pulls/12/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/app/commits/first": {
      files: (options.firstCommitFiles ?? ["src/app.ts"]).map((filename) => ({ filename })), commit: { author: { email: "student@ucsc.edu" } },
    },
    "/repos/team/app/contents/docs/tasks/sprint-2?ref=squash": [{ name: "X-T-7.md", type: "file" }, { name: "X-T-8.md", type: "file" }],
    "/repos/team/app/contents/docs/tasks/sprint-3?ref=squash": [{ name: "Y-T-1.md", type: "file" }],
  };
  for (const [path, text] of Object.entries(contents)) {
    routes[`/repos/team/app/contents/${path}?ref=${ref}`] = { encoding: "base64", size: text.length, content: Buffer.from(text).toString("base64") };
  }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
  }));
}

const importAs = (assignment: number, taskPath?: string, login = "student") =>
  importTaskFromPullRequest(PR_URL, assignment, githubReader("token"), login, { taskPath });

describe("two task files in one merged PR: choosing the task file", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("under Assignment 2, offers the two task files the PR adds, never the teammate's file it modifies", async () => {
    stubPull();
    const result = importAs(2);
    await expect(result).rejects.toBeInstanceOf(ChooseTaskFileError);
    await expect(result).rejects.toMatchObject({
      code: "choose_task_file", repoFullName: REPO, prNumber: 12,
      choices: [{ path: T7, taskId: "X-T-7" }, { path: T8, taskId: "X-T-8" }],
    });
  });

  it("under Assignment 3, finds no task file: the PR only modifies the teammate's file there", async () => {
    stubPull();
    await expect(importAs(3)).rejects.toThrow(new Error(
      "No task file was found in docs/tasks/sprint-3/ in this PR. It changes Y-T-1.md but does not add it; a PR's task file is one it adds.",
    ));
  });

  it("imports each chosen file on its own: its own ID, estimate and checks", async () => {
    stubPull();
    const seven = await importAs(2, T7);
    const eight = await importAs(2, T8);
    expect([seven.taskPath, seven.spec.id, seven.spec.estimateHours]).toEqual([T7, "X-T-7", 4]);
    expect([eight.taskPath, eight.spec.id, eight.spec.estimateHours]).toEqual([T8, "X-T-8", 5]);
    expect(seven.prUrl).toBe(eight.prUrl);
    expect(seven.validation.prAuthoredByStudent).toBe(true);
  });

  it("checks the chosen file on its own (#388): the other file's problems are not its problems", async () => {
    stubPull({ contents: { [T7]: spec("X-T-7", 2, 4), [T8]: spec("X-T-8", 2, 5).replace("## Specs", "## Steps") } });
    await expect(importAs(2, T7)).resolves.toMatchObject({ taskPath: T7 });
    await expect(importAs(2, T8)).rejects.toThrow("The task file needs a nonempty “Specs” section.");
  });

  it("refuses a chosen path the PR did not add", async () => {
    stubPull();
    await expect(importAs(2, "docs/tasks/sprint-2/X-T-9.md")).rejects.toThrow(new Error(
      "This PR does not add X-T-9.md in docs/tasks/sprint-2/. Choose a task file it adds: X-T-7.md, X-T-8.md.",
    ));
    await expect(importAs(2, TEAMMATE)).rejects.toThrow("This PR does not add Y-T-1.md");
  });

  it("refuses a student who did not open the PR, with or without a chosen file", async () => {
    stubPull({ author: "someone-else" });
    await expect(importAs(2)).rejects.toThrow(new Error(SEVERAL_TASK_FILES_NOT_AUTHOR));
    await expect(importAs(2, T7)).rejects.toThrow(new Error(SEVERAL_TASK_FILES_NOT_AUTHOR));
    expect(SEVERAL_TASK_FILES_NOT_AUTHOR).toBe("A PR with several task files can be added only by the student who opened it.");
  });

  it("still refuses an open PR with two task files, and says to split it before merging", async () => {
    stubPull({ open: true, files: [{ filename: T7, status: "added" }, { filename: T8, status: "added" }] });
    await expect(importAs(2)).rejects.toThrow(new Error("This pull request is not merged yet. Before you merge, fix:\n"
      + "- This PR adds 2 task files: X-T-7.md, X-T-8.md. A task PR adds only its own task file. Before merging, move each task file to its own PR. One PR per task."));
  });

  it("picks the added task file when the PR also modifies a teammate's in the same sprint folder (rule 1)", async () => {
    const teammate2 = "docs/tasks/sprint-2/Y-T-2.md";
    stubPull({ files: [{ filename: T7, status: "added" }, { filename: teammate2, status: "modified" }], contents: { [T7]: spec("X-T-7", 2, 4) } });
    await expect(importAs(2)).resolves.toMatchObject({ taskPath: T7 });
  });
});

describe("two task files in one merged PR: task file committed first", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true for both tasks when the first commit holds both task files and nothing else", async () => {
    stubPull({ firstCommitFiles: [T7, T8] });
    expect((await importAs(2, T7)).facts.firstCommitTaskOnly).toBe(true);
    expect((await importAs(2, T8)).facts.firstCommitTaskOnly).toBe(true);
  });

  it("is false for both tasks when the first commit holds code (code before the task files)", async () => {
    stubPull({ firstCommitFiles: ["src/app.ts"] });
    expect((await importAs(2, T7)).facts.firstCommitTaskOnly).toBe(false);
    expect((await importAs(2, T8)).facts.firstCommitTaskOnly).toBe(false);
    stubPull({ firstCommitFiles: [T7, T8, "src/app.ts"] });
    expect((await importAs(2, T7)).facts.firstCommitTaskOnly).toBe(false);
  });

  it("is false when the first commit holds the teammate's modified task file too", async () => {
    stubPull({ firstCommitFiles: [T7, TEAMMATE] });
    expect((await importAs(2, T7)).facts.firstCommitTaskOnly).toBe(false);
  });

  it("is unchanged for a one-task-file PR: exactly its own file", () => {
    expect(firstCommitHoldsOnlyTaskFiles([{ filename: T7 }], T7, [T7])).toBe(true);
    expect(firstCommitHoldsOnlyTaskFiles([{ filename: T7 }, { filename: T8 }], T7, [T7])).toBe(false);
    expect(firstCommitHoldsOnlyTaskFiles([{ filename: T8 }], T7, [T7, T8])).toBe(false);
    expect(firstCommitHoldsOnlyTaskFiles([], T7, [T7])).toBe(false);
    expect(firstCommitHoldsOnlyTaskFiles(undefined, T7, [T7])).toBe(false);
  });
});

describe("two task files in one merged PR: duplicate rules", () => {
  const own = (assignment: number, slot: number, path: string, pr = 12): OwnTask =>
    ({ assignment_number: assignment, task_slot: slot, repo_full_name: REPO, pr_number: pr, task_path: path });
  const target = { assignmentNumber: 2, slot: 2, repoFullName: "Team/App", prNumber: 12 };

  it("lets the same student add the other task file in the other slot", () => {
    expect(ownTaskConflict([own(2, 1, T7)], { ...target, taskPath: T8 })).toBeNull();
  });

  it("refuses the same task file twice", () => {
    expect(ownTaskConflict([own(2, 1, T7)], { ...target, taskPath: T7 }))
      .toBe("X-T-7.md from this PR is already your Task 1. Each task needs its own task file.");
    expect(ownTaskConflict([own(3, 1, T7)], { ...target, taskPath: T7 }))
      .toBe("X-T-7.md from this PR is already your Task 1 in Sprint 3. Each task needs its own task file.");
  });

  it("ignores the slot being filled, so Re-check and changing the file in one slot work", () => {
    expect(ownTaskConflict([own(2, 2, T7)], { ...target, taskPath: T7 })).toBeNull();
    expect(ownTaskConflict([own(2, 2, T7)], { ...target, taskPath: T8 })).toBeNull();
  });

  it("uses at most two task files from one PR", () => {
    expect(ownTaskConflict([own(2, 1, T7), own(2, 2, T8)], { ...target, assignmentNumber: 3, slot: 1, taskPath: "docs/tasks/sprint-3/X-T-9.md" }))
      .toBe("At most two task files from one PR can be used, one for each task.");
  });

  it("still refuses another student's PR, before and after the file is chosen", () => {
    const others = [{ repo_full_name: REPO, pr_number: 12, task_id: "X-T-7" }];
    const taken = "This PR is already added by another student in this course. Each PR counts for one student's task. If you think this is an error, please contact a TA.";
    expect(duplicateTaskMessage(others, { repoFullName: REPO, prNumber: 12, taskId: null })).toBe(taken);
    expect(duplicateTaskMessage(others, { repoFullName: REPO, prNumber: 12, taskId: "X-T-8" })).toBe(taken);
    expect(duplicateTaskMessage([{ repo_full_name: REPO, pr_number: 13, task_id: "X-T-7" }], { repoFullName: REPO, prNumber: 12, taskId: null })).toBeNull();
  });

  it("explains the database's refusal before the migration, and keeps the old message otherwise", () => {
    expect(saveConflictMessage({ message: "duplicate key value violates unique constraint \"cse_task_submissions_course_id_user_id_pr_url_key\"" }))
      .toBe("Two tasks from one PR can't be saved yet: the course database still takes each PR once per student. Please contact a TA.");
    expect(saveConflictMessage({ message: "duplicate key value violates unique constraint \"cse_task_submissions_course_user_pr_task_path_key\"", details: "Key (course_id, user_id, pr_url, task_path)" }))
      .toBe("This task ID or PR is already submitted in another slot.");
    expect(saveConflictMessage({ message: "duplicate key value violates unique constraint \"cse_task_submissions_course_id_user_id_task_id_key\"" }))
      .toBe("This task ID or PR is already submitted in another slot.");
  });
});

// ---- The Add PR route, with an in-memory table and the GitHub stub above. ----

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  migrated: true,
  upserts: 0,
  userId: "user-student",
  githubLogin: "student",
}));

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => fakeDb() }));
vi.mock("@/lib/cse115a/server", () => ({
  getCourseIdentity: async () => ({ userId: state.userId, githubLogin: state.githubLogin }),
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

function duplicateError(constraint: string, key: string) {
  return { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"`, details: `Key (${key})=(...) already exists.` };
}

function upsertRow(row: Row): { data: Row | null; error: ReturnType<typeof duplicateError> | null } {
  state.upserts += 1;
  const sameSlot = (other: Row) => other.course_id === row.course_id && other.user_id === row.user_id
    && other.assignment_number === row.assignment_number && other.task_slot === row.task_slot;
  const others = state.rows.filter((other) => !sameSlot(other) && other.course_id === row.course_id && other.user_id === row.user_id);
  if (others.some((other) => other.task_id === row.task_id)) return { data: null, error: duplicateError("cse_task_submissions_course_id_user_id_task_id_key", "course_id, user_id, task_id") };
  if (!state.migrated && others.some((other) => other.pr_url === row.pr_url)) {
    return { data: null, error: duplicateError("cse_task_submissions_course_id_user_id_pr_url_key", "course_id, user_id, pr_url") };
  }
  if (state.migrated && others.some((other) => other.pr_url === row.pr_url && other.task_path === row.task_path)) {
    return { data: null, error: duplicateError("cse_task_submissions_course_user_pr_task_path_key", "course_id, user_id, pr_url, task_path") };
  }
  state.rows = [...state.rows.filter((other) => !sameSlot(other)), row];
  return { data: row, error: null };
}

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
          const result = upsertRow(row);
          return { select: () => ({ single: async () => result }) };
        },
      };
      return query;
    },
  };
}

async function addPr(slot: number, body: { prUrl?: string; taskPath?: string } = {}) {
  const { POST } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
  const request = new Request("http://localhost/api/cse115a/assignments/2/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseSlug: "CSE115A", slot, prUrl: body.prUrl ?? PR_URL, ...(body.taskPath ? { taskPath: body.taskPath } : {}) }),
  });
  const response = (await POST(request, { params: Promise.resolve({ number: "2" }) }))!;
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("two task files in one merged PR: Add PR", () => {
  beforeEach(() => {
    state.rows = [];
    state.migrated = true;
    state.upserts = 0;
    state.userId = "user-student";
    state.githubLogin = "student";
    stubPull();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the choices, adds each file in its own slot, and refuses the same file twice", async () => {
    const ask = await addPr(1);
    expect(ask.status).toBe(409);
    expect(ask.body).toMatchObject({
      code: "choose_task_file",
      choices: [{ path: T7, taskId: "X-T-7", takenBySlot: null }, { path: T8, taskId: "X-T-8", takenBySlot: null }],
    });

    const first = await addPr(1, { taskPath: T7 });
    expect(first.status).toBe(200);
    expect(first.body.submission).toMatchObject({ task_slot: 1, task_id: "X-T-7", task_path: T7, pr_url: PR_URL });

    const askAgain = await addPr(2);
    expect(askAgain.body).toMatchObject({ code: "choose_task_file", choices: [{ path: T7, takenBySlot: 1 }, { path: T8, takenBySlot: null }] });

    const second = await addPr(2, { taskPath: T8 });
    expect(second.status).toBe(200);
    expect(state.rows.map((row) => [row.task_slot, row.task_id, row.pr_url])).toEqual([[1, "X-T-7", PR_URL], [2, "X-T-8", PR_URL]]);

    const upserts = state.upserts;
    const twice = await addPr(2, { taskPath: T7 });
    expect(twice).toEqual({ status: 409, body: { error: "X-T-7.md from this PR is already your Task 1. Each task needs its own task file.", code: "task_file_already_used" } });
    expect(state.upserts).toBe(upserts);
  });

  it("re-checks a slot with its saved task file", async () => {
    await addPr(1, { taskPath: T7 });
    await addPr(2, { taskPath: T8 });
    const recheck = await addPr(2, { taskPath: T8 });
    expect(recheck.status).toBe(200);
    expect(recheck.body.submission).toMatchObject({ task_slot: 2, task_id: "X-T-8" });
  });

  it("refuses a student who did not open the PR", async () => {
    state.githubLogin = "teammate";
    expect(await addPr(1)).toEqual({ status: 422, body: { error: SEVERAL_TASK_FILES_NOT_AUTHOR } });
    expect(await addPr(1, { taskPath: T7 })).toEqual({ status: 422, body: { error: SEVERAL_TASK_FILES_NOT_AUTHOR } });
  });

  it("refuses a chosen path the PR did not add", async () => {
    const result = await addPr(1, { taskPath: TEAMMATE });
    expect(result.status).toBe(422);
    expect(result.body.error).toBe("This PR does not add Y-T-1.md in docs/tasks/sprint-2/. Choose a task file it adds: X-T-7.md, X-T-8.md.");
  });

  it("still refuses another student adding the PR, even its author's other file", async () => {
    await addPr(1, { taskPath: T7 });
    state.userId = "user-other";
    const ask = await addPr(1);
    expect(ask.status).toBe(409);
    expect(ask.body.code).toBe("taken_by_another_student");
    const chosen = await addPr(1, { taskPath: T8 });
    expect(chosen.body.code).toBe("taken_by_another_student");
  });

  it("before the migration: a second file gives a clear error, and the same file never reaches the database", async () => {
    state.migrated = false;
    expect((await addPr(1, { taskPath: T7 })).status).toBe(200);
    expect(await addPr(2, { taskPath: T8 })).toEqual({ status: 409, body: {
      error: "Two tasks from one PR can't be saved yet: the course database still takes each PR once per student. Please contact a TA.",
    } });
    const upserts = state.upserts;
    expect((await addPr(2, { taskPath: T7 })).body.code).toBe("task_file_already_used");
    expect(state.upserts).toBe(upserts);
  });

  it("a one-task-file PR in both slots is refused before the database, migrated or not", async () => {
    stubPull({ files: [{ filename: T7, status: "added" }], contents: { [T7]: spec("X-T-7", 2, 4) } });
    expect((await addPr(1)).status).toBe(200);
    const upserts = state.upserts;
    expect((await addPr(2)).body).toEqual({ error: "X-T-7.md from this PR is already your Task 1. Each task needs its own task file.", code: "task_file_already_used" });
    expect(state.upserts).toBe(upserts);
  });
});

// ---- Grading, the review line, benchmark rows and capture. ----

function snapshot(slot: number, taskId: string, overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  const diff = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n x\n+y\n";
  return {
    slot, taskId, prUrl: PR_URL, repoFullName: REPO, prNumber: 12, taskPath: `docs/tasks/sprint-2/${taskId}.md`,
    specMarkdown: spec(taskId, 2, 4), spec: { id: taskId, estimateHours: 4 } as TaskSpec, validation: { prMerged: true }, analysisResultId: `r${slot}`,
    pr: { title: "X", body: "", headRef: "feature/x", author: "student", mergedAt: "2026-10-14T00:00:00Z", baseSha: "main0", mergeCommitSha: "squash" },
    baseCommit: "main0", baseCommitSource: "pr_base", diff, diffBytes: diff.length, diffTruncated: false, diffError: null, comments: [], checks: [],
    ...overrides,
  };
}

describe("two task files in one merged PR: grading and review", () => {
  const LINE = "This PR holds two tasks. The other task, X-T-8, has its own task file and grade; judge this task only against its own task file and acceptance criteria, and do not count the other task's work for or against it.";

  it("gives the grader the shared-PR line only for such tasks", () => {
    const seven = snapshot(1, "X-T-7");
    const eight = snapshot(2, "X-T-8");
    expect(otherTaskInSamePr([seven, eight], seven)?.taskId).toBe("X-T-8");
    const input = graderInput(seven, prTaskFileGraderNotes([seven, eight], seven));
    expect(input.notes.filter((note) => note.startsWith("This PR"))).toEqual([LINE]);
    expect(buildMessages(input)[1]!.content).toContain(`Note: ${LINE}`);

    const alone = snapshot(1, "X-T-7");
    const separate = snapshot(2, "X-T-8", { prUrl: "https://github.com/team/app/pull/13", prNumber: 13 });
    expect(prTaskFileGraderNotes([alone, separate], alone)).toEqual([]);
    expect(graderInput(alone, prTaskFileGraderNotes([alone, separate], alone)).notes.some((note) => note.includes("This PR"))).toBe(false);
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v4");
  });

  it("says on the review page and student card which tasks share the PR", () => {
    const seven = snapshot(1, "X-T-7", { prTaskFiles: [T7, T8] });
    const eight = snapshot(2, "X-T-8", { prTaskFiles: [T7, T8] });
    const both = ["This PR holds two tasks: X-T-7 (Task 1) and X-T-8 (Task 2). They share one diff."];
    expect(prTaskFileLines([eight, seven], seven, "student")).toEqual(both);
    expect(prTaskFileLines([eight, seven], eight, "student")).toEqual(both);
    // Tasks saved before the count was recorded fall back to the other slot.
    expect(prTaskFileLines([snapshot(1, "X-T-7"), snapshot(2, "X-T-8")], snapshot(1, "X-T-7"), "student")).toEqual(both);
    expect(prTaskFileLines([snapshot(1, "X-T-7")], snapshot(1, "X-T-7"), "student")).toEqual([]);
    const other = snapshot(2, "X-T-8", { prUrl: "https://github.com/team/app/pull/13" });
    expect(prTaskFileLines([snapshot(1, "X-T-7"), other], snapshot(1, "X-T-7"), "student")).toEqual([]);
    expect(prTaskFileLines([snapshot(1, "X-T-7", { prTaskFiles: [T7] }), other], snapshot(1, "X-T-7", { prTaskFiles: [T7] }), "student")).toEqual([]);
  });
});

describe("one task file used from a PR that adds two", () => {
  afterEach(() => vi.unstubAllGlobals());
  // Task 1 is X-T-7 from PR #12, which also adds X-T-8; Task 2 is another PR.
  const seven = snapshot(1, "X-T-7", { prTaskFiles: [T7, T8] });
  const elsewhere = snapshot(2, "Z-T-1", { prUrl: "https://github.com/team/app/pull/13", prNumber: 13, prTaskFiles: ["docs/tasks/sprint-2/Z-T-1.md"] });
  const LINE = "This PR also adds another task file, X-T-8.md, which is not one of your tasks here. Its work is in the same diff.";
  const NOTE = "This PR also adds another task file, X-T-8.md, which is not one of this student's tasks here; its work is in the same diff. Judge this task only against its own task file and acceptance criteria, and do not count that file's work for or against it.";

  it("records at import how many task files the PR adds, and which", async () => {
    stubPull();
    const task = await importAs(2, T7);
    expect(task.facts.prTaskFileCount).toBe(2);
    expect(task.facts.prTaskFiles).toEqual([T7, T8]);
    stubPull({ files: [{ filename: T7, status: "added" }, { filename: TEAMMATE, status: "modified" }], contents: { [T7]: spec("X-T-7", 2, 4) } });
    const single = await importAs(2);
    expect([single.facts.prTaskFileCount, single.facts.prTaskFiles]).toEqual([1, [T7]]);
  });

  it("shows the line to the student and staff, only on that task", () => {
    expect(prTaskFileLines([seven, elsewhere], seven, "student")).toEqual([LINE]);
    expect(prTaskFileLines([seven, elsewhere], elsewhere, "student")).toEqual([]);
    expect(prTaskFileLines([seven], seven, "student")).toEqual([LINE]);
  });

  it("says \"this student's tasks\" on the staff review page", () => {
    expect(prTaskFileLines([seven, elsewhere], seven, "staff")).toEqual([
      "This PR also adds another task file, X-T-8.md, which is not one of this student's tasks here. Its work is in the same diff.",
    ]);
    expect(prTaskFileLines([seven, elsewhere], elsewhere, "staff")).toEqual([]);
  });

  it("names every other file when the PR adds three and the student uses two", () => {
    const t9 = "docs/tasks/sprint-2/X-T-9.md";
    const a = snapshot(1, "X-T-7", { prTaskFiles: [T7, T8, t9] });
    const b = snapshot(2, "X-T-8", { prTaskFiles: [T7, T8, t9] });
    expect(prTaskFileLines([a, b], a, "student")).toEqual([
      "This PR holds two tasks: X-T-7 (Task 1) and X-T-8 (Task 2). They share one diff.",
      "This PR also adds another task file, X-T-9.md, which is not one of your tasks here. Its work is in the same diff.",
    ]);
    const c = snapshot(1, "X-T-7", { prTaskFiles: [T7, T8, t9] });
    expect(prTaskFileLines([c], c, "student")).toEqual(["This PR also adds other task files, X-T-8.md, X-T-9.md, which are not your tasks here. Their work is in the same diff."]);
    expect(prTaskFileLines([c], c, "staff")).toEqual(["This PR also adds other task files, X-T-8.md, X-T-9.md, which are not this student's tasks here. Their work is in the same diff."]);
    expect(prTaskFileLines([a, b], a, "staff")[0]).toBe("This PR holds two tasks: X-T-7 (Task 1) and X-T-8 (Task 2). They share one diff.");
  });

  it("gives the grader the note to judge this task only against its own task file", () => {
    expect(prTaskFileGraderNotes([seven, elsewhere], seven)).toEqual([NOTE]);
    expect(prTaskFileGraderNotes([seven, elsewhere], elsewhere)).toEqual([]);
    const input = graderInput(seven, prTaskFileGraderNotes([seven, elsewhere], seven));
    expect(buildMessages(input)[1]!.content).toContain(`Note: ${NOTE}`);
  });

  it("flags the benchmark row and keeps it out of export; the other PR's row is unchanged", async () => {
    expect(prHoldsMoreThanThisTask([seven, elsewhere], seven)).toBe(true);
    expect(prHoldsMoreThanThisTask([seven, elsewhere], elsewhere)).toBe(false);
    let saved: BenchmarkSave[] = [];
    const store: JobStore = {
      claim: async () => ({ id: "j", assignment_submission_id: "s", kind: "benchmark", attempts: 1 }),
      loadSubmission: async () => ({ id: "s", course_id: "c", user_id: "u", assignment_number: 2, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "", tasks: [seven, elsewhere] } }),
      setSubmissionStatus: async () => {}, saveGrades: async () => {}, finishJob: async () => {},
      loadRepoMetrics: async () => null, loadStudentEmail: async () => null,
      saveBenchmark: async (_submission, rows) => { saved = rows; },
    };
    await runNextJob(store, { grade: async () => [] });
    expect(saved.map((row) => [row.slot, row.flags.includes("pr_holds_two_tasks")])).toEqual([[1, true], [2, false]]);
    const candidates = saved.map((row) => ({ instance: row.instance, sources: [{ consented: true, validationStatus: "candidate" as const, flags: row.flags }] }));
    expect(candidates.map((candidate) => isExportable(candidate))).toEqual([false, true]);
    expect(exportJsonl(candidates).trim().split("\n").map((line) => (JSON.parse(line) as { instance_id: string }).instance_id)).toEqual(["team__app-Z-T-1"]);
  });
});

describe("two task files in one merged PR: benchmark rows", () => {
  async function benchmarkRows(tasks: TaskSnapshot[]): Promise<BenchmarkSave[]> {
    let saved: BenchmarkSave[] = [];
    const store: JobStore = {
      claim: async () => ({ id: "j", assignment_submission_id: "s", kind: "benchmark", attempts: 1 }),
      loadSubmission: async () => ({ id: "s", course_id: "c", user_id: "u", assignment_number: 2, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "", tasks } }),
      setSubmissionStatus: async () => {},
      saveGrades: async () => {},
      finishJob: async () => {},
      loadRepoMetrics: async () => null,
      loadStudentEmail: async () => null,
      saveBenchmark: async (_submission, rows) => { saved = rows; },
    };
    await runNextJob(store, { grade: async () => [] });
    return saved;
  }

  it("gives each task its own row and flags both", async () => {
    const rows = await benchmarkRows([snapshot(1, "X-T-7"), snapshot(2, "X-T-8")]);
    expect(rows.map((row) => row.instance.instance_id)).toEqual(["team__app-X-T-7", "team__app-X-T-8"]);
    expect(rows.every((row) => row.flags.includes("pr_holds_two_tasks"))).toBe(true);
  });

  it("leaves a normal row unchanged", async () => {
    const rows = await benchmarkRows([snapshot(1, "X-T-7"), snapshot(2, "X-T-8", { prUrl: "https://github.com/team/app/pull/13", prNumber: 13 })]);
    expect(rows.some((row) => row.flags.includes("pr_holds_two_tasks"))).toBe(false);
    expect(buildInstance(snapshot(1, "X-T-7"), 2, null)).toEqual(buildInstance(snapshot(1, "X-T-7"), 2, null, null, { prHoldsTwoTasks: false }));
  });

  it("keeps flagged rows out of the JSONL export, like rejected rows", () => {
    const flagged = buildInstance(snapshot(1, "X-T-7"), 2, null, null, { prHoldsTwoTasks: true });
    const normal = buildInstance(snapshot(1, "X-T-9", { prUrl: "https://github.com/team/app/pull/14" }), 2, null);
    expect(flagged.flags).toContain("pr_holds_two_tasks");
    const candidates = [
      { instance: flagged.instance, sources: [{ consented: true, validationStatus: "candidate" as const, flags: flagged.flags }] },
      { instance: normal.instance, sources: [{ consented: true, validationStatus: "candidate" as const, flags: normal.flags }] },
    ];
    expect(isExportable(candidates[0]!)).toBe(false);
    expect(isExportable(candidates[1]!)).toBe(true);
    const lines = exportJsonl(candidates).trim().split("\n").map((line) => JSON.parse(line) as { instance_id: string });
    expect(lines.map((line) => line.instance_id)).toEqual(["team__app-X-T-9"]);
  });
});

describe("two task files in one merged PR: capture at submit", () => {
  function row(slot: number, taskId: string, prNumber = 12): SubmittedTaskRow {
    return {
      task_slot: slot, task_id: taskId, pr_url: `https://github.com/team/app/pull/${prNumber}`, repo_full_name: REPO, pr_number: prNumber,
      task_path: `docs/tasks/sprint-2/${taskId}.md`, task_spec_markdown: spec(taskId, 2, 4), task_spec_json: { id: taskId } as TaskSpec,
      validation_json: { prMerged: true }, analysis_result_id: `r${slot}`,
    };
  }
  function reader(firstFiles: string[]): GitHubReader {
    return {
      async json<T>(path: string) {
        if (/\/pulls\/\d+$/.test(path)) return { title: "X", body: "", merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "squash", base: { sha: "main0" }, head: { ref: "feature/x" }, user: { login: "student" } } as T;
        if (path.includes("/commits?per_page=1")) return [{ sha: "first" }] as T;
        if (path.endsWith("/commits/first")) return { files: firstFiles.map((filename) => ({ filename })), commit: { author: { email: "student@ucsc.edu" } } } as T;
        if (path.includes("/git/ref/tags/")) return null as T;
        return [] as T;
      },
      async text() { return ""; },
    };
  }

  it("starts both diffs at the first commit when it holds both task files and nothing else", async () => {
    const snap = await captureSubmissionSnapshot(reader([T7, T8]), [row(1, "X-T-7"), row(2, "X-T-8")]);
    expect(snap.tasks.map((task) => [task.slot, task.baseCommit, task.baseCommitSource])).toEqual([[1, "first", "first_commit"], [2, "first", "first_commit"]]);
  });

  it("starts both at the PR base when the first commit holds code", async () => {
    const snap = await captureSubmissionSnapshot(reader(["src/app.ts"]), [row(1, "X-T-7"), row(2, "X-T-8")]);
    expect(snap.tasks.map((task) => task.baseCommitSource)).toEqual(["pr_base", "pr_base"]);
  });

  it("is unchanged for tasks from two PRs: a first commit with another task's file is not this task's alone", async () => {
    const snap = await captureSubmissionSnapshot(reader([T7, T8]), [row(1, "X-T-7", 12), row(2, "X-T-8", 13)]);
    expect(snap.tasks.map((task) => task.baseCommitSource)).toEqual(["pr_base", "pr_base"]);
    const alone = await captureSubmissionSnapshot(reader([T7]), [row(1, "X-T-7", 12)]);
    expect(alone.tasks[0]!.baseCommitSource).toBe("first_commit");
  });

  it("carries the recorded task files into the snapshot, and uses them for the first-commit diff base", async () => {
    const one = { ...row(1, "X-T-7"), facts_json: { prTaskFileCount: 2, prTaskFiles: [T7, T8] } };
    const snap = await captureSubmissionSnapshot(reader([T7, T8]), [one]);
    expect(snap.tasks[0]!.prTaskFiles).toEqual([T7, T8]);
    expect(snap.tasks[0]!.baseCommitSource).toBe("first_commit");
    const older = await captureSubmissionSnapshot(reader([T7]), [row(1, "X-T-7")]);
    expect("prTaskFiles" in older.tasks[0]!).toBe(false);
  });
});
