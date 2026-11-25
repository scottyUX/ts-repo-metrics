// #437: staff add extra PRs for a task's code. The rules, the preview and the apply, the remove, the stale page, the
// grader's input, Tests pass, the benchmark flag and provenance, the refusal to change the main PR while extra PRs are
// attached, the out-of-date line, the page texts, and the three fixes to #431 — against a fake GitHub and a fake
// database (nothing reaches GitHub or Supabase). Names, repos, emails, PR numbers and ids are made up.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import {
  alreadyExtraMessage, mainPrMessage, notExtraMessage, runExtraPrChange, taskFilePrMessage, type ExtraPrResult,
} from "@/lib/cse115a/benchmark/extraCodePrs";
import { GUARD_MESSAGE, type StoredTaskRow } from "@/lib/cse115a/benchmark/recapture";
import {
  listWorkPrCandidates, runWorkPrChange, STALE_PAGE, usedPrs, type CourseTaskRef, type ExtraPrRequest, type WorkPrDb,
} from "@/lib/cse115a/benchmark/workPrChoice";
import { submissionTaskRefs, WORK_PR_TASK_PATHS } from "@/lib/cse115a/benchmark/workPrChoiceStore";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import { gradeTestsPass, lastMergedChecks } from "@/lib/cse115a/grader/deterministic";
import { gradeTask } from "@/lib/cse115a/grader/gradeTask";
import { buildMessages, graderDiff, graderInput, GRADER_PROMPT_VERSION } from "@/lib/cse115a/grader/llmGrader";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { planBenchmarkSave, snapshotExtraCodePrs, type SourceUpsert, type StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import { prTaskFileGraderNotes, prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { MAX_EXTRA_CODE_PRS, type ExtraCodePr, type SubmissionSnapshot, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import {
  EXTRA_CODE_PRS_FLAG, extraBenchmarkLine, extraCodePrLine, extraCodePrReasonLine, extraCodePrsGraderNote, extraOverlapWarning,
  extrasFirstMessage, getTheCodeExtrasNote, repoCopyFromNote, staleAiGradeLine, WORK_PR_TEXT,
} from "@/lib/cse115a/workPr";
import { PIN_TASKS } from "./cse115aExtraCodePrsFixture";

const REPO = "team-zeta/orchard";
const STUDENT = "student-zeta";
const OTHER = "student-eta";
const TASK_ID = "US-3-T-1";
const TASK_PATH = `docs/tasks/sprint-3/${TASK_ID}.md`;
const SIBLING_PATH = "docs/tasks/sprint-3/US-3-T-2.md";
const SPEC = `# ${TASK_ID}: Apple picker\n\nChange src/apple.ts so apples are picked when ripe.\n`;
const SUBMISSION_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const T0 = "2026-10-20T00:00:00.000Z";
const NOW = "2026-11-23T10:00:00.000Z";
const LATER = "2026-11-23T11:00:00.000Z";
const BY = "ta-zeta@example.invalid";

const sha = (char: string, end: string) => char.repeat(39) + end;
const fileDiff = (path: string, line = "x") => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${line}\n`;
const editDiff = (path: string, line: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1,2 @@\n x\n+${line}\n`;
const MAIN_DIFF = fileDiff("src/apple.ts", "export const ripe = true;") + fileDiff(TASK_PATH, "# spec");

type FakePr = {
  number: number; title: string; author: string; merged: boolean; mergedAt: string;
  merge: string; base: string; head: string; mergeBase: string; diff: string; files: string[];
  checks?: Array<{ name: string; conclusion: string }>;
};

function pr(number: number, overrides: Partial<FakePr> = {}): FakePr {
  const c = String.fromCharCode(96 + (number % 26) + 1);
  return {
    number, title: `Change ${number}`, author: STUDENT, merged: true, mergedAt: `2026-10-${String(number).padStart(2, "0")}T00:00:00Z`,
    merge: sha(c, "m"), base: sha(c, "b"), head: sha(c, "h"), mergeBase: sha(c, "0"),
    diff: fileDiff(`src/file${number}.ts`), files: [`src/file${number}.ts`],
    ...overrides,
  };
}

/** #10 is the task's main PR; #12 holds more code (merged two days later); #14 and #15 hold its tests. */
function defaultPrs(): FakePr[] {
  return [
    pr(10, { title: "Apple picker", diff: MAIN_DIFF, files: ["src/apple.ts", TASK_PATH], checks: [{ name: "test", conclusion: "failure" }] }),
    pr(12, { title: "Apple picker, part two", diff: editDiff("src/apple.ts", "export const picked = 45;") + fileDiff("src/basket.ts"), files: ["src/apple.ts", "src/basket.ts"], checks: [{ name: "test", conclusion: "success" }] }),
    pr(14, { title: "Apple tests", diff: fileDiff("src/__tests__/apple.test.ts", "it('picks', () => {});"), files: ["src/__tests__/apple.test.ts"], checks: [{ name: "test", conclusion: "success" }, { name: "lint", conclusion: "success" }] }),
    pr(15, { title: "More apple tests", diff: fileDiff("src/__tests__/basket.test.ts", "it('holds', () => {});"), files: ["src/__tests__/basket.test.ts"] }),
    pr(16, { title: "Pears" }),
    pr(9, { title: "Unmerged", merged: false }),
    pr(8, { title: "Teammate's PR", author: OTHER }),
    pr(20, { title: "Used as Task 2's extra PR" }),
    pr(21, { title: "Task 2's task file", diff: fileDiff(SIBLING_PATH, "# spec 2"), files: [SIBLING_PATH] }),
    pr(30, { title: "Task 2's code" }),
  ];
}

function gitHub(prs: FakePr[] = defaultPrs()) {
  const calls: string[] = [];
  const byNumber = (n: number) => prs.find((item) => item.number === n);
  const bySha = (s: string) => prs.find((item) => item.head === s || item.merge === s);
  const reader: GitHubReader = {
    async json<T>(path: string, opts?: { optional?: boolean }) {
      calls.push(path);
      if (!path.startsWith(`/repos/${REPO}/`)) throw new Error(`another repository: ${path}`);
      if (/\/pulls\?state=closed.*&page=1$/.test(path)) {
        return prs.map((item) => ({ number: item.number, title: item.title, body: "", merged_at: item.merged ? item.mergedAt : null, head: { ref: `b-${item.number}` }, user: { login: item.author } })) as T;
      }
      if (/\/pulls\?state=closed/.test(path)) return [] as T;
      const files = /\/pulls\/(\d+)\/files/.exec(path);
      if (files) return (byNumber(Number(files[1]))?.files ?? []).map((filename) => ({ filename })) as T;
      const pull = /\/pulls\/(\d+)$/.exec(path);
      if (pull) {
        const item = byNumber(Number(pull[1]));
        if (!item) { if (opts?.optional) return null; throw new Error("GitHub 404"); }
        return {
          title: item.title, body: "", merged_at: item.merged ? item.mergedAt : null, merge_commit_sha: item.merged ? item.merge : null,
          base: { sha: item.base }, head: { ref: `b-${item.number}`, sha: item.head }, user: { login: item.author },
        } as T;
      }
      if (/\/pulls\/\d+\/commits\?per_page=1/.test(path)) return [{ sha: "f".repeat(40) }] as T;
      if (path.endsWith(`/commits/${"f".repeat(40)}`)) return { files: [{ filename: TASK_PATH }] } as T;
      const compare = /\/compare\/([0-9a-z]+)\.\.\.([0-9a-z]+)$/.exec(path);
      if (compare) return { merge_base_commit: { sha: bySha(compare[2]!)?.mergeBase ?? "0".repeat(40) } } as T;
      if (/\/(issues|pulls)\/\d+\/(comments|reviews)/.test(path)) return [] as T;
      const runs = /\/commits\/([0-9a-z]+)\/check-runs/.exec(path);
      if (runs) return { check_runs: (bySha(runs[1]!)?.checks ?? []).map((check) => ({ ...check, status: "completed" })) } as T;
      if (path.endsWith("/status")) return { statuses: [] } as T;
      throw new Error(`unexpected ${path}`);
    },
    async text(path: string) {
      calls.push(`text ${path}`);
      const compare = /\/compare\/([0-9a-z]+)\.\.\.([0-9a-z]+)$/.exec(path);
      const item = compare ? bySha(compare[2]!) : undefined;
      if (!item) throw new Error(`unexpected ${path}`);
      return item.diff;
    },
  };
  return { reader, calls };
}

function savedTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  const ten = defaultPrs()[0]!;
  return {
    slot: 1, taskId: TASK_ID, prUrl: `https://github.com/${REPO}/pull/10`, repoFullName: REPO, prNumber: 10, taskPath: TASK_PATH,
    specMarkdown: SPEC, spec: { id: TASK_ID, title: "Apple picker", estimateHours: 3 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: "result-3", prTaskFiles: [TASK_PATH],
    pr: { title: ten.title, body: "", headRef: "b-10", author: STUDENT, mergedAt: ten.mergedAt, baseSha: ten.base, mergeCommitSha: ten.merge },
    baseCommit: ten.mergeBase, baseCommitSource: "merge_base", taskFileFirstCommit: true, headCommit: ten.head, diffEnd: "head",
    diff: MAIN_DIFF, diffBytes: Buffer.byteLength(MAIN_DIFF), diffTruncated: false, diffError: null,
    comments: [], checks: [{ source: "check_run", name: "test", status: "completed", conclusion: "failure" }],
    ...overrides,
  };
}

/** An extra PR as an apply saves it, from the fake PRs. */
function extraOf(n: number, overrides: Partial<ExtraCodePr> = {}): ExtraCodePr {
  const item = defaultPrs().find((p) => p.number === n)!;
  return {
    prNumber: n, prUrl: `https://github.com/${REPO}/pull/${n}`, title: item.title, mergedAt: item.mergedAt, mergeCommitSha: item.merge,
    baseCommit: item.mergeBase, headCommit: item.head, diffEnd: "head", diff: item.diff, diffBytes: Buffer.byteLength(item.diff), diffTruncated: false,
    checks: (item.checks ?? []).map((check) => ({ source: "check_run" as const, name: check.name, status: "completed", conclusion: check.conclusion })),
    addedBy: BY, addedAt: NOW, reason: `More of the code is in #${n}.`,
    ...overrides,
  };
}

/** Task 2: a pair the student made, code in #30 and task file in #21. */
function siblingTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return savedTask({
    slot: 2, taskId: "US-3-T-2", taskPath: SIBLING_PATH, prNumber: 30, prUrl: `https://github.com/${REPO}/pull/30`, prTaskFiles: [],
    taskFilePr: { url: `https://github.com/${REPO}/pull/21`, number: 21, mergeSha: sha("v", "m") }, ...overrides,
  });
}

type Op = { op: string; args: unknown[] };

function fakeDb(sub: Submission, options: { refs?: CourseTaskRef[]; sources?: StoredSource[]; storedTasks?: StoredTaskRow[]; guardFails?: boolean; copyStored?: boolean | null } = {}) {
  const ops: Op[] = [];
  const state = { row: sub, sources: [...(options.sources ?? [])], storedTasks: [...(options.storedTasks ?? [])] };
  const guardHolds = (guard: { capturedAt: string; recapturedAt: string | null }) => !options.guardFails && state.row.superseded_at === null
    && state.row.snapshot.capturedAt === guard.capturedAt && ((state.row.snapshot as { recapturedAt?: string }).recapturedAt ?? null) === guard.recapturedAt;
  const db: WorkPrDb = {
    async assertBackupColumn() { ops.push({ op: "assertBackupColumn", args: [] }); },
    async backupSnapshot(id, snapshot, guard) { ops.push({ op: "backupSnapshot", args: [id, snapshot, guard] }); return guardHolds(guard) ? "written" : "guard"; },
    async writeSnapshot(id, snapshot, guard) {
      ops.push({ op: "writeSnapshot", args: [id, snapshot, guard] });
      if (!guardHolds(guard)) return false;
      state.row = { ...state.row, snapshot };
      return true;
    },
    async writeBenchmark(tasks, sources) {
      ops.push({ op: "writeBenchmark", args: [tasks, sources] });
      for (const task of tasks) {
        state.storedTasks = state.storedTasks.filter((row) => row.instance_id !== task.instance_id);
        state.storedTasks.push({ instance_id: task.instance_id, base_commit: task.base_commit, patch: task.patch, test_patch: task.test_patch });
      }
      for (const source of sources as SourceUpsert[]) {
        const old = state.sources.find((row) => row.assignment_submission_id === source.assignment_submission_id && row.task_slot === source.task_slot);
        state.sources = state.sources.filter((row) => row !== old);
        state.sources.push({ instance_id: source.instance_id, assignment_submission_id: source.assignment_submission_id, task_slot: source.task_slot,
          validation_status: source.validation_status ?? old?.validation_status ?? "candidate", flags: source.flags, merge_commit: null });
      }
    },
    async requeueRepoCopy(id) { ops.push({ op: "requeueRepoCopy", args: [id] }); return "reset"; },
    async loadBenchmarkState(ids) { ops.push({ op: "loadBenchmarkState", args: [ids] }); return { sources: [...state.sources], storedTasks: [...state.storedTasks] }; },
    async loadRepoMetrics(id) { ops.push({ op: "loadRepoMetrics", args: [id] }); return null; },
    async loadStudentEmail() { ops.push({ op: "loadStudentEmail", args: [] }); return null; },
    async loadCourseTaskRefs(courseId, repo) { ops.push({ op: "loadCourseTaskRefs", args: [courseId, repo] }); return options.refs ?? []; },
    ...(options.copyStored === undefined ? {} : { async repoCopyStored(id: string, base: string) { ops.push({ op: "repoCopyStored", args: [id, base] }); return options.copyStored ?? null; } }),
  };
  return { db, ops, state };
}

function submission(tasks: TaskSnapshot[], overrides: Partial<Submission> = {}): Submission {
  return {
    id: SUBMISSION_ID, course_id: "course-z", user_id: "user-z", assignment_number: 3, status: "graded",
    snapshot: { version: 1, capturedAt: T0, tasks }, superseded_at: null, ...overrides,
  };
}

const seenOf = (sub: Submission, slot = 1) => {
  const task = sub.snapshot.tasks.find((item) => item.slot === slot)!;
  return { prNumber: task.prNumber, recapturedAt: (sub.snapshot as { recapturedAt?: string }).recapturedAt ?? null, extraPrs: (task.extraCodePrs ?? []).map((extra) => extra.prNumber) };
};
const add = (sub: Submission, pr: unknown, apply: boolean, reason = "The tests are in a later PR.", slot = 1): ExtraPrRequest =>
  ({ kind: "addExtra", slot, pr, reason, apply, seen: seenOf(sub, slot) });
const remove = (sub: Submission, prNumber: unknown, slot = 1): ExtraPrRequest => ({ kind: "removeExtra", slot, prNumber, seen: seenOf(sub, slot) });
const by = (now = NOW) => ({ by: BY, now });
const error = (result: ExtraPrResult) => (result.ok ? null : result.error);
const instance = `${REPO.replace("/", "__")}-${TASK_ID}`;
const source = (status: StoredSource["validation_status"], flags: string[] = ["base_commit_from_merge_base"]): StoredSource =>
  ({ instance_id: instance, assignment_submission_id: SUBMISSION_ID, task_slot: 1, validation_status: status, flags, merge_commit: null });

describe("1. the rules for an extra PR (part 2)", () => {
  it("refuses: no reason, the main PR, the task-file PR, an extra PR again, another repository, not merged, another student's PR, not found", async () => {
    const paired = savedTask({ taskFilePr: { url: `https://github.com/${REPO}/pull/21`, number: 21, mergeSha: sha("v", "m") }, extraCodePrs: [extraOf(14)] });
    const sub = submission([paired]);
    const { reader, calls } = gitHub();
    const run = (pr: unknown, reason?: string) => runExtraPrChange(fakeDb(sub).db, reader, sub, add(sub, pr, false, reason), by());
    expect(error(await run(12, "  "))).toBe("Give a reason. It is saved with the change.");
    expect(error(await run(10))).toBe(mainPrMessage(10));
    expect(error(await run("#21"))).toBe(taskFilePrMessage(21));
    expect(error(await run(`https://github.com/${REPO}/pull/14`))).toBe(alreadyExtraMessage(14));
    expect(error(await run("https://github.com/team-other/orchard/pull/12"))).toBe("That PR is in another repository, team-other/orchard. This task's repository is team-zeta/orchard.");
    expect(calls).toEqual([]);
    expect(error(await run(9))).toBe("PR #9 is not merged. Only a merged PR can hold the task's code.");
    expect(error(await run(8))).toBe(`PR #8 was opened by ${OTHER}, not by the task's student (${STUDENT}).`);
    expect(error(await run(99))).toBe("PR #99 was not found in team-zeta/orchard.");
    expect(error(await run("twelve"))).toBe("Type a PR number, like 12, or the PR's GitHub link.");
    expect(mainPrMessage(10)).toBe("PR #10 is this task's main PR.");
    expect(taskFilePrMessage(21)).toBe("PR #21 holds this task's task file, so it can't also be an extra PR for its code.");
    expect(alreadyExtraMessage(14)).toBe("PR #14 is already an extra PR of this task.");
  });

  it("allows at most three extra PRs", async () => {
    const sub = submission([savedTask({ extraCodePrs: [extraOf(12), extraOf(14), extraOf(15)] })]);
    expect(MAX_EXTRA_CODE_PRS).toBe(3);
    expect(error(await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, add(sub, 16, false), by()))).toBe("This task already has 3 extra PRs, the most it can have.");
  });

  it("an extra PR of another task is used: it can't be another task's main PR or extra PR, from this submission or another one", async () => {
    const two = siblingTask({ extraCodePrs: [extraOf(20)] });
    const sub = submission([savedTask(), two]);
    const { reader } = gitHub();
    const used = "PR #20 is already used by Task 2 of this submission, as an extra PR for its code.";
    expect(error(await runExtraPrChange(fakeDb(sub).db, reader, sub, add(sub, 20, false), by()))).toBe(used);
    const chosen = await runWorkPrChange(fakeDb(sub).db, reader, sub, { kind: "choose", slot: 1, pr: 20, reason: "r", apply: false, seen: null }, { by: BY, repoCopies: true, now: NOW });
    expect(chosen).toEqual({ ok: false, status: 409, error: used });
    // Another student's current submission: its extra PRs come from the snapshot's JSON paths.
    const refs = submissionTaskRefs({ id: "other-sub", user_id: "user-y", assignment_number: 3, s1: 1, r1: REPO, p1: 30, f1: null, x1_0: 16, x1_1: null, x1_2: null });
    expect(refs).toEqual([{ source: "submission", submissionId: "other-sub", userId: "user-y", assignmentNumber: 3, slot: 1, repoFullName: REPO, prNumber: 30, taskFilePrNumber: null, extraPrNumbers: [16] }]);
    const lone = submission([savedTask()]);
    const other = "PR #16 is already used by another student's Task 1 in Sprint 3, as an extra PR for its code.";
    expect(error(await runExtraPrChange(fakeDb(lone, { refs }).db, reader, lone, add(lone, 16, false), by()))).toBe(other);
    expect(await runWorkPrChange(fakeDb(lone, { refs }).db, reader, lone, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: false, seen: null }, { by: BY, repoCopies: true, now: NOW }))
      .toEqual({ ok: false, status: 409, error: other });
    // This task's own extra PRs are not "used by another task".
    expect(usedPrs([], submission([savedTask({ extraCodePrs: [extraOf(12)] })]), 1)).toEqual([]);
  });

  it("#435's exception holds for extra PRs: a sibling's task-file-only PR may be added", async () => {
    const sub = submission([savedTask(), siblingTask()]);
    const result = await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, add(sub, 21, false, "Its task file PR also holds our code."), by());
    expect(result).toMatchObject({ ok: true, body: { preview: { prNumber: 21, files: [SIBLING_PATH], taskFiles: 1, sourceFiles: 0, testFiles: 0 } } });
    // Task 2's code PR (#30) is still used.
    expect(error(await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, add(sub, 30, false), by()))).toBe("PR #30 is already used by Task 2 of this submission.");
  });

  it("is allowed whether or not staff chose the main PR, and an unknown author is a warning", async () => {
    const chosen = savedTask({
      workPrChoice: { prNumber: 10, prUrl: `https://github.com/${REPO}/pull/10`, chosenBy: BY, chosenAt: T0, reason: "r", replacedPrNumber: 21,
        before: { prNumber: 21, prUrl: "", taskFilePr: null, prTaskFiles: null, mergeCommitSha: "", baseCommit: "", baseCommitSource: "merge_base", headCommit: null, diffEnd: "head", files: [], diffBytes: 0, diffTruncated: false } },
      taskFilePr: { url: `https://github.com/${REPO}/pull/21`, number: 21, mergeSha: sha("v", "m") },
      pr: { ...savedTask().pr, author: null },
    });
    const sub = submission([chosen]);
    const result = await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, add(sub, 12, false), by());
    expect(result).toMatchObject({ ok: true, body: { preview: { prNumber: 12, warnings: ["The task's PR author is not saved, so it can't be checked that the student opened PR #12.", expect.any(String)] } } });
  });

  it("an unlocked attempt is read-only for add and remove", async () => {
    const sub = submission([savedTask({ extraCodePrs: [extraOf(12)] })], { superseded_at: LATER });
    expect(error(await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, add(sub, 14, true), by()))).toBe(WORK_PR_TEXT.readOnly);
    expect(error(await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, remove(sub, 12), by()))).toBe("This attempt was unlocked and is read-only.");
  });
});

