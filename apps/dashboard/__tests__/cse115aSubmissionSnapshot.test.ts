import { describe, expect, it } from "vitest";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { captureSubmissionSnapshot, truncateDiff, type SubmittedTaskRow } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

function task(slot: number, taskId: string, prNumber: number): SubmittedTaskRow {
  return {
    task_slot: slot,
    task_id: taskId,
    pr_url: `https://github.com/team/proj/pull/${prNumber}`,
    repo_full_name: "team/proj",
    pr_number: prNumber,
    task_path: `docs/tasks/sprint-1/${taskId}.md`,
    task_spec_markdown: `---\nid: ${taskId}\n---\n# Title`,
    task_spec_json: { id: taskId, title: "Title" } as TaskSpec,
    validation_json: { prMerged: true },
    analysis_result_id: `result-${slot}`,
  };
}

function fakeGitHub(overrides: { baseTag?: boolean; diff?: string | Error; merged?: boolean } = {}) {
  const calls: string[] = [];
  const reader: GitHubReader = {
    async json<T>(path: string) {
      calls.push(path);
      if (/\/pulls\/\d+$/.test(path)) {
        return {
          title: "US-1-T-1 reject email", body: "Closes the card", merged_at: overrides.merged === false ? null : "2026-10-01T00:00:00Z",
          merge_commit_sha: "merge123", base: { sha: "prbase" }, head: { ref: "US-1-T-1-branch" }, user: { login: "student" },
        } as T;
      }
      if (path.includes("/git/ref/tags/")) return (overrides.baseTag === false ? null : { object: { type: "commit", sha: "basetag" } }) as T;
      if (path.includes("/issues/")) return [{ body: "Looks good", user: { login: "ta" }, created_at: "2026-10-01T01:00:00Z" }, { body: "  " }] as T;
      if (path.includes("/reviews")) return [{ body: "Approved", user: { login: "teammate" }, submitted_at: "2026-10-01T02:00:00Z" }] as T;
      if (path.includes("/pulls/") && path.includes("/comments")) return [{ body: "nit", user: { login: "teammate" }, path: "src/a.ts" }] as T;
      if (path.includes("/check-runs")) return { check_runs: [{ name: "test", status: "completed", conclusion: "success" }] } as T;
      if (path.endsWith("/status")) return { statuses: [{ context: "ci/legacy", state: "failure" }] } as T;
      throw new Error(`unexpected ${path}`);
    },
    async text(path: string) {
      calls.push(path);
      if (overrides.diff instanceof Error) throw overrides.diff;
      return overrides.diff ?? "diff --git a/src/a.ts b/src/a.ts\n+x\n";
    },
  };
  return { reader, calls };
}

describe("truncateDiff", () => {
  it("keeps small diffs whole", () => {
    expect(truncateDiff("a\nb\n", 100)).toEqual({ diff: "a\nb\n", bytes: 4, truncated: false });
  });

  it("cuts on a line boundary and reports the original size", () => {
    const result = truncateDiff("line1\nline2\nline3\n", 14);
    expect(result).toEqual({ diff: "line1\nline2\n", bytes: 18, truncated: true });
  });

  it("measures bytes, not characters", () => {
    const result = truncateDiff("ééé\nabc\n", 7);
    expect(result.truncated).toBe(true);
    expect(result.diff).toBe("ééé\n");
  });
});

describe("captureSubmissionSnapshot", () => {
  it("diffs from the base tag to the merge commit and records PR evidence", async () => {
    const { reader, calls } = fakeGitHub();
    const snapshot = await captureSubmissionSnapshot(reader, [task(2, "US-1-T-2", 13), task(1, "US-1-T-1", 12)], new Date("2026-10-02T00:00:00Z"));

    expect(snapshot.version).toBe(1);
    expect(snapshot.capturedAt).toBe("2026-10-02T00:00:00.000Z");
    expect(snapshot.tasks.map((item) => item.slot)).toEqual([1, 2]);
    const first = snapshot.tasks[0]!;
    expect(first).toMatchObject({
      taskId: "US-1-T-1", analysisResultId: "result-1", baseCommit: "basetag", baseCommitSource: "base_tag",
      diff: "diff --git a/src/a.ts b/src/a.ts\n+x\n", diffTruncated: false, diffError: null,
      pr: { mergeCommitSha: "merge123", baseSha: "prbase", author: "student", body: "Closes the card" },
    });
    expect(calls).toContain("/repos/team/proj/compare/basetag...merge123");
    expect(first.comments.map((item) => item.kind)).toEqual(["issue", "review", "review_comment"]);
    expect(first.comments[2]).toMatchObject({ path: "src/a.ts" });
    expect(first.checks).toEqual([
      { source: "check_run", name: "test", status: "completed", conclusion: "success" },
      { source: "status", name: "ci/legacy", status: "completed", conclusion: "failure" },
    ]);
  });

  it("falls back to the PR base when the base tag is missing", async () => {
    const { reader, calls } = fakeGitHub({ baseTag: false });
    const snapshot = await captureSubmissionSnapshot(reader, [task(1, "US-1-T-1", 12)]);
    expect(snapshot.tasks[0]).toMatchObject({ baseCommit: "prbase", baseCommitSource: "pr_base" });
    expect(calls).toContain("/repos/team/proj/compare/prbase...merge123");
  });

  it("records a diff failure instead of blocking the submission", async () => {
    const { reader } = fakeGitHub({ diff: new Error("GitHub could not load this pull request diff (406).") });
    const snapshot = await captureSubmissionSnapshot(reader, [task(1, "US-1-T-1", 12)]);
    expect(snapshot.tasks[0]).toMatchObject({ diff: "", diffError: "GitHub could not load this pull request diff (406)." });
  });

  it("rejects a PR that is no longer merged", async () => {
    const { reader } = fakeGitHub({ merged: false });
    await expect(captureSubmissionSnapshot(reader, [task(1, "US-1-T-1", 12)])).rejects.toThrow("no longer merged");
  });
});
