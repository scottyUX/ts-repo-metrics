import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";
import { ChooseTaskFileError, importTaskFromPullRequest, SEVERAL_TASK_FILES_NOT_AUTHOR } from "@/lib/cse115a/githubTaskImport";
import { prTaskFileGraderNotes, prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { buildMessages, graderInput } from "@/lib/cse115a/grader/llmGrader";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { exportJsonl } from "@/lib/cse115a/benchmark/exportJsonl";
import { runNextJob, type BenchmarkSave, type JobStore } from "@/lib/cse115a/jobs/runner";
import { captureSubmissionSnapshot, type SubmittedTaskRow, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

vi.mock("server-only", () => ({}));

// Only the student's own task files can be their task, for a PR that adds several. "Own" means the commit that
// added the file was made from the student's GitHub account. All names are made up.
const REPO = "team/app";
const PR_URL = "https://github.com/team/app/pull/12";
const T7 = "docs/tasks/sprint-2/X-T-7.md";
const T8 = "docs/tasks/sprint-2/X-T-8.md";
const Y1 = "docs/tasks/sprint-2/Y-T-1.md";

function spec(id: string, sprint = 2, hours = 4): string {
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

/**
 * Who added a file, as the commits list for that path answers: a login, null for a commit with no GitHub account,
 * an HTTP status for a failed request, "empty" for an empty list, or "full" for a full page of 100.
 */
type Committer = string | null | { status: number } | "empty" | "full";

const commitsPath = (path: string) => `/repos/team/app/commits?sha=head1&path=${path}&per_page=100`;

function commitsAnswer(committer: Committer): Response {
  if (committer && typeof committer === "object") return new Response("{}", { status: committer.status });
  if (committer === "empty") return new Response("[]");
  if (committer === "full") return new Response(JSON.stringify(Array.from({ length: 100 }, () => ({ author: { login: "student" } }))));
  // Newest first: a later edit by someone else, then the commit that added the file.
  return new Response(JSON.stringify([{ author: { login: "editor" } }, { author: committer === null ? null : { login: committer } }]));
}

/** A PR in team/app, number 12, by `author`, adding `committers`' files. Contents at "squash" (merged) or "head1" (open). */
function stubPull(options: {
  committers?: Record<string, Committer>; author?: string; open?: boolean; contents?: Record<string, string>; extraFiles?: Array<{ filename: string; status: string }>;
} = {}): string[] {
  const committers = options.committers ?? { [T7]: "student", [T8]: "student" };
  const files = [{ filename: "src/app.ts", status: "added" }, ...Object.keys(committers).map((filename) => ({ filename, status: "added" })), ...(options.extraFiles ?? [])];
  const ref = options.open ? "head1" : "squash";
  const contents = options.contents ?? Object.fromEntries(Object.keys(committers).map((path) => [path, spec(path.split("/").pop()!.replace(/\.md$/, ""))]));
  const routes: Record<string, unknown> = {
    "/repos/team/app/pulls/12": {
      state: options.open ? "open" : "closed",
      merged_at: options.open ? null : "2026-10-14T00:00:00Z", merge_commit_sha: options.open ? null : "squash",
      title: "X-T-7 X-T-8 Y-T-1", user: { login: options.author ?? "student" }, head: { ref: "feature/x-t-7-x-t-8-y-t-1", sha: "head1" }, base: { sha: "main0" },
    },
    "/repos/team/app/pulls/12/files?per_page=100&page=1": files,
    "/repos/team/app/pulls/12/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/app/commits/first": { files: [{ filename: "src/app.ts" }], commit: { author: { email: "student@ucsc.edu" } } },
    "/repos/team/app/contents/docs/tasks/sprint-2?ref=squash": Object.keys(committers).map((path) => ({ name: path.split("/").pop(), type: "file" })),
  };
  for (const [path, text] of Object.entries(contents)) {
    routes[`/repos/team/app/contents/${path}?ref=${ref}`] = { encoding: "base64", size: text.length, content: Buffer.from(text).toString("base64") };
  }
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    requests.push(path);
    const looked = Object.keys(committers).find((file) => path === commitsPath(file));
    if (looked) return commitsAnswer(committers[looked]!);
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
  }));
  return requests;
}

const importAs = (taskPath?: string, login = "student") =>
  importTaskFromPullRequest(PR_URL, 2, githubReader("token"), login, { taskPath });
const lookups = (requests: string[]) => requests.filter((path) => path.includes("/commits?sha="));