describe("2. preview, apply and remove (parts 3 and 4)", () => {
  it("a preview writes nothing and reads five things from GitHub; it shows the PR's own files, counts, overlap and the benchmark row", async () => {
    const sub = submission([savedTask()]);
    const { db, ops, state } = fakeDb(sub, { sources: [source("validated")] });
    const { reader, calls } = gitHub();
    const result = await runExtraPrChange(db, reader, sub, add(sub, 12, false), by());
    expect(result).toMatchObject({
      ok: true, status: 200,
      body: { apply: false, preview: {
        slot: 1, prNumber: 12, title: "Apple picker, part two", files: ["src/apple.ts", "src/basket.ts"], testFiles: 0, sourceFiles: 2, taskFiles: 0,
        summary: "PR #12 changes 2 files: 0 test files and 2 source files.",
        benchmark: { row: "validated", line: "Its benchmark row stays validated, built from the main PR only (its patches don't change); it carries the flag extra_code_prs." },
        warnings: ["PR #12 also changes src/apple.ts, which PR #10 changes too. The AI sees each PR's change to that file in turn, in merge order."],
      } },
    });
    expect(ops.map((op) => op.op)).toEqual(["loadCourseTaskRefs", "loadBenchmarkState"]);
    expect(state.row).toBe(sub);
    expect(calls).toEqual([
      `/repos/${REPO}/pulls/12`,
      `/repos/${REPO}/compare/${sha("m", "b")}...${sha("m", "h")}`,
      `/repos/${REPO}/commits/${sha("m", "m")}/check-runs?per_page=100`,
      `/repos/${REPO}/commits/${sha("m", "m")}/status`,
      `text /repos/${REPO}/compare/${sha("m", "0")}...${sha("m", "h")}`,
    ]);
  });

  it("an apply writes the source's flag (status kept, no task row) and then only this task's extraCodePrs in the guarded snapshot", async () => {
    const two = siblingTask();
    const sub = submission([savedTask(), two]);
    const stored: StoredTaskRow = { instance_id: instance, base_commit: savedTask().baseCommit, patch: "P", test_patch: "T" };
    const { db, ops, state } = fakeDb(sub, { sources: [source("validated")], storedTasks: [stored] });
    const result = await runExtraPrChange(db, gitHub().reader, sub, add(sub, 14, true), by());
    expect(result).toMatchObject({ ok: true, body: { apply: true, done: { benchmarkSourcesWritten: 1, snapshotWritten: true }, message: "Added PR #14. Press Regrade to grade this task on all of its PRs." } });
    expect(ops.map((op) => op.op)).toEqual(["loadCourseTaskRefs", "loadBenchmarkState", "writeBenchmark", "writeSnapshot"]);
    const [tasks, sources] = ops[2]!.args as [unknown[], SourceUpsert[]];
    expect(tasks).toEqual([]);
    expect(sources).toEqual([{ instance_id: instance, course_id: "course-z", user_id: "user-z", assignment_submission_id: SUBMISSION_ID, task_slot: 1, flags: ["base_commit_from_merge_base", EXTRA_CODE_PRS_FLAG], updated_at: NOW }]);
    expect(state.sources).toEqual([{ ...source("validated"), flags: ["base_commit_from_merge_base", EXTRA_CODE_PRS_FLAG] }]);
    expect(state.storedTasks).toEqual([stored]);
    const [, written, guard] = ops[3]!.args as [string, SubmissionSnapshot & { recapturedAt: string }, unknown];
    expect(guard).toEqual({ capturedAt: T0, recapturedAt: null });
    expect(written.recapturedAt).toBe(NOW);
    expect(written.tasks[1]).toBe(two);
    const { extraCodePrs, extraCodePrChange, ...rest } = written.tasks[0]!;
    expect(rest).toEqual(savedTask());
    expect(extraCodePrChange).toEqual({ action: "added", prNumber: 14, by: BY, at: NOW });
    expect(extraCodePrs).toEqual([extraOf(14, { reason: "The tests are in a later PR." })]);
  });

  it("extra PRs are kept in merge order; no source row means no benchmark write", async () => {
    let sub = submission([savedTask()]);
    const store = fakeDb(sub);
    await runExtraPrChange(store.db, gitHub().reader, sub, add(sub, 14, true), by());
    sub = store.state.row;
    expect((await runExtraPrChange(store.db, gitHub().reader, sub, add(sub, 12, true), by(LATER))).ok).toBe(true);
    expect(store.state.row.snapshot.tasks[0]!.extraCodePrs!.map((extra) => extra.prNumber)).toEqual([12, 14]);
    expect(store.ops.filter((op) => op.op === "writeBenchmark")).toEqual([]);
  });

  it("a remove reads nothing from GitHub, clears the flag with the last extra PR, and keeps the row's status", async () => {
    const sub = submission([savedTask({ extraCodePrs: [extraOf(12), extraOf(14)] })]);
    const { db, ops, state } = fakeDb(sub, { sources: [source("rejected", ["base_commit_from_merge_base", EXTRA_CODE_PRS_FLAG])] });
    const { reader, calls } = gitHub();
    const first = await runExtraPrChange(db, reader, sub, remove(sub, 12), by());
    expect(first).toMatchObject({ ok: true, body: { apply: true, preview: null, done: { benchmarkSourcesWritten: 0, snapshotWritten: true }, message: "Removed PR #12. Press Regrade to grade this task without it." } });
    expect(state.row.snapshot.tasks[0]!.extraCodePrs!.map((extra) => extra.prNumber)).toEqual([14]);
    const second = await runExtraPrChange(db, reader, state.row, remove(state.row, "14"), by(LATER));
    expect(second).toMatchObject({ ok: true, body: { done: { benchmarkSourcesWritten: 1 } } });
    expect(state.row.snapshot.tasks[0]).toEqual({ ...savedTask(), extraCodePrChange: { action: "removed", prNumber: 14, by: BY, at: LATER } });
    expect("extraCodePrs" in state.row.snapshot.tasks[0]!).toBe(false);
    expect(state.sources).toEqual([source("rejected", ["base_commit_from_merge_base"])]);
    expect(calls).toEqual([]);
    expect(ops.map((op) => op.op)).not.toContain("loadCourseTaskRefs");
    expect(error(await runExtraPrChange(db, reader, state.row, remove(state.row, 14), by(LATER)))).toBe(notExtraMessage(14));
  });

  it("a guard failure on the snapshot stops after the flag; a rerun ends as a clean apply", async () => {
    const sub = submission([savedTask()]);
    const failing = fakeDb(sub, { sources: [source("validated")], guardFails: true });
    expect(error(await runExtraPrChange(failing.db, gitHub().reader, sub, add(sub, 14, true), by()))).toBe(GUARD_MESSAGE);
    const rerun = fakeDb(sub, { sources: failing.state.sources });
    expect((await runExtraPrChange(rerun.db, gitHub().reader, sub, add(sub, 14, true), by())).ok).toBe(true);
    expect(rerun.ops.map((op) => op.op)).toEqual(["loadCourseTaskRefs", "loadBenchmarkState", "writeSnapshot"]);
    expect(rerun.state.sources).toEqual([{ ...source("validated"), flags: ["base_commit_from_merge_base", EXTRA_CODE_PRS_FLAG] }]);
  });

  it("no grade row, grade status or grade job is touched: the database the change gets has no such call", async () => {
    const sub = submission([savedTask()], { status: "released" });
    const { db, ops, state } = fakeDb(sub);
    await runExtraPrChange(db, gitHub().reader, sub, add(sub, 14, true), by());
    expect(ops.map((op) => op.op).filter((op) => /grade|status|job|requeue|backup/i.test(op))).toEqual([]);
    expect(state.row.status).toBe("released");
  });
});

