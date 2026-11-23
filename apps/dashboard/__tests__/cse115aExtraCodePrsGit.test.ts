// #437 on a real git history (a temporary repository, no network): a task whose main PR holds most of the code and
// whose extra PR, merged two days later after a teammate's PR, holds the rest and the tests. GitHub's compare `A...B`
// is the diff from `git merge-base A B` to B, so the fake GitHub below answers every compare that way; the add is
// the real one, against a fake database. Names, repos and PR numbers are made up.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { runExtraPrChange } from "@/lib/cse115a/benchmark/extraCodePrs";
import type { WorkPrDb } from "@/lib/cse115a/benchmark/workPrChoice";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import { gradeTestsPass, lastMergedChecks } from "@/lib/cse115a/grader/deterministic";
import { graderInput } from "@/lib/cse115a/grader/llmGrader";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import type { Submission } from "@/lib/cse115a/jobs/runner";
import { captureTaskSnapshot, type SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

const exec = promisify(execFile);
let dir: string;
const env = () => ({ ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, ".gitconfig-none"), GIT_TERMINAL_PROMPT: "0" });

const REPO = "team-theta/greenhouse";
const STUDENT = "student-theta";
const TASK = "docs/tasks/sprint-4/US-4-T-7.md";
type GitPull = { base: string; head: string; merge: string; first: string; title: string; mergedAt: string };

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "hecate-extra-pr-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const files = (diff: string) => parseDiffFiles(diff).map((file) => file.path);

