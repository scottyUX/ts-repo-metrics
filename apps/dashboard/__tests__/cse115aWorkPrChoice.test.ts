// #431: staff choose the PR that holds a task's code. The candidates, the rules a chosen PR must meet, the preview,
// apply and undo against a fake GitHub and a fake database (nothing reaches GitHub or Supabase), the benchmark row,
// the out-of-date AI grade line, the grader's input and Process, and the page texts. Names, repos and ids are made up.
import { describe, expect, it } from "vitest";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { RECAPTURED_SAME_PATCH_FLAG, type StoredTaskRow } from "@/lib/cse115a/benchmark/recapture";
import {
  listWorkPrCandidates, MAX_CANDIDATES, NO_REASON, NOTHING_TO_UNDO, runWorkPrChange, STALE_PAGE, usedPrs,
  type CourseTaskRef, type WorkPrDb, type WorkPrRequest,
} from "@/lib/cse115a/benchmark/workPrChoice";
import { submissionTaskRefs, WORK_PR_TASK_PATHS } from "@/lib/cse115a/benchmark/workPrChoiceStore";
import { gradeProcess } from "@/lib/cse115a/grader/deterministic";
import { gradeTask } from "@/lib/cse115a/grader/gradeTask";
import { buildMessages, graderInput, GRADER_PROMPT_VERSION } from "@/lib/cse115a/grader/llmGrader";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { StoredSource, SourceUpsert } from "@/lib/cse115a/jobs/benchmarkSave";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import type { SubmissionSnapshot, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import {
  benchmarkOutcomeLine, choiceDate, getTheCodeChoiceNote, likelyReasons, orderCandidates, parsePrInput, previewSummary,
  staleAiGradeLine, WORK_PR_FLAG, WORK_PR_TEXT, workPrChoiceLine, workPrGraderNote, workPrHeaderLine, workPrProcessRationale,
  workPrReasonLine, workPrUndoneLine,
} from "@/lib/cse115a/workPr";

const REPO = "team-kappa/shop";
const STUDENT = "student-kappa";
const OTHER = "student-omega";
const TASK_ID = "US-4-T-2";
const TASK_PATH = `docs/tasks/sprint-4/${TASK_ID}.md`;
const SPEC = `# ${TASK_ID}: Cart totals\n\nChange src/cart.ts so the total includes tax.\n`;
const SUBMISSION_ID = "11111111-2222-4333-8444-555555555555";
const T0 = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-22T12:00:00.000Z";
const LATER = "2026-11-23T08:00:00.000Z";

const sha = (char: string) => char.repeat(40);
const fileDiff = (path: string, line = "x") => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${line}\n`;
const TASK_ONLY_DIFF = fileDiff(TASK_PATH, "# spec");
const CODE_DIFF = fileDiff("src/cart.ts", "export const total = 1;") + fileDiff("src/__tests__/cart.test.ts", "it('adds tax', () => { expect(total).toBe(1); });");

type FakePr = {
  number: number; title: string; body: string; branch: string; author: string; merged: boolean;
  merge: string; base: string; head: string; mergeBase: string; diff: string; files: string[];
  checks?: Array<{ name: string; conclusion: string }>; comments?: Array<{ body: string; user: { login: string } }>;
};

function pr(number: number, overrides: Partial<FakePr> = {}): FakePr {
  const c = String.fromCharCode(96 + (number % 26) + 1);
  return {
    number, title: `Change ${number}`, body: "", branch: `branch-${number}`, author: STUDENT, merged: true,
    merge: sha(c) .slice(0, 39) + "m", base: sha(c).slice(0, 39) + "b", head: sha(c).slice(0, 39) + "h", mergeBase: sha(c).slice(0, 39) + "0",
    diff: fileDiff(`src/file${number}.ts`), files: [`src/file${number}.ts`],
    ...overrides,
  };
}

/** The repository's PRs: #7 is the PR the student submitted (task file only); #5 holds the code. */
function defaultPrs(): FakePr[] {
  return [
    pr(7, { title: `Add ${TASK_ID} task file`, branch: "task-file", diff: TASK_ONLY_DIFF, files: [TASK_PATH], checks: [{ name: "lint", conclusion: "success" }] }),
    pr(5, { title: "Cart tax", branch: "feature/cart-tax", diff: CODE_DIFF, files: ["src/cart.ts", "src/__tests__/cart.test.ts"],
      checks: [{ name: "test", conclusion: "failure" }], comments: [{ body: "Nice work on tax", user: { login: "ta-one" } }] }),
    pr(4, { title: "Fix header", branch: "fix/header", body: `Part of ${TASK_ID}`, files: ["src/header.ts"], diff: fileDiff("src/header.ts") }),
    pr(3, { title: "Teammate PR", author: OTHER, files: ["src/other.ts"], diff: fileDiff("src/other.ts") }),
    pr(2, { title: "Unmerged", merged: false }),
    pr(9, { title: "Used elsewhere", branch: "feature/us-4-t-9" }),
  ];
}

function gitHub(prs: FakePr[], options: { listPages?: FakePr[][] } = {}) {
  const calls: string[] = [];
  const byNumber = (n: number) => prs.find((item) => item.number === n);
  const byHead = (s: string) => prs.find((item) => item.head === s || item.merge === s);
  const reader: GitHubReader = {
    async json<T>(path: string, opts?: { optional?: boolean }) {
      calls.push(path);
      if (!path.startsWith(`/repos/${REPO}/`)) throw new Error(`another repository: ${path}`);
      const list = /\/pulls\?state=closed.*&page=(\d+)$/.exec(path);
      if (list) {
        const page = Number(list[1]);
        const pages = options.listPages ?? [prs];
        return (pages[page - 1] ?? []).map((item) => ({
          number: item.number, title: item.title, body: item.body, merged_at: item.merged ? `2026-10-${String(item.number).padStart(2, "0")}T00:00:00Z` : null,
          head: { ref: item.branch }, user: { login: item.author },
        })) as T;
      }
      const files = /\/pulls\/(\d+)\/files/.exec(path);
      if (files) return (byNumber(Number(files[1]))?.files ?? []).map((filename) => ({ filename })) as T;
      const pull = /\/pulls\/(\d+)$/.exec(path);
      if (pull) {
        const item = byNumber(Number(pull[1]));
        if (!item) { if (opts?.optional) return null; throw new Error("GitHub 404"); }
        return {
          title: item.title, body: item.body, merged_at: item.merged ? `2026-10-${String(item.number).padStart(2, "0")}T00:00:00Z` : null,
          merge_commit_sha: item.merged ? item.merge : null, base: { sha: item.base }, head: { ref: item.branch, sha: item.head }, user: { login: item.author },
        } as T;
      }
      if (/\/pulls\/\d+\/commits\?per_page=1/.test(path)) return [{ sha: sha("f") }] as T;
      if (path.endsWith(`/commits/${sha("f")}`)) return { files: [{ filename: TASK_PATH }] } as T;
      const compare = /\/compare\/([0-9a-z]+)\.\.\.([0-9a-z]+)$/.exec(path);
      if (compare) return { merge_base_commit: { sha: byHead(compare[2]!)?.mergeBase ?? sha("0") } } as T;
      const comments = /\/(issues|pulls)\/(\d+)\/(comments|reviews)/.exec(path);
      if (comments) return (comments[1] === "issues" ? byNumber(Number(comments[2]))?.comments ?? [] : []) as T;
      const runs = /\/commits\/([0-9a-z]+)\/check-runs/.exec(path);
      if (runs) return { check_runs: (byHead(runs[1]!)?.checks ?? []).map((check) => ({ ...check, status: "completed" })) } as T;
      if (path.endsWith("/status")) return { statuses: [] } as T;
      throw new Error(`unexpected ${path}`);
    },
    async text(path: string) {
      calls.push(`text ${path}`);
      const compare = /\/compare\/([0-9a-z]+)\.\.\.([0-9a-z]+)$/.exec(path);
      const item = compare ? byHead(compare[2]!) : undefined;
      if (!item) throw new Error(`unexpected ${path}`);
      return item.diff;
    },
  };
  return { reader, calls };
}

/** The task as Submit saved it, from PR #7 (task file only). */
function savedTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  const seven = defaultPrs()[0]!;
  return {
    slot: 1, taskId: TASK_ID, prUrl: `https://github.com/${REPO}/pull/7`, repoFullName: REPO, prNumber: 7, taskPath: TASK_PATH,
    specMarkdown: SPEC, spec: { id: TASK_ID, title: "Cart totals", estimateHours: 2 } as TaskSpec,
    validation: { prMerged: true, specCommittedFirst: true }, analysisResultId: "result-1", prTaskFiles: [TASK_PATH],
    pr: { title: seven.title, body: "", headRef: "task-file", author: STUDENT, mergedAt: "2026-10-07T00:00:00Z", baseSha: seven.base, mergeCommitSha: seven.merge },
    baseCommit: seven.mergeBase, baseCommitSource: "merge_base", taskFileFirstCommit: true, headCommit: seven.head, diffEnd: "head",
    diff: TASK_ONLY_DIFF, diffBytes: Buffer.byteLength(TASK_ONLY_DIFF), diffTruncated: false, diffError: null,
    comments: [], checks: [{ source: "check_run", name: "lint", status: "completed", conclusion: "success" }],
    ...overrides,
  };
}