const NONE_YOURS = "None of the task files this PR adds were committed from your GitHub account (@student). If you commit from another account, contact a TA.";
const NOT_YOURS = (name: string) => `${name} was committed by someone else, so it can't be your task. Choose a task file you committed.`;
const OPEN_HEADER = "This pull request is not merged yet. Before you merge, fix:\n";

describe("merged PR with several task files: only the student's own", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("1. offers both when the student committed both", async () => {
    stubPull();
    await expect(importAs()).rejects.toMatchObject({ code: "choose_task_file", choices: [{ path: T7, taskId: "X-T-7" }, { path: T8, taskId: "X-T-8" }] });
  });

  it("2. imports the student's file without a choice when the other is a teammate's, and records both", async () => {
    const requests = stubPull({ committers: { [T7]: "student", [Y1]: "teammate" } });
    const task = await importAs();
    expect(task.taskPath).toBe(T7);
    expect(task.spec.id).toBe("X-T-7");
    expect(task.facts.prTaskFiles).toEqual([T7, Y1]);
    expect(task.facts.prTaskFileCount).toBe(2);
    expect(task.facts.prTaskFileCommitters).toEqual({ [T7]: "student", [Y1]: "someone_else" });
    expect(JSON.stringify(task.facts)).not.toContain("teammate");
    expect(lookups(requests).sort()).toEqual([commitsPath(T7), commitsPath(Y1)].sort());
    // The student card shows today's line about the other file.
    const card = { slot: 1, taskId: "X-T-7", prUrl: PR_URL, taskPath: T7, prTaskFiles: task.facts.prTaskFiles, prTaskFileCommitters: task.facts.prTaskFileCommitters };
    expect(prTaskFileLines([card], card, "student")).toEqual([
      "This PR also adds another task file, Y-T-1.md, which is not one of your tasks here. Its work is in the same diff.",
    ]);
  });

  it("compares logins without regard to case", async () => {
    stubPull({ committers: { [T7]: "Student", [Y1]: "teammate" } });
    await expect(importAs()).resolves.toMatchObject({ taskPath: T7 });
  });

  it("3. offers a file whose commit has no GitHub account", async () => {
    stubPull({ committers: { [T7]: "student", [T8]: null } });
    await expect(importAs()).rejects.toMatchObject({ choices: [{ path: T7 }, { path: T8 }] });
    const chosen = await importAs(T8);
    expect(chosen.facts.prTaskFileCommitters).toEqual({ [T7]: "student", [T8]: "unknown" });
  });

  it("offers only the student's files when two are theirs and one is a teammate's", async () => {
    stubPull({ committers: { [T7]: "student", [T8]: "student", [Y1]: "teammate" } });
    const error = await importAs().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ChooseTaskFileError);
    expect((error as ChooseTaskFileError).choices.map((choice) => choice.path)).toEqual([T7, T8]);
  });

  it("4. refuses when every file is a teammate's", async () => {
    stubPull({ committers: { [T7]: "teammate", [T8]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(NONE_YOURS));
    await expect(importAs(T7)).rejects.toThrow(new Error(NONE_YOURS));
  });

  it("5. refuses a chosen path a teammate committed; a path the PR doesn't add is refused first", async () => {
    stubPull({ committers: { [T7]: "student", [T8]: "student", [Y1]: "teammate" } });
    await expect(importAs(Y1)).rejects.toThrow(new Error(NOT_YOURS("Y-T-1.md")));
    await expect(importAs("docs/tasks/sprint-2/X-T-9.md")).rejects.toThrow("This PR does not add X-T-9.md");
    await expect(importAs(T8)).resolves.toMatchObject({ taskPath: T8 });
  });

  it.each<[string, Committer]>([["500", { status: 500 }], ["404", { status: 404 }], ["an empty list", "empty"], ["100 entries", "full"]])(
    "6. a lookup answering %s is unknown, and nothing throws",
    async (_label, answer) => {
      stubPull({ committers: { [T7]: "student", [T8]: answer } });
      await expect(importAs()).rejects.toBeInstanceOf(ChooseTaskFileError);
      const task = await importAs(T8);
      expect(task.facts.prTaskFileCommitters).toEqual({ [T7]: "student", [T8]: "unknown" });
    },
  );

  it("11. refuses a non-author before any lookup", async () => {
    const requests = stubPull({ author: "teammate", committers: { [T7]: "student", [Y1]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(SEVERAL_TASK_FILES_NOT_AUTHOR));
    await expect(importAs(T7)).rejects.toThrow(new Error(SEVERAL_TASK_FILES_NOT_AUTHOR));
    expect(lookups(requests)).toEqual([]);
  });

  it("14. says to refresh when the choices are not shown", () => {
    expect(new ChooseTaskFileError([], REPO, 12).message)
      .toBe("This merged PR adds several task files. Choose which one is this task. If you don't see the choices, refresh the page.");
  });
});

describe("PRs with one task file: unchanged", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("7. a merged one makes no committer lookup and records no committers", async () => {
    const requests = stubPull({ committers: { [T7]: "teammate" }, extraFiles: [{ filename: "docs/tasks/sprint-2/Y-T-2.md", status: "modified" }] });
    const task = await importAs();
    expect(task.taskPath).toBe(T7);
    expect(task.facts).toEqual({
      ci: expect.anything(), testFileCount: null, mergeSha: "squash", firstCommitSha: "first", firstCommitTaskOnly: false,
      prNumber: 12, prTaskFileCount: 1, prTaskFiles: [T7],
    });
    expect(lookups(requests)).toEqual([]);
  });

  it("7. an open one makes no committer lookup and reads as before", async () => {
    const requests = stubPull({ open: true, committers: { [T7]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(
      "This pull request is not merged yet. Its task file (X-T-7.md) passes the task-file checks. Merge the pull request, then add it here again.",
    ));
    stubPull({ open: true, committers: { [T7]: "teammate" }, contents: { [T7]: spec("X-T-7").replace("## Specs", "## Steps") } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- The task file needs a nonempty “Specs” section.`));
    expect(lookups(requests)).toEqual([]);
  });
});

describe("open PR with several task files", () => {
  afterEach(() => vi.unstubAllGlobals());
  const THEIRS_ONE = "Y-T-1.md was committed by someone else, probably because their branch was merged into yours. Their PR should merge first; then update your branch from main and it drops out of this PR.";

  it("8. checks the student's file and says the teammate's drops out after an update", async () => {
    stubPull({ open: true, committers: { [T7]: "student", [Y1]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- ${THEIRS_ONE}`));
  });

  it("8. lists the student's format problem and the teammate's file together", async () => {
    stubPull({ open: true, committers: { [T7]: "student", [Y1]: "teammate" }, contents: { [T7]: spec("X-T-7").replace("## Specs", "## Steps"), [Y1]: spec("Y-T-1") } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- The task file needs a nonempty “Specs” section.\n- ${THEIRS_ONE}`));
  });

  it("9. lists only the student's files in the split message, plus the teammate line", async () => {
    stubPull({ open: true, committers: { [T7]: "student", [T8]: "student", [Y1]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}`
      + "- This PR adds 2 task files: X-T-7.md, X-T-8.md. A task PR adds only its own task file. Before merging, move each task file to its own PR. One PR per task.\n"
      + `- ${THEIRS_ONE}`));
  });

  it("names several teammate files in one line", async () => {
    const y2 = "docs/tasks/sprint-2/Y-T-2.md";
    stubPull({ open: true, committers: { [T7]: "student", [Y1]: "teammate", [y2]: "other" } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- Y-T-1.md, Y-T-2.md were committed by someone else, probably because their branch was merged into yours. Their PR should merge first; then update your branch from main and they drop out of this PR.`));
  });

  it("10. says none is the student's when a teammate committed every file", async () => {
    stubPull({ open: true, committers: { [T7]: "teammate", [T8]: "teammate" } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- ${NONE_YOURS}`));
  });

  it("keeps today's split message when the committers can't be told", async () => {
    stubPull({ open: true, committers: { [T7]: { status: 500 }, [T8]: null } });
    await expect(importAs()).rejects.toThrow(new Error(`${OPEN_HEADER}- This PR adds 2 task files: X-T-7.md, X-T-8.md. A task PR adds only its own task file. Before merging, move each task file to its own PR. One PR per task.`));
  });
});

// ---- The Add PR route (choice form and Re-check), with an in-memory table. ----

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
          state.rows = [...state.rows.filter((other) => other.task_slot !== row.task_slot), row];
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      };
      return query;
    },
  };
}