describe("#437 on real git: a main PR and one extra PR", () => {
  it("the extra PR's own diff is captured; the AI reads the main PR's then the extra PR's; the row and Tests pass are as the brief says", async () => {
    const repo = join(dir, "repo");
    await mkdir(repo);
    const git = async (...args: string[]) => (await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, env: env() })).stdout.trim();
    const write = async (file: string, text: string) => {
      await mkdir(dirname(join(repo, file)), { recursive: true });
      await writeFile(join(repo, file), text);
      await git("add", "--", file);
    };
    const merge = async (branch: string, title: string, mergedAt: string): Promise<GitPull> => {
      const first = (await git("rev-list", "--reverse", `main..${branch}`)).split("\n")[0]!;
      const head = await git("rev-parse", branch);
      await git("checkout", "-q", "main");
      const base = await git("rev-parse", "HEAD");
      await git("merge", "-q", "--no-ff", "-m", `merge ${branch}`, branch);
      return { base, head, merge: await git("rev-parse", "HEAD"), first, title, mergedAt };
    };
    await git("init", "-q", "-b", "main");
    await write("README.md", "start\n");
    await git("commit", "-q", "-m", "start");

    // PR #10, the main PR: the task file first, then most of the code.
    await git("checkout", "-q", "-b", "fan");
    await write(TASK, "# US-4-T-7: Fan\n\nAdd src/fan.ts with a speed setting.\n");
    await git("commit", "-q", "-m", "task file");
    await write("src/fan.ts", "export const speed = 1;\n");
    await git("commit", "-q", "-m", "fan");
    const ten = await merge("fan", "Fan", "2026-10-10T00:00:00Z");
    // A teammate's PR merged in between.
    await git("checkout", "-q", "-b", "door");
    await write("src/door.ts", "export const open = true;\n");
    await git("commit", "-q", "-m", "door");
    await merge("door", "Door", "2026-10-11T00:00:00Z");
    // PR #12, the extra PR, two days later: the rest of src/fan.ts and its tests.
    await git("checkout", "-q", "-b", "fan-2");
    await write("src/fan.ts", "export const speed = 1;\nexport const max = 3;\n");
    await write("src/__tests__/fan.test.ts", "it('has a max', () => expect(max).toBe(3));\n");
    await git("commit", "-q", "-m", "fan max and tests");
    const twelve = await merge("fan-2", "Fan, part two", "2026-10-12T00:00:00Z");
    const pulls: Record<number, GitPull> = { 10: ten, 12: twelve };

    const calls: string[] = [];
    const gh: GitHubReader = {
      async json<T>(path: string) {
        calls.push(path);
        const pull = /\/pulls\/(\d+)$/.exec(path);
        if (pull) {
          const item = pulls[Number(pull[1])];
          if (!item) return null;
          return { title: item.title, body: "", merged_at: item.mergedAt, merge_commit_sha: item.merge, base: { sha: item.base }, head: { ref: item.title, sha: item.head }, user: { login: STUDENT } } as T;
        }
        const commits = /\/pulls\/(\d+)\/commits\?per_page=1/.exec(path);
        if (commits) return [{ sha: pulls[Number(commits[1])]!.first }] as T;
        const compare = /\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(path);
        if (compare) return { merge_base_commit: { sha: await git("merge-base", compare[1]!, compare[2]!) } } as T;
        const commit = /\/commits\/([0-9a-f]{40})$/.exec(path);
        if (commit) return { files: (await git("show", "--name-only", "--format=", commit[1]!)).split("\n").filter(Boolean).map((filename) => ({ filename })) } as T;
        const runs = /\/commits\/([0-9a-f]{40})\/check-runs/.exec(path);
        if (runs) return { check_runs: runs[1] === twelve.merge ? [{ name: "test", status: "completed", conclusion: "success" }] : [{ name: "test", status: "completed", conclusion: "failure" }] } as T;
        if (path.endsWith("/status")) return { statuses: [] } as T;
        return [] as T;
      },
      async text(path: string) {
        calls.push(`text ${path}`);
        const compare = /\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(path);
        if (!compare) throw new Error(`unexpected ${path}`);
        return `${await git("diff", "--no-color", await git("merge-base", compare[1]!, compare[2]!), compare[2]!)}\n`;
      },
    };

    const task = await captureTaskSnapshot(gh, {
      task_slot: 1, task_id: "US-4-T-7", pr_url: `https://github.com/${REPO}/pull/10`, repo_full_name: REPO, pr_number: 10, task_path: TASK,
      task_spec_markdown: "# US-4-T-7: Fan\n\nAdd src/fan.ts with a speed setting.\n", task_spec_json: { id: "US-4-T-7", estimateHours: 2 } as TaskSpec,
      validation_json: { prMerged: true, specCommittedFirst: true }, analysis_result_id: "result-4", facts_json: { prTaskFiles: [TASK] },
    });
    expect(files(task.diff).sort()).toEqual([TASK, "src/fan.ts"]);
    const sub: Submission = { id: "sub-theta", course_id: "course-t", user_id: "user-t", assignment_number: 4, status: "graded", superseded_at: null, snapshot: { version: 1, capturedAt: "2026-10-13T00:00:00.000Z", tasks: [task] } };
    const written: SubmissionSnapshot[] = [];
    const db: WorkPrDb = {
      assertBackupColumn: async () => {}, backupSnapshot: async () => "written",
      writeSnapshot: async (_id, snapshot) => { written.push(snapshot); return true; },
      writeBenchmark: async () => {}, requeueRepoCopy: async () => "inserted",
      loadBenchmarkState: async () => ({ sources: [], storedTasks: [] }), loadRepoMetrics: async () => null, loadStudentEmail: async () => null,
      loadCourseTaskRefs: async () => [],
    };

    calls.length = 0;
    const added = await runExtraPrChange(db, gh, sub, { kind: "addExtra", slot: 1, pr: 12, reason: "The rest of the fan and its tests.", apply: true, seen: { prNumber: 10, recapturedAt: null } }, { by: "ta-theta@example.invalid", now: "2026-11-23T10:00:00.000Z" });
    expect(added).toMatchObject({ ok: true, body: { preview: { files: ["src/__tests__/fan.test.ts", "src/fan.ts"], testFiles: 1, sourceFiles: 1,
      warnings: ["PR #12 also changes src/fan.ts, which PR #10 changes too. The AI sees each PR's change to that file in turn, in merge order."] } } });
    // Five GitHub calls: the PR, its merge base, its check runs, its status and its diff.
    expect(calls).toHaveLength(5);

    const saved = written[0]!.tasks[0]!;
    const extra = saved.extraCodePrs![0]!;
    // The extra PR's own diff: not the teammate's door, not the main PR's work.
    expect(files(extra.diff).sort()).toEqual(["src/__tests__/fan.test.ts", "src/fan.ts"]);
    expect(extra).toMatchObject({ prNumber: 12, mergeCommitSha: twelve.merge, headCommit: twelve.head, baseCommit: await git("merge-base", twelve.base, twelve.head), diffEnd: "head" });
    expect(extra.diff).not.toContain("door");
    // The main PR is untouched.
    expect(saved.diff).toBe(task.diff);

    // The AI: src/fan.ts twice, the main PR's addition then PR #12's edit; the test from PR #12.
    const input = graderInput(saved);
    const fan = parseDiffFiles(input.patch).filter((file) => file.path === "src/fan.ts");
    expect(fan).toHaveLength(2);
    expect(fan[0]!.text).toContain("new file mode");
    expect(fan[0]!.text).toContain("+export const speed = 1;");
    expect(fan[1]!.text).toContain("@@ -1 +1,2 @@");
    expect(fan[1]!.text).toContain("+export const max = 3;");
    expect(files(input.testPatch)).toEqual(["src/__tests__/fan.test.ts"]);
    expect(input.notes[0]).toContain("PR #10 plus PR #12");

    // The benchmark row: the main PR only, with the flag.
    const built = buildInstance(saved, 4, null);
    expect(built.instance).toEqual(buildInstance(task, 4, null).instance);
    expect(files(built.instance.patch)).toEqual(["src/fan.ts"]);
    expect(built.instance.patch).not.toContain("max");
    expect(built.instance.test_patch).toBe("");
    expect(built.flags).toContain("extra_code_prs");

    // Tests pass: PR #12's merge commit, the last merged, holds all of the code.
    const last = lastMergedChecks(saved)!;
    expect(last.prNumber).toBe(12);
    expect(gradeTestsPass(last.checks, { prNumber: 12 })).toMatchObject({ level: "full", evidenceQuotes: ["checks read on the merge commit of PR #12", "test: success"] });
    // Checking out PR #12's merge commit gives both parts of the code and the tests.
    expect(await git("show", `${twelve.merge}:src/fan.ts`)).toBe("export const speed = 1;\nexport const max = 3;");
  });
});
