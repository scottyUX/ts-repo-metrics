import { afterEach, describe, expect, it, vi } from "vitest";
import { githubReader } from "@/lib/cse115a/githubClient";
import { importTaskFromPullRequest } from "@/lib/cse115a/githubTaskImport";
import { processChecklist } from "@/lib/cse115a/processChecklist";

vi.mock("server-only", () => ({}));

const TASK = "docs/tasks/sprint-1/US-1-T-1.md";
const SPEC = `---
id: US-1-T-1
story: US-1
sprint: 1
assignee: A. Student
estimate_hours: 3
---

# Reject a non-university email on login

## Description
Serves US-1.

## Specs
POST /api/login returns 400.

## Requirements
Use the existing handler.

## Acceptance criteria
1. Reject a non-university email.

## Tests
| Test | Asserts | Criterion |
|---|---|---|
| US-1-T-1 rejects email | HTTP 400 | 1 |
`;

/** A squash-merged PR. Its first commit is "first"; the squash commit on main is "squash". */
function stubGitHub(baseTag: string | null, firstCommitFiles: string[], prFiles: Array<{ filename: string; status?: string }> = [{ filename: TASK }, { filename: "app.js" }], spec = SPEC) {
    const routes: Record<string, unknown> = {
    "/repos/team/repo/pulls/1": {
      merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "squash", title: "US-1-T-1: Reject",
      user: { login: "student" }, head: { ref: "task/US-1-T-1" }, base: { sha: "main0" },
    },
    "/user": { login: "student" },
    "/repos/team/repo/pulls/1/files?per_page=100&page=1": prFiles,
    [`/repos/team/repo/contents/${TASK}?ref=squash`]: { encoding: "base64", size: spec.length, content: Buffer.from(spec).toString("base64") },
    "/repos/team/repo/pulls/1/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/repo/contents/docs/tasks/sprint-1?ref=squash": [{ name: "US-1-T-1.md", type: "file" }],
    "/repos/team/repo/commits/first": { files: firstCommitFiles.map((filename) => ({ filename })), commit: { author: { email: "student@ucsc.edu" } } },
    "/repos/team/repo/commits/squash": { commit: { author: { email: "Student@ucsc.edu" } } },
    "/repos/team/repo/commits/teammate": { commit: { author: { email: "student3@example.edu" } } },
  };
  if (baseTag) routes["/repos/team/repo/git/ref/tags/US-1-T-1-base"] = { object: { type: "commit", sha: baseTag } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
  }));
}

const UNFIXABLE = "Can't be fixed on this PR. The spec must come first; use a new task.";
const TEAMMATE_TAG = "This tag is on someone else's commit, maybe a teammate's task with the same ID. Don't move it; ask a TA.";

describe("CSE 115A task import: spec committed first (#266)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["task file only", "tag on it", "first", [TASK], true, null],
    ["task file only", "tag missing", null, [TASK], false, "Push the base tag, then Re-check."],
    ["task file only", "tag on the squash commit", "squash", [TASK], false, "git fetch origin pull/1/head && git tag -f US-1-T-1-base first && git push -f origin US-1-T-1-base"],
    ["task file only", "tag on a teammate's commit", "teammate", [TASK], false, TEAMMATE_TAG],
    ["task file and code", "tag missing", null, [TASK, "app.js"], false, UNFIXABLE],
    ["task file and code", "tag on it", "first", [TASK, "app.js"], false, UNFIXABLE],
  ])("first commit has the %s, %s", async (_files, _tag, baseTag, firstCommitFiles, ok, detail) => {
    stubGitHub(baseTag, firstCommitFiles);
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    const line = processChecklist(task.validation, task.facts, "US-1-T-1").find((entry) => entry.key === "specCommittedFirst");
    expect(task.facts.firstCommitTaskOnly).toBe(firstCommitFiles.length === 1);
    expect(line?.ok).toBe(ok);
    expect(line?.detail).toBe(detail);
  });
});