async function addPr(slot: number, taskPath?: string) {
  const { POST } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
  const request = new Request("http://localhost/api/cse115a/assignments/2/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseSlug: "CSE115A", slot, prUrl: PR_URL, ...(taskPath ? { taskPath } : {}) }),
  });
  const response = (await POST(request, { params: Promise.resolve({ number: "2" }) }))!;
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("Add PR and Re-check with a teammate's task file in the PR", () => {
  beforeEach(() => { state.rows = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("offers only the student's files, marking a used one as taken", async () => {
    stubPull({ committers: { [T7]: "student", [T8]: "student", [Y1]: "teammate" } });
    expect((await addPr(1, T7)).status).toBe(200);
    const ask = await addPr(2);
    expect(ask.status).toBe(409);
    expect(ask.body).toMatchObject({
      code: "choose_task_file",
      error: "This merged PR adds several task files. Choose which one is this task. If you don't see the choices, refresh the page.",
    });
    expect(ask.body.choices).toEqual([{ path: T7, taskId: "X-T-7", takenBySlot: 1 }, { path: T8, taskId: "X-T-8", takenBySlot: null }]);
  });

  it("5. refuses a teammate's file from the choice form and from Re-check", async () => {
    stubPull({ committers: { [T7]: "student", [Y1]: "teammate" } });
    expect(await addPr(1, Y1)).toEqual({ status: 422, body: { error: NOT_YOURS("Y-T-1.md") } });
    // Re-check sends the saved task file: a slot saved with the teammate's file before this change is refused.
    state.rows = [{ course_id: "course-1", user_id: "user-student", assignment_number: 2, task_slot: 1, pr_url: PR_URL, task_path: Y1, repo_full_name: REPO, pr_number: 12 }];
    expect(await addPr(1, Y1)).toEqual({ status: 422, body: { error: NOT_YOURS("Y-T-1.md") } });
  });

  it("2. adds the student's only file without a choice and saves who committed each", async () => {
    stubPull({ committers: { [T7]: "student", [Y1]: "teammate" } });
    const added = await addPr(1);
    expect(added.status).toBe(200);
    expect(added.body.submission).toMatchObject({ task_path: T7, facts_json: { prTaskFiles: [T7, Y1], prTaskFileCommitters: { [T7]: "student", [Y1]: "someone_else" } } });
  });
});

// ---- What staff see, and where the committers must not go. ----

function snapshot(slot: number, taskId: string, overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  const diff = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n x\n+y\n";
  return {
    slot, taskId, prUrl: PR_URL, repoFullName: REPO, prNumber: 12, taskPath: `docs/tasks/sprint-2/${taskId}.md`,
    specMarkdown: spec(taskId), spec: { id: taskId, estimateHours: 4 } as TaskSpec, validation: { prMerged: true }, analysisResultId: `r${slot}`,
    pr: { title: "X", body: "", headRef: "feature/x", author: "student", mergedAt: "2026-10-14T00:00:00Z", baseSha: "main0", mergeCommitSha: "squash" },
    baseCommit: "main0", baseCommitSource: "pr_base", diff, diffBytes: diff.length, diffTruncated: false, diffError: null, comments: [], checks: [],
    ...overrides,
  };
}

describe("12. the staff review line", () => {
  const Z2 = "docs/tasks/sprint-2/Z-T-2.md";
  const files = [T7, Y1, Z2];
  const OTHERS = "This PR also adds other task files, Y-T-1.md, Z-T-2.md, which are not this student's tasks here. Their work is in the same diff.";

  it("names who committed each file for a mixed PR, after the existing lines", () => {
    const task = snapshot(1, "X-T-7", { prTaskFiles: files, prTaskFileCommitters: { [T7]: "student", [Y1]: "someone_else", [Z2]: "unknown" } });
    expect(prTaskFileLines([task], task, "staff")).toEqual([
      OTHERS,
      "Who committed this PR's task files: X-T-7.md, this student; Y-T-1.md, someone else; Z-T-2.md, not confirmed.",
    ]);
  });

  it("asks staff to check this task's own file when its committer is unknown", () => {
    const task = snapshot(1, "X-T-7", { prTaskFiles: files, prTaskFileCommitters: { [T7]: "unknown", [Y1]: "someone_else", [Z2]: "student" } });
    expect(prTaskFileLines([task], task, "staff")[1]).toBe(
      "Who committed this PR's task files: X-T-7.md, not confirmed; Y-T-1.md, someone else; Z-T-2.md, this student. Check that X-T-7.md is this student's own.",
    );
  });

  it("adds no line when every file is the student's, or when nothing is recorded", () => {
    const all = snapshot(1, "X-T-7", { prTaskFiles: files, prTaskFileCommitters: { [T7]: "student", [Y1]: "student", [Z2]: "student" } });
    expect(prTaskFileLines([all], all, "staff")).toEqual([OTHERS]);
    const older = snapshot(1, "X-T-7", { prTaskFiles: files });
    expect(prTaskFileLines([older], older, "staff")).toEqual([OTHERS]);
  });

  it("leaves the student card and the grader notes unchanged", () => {
    const mixed = snapshot(1, "X-T-7", { prTaskFiles: files, prTaskFileCommitters: { [T7]: "unknown", [Y1]: "someone_else", [Z2]: "unknown" } });
    const plain = snapshot(1, "X-T-7", { prTaskFiles: files });
    expect(prTaskFileLines([mixed], mixed, "student")).toEqual(prTaskFileLines([plain], plain, "student"));
    expect(prTaskFileLines([mixed], mixed, "student")).toEqual([
      "This PR also adds other task files, Y-T-1.md, Z-T-2.md, which are not your tasks here. Their work is in the same diff.",
    ]);
    expect(prTaskFileGraderNotes([mixed], mixed)).toEqual(prTaskFileGraderNotes([plain], plain));
  });
});

describe("13. committers in the snapshot, and nowhere else", () => {
  const committers = { [T7]: "student", [Y1]: "someone_else" } as const;
  function row(facts: SubmittedTaskRow["facts_json"]): SubmittedTaskRow {
    return {
      task_slot: 1, task_id: "X-T-7", pr_url: PR_URL, repo_full_name: REPO, pr_number: 12, task_path: T7,
      task_spec_markdown: spec("X-T-7"), task_spec_json: { id: "X-T-7" } as TaskSpec, validation_json: { prMerged: true }, analysis_result_id: "r1",
      facts_json: facts,
    };
  }
  const reader: GitHubReader = {
    async json<T>(path: string) {
      if (/\/pulls\/\d+$/.test(path)) return { title: "X", body: "", merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "squash", base: { sha: "main0" }, head: { ref: "feature/x" }, user: { login: "student" } } as T;
      if (path.includes("/commits?per_page=1")) return [{ sha: "first" }] as T;
      if (path.endsWith("/commits/first")) return { files: [{ filename: "src/app.ts" }] } as T;
      return [] as T;
    },
    async text() { return "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n x\n+y\n"; },
  };

  it("carries them into the snapshot like prTaskFiles; missing on older tasks", async () => {
    const snap = await captureSubmissionSnapshot(reader, [row({ prTaskFileCount: 2, prTaskFiles: [T7, Y1], prTaskFileCommitters: committers })]);
    expect(snap.tasks[0]!.prTaskFiles).toEqual([T7, Y1]);
    expect(snap.tasks[0]!.prTaskFileCommitters).toEqual(committers);
    const older = await captureSubmissionSnapshot(reader, [row({ prTaskFileCount: 2, prTaskFiles: [T7, Y1] })]);
    expect("prTaskFileCommitters" in older.tasks[0]!).toBe(false);
    const oldest = await captureSubmissionSnapshot(reader, [row(null)]);
    expect("prTaskFileCommitters" in oldest.tasks[0]!).toBe(false);
  });

  it("never reaches the grader's input, a benchmark row or the JSONL export", async () => {
    const task = snapshot(1, "X-T-7", { prTaskFiles: [T7, Y1], prTaskFileCommitters: committers });
    const leaks = (text: string) => /prTaskFileCommitters|someone_else/.test(text);
    const input = graderInput(task, prTaskFileGraderNotes([task], task));
    expect(leaks(JSON.stringify(input))).toBe(false);
    expect(leaks(JSON.stringify(buildMessages(input)))).toBe(false);
    const built = buildInstance(task, 2, null, null, { prHoldsTwoTasks: true });
    expect(leaks(JSON.stringify(built))).toBe(false);
    // The JSONL export leaves flagged rows out; export this one as if it were not flagged, to read the row itself.
    expect(leaks(exportJsonl([{ instance: built.instance, sources: [{ consented: true, validationStatus: "candidate" as const, flags: [] }] }]))).toBe(false);
    let saved: BenchmarkSave[] = [];
    const store: JobStore = {
      claim: async () => ({ id: "j", assignment_submission_id: "s", kind: "benchmark", attempts: 1 }),
      loadSubmission: async () => ({ id: "s", course_id: "c", user_id: "u", assignment_number: 2, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "", tasks: [task] } }),
      setSubmissionStatus: async () => {}, saveGrades: async () => {}, finishJob: async () => {},
      loadRepoMetrics: async () => null, loadStudentEmail: async () => null,
      saveBenchmark: async (_submission, rows) => { saved = rows; },
    };
    await runNextJob(store, { grade: async () => [] });
    expect(saved).toHaveLength(1);
    expect(leaks(JSON.stringify(saved))).toBe(false);
  });
});

describe("14. the choice form heading", () => {
  it("names the slot without a count", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../components/cse115a/CourseDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Which task file from this merged PR is Task {slot}?");
    expect(source).not.toContain("This merged PR adds {choice.choices.length} task files.");
  });
});