describe("3. the stale page (part 3)", () => {
  it("an add and a remove from a page that saw other extra PRs, or no `seen` at all, are refused before GitHub is read", async () => {
    const sub = submission([savedTask({ extraCodePrs: [extraOf(12)] })]);
    const { reader, calls } = gitHub();
    const { db, ops } = fakeDb(sub);
    const before = { prNumber: 10, recapturedAt: null };
    expect(error(await runExtraPrChange(db, reader, sub, { kind: "addExtra", slot: 1, pr: 14, reason: "r", apply: true, seen: before }, by()))).toBe(STALE_PAGE);
    expect(error(await runExtraPrChange(db, reader, sub, { kind: "addExtra", slot: 1, pr: 14, reason: "r", apply: false, seen: { ...before, extraPrs: [12, 15] } }, by()))).toBe(STALE_PAGE);
    expect(error(await runExtraPrChange(db, reader, sub, { kind: "addExtra", slot: 1, pr: 14, reason: "r", apply: true, seen: null }, by()))).toBe(STALE_PAGE);
    expect(error(await runExtraPrChange(db, reader, sub, { kind: "removeExtra", slot: 1, prNumber: 12, seen: before }, by()))).toBe(STALE_PAGE);
    expect(error(await runExtraPrChange(db, reader, sub, { kind: "removeExtra", slot: 1, prNumber: 12, seen: null }, by()))).toBe(STALE_PAGE);
    expect(calls).toEqual([]);
    expect(ops).toEqual([]);
    // The #431 change sees the extra PRs too: a page that saw none is stale once one is added.
    expect(await runWorkPrChange(db, reader, sub, { kind: "undo", slot: 1, seen: before }, { by: BY, repoCopies: true })).toEqual({ ok: false, status: 409, error: STALE_PAGE });
  });
});