describe("CSE 115A task import: which task file is this PR's", () => {
  afterEach(() => vi.unstubAllGlobals());
  const OTHER = "docs/tasks/sprint-1/US-1-T-2.md";

  it("uses the task file the PR adds when it also edits an earlier task's file", async () => {
    stubGitHub("first", [TASK], [{ filename: TASK, status: "added" }, { filename: OTHER, status: "modified" }]);
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    expect(task.taskPath).toBe(TASK);
  });

  it("names the task files when the PR adds more than one", async () => {
    stubGitHub("first", [TASK], [{ filename: TASK, status: "added" }, { filename: OTHER, status: "added" }]);
    await expect(importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student"))
      .rejects.toThrow("This PR adds or changes 2 task files: US-1-T-1.md, US-1-T-2.md. A task PR adds only its own task file.");
  });
});

describe("CSE 115A task import: task ID in the PR title and branch (#324)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the task ID in any letter case", async () => {
    stubGitHub("first", [TASK]);
    const github = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const response = await github(url);
      if (!url.endsWith("/pulls/1")) return response;
      return new Response(JSON.stringify({ ...await response.json(), title: "us-1-t-1: Reject", head: { ref: "task/us-1-t-1" } }));
    }));
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    expect(task.validation.prTitleHasTaskId).toBe(true);
    expect(task.validation.branchHasTaskId).toBe(true);
  });
});
/** A PR that is not merged. `files` maps each path it adds to its contents at the head commit "head1". */
function stubUnmergedPull(files: Record<string, string>, state = "open"): string[] {
  const requested: string[] = [];
  const routes: Record<string, unknown> = {
    "/repos/team/repo/pulls/1": {
      state, merged_at: null, merge_commit_sha: null, title: "US-1-T-1: Reject",
      user: { login: "student" }, head: { ref: "task/US-1-T-1", sha: "head1" }, base: { sha: "main0" },
    },
    "/repos/team/repo/pulls/1/files?per_page=100&page=1": Object.keys(files).map((filename) => ({ filename, status: "added" })),
  };
  for (const [path, text] of Object.entries(files)) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    routes[`/repos/team/repo/contents/${encoded}?ref=head1`] = { encoding: "base64", size: text.length, content: Buffer.from(text).toString("base64") };
  }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    requested.push(path);
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
  }));
  return requested;
}