function otherTask(slot: number, prNumber: number, overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return savedTask({ slot, taskId: `US-4-T-${slot + 5}`, taskPath: `docs/tasks/sprint-4/US-4-T-${slot + 5}.md`, prNumber, prUrl: `https://github.com/${REPO}/pull/${prNumber}`, ...overrides });
}

type Op = { op: string; args: unknown[] };

/** A database holding one submission; the snapshot write is guarded as recaptureStore's is. */
function fakeDb(sub: Submission, options: { refs?: CourseTaskRef[]; sources?: StoredSource[]; storedTasks?: StoredTaskRow[]; failBenchmarkOnce?: boolean; guardFails?: boolean } = {}) {
  const ops: Op[] = [];
  const state = { row: sub, backup: null as SubmissionSnapshot | null, sources: [...(options.sources ?? [])], storedTasks: [...(options.storedTasks ?? [])], failBenchmark: options.failBenchmarkOnce ?? false };
  const guardHolds = (guard: { capturedAt: string; recapturedAt: string | null }) => !options.guardFails && state.row.superseded_at === null
    && state.row.snapshot.capturedAt === guard.capturedAt && ((state.row.snapshot as { recapturedAt?: string }).recapturedAt ?? null) === guard.recapturedAt;
  const db: WorkPrDb = {
    async assertBackupColumn() { ops.push({ op: "assertBackupColumn", args: [] }); },
    async backupSnapshot(id, snapshot, guard) {
      ops.push({ op: "backupSnapshot", args: [id, snapshot, guard] });
      if (!guardHolds(guard)) return "guard";
      if (state.backup) return "kept";
      state.backup = snapshot;
      return "written";
    },
    async writeSnapshot(id, snapshot, guard) {
      ops.push({ op: "writeSnapshot", args: [id, snapshot, guard] });
      if (!guardHolds(guard)) return false;
      state.row = { ...state.row, snapshot };
      return true;
    },
    async writeBenchmark(tasks, sources) {
      ops.push({ op: "writeBenchmark", args: [tasks, sources] });
      if (state.failBenchmark) { state.failBenchmark = false; throw new Error("Could not save benchmark tasks: boom"); }
      for (const task of tasks) {
        state.storedTasks = state.storedTasks.filter((row) => row.instance_id !== task.instance_id);
        state.storedTasks.push({ instance_id: task.instance_id, base_commit: task.base_commit, patch: task.patch, test_patch: task.test_patch });
      }
      for (const source of sources as SourceUpsert[]) {
        const old = state.sources.find((row) => row.instance_id === source.instance_id && row.assignment_submission_id === source.assignment_submission_id && row.task_slot === source.task_slot);
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
  };
  return { db, ops, state };
}

function submission(tasks: TaskSnapshot[], overrides: Partial<Submission> = {}): Submission {
  return {
    id: SUBMISSION_ID, course_id: "course-1", user_id: "user-1", assignment_number: 4, status: "graded",
    snapshot: { version: 1, capturedAt: T0, tasks }, superseded_at: null, ...overrides,
  };
}

const seenOf = (sub: Submission, slot = 1) => ({
  prNumber: sub.snapshot.tasks.find((task) => task.slot === slot)!.prNumber,
  recapturedAt: (sub.snapshot as { recapturedAt?: string }).recapturedAt ?? null,
});
const choose = (sub: Submission, pr: unknown, apply: boolean, reason = "The code was merged in PR #5."): WorkPrRequest =>
  ({ kind: "choose", slot: 1, pr, reason, apply, seen: seenOf(sub) });
const undo = (sub: Submission): WorkPrRequest => ({ kind: "undo", slot: 1, seen: seenOf(sub) });
const options = (now = NOW) => ({ by: "ta-one@ucsc.edu", repoCopies: true, now });

const writeOps = (ops: Op[]) => ops.map((item) => item.op).filter((op) => !op.startsWith("load"));

// ---- 1. Candidates. ----

describe("1. candidates (read-only)", () => {
  it("lists the student's merged PRs only, without the task's own PR, likely ones first with reasons", async () => {
    const { reader, calls } = gitHub(defaultPrs());
    const used = usedPrs([], submission([savedTask()]), 1);
    const { candidates, authorKnown, calls: count } = await listWorkPrCandidates(reader, savedTask(), used);
    expect(authorKnown).toBe(true);
    // #7 is the task's own PR, #3 another student's, #2 not merged.
    expect(candidates.map((item) => item.number)).toEqual([5, 4, 9]);
    expect(candidates[0]).toMatchObject({ number: 5, likely: true, branch: "feature/cart-tax", filesChanged: 2, filesCapped: false, usedBy: null,
      reasons: ["It changes src/cart.ts, which the task file names."] });
    expect(candidates[1]).toMatchObject({ number: 4, likely: true, reasons: [`The description names ${TASK_ID}.`] });
    expect(candidates[2]).toMatchObject({ number: 9, likely: false, reasons: [] });
    // One page of closed PRs (short), then one file list per candidate.
    expect(count).toBe(1 + 3);
    expect(calls.filter((path) => path.includes("/pulls?state=closed"))).toHaveLength(1);
    expect(calls.filter((path) => path.includes("/files"))).toHaveLength(3);
    expect(calls.every((path) => !/\/pulls\/\d+$/.test(path))).toBe(true);
  });

  it("an unknown author lists every merged PR and says so", async () => {
    const { reader } = gitHub(defaultPrs());
    const task = savedTask({ pr: { ...savedTask().pr, author: null } });
    const { candidates, authorKnown } = await listWorkPrCandidates(reader, task, []);
    expect(authorKnown).toBe(false);
    expect(candidates.map((item) => item.number).sort((a, b) => a - b)).toEqual([3, 4, 5, 9]);
    expect(WORK_PR_TEXT.unknownAuthor).toBe("The task's PR author is not saved, so every merged PR in the repository is listed.");
  });

  it("marks a PR another task uses, and reads at most three pages and thirty candidates", async () => {
    const used = usedPrs([{ source: "submission", submissionId: "other-sub", userId: "user-2", assignmentNumber: 4, slot: 2, repoFullName: REPO.toUpperCase(), prNumber: 9, taskFilePrNumber: null }], submission([savedTask()]), 1);
    const { reader } = gitHub(defaultPrs());
    const { candidates } = await listWorkPrCandidates(reader, savedTask(), used);
    expect(candidates.find((item) => item.number === 9)!.usedBy).toBe("another student's Task 2 in Sprint 4");

    const many = Array.from({ length: 100 }, (_, index) => pr(100 + index));
    const paged = gitHub(many, { listPages: [many, many, many, many] });
    const listed = await listWorkPrCandidates(paged.reader, savedTask(), []);
    expect(paged.calls.filter((path) => path.includes("/pulls?state=closed"))).toHaveLength(3);
    expect(listed.candidates).toHaveLength(MAX_CANDIDATES);
    expect(listed.calls).toBe(3 + MAX_CANDIDATES);
  });

  it("orders likely first, then newest merged; reasons for title and branch", () => {
    const base = { title: "", branch: "", mergedAt: "", filesChanged: 1, filesCapped: false, reasons: [], usedBy: null };
    const ordered = orderCandidates([
      { ...base, number: 1, likely: false, mergedAt: "2026-10-09T00:00:00Z" },
      { ...base, number: 2, likely: true, mergedAt: "2026-10-01T00:00:00Z" },
      { ...base, number: 3, likely: true, mergedAt: "2026-10-05T00:00:00Z" },
    ]);
    expect(ordered.map((item) => item.number)).toEqual([3, 2, 1]);
    expect(likelyReasons({ title: `[${TASK_ID}] cart`, branch: "us-4-t-2/cart", body: null }, [], TASK_ID, () => false))
      .toEqual([`The title names ${TASK_ID}.`, `The branch names ${TASK_ID}.`]);
    // Not part of a longer ID.
    expect(likelyReasons({ title: "US-4-T-20", branch: "x", body: "US-4-T-2a" }, [], TASK_ID, () => false)).toEqual([]);
    // Task files never count as a named file.
    expect(likelyReasons({ title: "", branch: "", body: "" }, [TASK_PATH], TASK_ID, () => true)).toEqual([]);
  });
});

// ---- 2. The rules and the preview. ----

describe("2. preview (writes nothing) and refusals", () => {
  it("a typed PR number not in the list is previewed under the same rules: the chosen PR's own files and the benchmark row", async () => {
    const sub = submission([savedTask()]);
    const { db, ops } = fakeDb(sub);
    const result = await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, "#5", false), options());
    expect(result).toMatchObject({ ok: true, body: { apply: false, preview: {
      prNumber: 5, files: ["src/__tests__/cart.test.ts", "src/cart.ts"], testFiles: 1, sourceFiles: 1, diffTruncated: false,
      summary: "PR #5 changes 2 files: 1 test file and 1 source file.",
      benchmark: { action: "replace", row: null, line: "A benchmark row will be made from PR #5, as a candidate." }, warnings: [],
    } } });
    expect(writeOps(ops)).toEqual([]);
  });

  it("a preview needs no `seen`, but a stale one is refused before GitHub is read", async () => {
    const sub = submission([savedTask()]);
    const { db } = fakeDb(sub);
    const { reader, calls } = gitHub(defaultPrs());
    const stale: WorkPrRequest = { kind: "choose", slot: 1, pr: 5, reason: "r", apply: false, seen: { prNumber: 5, recapturedAt: null } };
    expect(await runWorkPrChange(db, reader, sub, stale, options())).toEqual({ ok: false, status: 409, error: STALE_PAGE });
    expect(await runWorkPrChange(db, reader, sub, { ...stale, apply: true }, options())).toEqual({ ok: false, status: 409, error: STALE_PAGE });
    expect(await runWorkPrChange(db, reader, sub, { ...stale, apply: true, seen: null }, options())).toEqual({ ok: false, status: 409, error: STALE_PAGE });
    expect(calls).toEqual([]);
    expect((await runWorkPrChange(db, reader, sub, { ...stale, seen: null }, options())).ok).toBe(true);
  });

  it("refuses: no reason, not merged, another repository, the current PR, another student's PR, not found", async () => {
    const sub = submission([savedTask()]);
    const { db, ops } = fakeDb(sub);
    const gh = gitHub(defaultPrs()).reader;
    const refuse = async (input: unknown, reason = "because") => {
      const result = await runWorkPrChange(db, gh, sub, choose(sub, input, false, reason), options());
      expect(result.ok).toBe(false);
      return result.ok ? null : result.error;
    };
    expect(await refuse(5, "   ")).toBe(NO_REASON);
    expect(await refuse(2)).toBe("PR #2 is not merged. Only a merged PR can hold the task's code.");
    expect(await refuse("https://github.com/team-zeta/other/pull/5")).toBe(`That PR is in another repository, team-zeta/other. This task's repository is ${REPO}.`);
    expect(await refuse(7)).toBe("PR #7 is the PR this task already uses.");
    expect(await refuse(3)).toBe(`PR #3 was opened by ${OTHER}, not by the task's student (${STUDENT}).`);
    expect(await refuse(42)).toBe(`PR #42 was not found in ${REPO}.`);
    expect(await refuse("twelve")).toBe("Type a PR number, like 12, or the PR's GitHub link.");
    expect(writeOps(ops)).toEqual([]);
    // A link to the task's own repository is taken, whatever its case.
    expect((await runWorkPrChange(db, gh, sub, choose(sub, `https://github.com/${REPO.toUpperCase()}/pull/5`, false), options())).ok).toBe(true);
  });

  it("refuses a PR used by another task: in this submission, and in another student's current submission", async () => {
    const sub = submission([savedTask(), otherTask(2, 5)]);
    const { db } = fakeDb(sub);
    const result = await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, false), options());
    expect(result).toEqual({ ok: false, status: 409, error: "PR #5 is already used by Task 2 of this submission." });

    const alone = submission([savedTask()]);
    const refs: CourseTaskRef[] = [
      { source: "submission", submissionId: "sub-other", userId: "user-2", assignmentNumber: 4, slot: 1, repoFullName: REPO, prNumber: 8, taskFilePrNumber: 5 },
    ];
    const other = await runWorkPrChange(fakeDb(alone, { refs }).db, gitHub(defaultPrs()).reader, alone, choose(alone, 5, false), options());
    expect(other).toEqual({ ok: false, status: 409, error: "PR #5 is already used by another student's Task 1 in Sprint 4." });

    // This task's own task row (which still holds PR #7) and this submission's own refs never count.
    const own: CourseTaskRef[] = [
      { source: "task_row", submissionId: null, userId: "user-1", assignmentNumber: 4, slot: 1, repoFullName: REPO, prNumber: 7, taskFilePrNumber: null },
      { source: "submission", submissionId: SUBMISSION_ID, userId: "user-1", assignmentNumber: 4, slot: 1, repoFullName: REPO, prNumber: 5, taskFilePrNumber: null },
      { source: "task_row", submissionId: null, userId: "user-1", assignmentNumber: 3, slot: 2, repoFullName: REPO, prNumber: 4, taskFilePrNumber: null },
    ];
    expect(usedPrs(own, alone, 1)).toEqual([{ repoFullName: REPO, prNumber: 4, where: "this student's Task 2 in Sprint 3" }]);
  });

  it("an unknown author can't be checked: the preview says so", async () => {
    const sub = submission([savedTask({ pr: { ...savedTask().pr, author: null } })]);
    const result = await runWorkPrChange(fakeDb(sub).db, gitHub(defaultPrs()).reader, sub, choose(sub, 3, false), options());
    expect(result).toMatchObject({ ok: true, body: { preview: { warnings: ["The task's PR author is not saved, so it can't be checked that the student opened PR #3."] } } });
  });

  it("parses a number, #N and a GitHub link", () => {
    expect(parsePrInput(5)).toEqual({ number: 5, repoFullName: null });
    expect(parsePrInput(" #12 ")).toEqual({ number: 12, repoFullName: null });
    expect(parsePrInput(`https://github.com/${REPO}/pull/8/files`)).toEqual({ number: 8, repoFullName: REPO });
    for (const bad of [0, -1, 1.5, "", "#0", "12a", `https://gitlab.com/${REPO}/pull/8`, null]) expect(parsePrInput(bad)).toBeNull();
  });
});

