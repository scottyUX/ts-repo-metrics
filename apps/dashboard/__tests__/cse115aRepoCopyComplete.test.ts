// #298, Brief 15 B: a complete repo copy keeps the PR's own commits. Real git; a local repository
// stands in for github.com, with GitHub's refs/pull/<n>/head refs and merge commits whose branches are
// deleted (as after a merged PR), and a folder stands in for the bucket.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyStatus, copyTaskRepo, type RepoCopyResult, type RepoCopyTask } from "@/lib/cse115a/benchmark/repoCopy";
import { copyTaskViews } from "@/lib/cse115a/benchmark/repoCopyJobs";
import { bundleRepo, run, type GitAccess } from "@/lib/cse115a/benchmark/validation/runRow";
import { findBundle, recordSnapshot, rowCheckout, snapshotPath } from "@/lib/cse115a/benchmark/validation/snapshots";
import { bucketSnapshotStore, fullSnapshotObject, legacySnapshotObject, snapshotObject } from "@/lib/cse115a/benchmark/validation/snapshotStore";
import type { GitHubAppConfig } from "@/lib/cse115a/githubAppToken";
import { snapshotCopyRefs } from "@/lib/cse115a/jobs/benchmarkSave";
import { supabaseJobStore } from "@/lib/cse115a/jobs/supabaseStore";
import type { SupabaseClient } from "@supabase/supabase-js";
import { folderBucket } from "./helpers/folderBucket";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
const TOKEN = "ghs_secretInstallationToken456";
const CONFIG: GitHubAppConfig = { appId: "1", privateKey: "unused", slug: "course-app" };
const GONE = "0123456789abcdef0123456789abcdef01234567";
let scratch = "";
let github = "";
/** The task's start, the task-file PR's head and merge, the PR's head and merge. */
const c = { base: "", taskFileHead: "", taskFileMerge: "", head: "", merge: "" };