describe("4. changing or undoing the main PR with extra PRs attached (part 2)", () => {
  it("is refused with a plain message, before GitHub is read; nothing is kept or dropped", async () => {
    const sub = submission([savedTask({ extraCodePrs: [extraOf(12), extraOf(14)] })]);
    const { reader, calls } = gitHub();
    const { db, ops } = fakeDb(sub);
    const message = "This task has extra PRs for its code (PR #12 and PR #14). Remove them first, then change or undo the main PR.";
    expect(extrasFirstMessage([12, 14])).toBe(message);
    expect(await runWorkPrChange(db, reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: false, seen: null }, { by: BY, repoCopies: true })).toEqual({ ok: false, status: 409, error: message });
    expect(await runWorkPrChange(db, reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: true, seen: seenOf(sub) }, { by: BY, repoCopies: true })).toEqual({ ok: false, status: 409, error: message });
    expect(await runWorkPrChange(db, reader, sub, { kind: "undo", slot: 1, seen: seenOf(sub) }, { by: BY, repoCopies: true })).toEqual({ ok: false, status: 409, error: message });
    expect(calls).toEqual([]);
    expect(ops).toEqual([]);
  });
});

describe("5. what the AI is given (part 5)", () => {
  const PINS: Record<string, string> = {
    "plain": "3018b3d6dfc83da5c1112663774e8e0c76951e48362e0f7bfd9f37d19bc0bf36",
    "shared PR notes": "94cd05623564bda9cfcd26bf9fe778029f35120e87d9f55da720733ddda36eee",
    "no tests, cut off": "9cff1462cefe418930339c3084b4f78a09691aba8582ad2e14d3a06d24cf8394",
    "diff error": "cb8a230c62b46f95050b665db63f113cce4807ef99653e4b366dc05a12d0d980",
    "staff-chosen PR (#431)": "9e52ebc9db361044985843abae441b986b4cb97b8081ade3d2d2a69541a3cc3f",
  };

  it("a task without extra PRs gives byte for byte the messages it gave before #437 (pinned from production at 10925af)", () => {
    for (const [name, task, notes] of PIN_TASKS) {
      const messages = JSON.stringify(buildMessages(graderInput(task, notes)));
      expect(createHash("sha256").update(messages).digest("hex"), name).toBe(PINS[name]);
      expect(JSON.stringify(buildMessages(graderInput({ ...task, extraCodePrs: [] }, notes))), name).toBe(messages);
      expect(graderDiff(task)).toBe(task.diff);
    }
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v5");
  });

  it("with extra PRs: the main PR's diff, then each extra PR's in merge order; a file in two PRs is two sections in order; one note; v5", () => {
    const task = savedTask({ extraCodePrs: [extraOf(14), extraOf(12)] });
    expect(graderDiff(task)).toBe(MAIN_DIFF + extraOf(12).diff + extraOf(14).diff);
    const input = graderInput(task);
    const apple = parseDiffFiles(input.patch).filter((file) => file.path === "src/apple.ts");
    expect(apple.map((file) => file.text)).toEqual([fileDiff("src/apple.ts", "export const ripe = true;"), editDiff("src/apple.ts", "export const picked = 45;")]);
    // The spec names src/apple.ts, so both of its sections come first, the main PR's then PR #12's; then the rest in diff order.
    expect(parseDiffFiles(input.patch).map((file) => file.path)).toEqual(["src/apple.ts", "src/apple.ts", "src/basket.ts", TASK_PATH]);
    expect(input.testPatch).toBe(extraOf(14).diff);
    expect(input.notes).toEqual([
      "This task's code is in PR #10 plus PRs #12 and #14, as course staff recorded. The test and source diffs below are PR #10's followed by those PRs', in the order they were merged, so a file changed in more than one of these PRs appears once for each. Judge the task on all of them together.",
    ]);
    expect(extraCodePrsGraderNote(10, [14])).toBe("This task's code is in PR #10 plus PR #14, as course staff recorded. The test and source diffs below are PR #10's followed by that PR's, in the order they were merged, so a file changed in more than one of these PRs appears once for each. Judge the task on all of them together.");
    const user = buildMessages(input)[1]!.content;
    expect(user).toContain("Note: This task's code is in PR #10 plus PRs #12 and #14");
    expect(user).toContain("it('picks', () => {});");
    // The tests-only shape: the main PR has no tests, so without the extra PR the AI is told there are none.
    expect(graderInput(savedTask()).notes).toContain("The diff has no test files.");
    expect(graderInput(savedTask({ extraCodePrs: [extraOf(14, { diffTruncated: true })] })).notes).toContain("The diff of PR #14 was over 1 MB and was cut off.");
  });

  it("an extra PR diff that does not end in a newline does not join the next PR's first line", () => {
    const task = savedTask({ diff: "diff --git a/a b/a\n+x", extraCodePrs: [extraOf(12)] });
    expect(graderDiff(task)).toBe(`diff --git a/a b/a\n+x\n${extraOf(12).diff}`);
  });
});

