import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstance, type BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { toExportRecord, type ExportCandidate } from "@/lib/cse115a/benchmark/exportJsonl";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";
import { importTaskFromPullRequest } from "@/lib/cse115a/githubTaskImport";
import { gradeProcess } from "@/lib/cse115a/grader/deterministic";
import { planBenchmarkSave, type StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { BenchmarkSave, Submission } from "@/lib/cse115a/jobs/runner";
import { baseCommitLine } from "@/lib/cse115a/processChecklist";
import { captureSubmissionSnapshot, captureTaskSnapshot, type SubmittedTaskRow, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

vi.mock("server-only", () => ({}));

// #382: a task's diff is the PR's own, as GitHub's "Files changed" computes it: from the merge base of the PR's
// base and head, to the head. All names here are made up.

const TASK_FILE = "docs/tasks/sprint-1/US-1-T-1.md";
const OWN_DIFF = [
  `diff --git a/${TASK_FILE} b/${TASK_FILE}\nnew file mode 100644\n--- /dev/null\n+++ b/${TASK_FILE}\n@@ -0,0 +1 @@\n+# Cart total\n`,
  "diff --git a/src/cart.ts b/src/cart.ts\n--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -1 +1,2 @@\n export class Cart {}\n+export const total = () => 0;\n",
  "diff --git a/src/__tests__/cart.test.ts b/src/__tests__/cart.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/__tests__/cart.test.ts\n@@ -0,0 +1,3 @@\n+it(\"totals an empty cart\", () => {\n+  expect(0).toBe(0);\n+});\n",
].join("");

function row(facts: SubmittedTaskRow["facts_json"] = null, specCommittedFirst = true): SubmittedTaskRow {
  return {
    task_slot: 1, task_id: "US-1-T-1", pr_url: "https://github.com/team/proj/pull/12", repo_full_name: "team/proj", pr_number: 12,
    task_path: TASK_FILE, task_spec_markdown: "# Cart total\n", task_spec_json: { id: "US-1-T-1", title: "Cart total", estimateHours: 3 } as TaskSpec,
    validation_json: { prMerged: true, specCommittedFirst }, analysis_result_id: "result-1", facts_json: facts,
  };
}

type Compare = { merge_base_commit?: { sha?: string } | null } | Error | null;

/** A merged PR: base "prbase", head "head1", merge commit "merge1", first commit "first1" holding `firstFiles`. */
function fakeGitHub(options: { firstFiles?: string[]; compare?: Compare; diff?: string | Error; headSha?: string | null } = {}) {
  const calls: string[] = [];
  const headSha = options.headSha === undefined ? "head1" : options.headSha;
  const compare = options.compare === undefined ? { merge_base_commit: { sha: "mb1" } } : options.compare;
  const reader: GitHubReader = {
    async json<T>(path: string) {
      calls.push(`json ${path}`);
      if (/\/pulls\/12$/.test(path)) {
        return {
          title: "US-1-T-1 cart total", body: "Adds total", merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: "merge1",
          base: { sha: "prbase" }, head: headSha === null ? { ref: "US-1-T-1" } : { ref: "US-1-T-1", sha: headSha }, user: { login: "student" },
        } as T;
      }
      if (path.includes("/compare/")) {
        if (compare instanceof Error) throw compare;
        return compare as T;
      }
      if (path.includes("/commits?per_page=1")) return [{ sha: "first1" }] as T;
      if (path.endsWith("/commits/first1")) return { files: (options.firstFiles ?? [TASK_FILE]).map((filename) => ({ filename })) } as T;
      if (path.includes("/check-runs")) return { check_runs: [{ name: "test", status: "completed", conclusion: "success" }] } as T;
      if (path.endsWith("/status")) return { statuses: [] } as T;
      return [] as T;
    },
    async text(path: string, accept: string) {
      calls.push(`text ${path} ${accept}`);
      if (options.diff instanceof Error) throw options.diff;
      return options.diff ?? OWN_DIFF;
    },
  };
  return { reader, calls };
}

const DIFF_TYPE = "application/vnd.github.diff";

describe("1. capture diffs from the merge base to the PR's head", () => {
  it("asks for the JSON compare of base...head, then the diff of mergeBase...head, and saves the new fields", async () => {
    const { reader, calls } = fakeGitHub();
    const snapshot = await captureSubmissionSnapshot(reader, [row()]);
    const task = snapshot.tasks[0]!;
    expect(calls).toContain("json /repos/team/proj/compare/prbase...head1");
    expect(calls).toContain(`text /repos/team/proj/compare/mb1...head1 ${DIFF_TYPE}`);
    expect(calls.filter((call) => call.startsWith("text "))).toEqual([`text /repos/team/proj/compare/mb1...head1 ${DIFF_TYPE}`]);
    expect(task).toMatchObject({
      baseCommit: "mb1", baseCommitSource: "merge_base", headCommit: "head1", diffEnd: "head", diff: OWN_DIFF, diffError: null,
      pr: { baseSha: "prbase", mergeCommitSha: "merge1" },
    });
    // CI checks stay on the merge commit.
    expect(calls).toContain("json /repos/team/proj/commits/merge1/check-runs?per_page=100");
    expect(task.checks).toEqual([{ source: "check_run", name: "test", status: "completed", conclusion: "success" }]);
  });
});

describe("2. task file first and code first get the same range", () => {
  it.each([
    ["task file first", [TASK_FILE], true],
    ["code first", [TASK_FILE, "src/cart.ts"], false],
  ] as const)("%s", async (_name, firstFiles, specCommittedFirst) => {
    const { reader, calls } = fakeGitHub({ firstFiles: [...firstFiles] });
    const task = await captureTaskSnapshot(reader, row(null, specCommittedFirst));
    expect(task).toMatchObject({ baseCommit: "mb1", baseCommitSource: "merge_base", headCommit: "head1", diffEnd: "head" });
    expect(task.validation.specCommittedFirst).toBe(specCommittedFirst);
    // The first commit is still read, only to know the fallback's start.
    expect(calls).toContain("json /repos/team/proj/commits/first1");
    expect(calls).toContain(`text /repos/team/proj/compare/mb1...head1 ${DIFF_TYPE}`);
  });

  it("a paired task also gets the merge-base range", async () => {
    const { reader } = fakeGitHub();
    const task = await captureTaskSnapshot(reader, row({ taskFilePr: { url: "https://github.com/team/proj/pull/11", number: 11, mergeSha: "spec11" } }, false));
    expect(task).toMatchObject({ baseCommit: "mb1", baseCommitSource: "merge_base", diffEnd: "head" });
  });
});

describe("3. fallback to the rule before #382", () => {
  it.each([
    ["the JSON compare fails", { compare: new Error("GitHub could not load this pull request (500).") }],
    ["the compare has no merge base", { compare: { merge_base_commit: null } }],
    ["the compare is empty", { compare: {} }],
    ["the PR has no head sha", { headSha: null }],
  ] as const)("%s: today's range, the fallback flag, and Submit succeeds", async (_name, options) => {
    for (const [firstFiles, baseCommit, baseCommitSource] of [[[TASK_FILE], "first1", "first_commit"], [[TASK_FILE, "src/cart.ts"], "prbase", "pr_base"]] as const) {
      const { reader, calls } = fakeGitHub({ ...options, firstFiles: [...firstFiles] });
      const snapshot = await captureSubmissionSnapshot(reader, [row()]);
      const task = snapshot.tasks[0]!;
      expect(task).toMatchObject({ baseCommit, baseCommitSource, diffEnd: "merge_commit", diffError: null });
      expect(calls).toContain(`text /repos/team/proj/compare/${baseCommit}...merge1 ${DIFF_TYPE}`);
      expect(buildInstance(task, 1, null).flags).toContain("diff_from_merge_commit");
      expect(buildInstance(task, 1, null).flags).not.toContain("base_commit_from_merge_base");
    }
  });
});

function snapshot(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot: 1, taskId: "US-1-T-1", prUrl: "https://github.com/team/proj/pull/12", repoFullName: "team/proj", prNumber: 12,
    taskPath: TASK_FILE, specMarkdown: "# Cart total\n", spec: { id: "US-1-T-1", title: "Cart total", estimateHours: 3 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: "result-1",
    pr: { title: "US-1-T-1", body: "", headRef: "US-1-T-1", author: "student", mergedAt: "2026-10-01T00:00:00Z", baseSha: "prbase", mergeCommitSha: "merge1" },
    baseCommit: "mb1", baseCommitSource: "merge_base", headCommit: "head1", diffEnd: "head",
    diff: OWN_DIFF, diffBytes: OWN_DIFF.length, diffTruncated: false, diffError: null, comments: [], checks: [],
    ...overrides,
  };
}

const paths = (patch: string) => parseDiffFiles(patch).map((file) => file.path);

describe("5. buildInstance on a merge-base snapshot", () => {
  it("drops docs/tasks files from both patches, with the flag, and sets the new base flag", () => {
    const { instance, flags } = buildInstance(snapshot(), 1, null);
    expect(paths(instance.patch)).toEqual(["src/cart.ts"]);
    expect(paths(instance.test_patch)).toEqual(["src/__tests__/cart.test.ts"]);
    expect(instance).toMatchObject({ base_commit: "mb1", environment_setup_commit: "mb1" });
    expect(flags).toEqual(["base_commit_from_merge_base", "task_files_dropped"]);
  });

  it("drops a task file that looks like a test, and both task files of a two-task-file PR", () => {
    const second = "docs/tasks/sprint-1/US-1-T-2.md";
    const testLike = "docs/tasks/sprint-1/tests/US-1-T-3.md";
    const extra = [second, testLike].map((path) => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+# Another\n`).join("");
    const { instance, flags } = buildInstance(snapshot({ diff: OWN_DIFF + extra }), 1, null, null, { prHoldsTwoTasks: true });
    expect([...paths(instance.patch), ...paths(instance.test_patch)].filter((path) => path.startsWith("docs/tasks/"))).toEqual([]);
    expect(flags).toEqual(["base_commit_from_merge_base", "task_files_dropped", "pr_holds_two_tasks"]);
  });

  it("drops AI-tool files and task files together, each with its flag", () => {
    const ai = "diff --git a/.claude/settings.json b/.claude/settings.json\nnew file mode 100644\n--- /dev/null\n+++ b/.claude/settings.json\n@@ -0,0 +1 @@\n+{}\n";
    const { instance, flags } = buildInstance(snapshot({ diff: ai + OWN_DIFF }), 1, null);
    expect(paths(instance.patch)).toEqual(["src/cart.ts"]);
    expect(flags).toEqual(["base_commit_from_merge_base", "ai_tool_files_dropped", "task_files_dropped"]);
  });

  it("flags task_file_not_first on a merge-base capture only when specCommittedFirst is not true", () => {
    expect(buildInstance(snapshot({ validation: { prMerged: true, specCommittedFirst: false } }), 1, null).flags).toContain("task_file_not_first");
    expect(buildInstance(snapshot({ validation: { prMerged: true } }), 1, null).flags).toContain("task_file_not_first");
    expect(buildInstance(snapshot(), 1, null).flags).not.toContain("task_file_not_first");
  });

  it("leaves a snapshot from before #382 with its old flags only", () => {
    const old = snapshot({ baseCommit: "prbase", baseCommitSource: "pr_base", headCommit: undefined, diffEnd: undefined, diff: OWN_DIFF.slice(OWN_DIFF.indexOf("diff --git a/src/cart.ts")), validation: { prMerged: true, specCommittedFirst: false } });
    expect(buildInstance(old, 1, null).flags).toEqual(["base_commit_from_pr_base"]);
  });
});

describe("6. export's task_file_first keeps its meaning for new captures", () => {
  const source = (flags: string[]): ExportCandidate["sources"][number] => ({ consented: true, validationStatus: "candidate", flags });
  it.each([
    ["task file first", [TASK_FILE], true],
    ["code first", [TASK_FILE, "src/cart.ts"], false],
  ] as const)("%s", async (_name, firstFiles, first) => {
    const { reader } = fakeGitHub({ firstFiles: [...firstFiles] });
    const task = await captureTaskSnapshot(reader, row(null, first));
    const built = buildInstance(task, 1, null);
    expect(built.flags).not.toContain("base_commit_from_pr_base");
    expect(toExportRecord({ instance: built.instance, sources: [source(built.flags)] }).task_file_first).toBe(first);
  });
});

describe("7. import's test-file count uses the merge-base range", () => {
  afterEach(() => vi.unstubAllGlobals());
  const SPEC = `---\nid: US-1-T-1\nstory: US-1\nsprint: 1\nassignee: A. Student\nestimate_hours: 3\n---\n\n# Cart total\n\n## Description\nServes US-1.\n\n## Specs\nA total.\n\n## Requirements\nUse Cart.\n\n## Acceptance criteria\n1. Totals.\n\n## Tests\n| Test | Asserts | Criterion |\n|---|---|---|\n| totals | 0 | 1 |\n`;

  function stub(compare: unknown): string[] {
    const requested: string[] = [];
    const routes: Record<string, unknown> = {
      "/repos/team/repo/pulls/1": {
        merged_at: "2026-10-14T00:00:00Z", merge_commit_sha: "merge1", title: "US-1-T-1: Cart total",
        user: { login: "student" }, head: { ref: "task/US-1-T-1", sha: "head1" }, base: { sha: "main0" },
      },
      "/user": { login: "student" },
      "/repos/team/repo/pulls/1/files?per_page=100&page=1": [{ filename: TASK_FILE, status: "added" }, { filename: "src/cart.ts", status: "modified" }],
      [`/repos/team/repo/contents/${TASK_FILE}?ref=merge1`]: { encoding: "base64", size: SPEC.length, content: Buffer.from(SPEC).toString("base64") },
      "/repos/team/repo/pulls/1/commits?per_page=1&page=1": [{ sha: "first1" }],
      "/repos/team/repo/contents/docs/tasks/sprint-1?ref=merge1": [{ name: "US-1-T-1.md", type: "file" }],
      "/repos/team/repo/commits/first1": { files: [{ filename: TASK_FILE }] },
      "/repos/team/repo/compare/main0...head1": compare,
    };
    const diffs: Record<string, string> = {
      // The PR's own diff: one test file.
      "/repos/team/repo/compare/mb1...head1": OWN_DIFF,
      // The range before #382 also holds a teammate's test file.
      "/repos/team/repo/compare/first1...merge1": OWN_DIFF + "diff --git a/src/__tests__/teammate.test.ts b/src/__tests__/teammate.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/__tests__/teammate.test.ts\n@@ -0,0 +1 @@\n+it(\"x\", () => {});\n",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      const path = url.replace("https://api.github.com", "");
      const accept = init?.headers?.Accept ?? "";
      requested.push(`${accept === DIFF_TYPE ? "diff" : "json"} ${path}`);
      if (accept === DIFF_TYPE) return path in diffs ? new Response(diffs[path]) : new Response("", { status: 404 });
      if (path in routes && routes[path] !== undefined) return new Response(JSON.stringify(routes[path]));
      return new Response("{}", { status: 404 });
    }));
    return requested;
  }

  it("counts test files over mergeBase...head", async () => {
    const requested = stub({ merge_base_commit: { sha: "mb1" } });
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    expect(requested).toContain("json /repos/team/repo/compare/main0...head1");
    expect(requested).toContain("diff /repos/team/repo/compare/mb1...head1");
    expect(requested.filter((line) => line.startsWith("diff "))).toEqual(["diff /repos/team/repo/compare/mb1...head1"]);
    expect(task.facts.testFileCount).toBe(1);
  });

  it("falls back to the range before #382 when the merge base can't be read", async () => {
    const requested = stub(undefined);
    const task = await importTaskFromPullRequest("https://github.com/team/repo/pull/1", 1, githubReader("token"), "student");
    expect(requested.filter((line) => line.startsWith("diff "))).toEqual(["diff /repos/team/repo/compare/first1...merge1"]);
    expect(task.facts.testFileCount).toBe(2);
  });
});

describe("8. gradeProcess on a merge-base snapshot", () => {
  it("is full when specCommittedFirst is true, none and review when false; the first_commit fallback never applies", () => {
    expect(gradeProcess({ prMerged: true, specCommittedFirst: true }, "merge_base")).toMatchObject({ level: "full", needsReview: false });
    expect(gradeProcess({ prMerged: true, specCommittedFirst: false }, "merge_base")).toMatchObject({ level: "none", needsReview: true });
    expect(gradeProcess({ prMerged: true }, "merge_base")).toMatchObject({ level: "none", needsReview: true });
  });
});

describe("9. the review page's base line", () => {
  it("says what a merge-base start is, and keeps the old texts", () => {
    const sha = "abc1234def5678";
    expect(baseCommitLine(sha, "merge_base")).toBe("base abc1234 (where the PR's branch left its base; the PR's own changes, as on GitHub)");
    expect(baseCommitLine(sha, "pr_base")).toBe("base abc1234 (PR base; the task file was not first)");
    expect(baseCommitLine(sha, "first_commit")).toBe("base abc1234 (PR's first commit, the task file alone)");
    expect(baseCommitLine(sha, "base_tag")).toBe("base abc1234 (PR's first commit, the task file alone)");
  });
});

describe("follow-up: planBenchmarkSave keeps a settled row only under the same capture rule", () => {
  const MERGE = "0123456789abcdef0123456789abcdef01234567";
  const ID = "team__proj-US-1-T-1";
  const submission = { id: "sub-2", course_id: "course", user_id: "user", assignment_number: 1, status: "submitted", snapshot: { version: 1, capturedAt: "2026-11-19T00:00:00.000Z", tasks: [] }, superseded_at: null } as Submission;
  const newInstance = { instance_id: ID, base_commit: "mb1", patch: "new", test_patch: "", harbor_env: null, validation_detail: null } as BenchmarkInstance;
  const newCapture: BenchmarkSave = { slot: 1, instance: newInstance, flags: ["base_commit_from_merge_base", "task_files_dropped"], mergeCommit: MERGE };
  const stored = (flags: string[]): StoredSource => ({ instance_id: ID, assignment_submission_id: "sub-1", task_slot: 1, validation_status: "validated", flags, merge_commit: MERGE });
  const NOW = "2026-11-19T00:00:00.000Z";

  it("sends an old-rule validated row back to candidate with the new instance, for the same merge commit", () => {
    const plan = planBenchmarkSave(submission, [newCapture], [stored(["base_commit_from_first_commit"])], NOW);
    expect(plan.kept).toEqual([]);
    expect(plan.tasks).toEqual([{ ...newInstance, harbor_env: null, validation_detail: null }]);
    expect(plan.sources).toEqual([{
      instance_id: ID, course_id: "course", user_id: "user", assignment_submission_id: "sub-2", task_slot: 1,
      flags: ["base_commit_from_merge_base", "task_files_dropped"], updated_at: NOW, validation_status: "candidate",
    }]);
  });

  it("keeps a merge-base row with its status when a second merge-base capture has the same merge commit", () => {
    const plan = planBenchmarkSave(submission, [newCapture], [stored(["base_commit_from_merge_base", "staff_note"])], NOW);
    expect(plan.kept).toEqual([ID]);
    expect(plan.tasks).toEqual([]);
    expect(plan.sources[0]).toMatchObject({ validation_status: "validated", flags: ["base_commit_from_merge_base", "task_files_dropped", "staff_note"] });
  });

  it("still keeps an old-rule row for an old-rule (fallback) capture from the same merge commit", () => {
    const fallback: BenchmarkSave = { ...newCapture, flags: ["base_commit_from_first_commit", "diff_from_merge_commit"] };
    const plan = planBenchmarkSave(submission, [fallback], [stored(["base_commit_from_first_commit"])], NOW);
    expect(plan.kept).toEqual([ID]);
  });
});

describe("follow-up: capture's own first-commit answer (taskFileFirstCommit)", () => {
  it("is saved on a new capture: true for a task-file-only first commit, false for code first or a paired task", async () => {
    expect((await captureTaskSnapshot(fakeGitHub().reader, row())).taskFileFirstCommit).toBe(true);
    expect((await captureTaskSnapshot(fakeGitHub({ firstFiles: [TASK_FILE, "src/cart.ts"] }).reader, row())).taskFileFirstCommit).toBe(false);
    const paired = row({ taskFilePr: { url: "https://github.com/team/proj/pull/11", number: 11, mergeSha: "spec11" } });
    expect((await captureTaskSnapshot(fakeGitHub().reader, paired)).taskFileFirstCommit).toBe(false);
  });

  it("rescues a stale specCommittedFirst (saved before #392): full Process and no task_file_not_first", () => {
    const task = snapshot({ validation: { prMerged: true, specCommittedFirst: false }, taskFileFirstCommit: true });
    expect(gradeProcess(task.validation, task.baseCommitSource, task.taskFileFirstCommit)).toMatchObject({ level: "full", needsReview: false });
    expect(buildInstance(task, 1, null).flags).not.toContain("task_file_not_first");
  });

  it("with both false: none, marked for review, and the flag", () => {
    const task = snapshot({ validation: { prMerged: true, specCommittedFirst: false }, taskFileFirstCommit: false });
    expect(gradeProcess(task.validation, task.baseCommitSource, task.taskFileFirstCommit)).toMatchObject({ level: "none", needsReview: true });
    expect(buildInstance(task, 1, null).flags).toContain("task_file_not_first");
  });
});