// ---- 3. Apply. ----

const CHANGED_KEYS = ["prNumber", "prUrl", "pr", "taskFilePr", "prTaskFiles", "workPrChoice", "baseCommit", "taskFileFirstCommit", "headCommit", "diff", "diffBytes", "comments", "checks"];

describe("3. apply", () => {
  it("changes only the diff, PR details, comments, checks and the staff-choice record; spec, task path and validation stay", async () => {
    const saved = savedTask();
    const sub = submission([saved, otherTask(2, 4)]);
    const { db, state } = fakeDb(sub);
    const result = await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(result).toMatchObject({ ok: true, body: { apply: true, message: "Saved. Press Regrade to grade this task on the new code." } });
    const after = state.row.snapshot.tasks.find((task) => task.slot === 1)!;
    const changed = Object.keys({ ...saved, ...after }).filter((key) => JSON.stringify((saved as Record<string, unknown>)[key]) !== JSON.stringify((after as Record<string, unknown>)[key]));
    expect(changed.sort()).toEqual([...CHANGED_KEYS].sort());
    for (const key of ["specMarkdown", "spec", "taskPath", "taskId", "validation", "analysisResultId", "slot", "repoFullName"] as const) expect(after[key]).toEqual(saved[key]);
    const five = defaultPrs()[1]!;
    expect(after).toMatchObject({
      prNumber: 5, prUrl: `https://github.com/${REPO}/pull/5`, diff: CODE_DIFF, baseCommit: five.mergeBase, baseCommitSource: "merge_base", diffEnd: "head",
      headCommit: five.head, taskFileFirstCommit: false, prTaskFiles: [],
      taskFilePr: { url: `https://github.com/${REPO}/pull/7`, number: 7, mergeSha: saved.pr.mergeCommitSha },
      pr: { title: "Cart tax", headRef: "feature/cart-tax", author: STUDENT, mergeCommitSha: five.merge },
      comments: [{ kind: "issue", author: "ta-one", body: "Nice work on tax" }],
      checks: [{ name: "test", conclusion: "failure" }],
      workPrChoice: {
        prNumber: 5, prUrl: `https://github.com/${REPO}/pull/5`, chosenBy: "ta-one@ucsc.edu", chosenAt: NOW, reason: "The code was merged in PR #5.", replacedPrNumber: 7,
        before: {
          prNumber: 7, prUrl: saved.prUrl, taskFilePr: null, prTaskFiles: [TASK_PATH], mergeCommitSha: saved.pr.mergeCommitSha,
          baseCommit: saved.baseCommit, baseCommitSource: "merge_base", headCommit: saved.headCommit, diffEnd: "head",
          files: [TASK_PATH], diffBytes: saved.diffBytes, diffTruncated: false,
        },
      },
    });
    // No second copy of the old diff text.
    expect(JSON.stringify(after.workPrChoice)).not.toContain("# spec");
    // The other task is untouched.
    expect(state.row.snapshot.tasks.find((task) => task.slot === 2)).toEqual(sub.snapshot.tasks[1]);
    expect((state.row.snapshot as { recapturedAt?: string }).recapturedAt).toBe(NOW);
  });

  it("writes in the re-capture's order: column check, backup, benchmark rows, the guarded snapshot last, then the repo copy job", async () => {
    const sub = submission([savedTask()]);
    const { db, ops } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(writeOps(ops)).toEqual(["assertBackupColumn", "backupSnapshot", "writeBenchmark", "writeSnapshot", "requeueRepoCopy"]);
    const guard = ops.find((item) => item.op === "writeSnapshot")!.args[2];
    expect(guard).toEqual({ capturedAt: T0, recapturedAt: null });
    // Copies off: no repo copy job.
    const off = fakeDb(sub);
    await runWorkPrChange(off.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), { ...options(), repoCopies: false });
    expect(writeOps(off.ops)).not.toContain("requeueRepoCopy");
  });

  it("no grade job, grade row or status is written; a released submission keeps its status", async () => {
    for (const status of ["graded", "released"] as const) {
      const sub = submission([savedTask()], { status });
      const { db, ops, state } = fakeDb(sub);
      await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
      expect(ops.some((item) => /grade|status|job/i.test(item.op) && item.op !== "requeueRepoCopy")).toBe(false);
      expect(state.row.status).toBe(status);
    }
  });

  it("the guard: a snapshot changed by someone else after the read stops the apply after the rows, before the snapshot", async () => {
    const sub = submission([savedTask()]);
    const { db, ops, state } = fakeDb(sub, { guardFails: true });
    const result = await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(writeOps(ops)).toEqual(["assertBackupColumn", "backupSnapshot"]);
    expect(state.row.snapshot).toBe(sub.snapshot);
  });

  it("a failed apply repairs on a rerun, ending as a clean apply does", async () => {
    const sub = submission([savedTask()]);
    const broken = fakeDb(sub, { failBenchmarkOnce: true });
    const first = await runWorkPrChange(broken.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(first).toMatchObject({ ok: false, status: 409, error: "Could not save the benchmark rows: Could not save benchmark tasks: boom" });
    expect(broken.state.row.snapshot).toBe(sub.snapshot);
    // The page still shows the old state, so the same `seen` is sent again.
    const rerun = await runWorkPrChange(broken.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(rerun.ok).toBe(true);
    const clean = fakeDb(sub);
    await runWorkPrChange(clean.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(broken.state.row.snapshot).toEqual(clean.state.row.snapshot);
    expect(broken.state.storedTasks).toEqual(clean.state.storedTasks);
    expect(broken.state.sources).toEqual(clean.state.sources);
  });

  it("an unlocked attempt is read-only", async () => {
    const sub = submission([savedTask()], { superseded_at: NOW });
    expect(await runWorkPrChange(fakeDb(sub).db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options()))
      .toEqual({ ok: false, status: 409, error: "This attempt was unlocked and is read-only." });
  });

  it("a second switch keeps the original `before` and records the PR it replaced", async () => {
    const sub = submission([savedTask()]);
    const { db, state } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const second = await runWorkPrChange(db, gitHub(defaultPrs()).reader, state.row, choose(state.row, 4, true, "Wrong PR before."), options(LATER));
    expect(second.ok).toBe(true);
    const task = state.row.snapshot.tasks[0]!;
    expect(task).toMatchObject({ prNumber: 4, taskFilePr: { number: 7 }, workPrChoice: { prNumber: 4, replacedPrNumber: 5, chosenAt: LATER, before: { prNumber: 7 } } });
    // Choosing the submitted PR again is Undo's job.
    const back = await runWorkPrChange(db, gitHub(defaultPrs()).reader, state.row, choose(state.row, 7, false), options());
    expect(back).toEqual({ ok: false, status: 409, error: "PR #7 is the PR the student submitted, which holds the task file. To take the code from it again, press Undo." });
  });

  it("a task the student already paired keeps its own task-file PR; the work PR is replaced", async () => {
    const pair = { url: `https://github.com/${REPO}/pull/6`, number: 6, mergeSha: sha("6") };
    const saved = savedTask({ taskFilePr: pair, prTaskFiles: [] });
    const sub = submission([saved]);
    const { db, state } = fakeDb(sub);
    expect((await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 6, false), options())))
      .toEqual({ ok: false, status: 409, error: "PR #6 holds this task's task file." });
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const task = state.row.snapshot.tasks[0]!;
    expect(task).toMatchObject({ prNumber: 5, taskFilePr: pair, workPrChoice: { before: { prNumber: 7, taskFilePr: pair } } });
    expect(workPrChoiceLine({ ...task, workPrChoice: task.workPrChoice! }))
      .toBe("Code from PR #5, chosen by staff on Nov 22, 2026. The student submitted PR #7 for the code and PR #6 for the task file.");
  });
});

