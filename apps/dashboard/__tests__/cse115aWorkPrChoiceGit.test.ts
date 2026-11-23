// #431 on real git histories (a temporary repository, no network): a task whose submitted PR holds only its task
// file, with the code merged in an earlier PR. GitHub's compare `A...B` is the diff from `git merge-base A B` to B,
// so the fake GitHub below answers every compare that way; the preview and the apply are the real ones, against a
// fake database. Names, repos and PR numbers are made up.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { runWorkPrChange, type WorkPrDb } from "@/lib/cse115a/benchmark/workPrChoice";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import { captureTaskSnapshot, type SubmissionSnapshot, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const exec = promisify(execFile);
let dir: string;
let n = 0;
const env = () => ({ ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, ".gitconfig-none"), GIT_TERMINAL_PROMPT: "0" });

const REPO = "team-sigma/garden";
const STUDENT = "student-sigma";
const TASK = "docs/tasks/sprint-2/US-2-T-4.md";
const CODE = ["src/__tests__/water.test.ts", "src/water.ts"];

async function newRepo() {
  const repo = join(dir, `repo${++n}`);
  await mkdir(repo);
  const git = async (...args: string[]) => (await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, env: env() })).stdout.trim();
  const commit = async (files: string[], message: string) => {
    for (const file of files) {
      await mkdir(dirname(join(repo, file)), { recursive: true });
      await writeFile(join(repo, file), `${file} ${message}\n`);
    }
    await git("add", "--", ...files);
    await git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  await git("init", "-q", "-b", "main");
  await commit(["README.md"], "start");
  return { git, commit };
}
type Git = Awaited<ReturnType<typeof newRepo>>["git"];
type GitPull = { base: string; head: string; merge: string; first: string; title: string };

/** Merges `branch` into main as a PR and returns its refs. */
async function mergePr(git: Git, branch: string, title: string): Promise<GitPull> {
  const first = (await git("rev-list", "--reverse", `main..${branch}`)).split("\n")[0]!;
  const head = await git("rev-parse", branch);
  await git("checkout", "-q", "main");
  const base = await git("rev-parse", "HEAD");
  await git("merge", "-q", "--no-ff", "-m", `merge ${branch}`, branch);
  return { base, head, merge: await git("rev-parse", "HEAD"), first, title };
}

function gitHub(git: Git, pulls: Record<number, GitPull>): GitHubReader {
  const mergeBase = (a: string, b: string) => git("merge-base", a, b);
  return {
    async json<T>(path: string) {
      const pull = /\/pulls\/(\d+)$/.exec(path);
      if (pull) {
        const item = pulls[Number(pull[1])];
        if (!item) return null;
        return { title: item.title, body: "", merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: item.merge, base: { sha: item.base }, head: { ref: item.title, sha: item.head }, user: { login: STUDENT } } as T;
      }
      const commits = /\/pulls\/(\d+)\/commits\?per_page=1/.exec(path);
      if (commits) return [{ sha: pulls[Number(commits[1])]!.first }] as T;
      const compare = /\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(path);
      if (compare) return { merge_base_commit: { sha: await mergeBase(compare[1]!, compare[2]!) } } as T;
      const commit = /\/commits\/([0-9a-f]{40})$/.exec(path);
      if (commit) return { files: (await git("show", "--name-only", "--format=", commit[1]!)).split("\n").filter(Boolean).map((filename) => ({ filename })) } as T;
      if (path.endsWith("/status")) return { statuses: [] } as T;
      if (path.includes("/check-runs")) return { check_runs: [] } as T;
      return [] as T;
    },
    async text(path: string) {
      const compare = /\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(path);
      if (!compare) throw new Error(`unexpected ${path}`);
      return `${await git("diff", "--no-color", await mergeBase(compare[1]!, compare[2]!), compare[2]!)}\n`;
    },
  };
}

const files = (diff: string) => parseDiffFiles(diff).map((file) => file.path).sort();

async function submitted(gh: GitHubReader): Promise<TaskSnapshot> {
  return captureTaskSnapshot(gh, {
    task_slot: 1, task_id: "US-2-T-4", pr_url: `https://github.com/${REPO}/pull/7`, repo_full_name: REPO, pr_number: 7, task_path: TASK,
    task_spec_markdown: "# US-2-T-4\n\nWater the plants in src/water.ts.\n", task_spec_json: { id: "US-2-T-4", estimateHours: 2 } as TaskSpec,
    validation_json: { prMerged: true, specCommittedFirst: true }, analysis_result_id: "result-1", facts_json: { prTaskFiles: [TASK] },
  });
}

