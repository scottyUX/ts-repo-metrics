import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloneError, NO_APP_CLONE_DETAIL, run } from "@/lib/cse115a/benchmark/validation/runRow";
import { batchRepo, recordSnapshot, SNAPSHOT_EXISTS, SNAPSHOT_WRITTEN, snapshotOnly, snapshotPath, type BatchGit } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
let scratch = "";
/** Stands in for github.com: `<github>/<owner>/<name>.git` is a local repository. */
let github = "";
let base = "";
let later = "";

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-snapshots-test-"));
  github = join(scratch, "github");
  const repo = join(github, "team", "app.git");
  await mkdir(repo, { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  await writeFile(join(repo, "a.txt"), "base\n");
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await writeFile(join(repo, "a.txt"), "later\n");
  await run("git", [...GIT_ID, "commit", "-qam", "later"], repo);
  later = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

const row = (id: string, repo = "team/app"): TaskRow => ({ instance_id: id, repo, base_commit: base, patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] });

/** Clones from the local stand-in; counts calls; a repository not there is refused like GitHub refuses a private one. */
function localGit(calls: string[] = []): BatchGit {
  return {
    clone: async (fullName, dir) => {
      calls.push(fullName);
      if (fullName !== "team/app") throw new CloneError(NO_APP_CLONE_DETAIL);
      await run("git", ["clone", "-q", join(github, `${fullName}.git`), dir]);
    },
  };
}

async function freshOut(): Promise<string> {
  return mkdtemp(join(scratch, "out-"));
}

describe("--snapshot-only", () => {
  it("writes the bundle at base_commit and no result, summary or write-back file", async () => {
    const out = await freshOut();
    const printed: string[] = [];
    const report = await snapshotOnly({ rows: [row("T-1")], out, redo: false, git: localGit(), print: (l) => printed.push(l) });
    expect(report.lines).toEqual(["T-1: snapshot written", "1 snapshot(s) written, 0 already had one, 0 failed, of 1 row(s)"]);
    expect(printed).toEqual(report.lines);
    expect((await readdir(out)).sort()).toEqual(["repos", "snapshots"]);
    // The bundle restores the base commit, and nothing after it.
    const restored = join(out, "restored");
    await run("git", ["clone", "-q", "-b", "hecate-snapshot", join(out, snapshotPath("T-1")), restored]);
    expect((await run("git", ["rev-parse", "HEAD"], restored)).trim()).toBe(base);
    await expect(run("git", ["cat-file", "-e", `${later}^{commit}`], restored)).rejects.toThrow();
  });

  it("leaves existing result, summary and write-back files byte-identical", async () => {
    const out = await freshOut();
    await mkdir(join(out, "results"), { recursive: true });
    const files = { "results/T-1.json": '{ "instance_id": "T-1", "validation_status": "validated" }\n', "summary.md": "old summary\n", "summary.json": "{}\n", "writeback.sql": "begin;\ncommit;\n" };
    for (const [path, text] of Object.entries(files)) await writeFile(join(out, path), text);
    await snapshotOnly({ rows: [row("T-1")], out, redo: false, git: localGit() });
    for (const [path, text] of Object.entries(files)) expect(await readFile(join(out, path), "utf8")).toBe(text);
    expect(await readdir(join(out, "results"))).toEqual(["T-1.json"]);
  });

  it("skips a row that already has a bundle, and --redo rewrites it", async () => {
    const out = await freshOut();
    await mkdir(join(out, "snapshots"), { recursive: true });
    await writeFile(join(out, snapshotPath("T-1")), "not a bundle");
    const calls: string[] = [];
    const skipped = await snapshotOnly({ rows: [row("T-1")], out, redo: false, git: localGit(calls) });
    expect(skipped.lines[0]).toBe(`T-1: ${SNAPSHOT_EXISTS}`);
    expect(skipped).toMatchObject({ written: 0, existing: 1, failed: 0 });
    expect(calls).toEqual([]);
    expect(await readFile(join(out, snapshotPath("T-1")), "utf8")).toBe("not a bundle");

    const redone = await snapshotOnly({ rows: [row("T-1")], out, redo: true, git: localGit(calls) });
    expect(redone.lines[0]).toBe(`T-1: ${SNAPSHOT_WRITTEN}`);
    await run("git", ["bundle", "verify", "-q", join(out, snapshotPath("T-1"))], join(out, "repos", "team__app"));
  });

  it("puts a clone failure's detail on the row's line and goes on to the next row", async () => {
    const out = await freshOut();
    const report = await snapshotOnly({ rows: [row("P-1", "ryan/private"), row("T-1")], out, redo: false, git: localGit() });
    expect(report.lines).toEqual([
      `P-1: ${NO_APP_CLONE_DETAIL}`,
      `T-1: ${SNAPSHOT_WRITTEN}`,
      "1 snapshot(s) written, 0 already had one, 1 failed, of 2 row(s)",
    ]);
  });

  it("clones each repository once across rows", async () => {
    const out = await freshOut();
    const calls: string[] = [];
    await snapshotOnly({ rows: [row("T-1"), row("T-2")], out, redo: false, git: localGit(calls) });
    expect(calls).toEqual(["team/app"]);
  });
});

describe("a normal run after a snapshot-only pass", () => {
  it("reuses the clone and records the bundle, even if the repository has since gone", async () => {
    const out = await freshOut();
    await snapshotOnly({ rows: [row("T-1")], out, redo: false, git: localGit() });
    const gone: BatchGit = { clone: async () => { throw new CloneError(NO_APP_CLONE_DETAIL); } };
    const repoDir = await batchRepo(out, "team/app", base, new Map(), () => {}, gone);
    expect(repoDir).toBe(join(out, "repos", "team__app"));
    expect(await recordSnapshot(out, row("T-1"), repoDir, false, () => {})).toBe(snapshotPath("T-1"));
    expect(await recordSnapshot(out, row("T-9"), repoDir, false, () => {})).toBeUndefined();
  });
});

describe("validateBenchmarkBatch.ts --snapshot-only (the script)", () => {
  it("prints one line per row and a count, writes no result files, and exits 0 when a row fails to clone", async () => {
    const out = await freshOut();
    const rowsFile = join(scratch, "rows.json");
    await writeFile(rowsFile, JSON.stringify([row("T-1"), row("M-1", "team/missing")]));
    const script = fileURLToPath(new URL("../scripts/validateBenchmarkBatch.ts", import.meta.url));
    const tsconfig = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
    // github.com is rewritten to the local stand-in, so the real cloneRepo runs without the network.
    // The Supabase variables are blanked so the script never uploads to a real snapshot store.
    const env = { ...process.env, SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GITHUB_APP_ID: "", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${github}/.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/" };
    const { code, stdout } = await new Promise<{ code: number | null; stdout: string }>((done) => {
      const child = spawn("npx", ["tsx", "--tsconfig", tsconfig, script, rowsFile, "--out", out, "--snapshot-only"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      child.stdout.on("data", (chunk) => { text += chunk; });
      child.on("close", (exitCode) => done({ code: exitCode, stdout: text }));
    });
    expect(code).toBe(0);
    const lines = stdout.trim().split("\n");
    expect(lines[0]).toBe("T-1: snapshot written");
    expect(lines[1]).toMatch(/^M-1: (clone failed|fetch)/);
    expect(lines[2]).toBe("1 snapshot(s) written, 0 already had one, 1 failed, of 2 row(s)");
    expect((await readdir(out)).sort()).toEqual(["repos", "snapshots"]);
  }, 60_000);
});