// ---- 4. Benchmark row. ----

describe("4. benchmark row", () => {
  it("is built like a paired task's, with the new flag", async () => {
    const sub = submission([savedTask()]);
    const { db, state } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const task = state.row.snapshot.tasks[0]!;
    const built = buildInstance(task, 4, null, null);
    const paired = buildInstance({ ...task, workPrChoice: undefined }, 4, null, null);
    expect(built.flags).toEqual([...paired.flags, WORK_PR_FLAG]);
    expect(built.flags).toContain("task_file_from_other_pr");
    expect(built.instance).toEqual(paired.instance);
    expect(state.sources).toEqual([expect.objectContaining({ task_slot: 1, validation_status: "candidate", flags: built.flags })]);
    expect(state.storedTasks[0]).toMatchObject({ instance_id: `team-kappa__shop-${TASK_ID}`, patch: built.instance.patch, test_patch: built.instance.test_patch });
    expect(built.instance.patch).toContain("src/cart.ts");
    expect(built.instance.test_patch).toContain("cart.test.ts");
  });

  it("a validated row with identical patches is kept (flags gain the staff flag); different patches go back to candidate", async () => {
    const sub = submission([savedTask()]);
    // What the chosen PR builds, to store it as "identical".
    const probe = fakeDb(sub);
    await runWorkPrChange(probe.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const built = buildInstance(probe.state.row.snapshot.tasks[0]!, 4, null, null).instance;
    const id = built.instance_id;
    const validated: StoredSource = { instance_id: id, assignment_submission_id: SUBMISSION_ID, task_slot: 1, validation_status: "validated", flags: ["base_commit_from_merge_base", "validator_flag"], merge_commit: null };

    const same = fakeDb(sub, { sources: [validated], storedTasks: [{ instance_id: id, base_commit: built.base_commit, patch: built.patch, test_patch: built.test_patch }] });
    const kept = await runWorkPrChange(same.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, false), options());
    expect(kept).toMatchObject({ ok: true, body: { preview: { benchmark: { action: "keep", row: "validated",
      line: "Its benchmark row is validated, and PR #5 gives the same patches, so the row is kept as it is." } } } });
    await runWorkPrChange(same.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(same.state.sources).toEqual([{ ...validated, flags: ["base_commit_from_merge_base", "validator_flag", WORK_PR_FLAG, RECAPTURED_SAME_PATCH_FLAG] }]);
    expect(same.ops.filter((item) => item.op === "writeBenchmark").every((item) => (item.args[0] as unknown[]).length === 0)).toBe(true);

    const differ = fakeDb(sub, { sources: [validated], storedTasks: [{ instance_id: id, base_commit: built.base_commit, patch: "old patch", test_patch: built.test_patch }] });
    const back = await runWorkPrChange(differ.db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    expect(back).toMatchObject({ ok: true, body: { preview: { benchmark: { action: "back_to_candidate",
      line: "Its benchmark row is validated; it will be rebuilt from PR #5 and go back to candidate." } } } });
    expect(differ.state.sources).toEqual([expect.objectContaining({ validation_status: "candidate", flags: expect.arrayContaining([WORK_PR_FLAG]) })]);
    expect(differ.state.storedTasks[0]!.patch).toBe(built.patch);
  });
});

// ---- 5. Undo, and the out-of-date AI grade line. ----

describe("5. undo", () => {
  it("captures the original PR again, clears the record, keeps one line of history; a second undo is refused", async () => {
    const saved = savedTask();
    const sub = submission([saved]);
    const { db, state, ops } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const switched = state.row;
    ops.length = 0;
    const undone = await runWorkPrChange(db, gitHub(defaultPrs()).reader, switched, undo(switched), options(LATER));
    expect(undone).toMatchObject({ ok: true, body: { apply: true, message: "Undone. The code is from PR #7 again. Press Regrade to grade this task on it." } });
    // The switch stored a row, so its source is written first (the re-capture's order), then the task row.
    expect(writeOps(ops)).toEqual(["assertBackupColumn", "backupSnapshot", "writeBenchmark", "writeBenchmark", "writeSnapshot", "requeueRepoCopy"]);
    const task = state.row.snapshot.tasks[0]!;
    expect(task.workPrChoice).toBeUndefined();
    expect(task.workPrUndone).toEqual({ undoneBy: "ta-one@ucsc.edu", undoneAt: LATER, prNumber: 5, backToPrNumber: 7 });
    expect("taskFilePr" in task).toBe(false);
    // Back to the original PR's capture: everything as saved, but the record line and the comments read again.
    const { workPrUndone: _line, ...rest } = task;
    void _line;
    expect(rest).toEqual({ ...saved, comments: [] });
    // Nothing to undo now.
    const again = await runWorkPrChange(db, gitHub(defaultPrs()).reader, state.row, undo(state.row), options());
    expect(again).toEqual({ ok: false, status: 409, error: NOTHING_TO_UNDO });
    // The benchmark row is back to PR #7's (task file only: no patch), without the staff flag.
    expect(state.sources[0]!.flags).not.toContain(WORK_PR_FLAG);
  });

  it("refuses when the original PR's merge commit is not the one saved", async () => {
    const sub = submission([savedTask()]);
    const { db, state } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const moved = defaultPrs().map((item) => (item.number === 7 ? { ...item, merge: sha("z") } : item));
    expect(await runWorkPrChange(db, gitHub(moved).reader, state.row, undo(state.row), options()))
      .toEqual({ ok: false, status: 409, error: "PR #7 no longer has the merge commit saved before, so it can't be put back automatically." });
  });
});

describe("6. the out-of-date AI grade line", () => {
  it("shows after a switch and after an undo, and goes once the task is graded again", async () => {
    const sub = submission([savedTask()]);
    const { db, state } = fakeDb(sub);
    const gradedBefore = "2026-11-10T00:00:00.000Z";
    expect(staleAiGradeLine(sub.snapshot.tasks[0]!, gradedBefore)).toBeNull();
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    const switched = state.row.snapshot.tasks[0]!;
    expect(staleAiGradeLine(switched, gradedBefore)).toBe("This AI grade was made on PR #7, before the code was switched to PR #5. Press Regrade.");
    const regraded = "2026-11-22T13:00:00.000Z";
    expect(staleAiGradeLine(switched, regraded)).toBeNull();
    expect(staleAiGradeLine(switched, null)).toBeNull();
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, state.row, undo(state.row), options(LATER));
    const undone = state.row.snapshot.tasks[0]!;
    expect(staleAiGradeLine(undone, regraded)).toBe("This AI grade was made on PR #5, before the code was switched back to PR #7. Press Regrade.");
    expect(staleAiGradeLine(undone, "2026-11-23T09:00:00.000Z")).toBeNull();
  });

  it("the review page shows it above the rubric, from the grade's graded_at", async () => {
    const { readFileSync } = await import("node:fs");
    const review = readFileSync(new URL("../components/cse115a/instructor/SubmissionReview.tsx", import.meta.url), "utf8");
    expect(review).toContain("const staleGrade = grade ? staleAiGradeLine(task, grade.graded_at) : null;");
    expect(review.indexOf("{staleGrade ?")).toBeLessThan(review.indexOf("{RUBRIC.map((row) => {\n              const agent"));
    expect(review).toContain("<WorkPrChooser ");
    // No browser confirm anywhere in the chooser.
    const chooser = readFileSync(new URL("../components/cse115a/instructor/WorkPrChooser.tsx", import.meta.url), "utf8");
    expect(chooser).not.toMatch(/\bconfirm\(/);
    expect(chooser).toContain("disabled={busy || !previewMatches || reason.trim() === \"\"}");
  });
});

// ---- 7. Grading. ----

describe("7. grading a staff-chosen task", () => {
  async function switchedTask(): Promise<TaskSnapshot> {
    const sub = submission([savedTask()]);
    const { db, state } = fakeDb(sub);
    await runWorkPrChange(db, gitHub(defaultPrs()).reader, sub, choose(sub, 5, true), options());
    return state.row.snapshot.tasks[0]!;
  }

  it("the grader's input says the code is from the chosen PR and the task file from the submitted one; the prompt version stays v5", async () => {
    const task = await switchedTask();
    const input = graderInput(task);
    expect(input.notes).toEqual([workPrGraderNote(5, 7)]);
    expect(input.notes[0]).toBe("The code and tests below are from PR #5, which course staff chose as the PR that holds this task's work. The task file was submitted in a separate PR, #7, so it is not in this diff. Judge the code and tests in PR #5 against that task file.");
    expect(buildMessages(input)[1]!.content).toContain(`Note: ${input.notes[0]}`);
    // A paired task the student made is unchanged.
    expect(graderInput({ ...task, workPrChoice: undefined }).notes).toEqual([]);
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v5");
  });

  it("Process follows the paired rule: not task file first, flagged, and it does not blame the first commit", async () => {
    const task = await switchedTask();
    // The validation saved at Submit says the task file came first (true of PR #7, not of the code).
    expect(task.validation.specCommittedFirst).toBe(true);
    const grade = gradeProcess(task.validation, task.baseCommitSource, task.taskFileFirstCommit, { workPrNumber: 5, taskFilePrNumber: 7 });
    expect(grade).toMatchObject({ level: "none", awarded: 0, needsReview: true, source: "evidence",
      rationale: "The code is in PR #5, which course staff chose, and the task file is in a separate PR, #7. Whether the task file came before the code can't be read from one PR, so a person checks Process.",
      evidenceQuotes: ["PR merged: yes", "task file first: no", "code PR chosen by staff: #5"] });
    // Without the staff choice, the same validation is "full", as before.
    expect(gradeProcess(task.validation, task.baseCommitSource, task.taskFileFirstCommit)).toMatchObject({ level: "full" });
    const client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(["scope", "specs", "acceptance_criteria", "test_quality"].map((key) => [key, { level: "full", rationale: "ok", evidence_quotes: ["Cart totals"] }]))) } }] }) } } };
    const graded = await gradeTask(client, task, "model-x");
    expect(graded.rubric.find((row) => row.name === "Process")).toMatchObject({ level: "none", needsReview: true, rationale: workPrProcessRationale(5, 7) });
    expect(graded.rubric.find((row) => row.name === "Tests pass")).toMatchObject({ level: "none" });
  });
});

