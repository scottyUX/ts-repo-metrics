// #437: tasks without extra PRs whose grader input is pinned byte for byte (cse115aExtraCodePrs.test.ts). The pins
// were computed with the grader as it was before #437 (production at 10925af). Names, repos and ids are made up.
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const fileDiff = (path: string, line: string) => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${line}\n`;
const SPEC = "# US-9-T-1: Lamp timer\n\nChange src/lamp.ts so the lamp turns off after an hour.\n";
const DIFF = fileDiff("src/lamp.ts", "export const off = 60;") + fileDiff("src/__tests__/lamp.test.ts", "it('turns off', () => expect(off).toBe(60));")
  + fileDiff("src/other.ts", "export const x = 1;") + fileDiff("package-lock.json", "{}");

export function pinTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    slot: 1, taskId: "US-9-T-1", prUrl: "https://github.com/team-lambda/lamp/pull/3", repoFullName: "team-lambda/lamp", prNumber: 3,
    taskPath: "docs/tasks/sprint-9/US-9-T-1.md", specMarkdown: SPEC, spec: { id: "US-9-T-1", title: "Lamp timer", estimateHours: 1 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: "result-9",
    pr: { title: "Lamp timer", body: "", headRef: "lamp", author: "student-lambda", mergedAt: "2026-10-03T00:00:00Z", baseSha: "b".repeat(40), mergeCommitSha: "m".repeat(40) },
    baseCommit: "0".repeat(40), baseCommitSource: "merge_base", taskFileFirstCommit: true, headCommit: "h".repeat(40), diffEnd: "head",
    diff: DIFF, diffBytes: DIFF.length, diffTruncated: false, diffError: null, comments: [],
    checks: [{ source: "check_run", name: "test", status: "completed", conclusion: "success" }],
    ...overrides,
  };
}

/** [name, task, the notes the worker passes (prTaskFileGraderNotes)]. */
export const PIN_TASKS: Array<[string, TaskSnapshot, string[]]> = [
  ["plain", pinTask(), []],
  ["shared PR notes", pinTask(), ["This PR holds two tasks. The other task, US-9-T-2, has its own task file and grade."]],
  ["no tests, cut off", pinTask({ diff: fileDiff("src/lamp.ts", "x"), diffTruncated: true }), []],
  ["diff error", pinTask({ diff: "", diffError: "GitHub 500" }), []],
  ["staff-chosen PR (#431)", pinTask({
    prNumber: 5, prUrl: "https://github.com/team-lambda/lamp/pull/5", taskFilePr: { url: "https://github.com/team-lambda/lamp/pull/3", number: 3, mergeSha: "m".repeat(40) },
    workPrChoice: {
      prNumber: 5, prUrl: "https://github.com/team-lambda/lamp/pull/5", chosenBy: "ta-lambda@example.invalid", chosenAt: "2026-11-01T00:00:00Z", reason: "Code in #5.", replacedPrNumber: 3,
      before: { prNumber: 3, prUrl: "https://github.com/team-lambda/lamp/pull/3", taskFilePr: null, prTaskFiles: null, mergeCommitSha: "m".repeat(40), baseCommit: "0".repeat(40), baseCommitSource: "merge_base", headCommit: null, diffEnd: "head", files: [], diffBytes: 0, diffTruncated: false },
    },
  }), []],
];