function db(): { db: WorkPrDb; written: SubmissionSnapshot[] } {
  const written: SubmissionSnapshot[] = [];
  return {
    written,
    db: {
      assertBackupColumn: async () => {}, backupSnapshot: async () => "written",
      writeSnapshot: async (_id, snapshot) => { written.push(snapshot); return true; },
      writeBenchmark: async () => {}, requeueRepoCopy: async () => "inserted",
      loadBenchmarkState: async () => ({ sources: [], storedTasks: [] }), loadRepoMetrics: async () => null, loadStudentEmail: async () => null,
      loadCourseTaskRefs: async () => [],
    },
  };
}

function submission(task: TaskSnapshot): Submission {
  return { id: "sub-1", course_id: "course-1", user_id: "user-1", assignment_number: 2, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "2026-10-02T00:00:00.000Z", tasks: [task] } };
}

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "hecate-work-pr-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("#431 on real git: the chosen PR's own files", () => {
  it("the submitted PR holds only its task file and the code is in an earlier PR: the preview and the apply give that PR's files", async () => {
    const { git, commit } = await newRepo();
    await git("checkout", "-q", "-b", "water");
    await commit(["src/water.ts"], "water");
    await commit(["src/__tests__/water.test.ts"], "water test");
    const five = await mergePr(git, "water", "Water plants");
    await commit(["src/teammate.ts"], "teammate's work on main");
    await git("checkout", "-q", "-b", "task-file");
    await commit([TASK], "task file");
    const seven = await mergePr(git, "task-file", "US-2-T-4 task file");
    const gh = gitHub(git, { 5: five, 7: seven });

    const saved = await submitted(gh);
    expect(files(saved.diff)).toEqual([TASK]);
    const sub = submission(saved);
    const seen = { prNumber: 7, recapturedAt: null };
    const preview = await runWorkPrChange(db().db, gh, sub, { kind: "choose", slot: 1, pr: 5, reason: "Code merged in #5.", apply: false, seen }, { by: "ta@ucsc.edu", repoCopies: true });
    expect(preview).toMatchObject({ ok: true, body: { preview: { files: CODE, testFiles: 1, sourceFiles: 1, diffTruncated: false } } });

    const store = db();
    const applied = await runWorkPrChange(store.db, gh, sub, { kind: "choose", slot: 1, pr: 5, reason: "Code merged in #5.", apply: true, seen }, { by: "ta@ucsc.edu", repoCopies: true });
    expect(applied.ok).toBe(true);
    const task = store.written[0]!.tasks[0]!;
    expect(files(task.diff)).toEqual(CODE);
    expect(task).toMatchObject({ prNumber: 5, baseCommit: await git("merge-base", five.base, five.head), headCommit: five.head, baseCommitSource: "merge_base", taskFilePr: { number: 7, mergeSha: seven.merge } });
    const built = buildInstance(task, 2, null);
    expect(files(built.instance.patch)).toEqual(["src/water.ts"]);
    expect(files(built.instance.test_patch)).toEqual(["src/__tests__/water.test.ts"]);
    expect(built.flags).toEqual(expect.arrayContaining(["task_file_from_other_pr", "work_pr_chosen_by_staff"]));
  });

  it("a chosen PR that merged main part-way still gives only its own files", async () => {
    const { git, commit } = await newRepo();
    await git("checkout", "-q", "-b", "water");
    await commit(["src/water.ts"], "water");
    await git("checkout", "-q", "main");
    await commit(["src/teammate.ts"], "teammate's work on main");
    await git("checkout", "-q", "water");
    await git("merge", "-q", "--no-ff", "-m", "merge main into water", "main");
    await commit(["src/__tests__/water.test.ts"], "water test");
    const five = await mergePr(git, "water", "Water plants");
    await git("checkout", "-q", "-b", "task-file");
    await commit([TASK], "task file");
    const seven = await mergePr(git, "task-file", "US-2-T-4 task file");
    const gh = gitHub(git, { 5: five, 7: seven });

    const sub = submission(await submitted(gh));
    const preview = await runWorkPrChange(db().db, gh, sub, { kind: "choose", slot: 1, pr: 5, reason: "Code merged in #5.", apply: false, seen: null }, { by: "ta@ucsc.edu", repoCopies: true });
    expect(preview).toMatchObject({ ok: true, body: { preview: { files: CODE } } });
    // The range from the PR's base to its merge commit would also hold the teammate's file.
    expect(files(await git("diff", "--no-color", five.first + "^", five.merge))).toContain("src/teammate.ts");
  });
});