describe("6. Tests pass (part 5)", () => {
  it("reads the checks of the last merged PR and names it; a task without extra PRs is unchanged", async () => {
    const task = savedTask({ extraCodePrs: [extraOf(14), extraOf(12)] });
    expect(lastMergedChecks(task)).toEqual({ prNumber: 14, checks: extraOf(14).checks });
    const grade = gradeTestsPass(lastMergedChecks(task)!.checks, { prNumber: 14 });
    expect(grade).toMatchObject({
      level: "full", rationale: "All 2 CI checks passed on the merge commit of PR #14, the last merged of this task's PRs.",
      evidenceQuotes: ["checks read on the merge commit of PR #14", "test: success", "lint: success"],
    });
    expect(gradeTestsPass([], { prNumber: 14 })).toMatchObject({ level: null, evidenceQuotes: ["checks read on the merge commit of PR #14"],
      rationale: "No finished CI checks were recorded on the merge commit of PR #14, the last merged of this task's PRs, so test results need a manual check." });
    // The main PR merged last: its own checks, named.
    const mainLast = savedTask({ pr: { ...savedTask().pr, mergedAt: "2026-10-30T00:00:00Z" }, extraCodePrs: [extraOf(12)] });
    expect(lastMergedChecks(mainLast)).toEqual({ prNumber: 10, checks: mainLast.checks });
    expect(lastMergedChecks(savedTask())).toBeNull();
    expect(gradeTestsPass(savedTask().checks)).toMatchObject({ rationale: "All 1 CI checks failed on the merge commit.", evidenceQuotes: ["test: failure"] });

    const client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(["scope", "specs", "acceptance_criteria", "test_quality"].map((key) => [key, { level: "full", rationale: "ok", evidence_quotes: ["Apple picker"] }]))) } }] }) } } };
    const graded = await gradeTask(client, task);
    expect(graded.rubric.find((row) => row.name === "Tests pass")).toMatchObject({ level: "full", evidenceQuotes: ["checks read on the merge commit of PR #14", "test: success", "lint: success"] });
    expect(graded.promptVersion).toBe("cse115a-grader-v5");
    expect((await gradeTask(client, savedTask())).rubric.find((row) => row.name === "Tests pass")).toEqual(gradeTestsPass(savedTask().checks));
  });
});