describe("CSE 115A task import: the task file is checked before the merge (#388)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const FOLDER = "docs/tasks/sprint-1";
  const importPull = () => importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
  const FIX = "This pull request is not merged yet. Before you merge, fix:\n";

  it("says an open PR's good task file passes, and asks for the merge", async () => {
    stubUnmergedPull({ [TASK]: SPEC, "app.js": "" });
    await expect(importPull()).rejects.toThrow(new Error(
      "This pull request is not merged yet. Its task file (US-1-T-1.md) passes the task-file checks. Merge the pull request, then add it here again.",
    ));
  });

  it("lists a missing section and a bad ID on an open PR", async () => {
    stubUnmergedPull({ [TASK]: SPEC.replace("id: US-1-T-1", "id: US..1").replace("## Specs", "## Steps") });
    await expect(importPull()).rejects.toThrow(new Error(`${FIX}- The task file needs a nonempty “Specs” section.\n`
      + `- The task ID “US..1” must be letters and digits joined by single "-", "." or "_", for example US-1-T-1.`));
  });

  it("names the file and the ID when they differ", async () => {
    stubUnmergedPull({ [`${FOLDER}/3_2_2.md`]: SPEC.replace("id: US-1-T-1", "id: 3.2.1") });
    await expect(importPull()).rejects.toThrow(new Error(
      `${FIX}- The file is named “3_2_2.md” but the id inside it is “3.2.1”. Name the file 3.2.1.md.`,
    ));
  });

  it("finds a task file whose name is not a task ID and says how to name it", async () => {
    stubUnmergedPull({ [`${FOLDER}/my task.md`]: SPEC });
    await expect(importPull()).rejects.toThrow(new Error(
      `${FIX}- The file is named “my task.md” but the id inside it is “US-1-T-1”. Name the file US-1-T-1.md.`,
    ));
  });

  it("finds 3.md and says its one-part ID is the problem", async () => {
    stubUnmergedPull({ [`${FOLDER}/3.md`]: SPEC.replace("id: US-1-T-1", "id: 3") });
    await expect(importPull()).rejects.toThrow(new Error(
      `${FIX}- The task ID “3” has only one part. Use two or more parts joined by "-", "." or "_", for example US-3-T-1.`,
    ));
  });

  it("says no task file was found when the PR adds no .md file in the folder", async () => {
    stubUnmergedPull({ "app.js": "", [`${FOLDER}/README.md`]: "# Tasks" });
    await expect(importPull()).rejects.toThrow(new Error(`${FIX}- No task file was found in docs/tasks/sprint-1/ in this PR.`));
  });

  it("names the other .md files when there are several and none is a task file", async () => {
    stubUnmergedPull({ [`${FOLDER}/notes.md`]: "", [`${FOLDER}/plan.md`]: "" });
    await expect(importPull()).rejects.toThrow(new Error(`${FIX}- No task file was found in docs/tasks/sprint-1/ in this PR. `
      + "It adds 2 other .md files there (notes.md, plan.md); a task file is named after its task ID, for example US-1-T-1.md."));
  });

  it("ignores another .md file next to a task file, as before", async () => {
    stubUnmergedPull({ [TASK]: SPEC, [`${FOLDER}/notes.md`]: "notes" });
    await expect(importPull()).rejects.toThrow("Its task file (US-1-T-1.md) passes the task-file checks.");
  });

  it("says the task file could not be read when GitHub does not return it", async () => {
    stubUnmergedPull({ [TASK]: SPEC });
    const github = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/contents/") ? new Response("{}", { status: 404 }) : github(url))));
    await expect(importPull()).rejects.toThrow(new Error(`${FIX}- The task file could not be read from this pull request.`));
  });

  it("reads only the PR, its files and the task file at the head commit on an open PR", async () => {
    const requested = stubUnmergedPull({ [TASK]: SPEC });
    await expect(importPull()).rejects.toThrow("passes the task-file checks");
    expect(requested).toEqual([
      "/repos/team/repo/pulls/1",
      "/repos/team/repo/pulls/1/files?per_page=100&page=1",
      `/repos/team/repo/contents/${TASK}?ref=head1`,
    ]);
    expect(requested.some((path) => /\/git\/ref|\/commits|\/contents\/docs\/tasks\/sprint-1\?/.test(path))).toBe(false);
  });

  it("still refuses a closed PR that was not merged, without checking it", async () => {
    const requested = stubUnmergedPull({ [TASK]: SPEC }, "closed");
    await expect(importPull()).rejects.toThrow(new Error("This pull request must be merged before submission."));
    expect(requested).toEqual(["/repos/team/repo/pulls/1"]);
  });

  it("finds a wrongly named task file on a merged PR and names the problem", async () => {
    const path = `${FOLDER}/my task.md`;
    stubGitHub("first", [path], [{ filename: path, status: "added" }]);
    const github = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/contents/docs/tasks/sprint-1/my%20task.md?ref=squash")
      ? new Response(JSON.stringify({ encoding: "base64", size: SPEC.length, content: Buffer.from(SPEC).toString("base64") }))
      : github(url))));
    await expect(importPull()).rejects.toThrow(new Error(
      "The file is named “my task.md” but the id inside it is “US-1-T-1”. Name the file US-1-T-1.md.",
    ));
  });
});

describe("CSE 115A task import: the 2-hour estimate check (#348)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["1.5", false],
    ["2", true],
    ["3", true],
    ["4", true],
  ])("estimate_hours %s gives estimateAtLeastTwoHours %s, as before", async (hours, ok) => {
    stubGitHub("first", [TASK], undefined, SPEC.replace("estimate_hours: 3", `estimate_hours: ${hours}`));
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    expect(task.spec.estimateHours).toBe(Number(hours));
    expect(task.validation.estimateAtLeastTwoHours).toBe(ok);
  });
});
