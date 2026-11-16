// #298 A: the website copies one task's repository into the snapshot store. Real git; local
// repositories stand in for github.com (a git wrapper maps the GitHub URLs onto them and refuses a
// private one without the token, as GitHub does), and a folder stands in for the bucket.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyMissing, copyStatus, copyTaskRepo, GIT_NETWORK_TIMEOUT_MS, type RepoCopyResult } from "@/lib/cse115a/benchmark/repoCopy";
import { run, type GitAccess } from "@/lib/cse115a/benchmark/validation/runRow";
import { findBundle } from "@/lib/cse115a/benchmark/validation/snapshots";
import { bucketSnapshotStore, snapshotObject, type SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";
import { CourseRepoAccessError, type GitHubAppConfig } from "@/lib/cse115a/githubAppToken";
import { folderBucket } from "./helpers/folderBucket";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
const TOKEN = "ghs_secretInstallationToken123";
const CONFIG: GitHubAppConfig = { appId: "1", privateKey: "unused", slug: "course-app" };
let scratch = "";
let github = "";
let base = "";
let later = "";

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-repo-copy-test-"));
  github = join(scratch, "github");
  // One history, served under two names: the private one and the public one.
  const repo = join(github, "team", "private-app.git");
  await mkdir(repo, { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  await writeFile(join(repo, "a.txt"), "one\n");
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await writeFile(join(repo, "a.txt"), "two\n");
  await run("git", [...GIT_ID, "commit", "-qam", "later"], repo);
  later = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await run("git", ["clone", "-q", "--bare", repo, join(github, "team", "public-app.git")]);
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

type Stand = { installed?: boolean; configured?: boolean; tokenError?: Error; gitError?: (url: string) => string | null };

/** GitHub in a box: which URLs git was given, and access that maps them onto the local repositories. */
function standIn(options: Stand = {}) {
  const urls: string[] = [];
  const git: typeof run = async (cmd, args, cwd, runOptions) => {
    // Only the commands that reach GitHub; `git remote set-url` and local commands go through as they are.
    if (!args.some((arg) => arg === "clone" || arg === "fetch" || arg === "ls-remote")) return run(cmd, args, cwd, runOptions);
    const mapped = args.map((arg) => {
      const m = arg.match(/^https:\/\/(?:x-access-token:([^@]+)@)?github\.com\/(.+)\.git$/);
      if (!m) return arg;
      urls.push(arg);
      const custom = options.gitError?.(arg);
      if (custom) throw new Error(`git ${args.join(" ")} exited 128\n${custom}`);
      // GitHub answers a private repository without the right token as if it did not exist.
      if (m[2]!.includes("private") && m[1] !== TOKEN) {
        throw new Error(`git ${args.join(" ")} exited 128\nremote: Repository not found.\nfatal: repository '${arg}/' not found`);
      }
      return join(github, `${m[2]}.git`);
    });
    return run(cmd, mapped, cwd, runOptions);
  };
  const access: GitAccess = {
    config: () => (options.configured === false ? null : CONFIG),
    token: async (owner, name) => {
      if (options.tokenError) throw options.tokenError;
      if (!options.installed) throw new CourseRepoAccessError(`The course GitHub App is not installed on ${owner}/${name}.`, "github_app_not_installed");
      return TOKEN;
    },
    git,
  };
  return { urls, access };
}

async function setup() {
  const files = folderBucket(await mkdtemp(join(scratch, "bucket-")));
  const tmp = await mkdtemp(join(scratch, "tmp-"));
  return { files, store: bucketSnapshotStore(files), tmp };
}

const task = (repo: string, commit = base) => ({ instance_id: `${repo.replace("/", "__")}-T-1`, repo, base_commit: commit });

/** Every log line and result line of a run, to check none holds the token. */
function collect() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("#298 A: copy one task's repository", () => {
  it("stores a private repository with the App token; a second copy is already stored and clones nothing", async () => {
    const { files, store, tmp } = await setup();
    const { urls, access } = standIn({ installed: true });
    const { lines, log } = collect();
    const t = task("team/private-app");
    expect(await copyTaskRepo(t, { store, access, tmp, log })).toEqual({ instance_id: t.instance_id, outcome: "stored" });
    expect(await files.names()).toEqual([snapshotObject(t.instance_id, base)]);
    expect(urls[0]).toContain("x-access-token:");
    expect(await readdir(tmp)).toEqual([]);
    // The validator restores it: the copy holds the base commit.
    const out = await mkdtemp(join(scratch, "out-"));
    expect(await findBundle(out, t, { store })).toBe(join(out, "snapshots", `${t.instance_id}.bundle`));

    const before = urls.length;
    expect(await copyTaskRepo(t, { store, access, tmp, log })).toEqual({ instance_id: t.instance_id, outcome: "already stored" });
    expect(urls.length).toBe(before);
    expect(files.calls.filter((c) => c.startsWith("upload"))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("with no installation, copies a public repository anonymously and refuses a private one with the not-installed line", async () => {
    const { store, tmp } = await setup();
    const { urls, access } = standIn({ installed: false });
    const pub = task("team/public-app");
    expect(await copyTaskRepo(pub, { store, access, tmp })).toMatchObject({ outcome: "stored" });
    expect(urls[0]).toBe("https://github.com/team/public-app.git");
    const priv = task("team/private-app");
    expect(await copyTaskRepo(priv, { store, access, tmp })).toEqual({
      instance_id: priv.instance_id, outcome: "failed", reason: "not_installed",
      line: "team/private-app is private (or gone) and the course GitHub App is not installed on it. Install the App on the repository, then retry.",
    });
    expect(await readdir(tmp)).toEqual([]);
    // No App on the site at all: the same, said for the site.
    const unset = standIn({ configured: false });
    expect(await copyTaskRepo(pub, { store: (await setup()).store, access: unset.access, tmp })).toMatchObject({ outcome: "stored" });
    expect(await copyTaskRepo(priv, { store, access: unset.access, tmp })).toMatchObject({
      reason: "not_installed", line: "team/private-app is private (or gone) and the course GitHub App is not set up on this site.",
    });
  });

  it("says when the base commit is not in the repository", async () => {
    const { store, tmp } = await setup();
    const t = task("team/private-app", "0123456789abcdef0123456789abcdef01234567");
    expect(await copyTaskRepo(t, { store, access: standIn({ installed: true }).access, tmp })).toEqual({
      instance_id: t.instance_id, outcome: "failed", reason: "base_missing",
      line: "The base commit 0123456789ab is not in team/private-app on GitHub (it may have been force-pushed away).",
    });
    expect(await readdir(tmp)).toEqual([]);
    expect(await copyTaskRepo({ ...t, base_commit: "main" }, { store, tmp })).toMatchObject({ reason: "base_missing", line: 'The base commit "main" is not a full commit id.' });
  });

  it("refuses a copy over the size limit and uploads nothing", async () => {
    const { files, store, tmp } = await setup();
    const result = await copyTaskRepo(task("team/public-app"), { store, access: standIn().access, tmp, sizeLimit: 100 });
    expect(result).toMatchObject({ outcome: "failed", reason: "too_large" });
    expect((result as { line: string }).line).toMatch(/^The copy is 0\.0 MB, over the 0\.0 MB limit for stored copies\.$/);
    expect(await files.names()).toEqual([]);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("GitHub errors: the token request, a refused token, and a network failure, with the token in no line", async () => {
    const { store, tmp } = await setup();
    const { lines, log } = collect();
    const results: RepoCopyResult[] = [];
    const t = task("team/private-app");
    results.push(await copyTaskRepo(t, { store, access: standIn({ tokenError: new Error("GitHub could not issue a token for team/private-app (500).") }).access, tmp, log }));
    expect(results.at(-1)).toMatchObject({ reason: "github", line: "GitHub error: could not get the course App token: GitHub could not issue a token for team/private-app (500)." });
    const unreachable = standIn({ installed: true, gitError: (url) => `fatal: unable to access '${url}/': Could not resolve host: github.com` });
    results.push(await copyTaskRepo(t, { store, access: unreachable.access, tmp, log }));
    expect(results.at(-1)).toMatchObject({ reason: "github" });
    expect((results.at(-1) as { line: string }).line).toMatch(/^GitHub error: clone failed: fatal: unable to access 'https:\/\/\*\*\*@github\.com\/team\/private-app\.git\/': Could not resolve host/);
    const refused = standIn({ installed: true, gitError: () => "remote: Invalid username or password.\nfatal: Authentication failed" });
    results.push(await copyTaskRepo(t, { store, access: refused.access, tmp, log }));
    expect(results.at(-1)).toMatchObject({ reason: "github", line: "GitHub error: clone failed with the course App token: is the App installed on team/private-app?" });
    // Every failure line and log line is token-free; the folder is gone after each.
    expect(JSON.stringify(results) + lines.join("\n")).not.toContain(TOKEN);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("Storage errors: asking, and uploading, each one line; the temp folder is gone", async () => {
    const { tmp } = await setup();
    const t = task("team/public-app");
    const access = standIn().access;
    const askFails: SnapshotStore = { has: async () => { throw new Error("Storage: Bucket not found"); }, upload: async () => "uploaded", download: async () => false };
    expect(await copyTaskRepo(t, { store: askFails, access, tmp })).toEqual({ instance_id: t.instance_id, outcome: "failed", reason: "storage", line: "Storage error: Bucket not found" });
    const uploadFails: SnapshotStore = { has: async () => false, upload: async () => { throw new Error("Storage: Payload too large\nmore"); }, download: async () => false };
    expect(await copyTaskRepo(t, { store: uploadFails, access, tmp })).toMatchObject({ reason: "storage", line: "Storage error: Payload too large" });
    expect(await readdir(tmp)).toEqual([]);
  });

  it("gives every git command the time limit", async () => {
    const { store, tmp } = await setup();
    const limits: Array<number | undefined> = [];
    const { access } = standIn();
    const inner = access.git!;
    access.git = async (cmd, args, cwd, options) => { limits.push(options?.timeoutMs); return inner(cmd, args, cwd, options); };
    await copyTaskRepo(task("team/public-app"), { store, access, tmp });
    expect(limits.length).toBeGreaterThan(0);
    expect(new Set(limits)).toEqual(new Set([GIT_NETWORK_TIMEOUT_MS]));
  });

  it("a changed base commit makes a second object", async () => {
    const { files, store, tmp } = await setup();
    const access = standIn({ installed: true }).access;
    const t = task("team/private-app");
    await copyTaskRepo(t, { store, access, tmp });
    expect(await copyTaskRepo({ ...t, base_commit: later }, { store, access, tmp })).toMatchObject({ outcome: "stored" });
    expect(await files.names()).toEqual([snapshotObject(t.instance_id, base), snapshotObject(t.instance_id, later)].sort());
  });
});

describe("#298 D: status and backfill steps", () => {
  let tasks: Array<{ instance_id: string; repo: string; base_commit: string }> = [];
  beforeAll(() => { tasks = Array.from({ length: 5 }, (_, i) => ({ instance_id: `T-${i}`, repo: "team/public-app", base_commit: base })); });

  it("status: which tasks have a copy for their base commit; a store error is null with its line", async () => {
    const { files, store } = await setup();
    await writeFile(join(files.dir, snapshotObject("T-1", base)), "x");
    await writeFile(join(files.dir, snapshotObject("T-2", later)), "x");
    const status = await copyStatus(tasks, store);
    expect(status.map((s) => s.stored)).toEqual([false, true, false, false, false]);
    const broken: SnapshotStore = { has: async () => { throw new Error("Storage: down"); }, upload: async () => "uploaded", download: async () => false };
    expect((await copyStatus(tasks.slice(0, 1), broken))[0]).toMatchObject({ stored: null, error: "Storage error: down" });
  });

  it("copies at most 3, reports the rest, and goes on past a failure; skip leaves out the ones that failed", async () => {
    const { files, store } = await setup();
    await writeFile(join(files.dir, snapshotObject("T-0", base)), "x");
    const seen: string[] = [];
    const copy = async (t: { instance_id: string }): Promise<RepoCopyResult> => {
      seen.push(t.instance_id);
      if (t.instance_id === "T-1") return { instance_id: t.instance_id, outcome: "failed", reason: "github", line: "GitHub error: boom" };
      if (t.instance_id === "T-2") throw new Error("unexpected");
      return { instance_id: t.instance_id, outcome: "stored" };
    };
    const first = await copyMissing(tasks, store, copy);
    expect(seen).toEqual(["T-1", "T-2", "T-3"]);
    expect(first.results.map((r) => r.outcome)).toEqual(["failed", "failed", "stored"]);
    expect(first.results[1]).toMatchObject({ reason: "github", line: "unexpected" });
    expect(first.remaining).toBe(1);
    const second = await copyMissing(tasks, store, copy, { skip: ["T-1", "T-2", "T-3"] });
    expect(second.results.map((r) => r.instance_id)).toEqual(["T-4"]);
    expect(second.remaining).toBe(0);
  });
});
