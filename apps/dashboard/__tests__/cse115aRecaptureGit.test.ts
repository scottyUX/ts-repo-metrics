import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRecapture } from "@/lib/cse115a/benchmark/recapture";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { recaptureTaskDiff, type TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

// #418 on a real git history (a temporary repository, no network), like cse115aPrOwnDiffGit.test.ts: a task
// saved on the rule before #382, whose diff runs from the PR's first commit to the merge commit and so holds a
// teammate's file, is re-captured and becomes the PR's own files. GitHub's compare `A...B` is the diff from
// `git merge-base A B` to B, and the fake GitHub answers every compare that way. Names are made up.

const exec = promisify(execFile);
let dir: string;
const env = () => ({ ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, ".gitconfig-none"), GIT_TERMINAL_PROMPT: "0" });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hecate-recapture-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const files = (diff: string) => parseDiffFiles(diff).map((file) => file.path).sort();
const TASK = "docs/tasks/sprint-1/US-1-T-1.md";

describe("re-capturing an old-rule task on a real git history", () => {
  it("the old diff holds a teammate's file; the re-captured diff is the PR's own files, and only the diff fields change", async () => {
    const repo = join(dir, "repo");
    await mkdir(repo);
    const git = async (...args: string[]) => (await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, env: env() })).stdout.trim();
    const commit = async (paths: string[], message: string) => {
      for (const path of paths) {
        await mkdir(dirname(join(repo, path)), { recursive: true });
        await writeFile(join(repo, path), `${path} ${message}\n`);
      }
      await git("add", "--", ...paths);
      await git("commit", "-q", "-m", message);
      return git("rev-parse", "HEAD");
    };
    await git("init", "-q", "-b", "main");
    await commit(["README.md"], "start");
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

    const mergeBase = (a: string, b: string) => git("merge-base", a, b);
    const gh: GitHubReader = {
      async json<T>(path: string) {
        if (/\/pulls\/\d+$/.test(path)) {
          return { title: "US-1-T-1", body: "", merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: merge, base: { sha: base }, head: { ref: "task", sha: head }, user: { login: "student" } } as T;
        }
        const compare = path.match(/\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/);
        if (compare) return { merge_base_commit: { sha: await mergeBase(compare[1]!, compare[2]!) } } as T;
        if (path.includes("/commits?per_page=1")) return [{ sha: first }] as T;
        const one = path.match(/\/commits\/([0-9a-f]{40})$/);
        if (one) return { files: (await git("show", "--name-only", "--format=", one[1]!)).split("\n").filter(Boolean).map((filename) => ({ filename })) } as T;
        throw new Error(`unexpected ${path}`);
      },
      async text(path: string) {
        const compare = path.match(/\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/);
        if (!compare) throw new Error(`unexpected ${path}`);
        return `${await git("diff", "--no-color", await mergeBase(compare[1]!, compare[2]!), compare[2]!)}\n`;
      },
    };

    // What Submit saved before #382: first commit (task file first) to the merge commit, no diffEnd.
    const oldDiff = `${await git("diff", "--no-color", first, merge)}\n`;
    const saved: TaskSnapshot = {
      slot: 1, taskId: "US-1-T-1", prUrl: "https://github.com/team/proj/pull/7", repoFullName: "team/proj", prNumber: 7, taskPath: TASK,
      specMarkdown: "# Task\n", spec: { id: "US-1-T-1", estimateHours: 3 } as TaskSpec, validation: { prMerged: true, specCommittedFirst: true },
      analysisResultId: "result-1",
      pr: { title: "US-1-T-1", body: "", headRef: "task", author: "student", mergedAt: "2026-10-01T00:00:00Z", baseSha: base, mergeCommitSha: merge },
      baseCommit: first, baseCommitSource: "first_commit",
      diff: oldDiff, diffBytes: Buffer.byteLength(oldDiff), diffTruncated: false, diffError: null,
      comments: [{ kind: "review", author: "teammate", body: "Approved", createdAt: null }], checks: [],
    };
    expect(files(saved.diff)).toEqual(["src/__tests__/cart.test.ts", "src/cart.ts", "src/teammate.ts"]);

    const result = await recaptureTaskDiff(gh, saved);
    expect(result.ok).toBe(true);
    const task = (result as { task: TaskSnapshot }).task;
    expect(task).toMatchObject({ baseCommit: base, baseCommitSource: "merge_base", headCommit: head, diffEnd: "head", diffError: null, taskFileFirstCommit: true });
    expect(files(task.diff)).toEqual([TASK, "src/__tests__/cart.test.ts", "src/cart.ts"]);
    expect({ ...task, baseCommit: 0, baseCommitSource: 0, headCommit: 0, diffEnd: 0, taskFileFirstCommit: 0, diff: 0, diffBytes: 0, diffTruncated: 0, diffError: 0 })
      .toEqual({ ...saved, baseCommit: 0, baseCommitSource: 0, headCommit: 0, diffEnd: 0, taskFileFirstCommit: 0, diff: 0, diffBytes: 0, diffTruncated: 0, diffError: 0 });

    const { plan, writes } = planRecapture({
      submission: { id: "sub-1", course_id: "c", user_id: "u", assignment_number: 1, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "2026-10-02T00:00:00.000Z", tasks: [saved] } },
      recaptured: new Map([[1, result]]), sources: [], storedTasks: [], repoMetrics: new Map(), studentEmail: null, now: "2026-11-20T00:00:00.000Z",
    });
    expect(plan.tasks[0]).toMatchObject({ filesRemoved: ["src/teammate.ts"], filesAdded: [TASK], codeChanged: true, action: "replace" });
    const row = writes.tasks[0]!;
    expect(row.base_commit).toBe(base);
    expect([...files(row.patch), ...files(row.test_patch)].sort()).toEqual(["src/__tests__/cart.test.ts", "src/cart.ts"]);
  });
});
