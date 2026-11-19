import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { captureTaskSnapshot, type SubmittedTaskRow } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

// #382 on real git histories (a temporary repository, no network). GitHub's compare `A...B` is the diff from
// `git merge-base A B` to B, so the fake GitHub below answers every compare that way, and the snapshot is taken by
// the real captureTaskSnapshot. Names are made up.

const exec = promisify(execFile);
let dir: string;
let n = 0;
const env = () => ({ ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, ".gitconfig-none"), GIT_TERMINAL_PROMPT: "0" });

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
  return { repo, git, commit };
}

type Git = Awaited<ReturnType<typeof newRepo>>["git"];

/** GitHub, read from the local repository: the PR, its first commit, and every compare as `merge-base...B`. */
function gitHub(git: Git, pull: { base: string; head: string; merge: string; first: string }): GitHubReader {
  const mergeBase = (a: string, b: string) => git("merge-base", a, b);
  return {
    async json<T>(path: string) {
      if (/\/pulls\/\d+$/.test(path)) {
        return { title: "US-1-T-1", body: "", merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: pull.merge, base: { sha: pull.base }, head: { ref: "US-1-T-1", sha: pull.head }, user: { login: "student" } } as T;
      }
      const compare = path.match(/\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/);
      if (compare) return { merge_base_commit: { sha: await mergeBase(compare[1]!, compare[2]!) } } as T;
      if (path.includes("/commits?per_page=1")) return [{ sha: pull.first }] as T;
      const commit = path.match(/\/commits\/([0-9a-f]{40})$/);
      if (commit) return { files: (await git("show", "--name-only", "--format=", commit[1]!)).split("\n").filter(Boolean).map((filename) => ({ filename })) } as T;
      if (path.endsWith("/status")) return { statuses: [] } as T;
      if (path.includes("/check-runs")) return { check_runs: [] } as T;
      return [] as T;
    },
    async text(path: string) {
      const compare = path.match(/\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/);
      if (!compare) throw new Error(`unexpected ${path}`);
      return `${await git("diff", "--no-color", await mergeBase(compare[1]!, compare[2]!), compare[2]!)}\n`;
    },
  };
}

function row(taskPath: string, taskId = "US-1-T-1"): SubmittedTaskRow {
  return {
    task_slot: 1, task_id: taskId, pr_url: "https://github.com/team/proj/pull/7", repo_full_name: "team/proj", pr_number: 7,
    task_path: taskPath, task_spec_markdown: "# Task\n", task_spec_json: { id: taskId, estimateHours: 3 } as TaskSpec,
    validation_json: { prMerged: true, specCommittedFirst: true }, analysis_result_id: "result-1",
  };
}

const files = (diff: string) => parseDiffFiles(diff).map((file) => file.path).sort();

/** Today's range before #382, for comparison: the PR's first commit (task file first) to the merge commit. */
async function oldRange(git: Git, first: string, merge: string) {
  return files(await git("diff", "--no-color", first, merge));
}

const TASK = "docs/tasks/sprint-1/US-1-T-1.md";
const OWN = [TASK, "src/__tests__/cart.test.ts", "src/cart.ts"];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hecate-pr-own-diff-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("4. the merge-base range on real git histories", () => {
  it("the branch merges main in part-way: only the task's files; today's range also holds the teammate's file", async () => {
    const { git, commit } = await newRepo();
    await git("checkout", "-q", "-b", "task");
    const first = await commit([TASK], "task file");
    await git("checkout", "-q", "main");
    await commit(["src/teammate.ts"], "teammate's work on main");
    const base = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "task");
    await git("merge", "-q", "--no-ff", "-m", "merge main into task", "main");
    await commit(["src/cart.ts", "src/__tests__/cart.test.ts"], "code and test");
    const head = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "main");
    await git("merge", "-q", "--no-ff", "-m", "merge the PR", "task");
    const merge = await git("rev-parse", "HEAD");

    const task = await captureTaskSnapshot(gitHub(git, { base, head, merge, first }), row(TASK));
    expect(task).toMatchObject({ baseCommit: base, baseCommitSource: "merge_base", headCommit: head, diffEnd: "head", diffError: null });
    expect(files(task.diff)).toEqual(OWN);
    expect(await oldRange(git, first, merge)).toEqual([...OWN.slice(1), "src/teammate.ts"].sort());
    // The task file is the problem statement, so the row leaves it out.
    const built = buildInstance(task, 1, null);
    expect([...files(built.instance.patch), ...files(built.instance.test_patch)].sort()).toEqual(["src/__tests__/cart.test.ts", "src/cart.ts"]);
    expect(built.instance.base_commit).toBe(base);
  });

  it("the branch never merges main: only the task's files; today's range also holds the teammate's file", async () => {
    const { git, commit } = await newRepo();
    await git("checkout", "-q", "-b", "task");
    const first = await commit([TASK], "task file");
    await commit(["src/cart.ts", "src/__tests__/cart.test.ts"], "code and test");
    const head = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "main");
    const start = await git("rev-parse", "HEAD");
    await commit(["src/teammate.ts"], "teammate's work on main");
    const base = await git("rev-parse", "HEAD");
    await git("merge", "-q", "--no-ff", "-m", "merge the PR", "task");
    const merge = await git("rev-parse", "HEAD");

    const task = await captureTaskSnapshot(gitHub(git, { base, head, merge, first }), row(TASK));
    expect(task).toMatchObject({ baseCommit: start, baseCommitSource: "merge_base", headCommit: head });
    expect(files(task.diff)).toEqual(OWN);
    expect(await oldRange(git, first, merge)).toEqual([...OWN.slice(1), "src/teammate.ts"].sort());
  });

  it("a stacked PR (based on another task's branch) holds only its own commits", async () => {
    const { git, commit } = await newRepo();
    const taskA = "docs/tasks/sprint-1/US-1-T-2.md";
    await git("checkout", "-q", "-b", "task-a");
    await commit([taskA], "task A file");
    await commit(["src/a.ts"], "task A code");
    const base = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "-b", "task-b");
    const first = await commit([TASK], "task B file");
    await commit(["src/cart.ts", "src/__tests__/cart.test.ts"], "task B code and test");
    const head = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "task-a");
    await git("merge", "-q", "--no-ff", "-m", "merge task B into task A", "task-b");
    const merge = await git("rev-parse", "HEAD");

    const task = await captureTaskSnapshot(gitHub(git, { base, head, merge, first }), row(TASK));
    expect(task).toMatchObject({ baseCommit: base, baseCommitSource: "merge_base" });
    expect(files(task.diff)).toEqual(OWN);
    expect(files(task.diff)).not.toContain("src/a.ts");
  });
});
