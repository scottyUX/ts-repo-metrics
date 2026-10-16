import { afterEach, describe, expect, it, vi } from "vitest";
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
function stubGitHub(baseTag: string | null, firstCommitFiles: string[]) {
  const routes: Record<string, unknown> = {
    "/repos/team/repo/pulls/1": {
      merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "squash", title: "US-1-T-1: Reject",
      user: { login: "student" }, head: { ref: "task/US-1-T-1" }, base: { sha: "main0" },
    },
    "/user": { login: "student" },
    "/repos/team/repo/pulls/1/files?per_page=100&page=1": [{ filename: TASK }, { filename: "app.js" }],
    [`/repos/team/repo/contents/${TASK}?ref=squash`]: { encoding: "base64", size: SPEC.length, content: Buffer.from(SPEC).toString("base64") },
    "/repos/team/repo/pulls/1/commits?per_page=1&page=1": [{ sha: "first" }],
    "/repos/team/repo/contents/docs/tasks/sprint-1?ref=squash": [{ name: "US-1-T-1.md", type: "file" }],
    "/repos/team/repo/commits/first": { files: firstCommitFiles.map((filename) => ({ filename })) },
  };
  if (baseTag) routes["/repos/team/repo/git/ref/tags/US-1-T-1-base"] = { object: { type: "commit", sha: baseTag } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
  }));
}

const UNFIXABLE = "Can't be fixed on this PR. The spec must come first; use a new task.";

describe("CSE 115A task import: spec committed first (#266)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["task file only", "tag on it", "first", [TASK], true, null],
    ["task file only", "tag missing", null, [TASK], false, "Push the base tag, then Re-check."],
    ["task file only", "tag on the squash commit", "squash", [TASK], false, "git tag -f US-1-T-1-base first && git push -f origin US-1-T-1-base"],
    ["task file and code", "tag missing", null, [TASK, "app.js"], false, UNFIXABLE],
    ["task file and code", "tag on it", "first", [TASK, "app.js"], false, UNFIXABLE],
  ])("first commit has the %s, %s", async (_files, _tag, baseTag, firstCommitFiles, ok, detail) => {
    stubGitHub(baseTag, firstCommitFiles);
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, "token");
    const line = processChecklist(task.validation, task.facts, "US-1-T-1").find((entry) => entry.key === "specCommittedFirst");
    expect(task.facts.firstCommitTaskOnly).toBe(firstCommitFiles.length === 1);
    expect(line?.ok).toBe(ok);
    expect(line?.detail).toBe(detail);
  });
});