// ---- 8. Texts and the store's paths. ----

describe("8. page texts", () => {
  it("say what staff did, in the page's words", () => {
    const task = savedTask({ prNumber: 5, taskFilePr: { url: "u", number: 7, mergeSha: "s" } });
    const choice = {
      prNumber: 5, prUrl: "u5", chosenBy: "ta-one@ucsc.edu", chosenAt: NOW, reason: "Code merged in #5.", replacedPrNumber: 7,
      before: { prNumber: 7, prUrl: "u7", taskFilePr: null, prTaskFiles: null, mergeCommitSha: "m", baseCommit: "b", baseCommitSource: "merge_base", headCommit: null, diffEnd: null, files: [], diffBytes: 0, diffTruncated: false },
    };
    const chosen = { ...task, workPrChoice: choice };
    expect(workPrChoiceLine(chosen)).toBe("Code from PR #5, chosen by staff on Nov 22, 2026. The student submitted PR #7, which holds the task file.");
    expect(workPrHeaderLine(chosen)).toBe("Paired by staff: the code is from PR #5, which staff chose, and the task file is from PR #7, which the student submitted.");
    expect(workPrReasonLine(choice)).toBe("Reason, from ta-one@ucsc.edu: Code merged in #5.");
    expect(getTheCodeChoiceNote(chosen)).toBe("These commands check out the merge commit of PR #5, which staff chose as the PR that holds this task's code. The task file is in PR #7.");
    expect(workPrUndoneLine({ undoneBy: "ta-two@ucsc.edu", undoneAt: LATER, prNumber: 5, backToPrNumber: 7 })).toBe("Staff chose PR #5 for the code; ta-two@ucsc.edu undid it on Nov 23, 2026.");
    expect(choiceDate("not a date")).toBe("not a date");
    expect(previewSummary(9, 1, 0, 1)).toBe("PR #9 changes 1 file: 0 test files and 1 source file.");
    expect(benchmarkOutcomeLine(9, "replace", "candidate")).toBe("Its benchmark row will be rebuilt from PR #9 and stay a candidate.");
    expect(benchmarkOutcomeLine(9, "back_to_candidate", "rejected")).toBe("Its benchmark row is rejected; it will be rebuilt from PR #9 and go back to candidate.");
  });

  it("the store lists each task's slot, repository, PR and task-file PR without loading diffs", () => {
    expect(WORK_PR_TASK_PATHS).toContain("s1:snapshot->tasks->0->slot,r1:snapshot->tasks->0->repoFullName,p1:snapshot->tasks->0->prNumber,f1:snapshot->tasks->0->taskFilePr->number");
    expect(WORK_PR_TASK_PATHS).not.toContain("diff");
    expect(submissionTaskRefs({ id: "s", user_id: "u", assignment_number: 2, s1: 1, r1: REPO, p1: 4, f1: null, s2: 3, r2: REPO, p2: 8, f2: 6, s3: null })).toEqual([
      { source: "submission", submissionId: "s", userId: "u", assignmentNumber: 2, slot: 1, repoFullName: REPO, prNumber: 4, taskFilePrNumber: null },
      { source: "submission", submissionId: "s", userId: "u", assignmentNumber: 2, slot: 3, repoFullName: REPO, prNumber: 8, taskFilePrNumber: 6 },
    ]);
  });
});