async function commit(repo: string, file: string, text: string, message: string): Promise<string> {
  await writeFile(join(repo, file), text);
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", message], repo);
  return (await run("git", ["rev-parse", "HEAD"], repo)).trim();
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-repo-copy-complete-"));
  github = join(scratch, "github");
  const repo = join(scratch, "work");
  await mkdir(join(repo, "docs"), { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  c.base = await commit(repo, "a.txt", "one\n", "base");
  // The task file in its own PR (number 6), merged with a merge commit, branch deleted.
  await run("git", ["checkout", "-qb", "task-file"], repo);
  c.taskFileHead = await commit(repo, "docs/T-1.md", "# Task\n", "task file");
  await run("git", ["checkout", "-q", "main"], repo);
  await run("git", [...GIT_ID, "merge", "-q", "--no-ff", "task-file", "-m", "merge task file"], repo);
  c.taskFileMerge = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  // The task's PR (number 7), merged with a merge commit, branch deleted.
  await run("git", ["checkout", "-qb", "feature"], repo);
  c.head = await commit(repo, "a.txt", "two\n", "the change");
  await run("git", ["checkout", "-q", "main"], repo);
  await run("git", [...GIT_ID, "merge", "-q", "--no-ff", "feature", "-m", "merge the change"], repo);
  c.merge = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await run("git", ["branch", "-qD", "feature", "task-file"], repo);
  const bare = join(github, "team", "private-app.git");
  await run("git", ["clone", "-q", "--bare", repo, bare]);
  await run("git", ["update-ref", "refs/pull/6/head", c.taskFileHead], bare);
  await run("git", ["update-ref", "refs/pull/7/head", c.head], bare);
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

/** GitHub in a box, as in cse115aRepoCopy.test.ts: the private repository needs the token. */
function standIn(options: { gitError?: (args: string[]) => string | null } = {}) {
  const urls: string[] = [];
  const git: typeof run = async (cmd, args, cwd, runOptions) => {
    if (!args.some((arg) => arg === "clone" || arg === "fetch")) return run(cmd, args, cwd, runOptions);
    const custom = options.gitError?.(args);
    if (custom) throw new Error(`git ${args.join(" ")} exited 128\n${custom}`);
    const mapped = args.map((arg) => {
      const m = arg.match(/^https:\/\/(?:x-access-token:([^@]+)@)?github\.com\/(.+)\.git$/);
      if (!m) return arg;
      urls.push(arg);
      if (m[1] !== TOKEN) throw new Error(`git ${args.join(" ")} exited 128\nremote: Repository not found.`);
      return join(github, `${m[2]}.git`);
    });
    return run(cmd, mapped, cwd, runOptions);
  };
  const access: GitAccess = { config: () => CONFIG, token: async () => TOKEN, git };
  return { urls, access };
}

async function setup() {
  const files = folderBucket(await mkdtemp(join(scratch, "bucket-")));
  const tmp = await mkdtemp(join(scratch, "tmp-"));
  return { files, store: bucketSnapshotStore(files), tmp };
}

const task = (extra: Partial<RepoCopyTask> = {}): RepoCopyTask => ({ instance_id: "team__private-app-T-1", repo: "team/private-app", base_commit: c.base, ...extra });

function collect() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

/** The refs a bundle lists, as `ref -> commit`. */
async function bundleRefs(file: string): Promise<Record<string, string>> {
  const out = (await run("git", ["bundle", "list-heads", file])).trim().split("\n").filter(Boolean);
  return Object.fromEntries(out.map((line) => line.split(/\s+/).reverse() as [string, string]));
}

/** Clones every ref of a bundle and says which of the commits are in it. */
async function commitsIn(file: string, commits: string[]): Promise<boolean[]> {
  const dir = await mkdtemp(join(scratch, "restore-"));
  await run("git", ["clone", "-q", "--mirror", file, join(dir, "r.git")]);
  return Promise.all(commits.map((sha) => run("git", ["cat-file", "-e", `${sha}^{commit}`], join(dir, "r.git")).then(() => true, () => false)));
}

/** The stored copy, downloaded from the folder bucket. */
const storedFile = (dir: string, t = task()) => join(dir, fullSnapshotObject(t.instance_id, t.base_commit));

describe("#298 Brief 15 B: a complete copy keeps the PR's own commits", () => {
  it("1. fetches the PR head and the merge commit into refs/hecate/*, bundles them with the base, and stores it under the .full name", async () => {
    const { files, store, tmp } = await setup();
    const { lines, log } = collect();
    const t = task({ pr_number: 7, merge_commit: c.merge });
    expect(await copyTaskRepo(t, { store, access: standIn().access, tmp, log })).toEqual({ instance_id: t.instance_id, outcome: "stored" });
    expect(await files.names()).toEqual([`team__private-app-T-1.${c.base.slice(0, 12)}.full.bundle`]);
    expect(await bundleRefs(storedFile(files.dir))).toEqual({
      "refs/heads/hecate-snapshot": c.base, "refs/hecate/pr-head": c.head, "refs/hecate/merge": c.merge,
    });
    expect(await commitsIn(storedFile(files.dir), [c.base, c.head, c.merge])).toEqual([true, true, true]);
    expect(lines.at(-1)).toMatch(/^team__private-app-T-1: stored in \d+(\.\d)? s$/);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("2. a paired task also gets the task-file PR's head", async () => {
    const { files, store, tmp } = await setup();
    const t = task({ pr_number: 7, merge_commit: c.merge, task_file_pr_number: 6 });
    expect(await copyTaskRepo(t, { store, access: standIn().access, tmp })).toMatchObject({ outcome: "stored" });
    expect(await bundleRefs(storedFile(files.dir))).toEqual({
      "refs/heads/hecate-snapshot": c.base, "refs/hecate/pr-head": c.head, "refs/hecate/merge": c.merge, "refs/hecate/task-file-pr-head": c.taskFileHead,
    });
    expect(await commitsIn(storedFile(files.dir), [c.base, c.head, c.merge, c.taskFileHead])).toEqual([true, true, true, true]);
  });

  it("3. a PR head, then a merge commit, that GitHub no longer has: stored without it, the log line naming the ref", async () => {
    const noHead = await setup();
    const head = collect();
    expect(await copyTaskRepo(task({ pr_number: 99, merge_commit: c.merge }), { store: noHead.store, access: standIn().access, tmp: noHead.tmp, log: head.log })).toEqual({
      instance_id: "team__private-app-T-1", outcome: "stored", missing: ["refs/hecate/pr-head (refs/pull/99/head is not on GitHub)"],
    });
    expect(head.lines.at(-1)).toMatch(/^team__private-app-T-1: stored in \d+(\.\d)? s; stored without refs\/hecate\/pr-head \(refs\/pull\/99\/head is not on GitHub\)$/);
    expect(await bundleRefs(storedFile(noHead.files.dir))).toEqual({ "refs/heads/hecate-snapshot": c.base, "refs/hecate/merge": c.merge });

    const noMerge = await setup();
    const merge = collect();
    expect(await copyTaskRepo(task({ pr_number: 7, merge_commit: GONE }), { store: noMerge.store, access: standIn().access, tmp: noMerge.tmp, log: merge.log })).toMatchObject({
      outcome: "stored", missing: ["refs/hecate/merge (the merge commit 0123456789ab is not on GitHub)"],
    });
    expect(merge.lines.at(-1)).toContain("; stored without refs/hecate/merge (the merge commit 0123456789ab is not on GitHub)");
    expect(await bundleRefs(storedFile(noMerge.files.dir))).toEqual({ "refs/heads/hecate-snapshot": c.base, "refs/hecate/pr-head": c.head });

    // Only the base commit is required: without it the copy fails as before, and nothing is stored.
    const noBase = await setup();
    expect(await copyTaskRepo(task({ base_commit: GONE, pr_number: 7, merge_commit: c.merge }), { store: noBase.store, access: standIn().access, tmp: noBase.tmp })).toEqual({
      instance_id: "team__private-app-T-1", outcome: "failed", reason: "base_missing",
      line: "The base commit 0123456789ab is not in team/private-app on GitHub (it may have been force-pushed away).",
    });
    expect(await noBase.files.names()).toEqual([]);
    expect(await readdir(noBase.tmp)).toEqual([]);
  });

  it("3b. any other GitHub failure fetching a PR ref fails the copy (a retry can make it whole); nothing is stored", async () => {
    const { files, store, tmp } = await setup();
    const unreachable = standIn({ gitError: (args) => (args.some((a) => a.startsWith("refs/pull/")) ? "fatal: unable to access 'https://github.com/team/private-app.git/': Could not resolve host: github.com" : null) });
    expect(await copyTaskRepo(task({ pr_number: 7 }), { store, access: unreachable.access, tmp })).toMatchObject({ outcome: "failed", reason: "github" });
    expect(await files.names()).toEqual([]);
  });

  it("4. a task with only an old-format copy counts as missing and gets a .full copy; the old objects stay; a .full copy counts as stored", async () => {
    const { files, store, tmp } = await setup();
    const t = task({ pr_number: 7, merge_commit: c.merge });
    await writeFile(join(files.dir, snapshotObject(t.instance_id, c.base)), "base-only copy");
    await writeFile(join(files.dir, legacySnapshotObject(t.instance_id)), "legacy copy");
    const before = await copyStatus([t], store);
    expect(before[0]!.stored).toBe(false);
    expect(copyTaskViews([{ ...before[0]!, assignment_submission_id: "sub-1" }], new Map())[0]!.state).toBe("missing");

    expect(await copyTaskRepo(t, { store, access: standIn().access, tmp })).toMatchObject({ outcome: "stored" });
    expect(await files.names()).toEqual([legacySnapshotObject(t.instance_id), fullSnapshotObject(t.instance_id, c.base), snapshotObject(t.instance_id, c.base)].sort());
    expect(await readFile(join(files.dir, snapshotObject(t.instance_id, c.base)), "utf8")).toBe("base-only copy");
    const after = await copyStatus([t], store);
    expect(after[0]!.stored).toBe(true);
    expect(copyTaskViews([{ ...after[0]!, assignment_submission_id: "sub-1" }], new Map())[0]!.state).toBe("stored");
    // A second copy is "already stored" and clones nothing.
    const again = standIn();
    expect(await copyTaskRepo(t, { store, access: again.access, tmp })).toEqual({ instance_id: t.instance_id, outcome: "already stored" });
    expect(again.urls).toEqual([]);
  });

  it("5. the validator restores a .full copy (findBundle, then rowCheckout when GitHub fails) at the base commit", async () => {
    const { files, store, tmp } = await setup();
    const t = task({ pr_number: 7, merge_commit: c.merge, task_file_pr_number: 6 });
    await copyTaskRepo(t, { store, access: standIn().access, tmp });
    const out = await mkdtemp(join(scratch, "out-"));
    const lines: string[] = [];
    const checkout = await rowCheckout({
      out, row: t, clones: new Map(), log: (l) => lines.push(l),
      git: { clone: async () => { throw new Error("clone failed: remote: Repository not found."); } }, store,
    });
    expect(checkout).toMatchObject({ source: "snapshot", repoDir: join(out, "repos-from-snapshot", t.instance_id) });
    expect((await run("git", ["rev-parse", "HEAD"], checkout.repoDir)).trim()).toBe(c.base);
    expect(files.calls.filter((call) => call.startsWith("download"))).toEqual([`download ${fullSnapshotObject(t.instance_id, c.base)}`]);
    // An object under the .full name that lacks the base commit (another history) is still refused.
    const wrong = await setup();
    const stranger = await mkdtemp(join(scratch, "stranger-"));
    await run("git", ["init", "-q", "-b", "main"], stranger);
    await commit(stranger, "x.txt", "x\n", "x");
    await bundleRepo(stranger, "HEAD", storedFile(wrong.files.dir));
    const refused = await mkdtemp(join(scratch, "out-"));
    const log: string[] = [];
    expect(await findBundle(refused, t, { store: wrong.store, log: (l) => log.push(l) })).toBeNull();
    expect(log.some((l) => l.includes("failed the check and was deleted"))).toBe(true);
    expect(await readdir(join(refused, "snapshots"))).toEqual([]);
  });

  it("8. the validator's own snapshot bundles are byte-identical to today's (same git commands, same bytes)", async () => {
    const repo = join(scratch, "validator-clone");
    await run("git", ["clone", "-q", join(github, "team", "private-app.git"), repo]);
    const commands: string[][] = [];
    const spy: typeof run = (cmd, args, cwd, options) => { commands.push(args); return run(cmd, args, cwd, options); };
    const ours = join(scratch, "ours.bundle");
    await bundleRepo(repo, c.base, ours, spy);
    expect(commands).toEqual([
      ["update-ref", "refs/heads/hecate-snapshot", c.base],
      ["bundle", "create", ours, "refs/heads/hecate-snapshot"],
      ["update-ref", "-d", "refs/heads/hecate-snapshot"],
    ]);
    // Today's bundle, by hand with the same commands, and the --snapshots path (recordSnapshot).
    const today = join(scratch, "today.bundle");
    await run("git", ["update-ref", "refs/heads/hecate-snapshot", c.base], repo);
    await run("git", ["bundle", "create", today, "refs/heads/hecate-snapshot"], repo);
    await run("git", ["update-ref", "-d", "refs/heads/hecate-snapshot"], repo);
    const out = await mkdtemp(join(scratch, "out-"));
    expect(await recordSnapshot(out, { instance_id: "X-1", base_commit: c.base }, repo, true, () => {})).toBe(snapshotPath("X-1"));
    const expected = await readFile(today);
    expect(await readFile(ours)).toEqual(expected);
    expect(await readFile(join(out, snapshotPath("X-1")))).toEqual(expected);
    expect(Object.keys(await bundleRefs(ours))).toEqual(["refs/heads/hecate-snapshot"]);
  });

  it("9. the token is in no log line, failure line or result, through the new fetches too", async () => {
    const { lines, log } = collect();
    const results: RepoCopyResult[] = [];
    for (const extra of [{ pr_number: 99, merge_commit: GONE, task_file_pr_number: 98 }, { pr_number: 7, merge_commit: c.merge, task_file_pr_number: 6 }]) {
      const { store, tmp } = await setup();
      results.push(await copyTaskRepo(task(extra), { store, access: standIn().access, tmp, log }));
    }
    // A failure whose git message carries the URL with the token in it.
    const leaky = standIn({ gitError: (args) => (args.some((a) => a.startsWith("refs/pull/")) ? `fatal: unable to access '${args.find((a) => a.includes("github.com"))}/': The requested URL returned error: 500` : null) });
    const { store, tmp } = await setup();
    results.push(await copyTaskRepo(task({ pr_number: 7 }), { store, access: leaky.access, tmp, log }));
    expect(results.at(-1)).toMatchObject({ outcome: "failed", reason: "github" });
    expect(results[0]).toMatchObject({ outcome: "stored", missing: expect.arrayContaining([expect.stringContaining("refs/hecate/task-file-pr-head")]) });
    const everything = JSON.stringify(results) + lines.join("\n");
    expect(everything).toContain("https://***@github.com/team/private-app.git");
    expect(everything).not.toContain(TOKEN);
  });
});

describe("#298 Brief 15 B: what a copy task knows", () => {
  const snapshot = {
    tasks: [
      { slot: 1, prNumber: 7, pr: { mergeCommitSha: "a".repeat(40) } },
      { slot: 2, prNumber: 8, pr: { mergeCommitSha: "b".repeat(40) }, taskFilePr: { url: "https://github.com/team/app/pull/6", number: 6, mergeSha: "c".repeat(40) } },
    ],
  };

  it("6. snapshotCopyRefs reads the task in the source's slot; a snapshot without them gives none", () => {
    expect(snapshotCopyRefs(snapshot, 1)).toEqual({ pr_number: 7, merge_commit: "a".repeat(40) });
    expect(snapshotCopyRefs(snapshot, 2)).toEqual({ pr_number: 8, merge_commit: "b".repeat(40), task_file_pr_number: 6 });
    expect(snapshotCopyRefs(snapshot, 3)).toEqual({});
    expect(snapshotCopyRefs({ tasks: [{ slot: 1 }] }, 1)).toEqual({});
    expect(snapshotCopyRefs(null, 1)).toEqual({});
    expect(snapshotCopyRefs({}, 1)).toEqual({});
  });

  /** A Supabase client that answers the three reads loadSubmissionCopyTasks makes. */
  function fakeDb(answers: Record<string, unknown>): SupabaseClient {
    return {
      from(table: string) {
        const result = { data: answers[table] ?? null, error: null };
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "in", "order"]) chain[method] = () => chain;
        chain.maybeSingle = async () => result;
        chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  it("6. loadSubmissionCopyTasks fills the new fields from the submission snapshot, matched by slot, and leaves them out without one", async () => {
    const answers = {
      cse_benchmark_task_sources: [{ instance_id: "team__app-T-1", task_slot: 1 }, { instance_id: "team__app-T-2", task_slot: 2 }],
      cse_benchmark_tasks: [{ instance_id: "team__app-T-2", repo: "team/app", base_commit: "d".repeat(40) }, { instance_id: "team__app-T-1", repo: "team/app", base_commit: "e".repeat(40) }],
    };
    const store = supabaseJobStore(fakeDb({ ...answers, cse_assignment_submissions: { snapshot } }));
    expect(await store.loadSubmissionCopyTasks!("sub-1")).toEqual([
      { instance_id: "team__app-T-1", repo: "team/app", base_commit: "e".repeat(40), pr_number: 7, merge_commit: "a".repeat(40) },
      { instance_id: "team__app-T-2", repo: "team/app", base_commit: "d".repeat(40), pr_number: 8, merge_commit: "b".repeat(40), task_file_pr_number: 6 },
    ]);
    const bare = supabaseJobStore(fakeDb({ ...answers, cse_assignment_submissions: { snapshot: { tasks: [] } } }));
    expect(await bare.loadSubmissionCopyTasks!("sub-1")).toEqual([
      { instance_id: "team__app-T-1", repo: "team/app", base_commit: "e".repeat(40) },
      { instance_id: "team__app-T-2", repo: "team/app", base_commit: "d".repeat(40) },
    ]);
  });
});