describe("7. the benchmark row (part 6)", () => {
  it("is built from the main PR only; the flag is set with extra PRs and not without", () => {
    const plain = buildInstance(savedTask(), 3, null);
    const withExtras = buildInstance(savedTask({ extraCodePrs: [extraOf(12), extraOf(14)] }), 3, null);
    expect(withExtras.instance).toEqual(plain.instance);
    expect(withExtras.flags).toEqual([...plain.flags, EXTRA_CODE_PRS_FLAG]);
    expect(plain.flags).not.toContain(EXTRA_CODE_PRS_FLAG);
    expect(JSON.stringify(withExtras.instance)).not.toContain("basket");
  });

  it("records each extra PR's number, merge, base and head commit with the row's provenance (the source's snapshot), in merge order, without diff text", () => {
    const snapshot = { tasks: [savedTask({ extraCodePrs: [extraOf(14), extraOf(12)] })] };
    expect(snapshotExtraCodePrs(snapshot, 1)).toEqual([
      { pr_number: 12, merge_commit: sha("m", "m"), base_commit: sha("m", "0"), head_commit: sha("m", "h") },
      { pr_number: 14, merge_commit: sha("o", "m"), base_commit: sha("o", "0"), head_commit: sha("o", "h") },
    ]);
    expect(snapshotExtraCodePrs({ tasks: [savedTask()] }, 1)).toEqual([]);
    expect(snapshotExtraCodePrs(null, 1)).toEqual([]);
  });

  it("a new attempt with the same main PR does not carry the flag over from a settled source", () => {
    const sub = submission([savedTask()], { id: "new-attempt" });
    const built = buildInstance(savedTask(), 3, null);
    const settled: StoredSource = { ...source("validated", [...built.flags, EXTRA_CODE_PRS_FLAG, "validator_note"]), assignment_submission_id: SUBMISSION_ID, merge_commit: savedTask().pr.mergeCommitSha };
    const plan = planBenchmarkSave(sub, [{ slot: 1, instance: built.instance, flags: built.flags, mergeCommit: savedTask().pr.mergeCommitSha }], [settled], NOW);
    expect(plan.kept).toEqual([instance]);
    expect(plan.sources[0]!.flags).toEqual([...built.flags, "validator_note"]);
    expect(plan.sources[0]!.validation_status).toBe("validated");
  });
});

