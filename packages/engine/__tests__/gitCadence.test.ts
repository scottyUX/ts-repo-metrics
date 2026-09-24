/**
 * Commits per week is measured in the 13 weeks before the newest commit, not
 * before the time of analysis, so a finished project keeps its cadence. A
 * change that sits on several refs under different hashes counts once.
 */

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractGitMetrics } from "../src/collect/gitMetrics.js";
import { extractGitHistoryBundle } from "../src/collect/gitMetricsV2.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A repo whose commits are all in early 2020, one per week for 13 weeks, by two authors. */
async function oldRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cadence-"));
  dirs.push(dir);
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync("git", args, { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
  git(["init", "-q"]);
  for (let week = 0; week < 13; week++) {
    const date = new Date(Date.UTC(2020, 0, 6 + week * 7, 12)).toISOString();
    const author = week % 2 === 0 ? "Alice <alice@example.com>" : "Bob <bob@example.com>";
    await writeFile(path.join(dir, "f.txt"), `week ${week}\n`);
    git(["add", "f.txt"]);
    git(["commit", "-q", "-m", `week ${week}`, `--author=${author}`], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    });
  }
  return dir;
}

/** Replay every commit onto a second branch: same tree, author, time, and subject; new hashes. */
function addRewrittenCopy(dir: string): void {
  const run = (args: string[], env: Record<string, string> = {}) =>
    execFileSync("git", args, {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", GIT_COMMITTER_DATE: "2024-06-01T00:00:00Z", ...env },
    }).toString().trim();
  let parent = "";
  for (const h of run(["rev-list", "--reverse", "HEAD"]).split("\n")) {
    const [name, email, date, subject] = run(["log", "-1", "--format=%an%n%ae%n%aI%n%s", h]).split("\n");
    const tree = run(["rev-parse", `${h}^{tree}`]);
    parent = run(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", subject ?? ""], {
      GIT_AUTHOR_NAME: name ?? "",
      GIT_AUTHOR_EMAIL: email ?? "",
      GIT_AUTHOR_DATE: date ?? "",
    });
  }
  run(["branch", "rewritten", parent]);
}

describe("rewritten copies across refs", () => {
  it("counts each change once in totals, spacing, and per-author stats", async () => {
    const dir = await oldRepo();
    addRewrittenCopy(dir);
    const refs = execFileSync("git", ["rev-list", "--all"], { cwd: dir }).toString().trim().split("\n");
    expect(refs).toHaveLength(26);

    const metrics = await extractGitMetrics(dir);
    expect(metrics?.totalCommits).toBe(13);
    expect(metrics?.commitsPerWeek).toBe(1);

    const bundle = await extractGitHistoryBundle(dir);
    expect(bundle?.gitMetricsV2.entropy.medianTimeBetweenCommits).toBe(7 * 24 * 3600 * 1000);
    expect(bundle?.gitMetricsV2.burstStats.burstCount).toBe(0);
    const counts = Object.fromEntries((bundle?.contributors ?? []).map((c) => [c.displayName, c.commitCount]));
    expect(counts).toEqual({ Alice: 7, Bob: 6 });
  }, 30_000);
});

describe("commit cadence anchor", () => {
  it("measures repo commits per week against the newest commit", async () => {
    const metrics = await extractGitMetrics(await oldRepo());
    expect(metrics?.commitsPerWeek).toBe(1);
  }, 30_000);

  it("measures each contributor against the repo's newest commit", async () => {
    const bundle = await extractGitHistoryBundle(await oldRepo());
    const perWeek = Object.fromEntries((bundle?.contributors ?? []).map((c) => [c.displayName, c.commitsPerWeek]));
    expect(perWeek).toEqual({ Alice: 0.5, Bob: 0.5 });
  }, 30_000);
});