describe("8. the out-of-date AI grade line (part 5)", () => {
  it("names the extra PR added or removed after the grade; the later of a choice and an extra change wins", () => {
    const added = savedTask({ extraCodePrChange: { action: "added", prNumber: 14, by: BY, at: NOW } });
    expect(staleAiGradeLine(added, T0)).toBe("This AI grade was made before PR #14 was added to this task's code. Press Regrade.");
    expect(staleAiGradeLine(added, LATER)).toBeNull();
    const removed = savedTask({ extraCodePrChange: { action: "removed", prNumber: 12, by: BY, at: NOW } });
    expect(staleAiGradeLine(removed, T0)).toBe("This AI grade was made before PR #12 was removed from this task's code. Press Regrade.");
    const both = savedTask({
      extraCodePrChange: { action: "added", prNumber: 14, by: BY, at: NOW },
      workPrUndone: { undoneBy: BY, undoneAt: "2026-11-01T00:00:00Z", prNumber: 16, backToPrNumber: 10 },
    });
    expect(staleAiGradeLine(both, T0)).toBe("This AI grade was made before PR #14 was added to this task's code. Press Regrade.");
    expect(staleAiGradeLine({ ...both, extraCodePrChange: { ...both.extraCodePrChange!, at: "2026-10-25T00:00:00Z" } }, T0))
      .toBe("This AI grade was made on PR #16, before the code was switched back to PR #10. Press Regrade.");
    expect(staleAiGradeLine(savedTask(), T0)).toBeNull();
  });
});

describe("9. the candidate list (part 3)", () => {
  it("marks the task's extra PRs and still lists the rest; at most 3 pages and 30 file lists", async () => {
    const task = savedTask({ extraCodePrs: [extraOf(12)] });
    const { reader, calls } = gitHub();
    const listed = await listWorkPrCandidates(reader, task, usedPrs([], submission([task, siblingTask({ extraCodePrs: [extraOf(20)] })]), 1));
    const byNumber = new Map(listed.candidates.map((candidate) => [candidate.number, candidate]));
    expect(byNumber.get(12)).toMatchObject({ attached: true, usedBy: null });
    expect(byNumber.get(14)?.attached).toBeUndefined();
    expect(byNumber.get(20)?.usedBy).toBe("Task 2 of this submission, as an extra PR for its code");
    expect(byNumber.has(10)).toBe(false);
    expect(listed.calls).toBe(1 + listed.candidates.length);
    expect(calls.length).toBe(listed.calls);
  });

  it("the store loads each task's extra PR numbers as JSON paths, never their diffs", () => {
    expect(WORK_PR_TASK_PATHS).toContain("x1_0:snapshot->tasks->0->extraCodePrs->0->prNumber,x1_1:snapshot->tasks->0->extraCodePrs->1->prNumber,x1_2:snapshot->tasks->0->extraCodePrs->2->prNumber");
    expect(WORK_PR_TASK_PATHS).not.toMatch(/extraCodePrs(,|$)/);
    expect(WORK_PR_TASK_PATHS).not.toContain("diff");
  });
});

describe("10. page texts, word for word (part 7)", () => {
  it("the list, the reason, the adder, Get the code and the benchmark lines", () => {
    expect(extraCodePrLine(extraOf(12))).toBe(`PR #12 Apple picker, part two · merged Oct 12, 2026 · added by ${BY} on Nov 23, 2026`);
    expect(extraCodePrReasonLine("Tests came later.")).toBe("Reason: Tests came later.");
    expect(getTheCodeExtrasNote(10, [12, 14])).toBe("The stored copy and these commands hold PR #10 only. This task's code is also in PR #12 and PR #14, which they do not include.");
    expect(extraBenchmarkLine(null)).toBe("This task has no benchmark row yet. When it gets one, it is built from the main PR only and carries the flag extra_code_prs.");
    expect(extraOverlapWarning(15, ["a.ts", "b.ts"], [10, 12])).toBe("PR #15 also changes a.ts, b.ts, which PR #10 and PR #12 change too. The AI sees each PR's change to those files in turn, in merge order.");
    expect({
      heading: WORK_PR_TEXT.extraHeading, list: WORK_PR_TEXT.extraListHeading, add: WORK_PR_TEXT.extraAdd,
      confirm: WORK_PR_TEXT.confirmExtra(12), remove: WORK_PR_TEXT.extraRemove, confirmRemove: WORK_PR_TEXT.confirmRemove(12), attached: WORK_PR_TEXT.attached,
      extraDiff: WORK_PR_TEXT.extraDiffHeading(12, "Apple picker, part two"), mainDiff: WORK_PR_TEXT.mainDiffHeading(10, "Apple picker"), checks: WORK_PR_TEXT.extraChecksHeading(12),
    }).toEqual({
      heading: "Add another PR that holds part of this task's code", list: "Extra PRs for this task's code", add: "Add this PR",
      confirm: "Yes, add PR #12 to this task's code", remove: "Remove", confirmRemove: "Yes, remove PR #12", attached: "Already added to this task",
      extraDiff: "PR #12: Apple picker, part two (extra PR for this task's code)", mainDiff: "PR #10: Apple picker (main PR)", checks: "CI on PR #12's merge commit",
    });
    expect(WORK_PR_TEXT.extraIntro).toBe("The task keeps its main PR. The AI reads the main PR's diff and then each extra PR's, in merge order. The benchmark row, the stored copy and \"Get the code\" stay the main PR's. Nothing is regraded until you press Regrade.");
  });
});

describe("11. student pages show nothing new (part 7)", () => {
  it("no student route, page or component reads extraCodePrs or prints who added a PR or why", async () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    await walk(join(root, "app"));
    await walk(join(root, "components"));
    const student = files.filter((path) => !/instructor/.test(relative(root, path)));
    expect(student.length).toBeGreaterThan(10);
    for (const path of student) {
      const text = await readFile(path, "utf8");
      expect(text, relative(root, path)).not.toMatch(/extraCodePr|addedBy|ExtraCodePrs|extraCodePrLine|extraCodePrReasonLine/);
    }
  });
});

describe("12. the three fixes to #431 (part 8)", () => {
  const sameBase = () => {
    const prs = defaultPrs();
    // #16 starts at the same merge base as the main PR #10.
    prs.find((item) => item.number === 16)!.mergeBase = savedTask().baseCommit;
    return prs;
  };
  const stored = (): StoredTaskRow => ({ instance_id: instance, base_commit: savedTask().baseCommit, patch: "P", test_patch: "T" });

  it("1. a choice at the same base commit with a copy stored records which PR the copy holds, and the page says so; an undo clears it", async () => {
    let sub = submission([savedTask()]);
    const store = fakeDb(sub, { sources: [source("candidate")], storedTasks: [stored()], copyStored: true });
    const { reader } = gitHub(sameBase());
    const chosen = await runWorkPrChange(store.db, reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: true, seen: seenOf(sub) }, { by: BY, repoCopies: true, now: NOW });
    expect(chosen).toMatchObject({ ok: true, body: { preview: { benchmark: { baseChanged: false } }, done: { repoCopy: "not needed" } } });
    expect(store.ops.find((op) => op.op === "repoCopyStored")?.args).toEqual([instance, savedTask().baseCommit]);
    sub = store.state.row;
    const task = sub.snapshot.tasks[0]!;
    expect(task.repoCopyFrom).toEqual({ prNumber: 10, mergeCommitSha: savedTask().pr.mergeCommitSha });
    expect(repoCopyFromNote(10, 16)).toBe("This stored copy was made for PR #10, before staff chose PR #16 for this task's code. Both start at the same commit, so the copy was not made again: its refs/hecate/merge is PR #10's merge commit. For PR #16, use From GitHub above.");
    const undone = await runWorkPrChange(store.db, reader, sub, { kind: "undo", slot: 1, seen: seenOf(sub) }, { by: BY, repoCopies: true, now: LATER });
    expect(undone.ok).toBe(true);
    expect(store.state.row.snapshot.tasks[0]!.repoCopyFrom).toBeUndefined();
  });

  it("1. a choice at the same base commit with no copy yet queues the copy job, so it is made for the chosen PR", async () => {
    const sub = submission([savedTask()]);
    const store = fakeDb(sub, { sources: [source("candidate")], storedTasks: [stored()], copyStored: false });
    const chosen = await runWorkPrChange(store.db, gitHub(sameBase()).reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: true, seen: seenOf(sub) }, { by: BY, repoCopies: true, now: NOW });
    expect(chosen).toMatchObject({ ok: true, body: { done: { repoCopy: "reset" } } });
    expect(store.ops.map((op) => op.op).slice(-2)).toEqual(["writeSnapshot", "requeueRepoCopy"]);
    expect(store.state.row.snapshot.tasks[0]!.repoCopyFrom).toBeUndefined();
    // Storage can't be asked: the job is queued and nothing is recorded.
    const unknown = fakeDb(sub, { sources: [source("candidate")], storedTasks: [stored()], copyStored: null });
    await runWorkPrChange(unknown.db, gitHub(sameBase()).reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: true, seen: seenOf(sub) }, { by: BY, repoCopies: true, now: NOW });
    expect(unknown.ops.map((op) => op.op)).toContain("requeueRepoCopy");
    expect(unknown.state.row.snapshot.tasks[0]!.repoCopyFrom).toBeUndefined();
    // A preview asks nothing.
    const preview = fakeDb(sub, { storedTasks: [stored()], copyStored: true });
    await runWorkPrChange(preview.db, gitHub(sameBase()).reader, sub, { kind: "choose", slot: 1, pr: 16, reason: "r", apply: false, seen: null }, { by: BY, repoCopies: true, now: NOW });
    expect(preview.ops.map((op) => op.op)).not.toContain("repoCopyStored");
  });

  it("2. two tasks from one submitted PR, one switched: the other task's staff note names the switched task's file", () => {
    const pr7 = `https://github.com/${REPO}/pull/7`;
    const one = savedTask({ prNumber: 16, prUrl: `https://github.com/${REPO}/pull/16`, prTaskFiles: [], taskFilePr: { url: pr7, number: 7, mergeSha: sha("g", "m") }, workPrChoice: {} as TaskSnapshot["workPrChoice"] });
    const two = siblingTask({ prNumber: 7, prUrl: pr7, taskFilePr: undefined, prTaskFiles: [TASK_PATH, SIBLING_PATH] });
    expect(prTaskFileLines([one, two], two, "staff")).toEqual([
      "This PR also adds US-3-T-1.md, the task file of US-3-T-1 (Task 1), whose code is in PR #16, which staff chose.",
    ]);
    // The student's page and the grader's notes are as before.
    expect(prTaskFileLines([one, two], two, "student")).toEqual(["This PR also adds another task file, US-3-T-1.md, which is not one of your tasks here. Its work is in the same diff."]);
    expect(prTaskFileGraderNotes([one, two], two)).toHaveLength(1);
    // A file that is none of the student's tasks is still said to be so.
    const three = { ...two, prTaskFiles: [TASK_PATH, SIBLING_PATH, "docs/tasks/sprint-3/US-3-T-9.md"] };
    expect(prTaskFileLines([one, three], three, "staff")).toEqual([
      "This PR also adds another task file, US-3-T-9.md, which is not one of this student's tasks here. Its work is in the same diff.",
      "This PR also adds US-3-T-1.md, the task file of US-3-T-1 (Task 1), whose code is in PR #16, which staff chose.",
    ]);
  });

  it("3. an unlocked attempt keeps its record readable: the staff choice and extra PRs stay on its snapshot and render; nothing can change", async () => {
    const old = savedTask({ extraCodePrs: [extraOf(12)], extraCodePrChange: { action: "added", prNumber: 12, by: BY, at: NOW } });
    const sub = submission([old], { superseded_at: LATER });
    expect(extraCodePrLine(sub.snapshot.tasks[0]!.extraCodePrs![0]!)).toContain("PR #12 Apple picker, part two");
    expect(getTheCodeExtrasNote(10, [12])).toContain("PR #12");
    expect(graderInput(sub.snapshot.tasks[0]!).notes[0]).toContain("PR #10 plus PR #12");
    for (const request of [add(sub, 14, true), remove(sub, 12)]) {
      expect(error(await runExtraPrChange(fakeDb(sub).db, gitHub().reader, sub, request, by()))).toBe("This attempt was unlocked and is read-only.");
    }
    // The new attempt's current submission is what usedPrs reads; the old attempt's extra PRs don't block anything.
    expect(usedPrs([], submission([savedTask()]), 1)).toEqual([]);
  });
});
