/**
 * Commits per week is measured in the 13 weeks before the newest commit, not
 * before the time of analysis, so a finished project keeps its cadence.
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

describe("commit cadence anchor", () => {
  it("measures repo commits per week against the newest commit", async () => {
    const metrics = await extractGitMetrics(await oldRepo());
    expect(metrics?.commitsPerWeek).toBe(1);
  });

  it("measures each contributor against the repo's newest commit", async () => {
    const bundle = await extractGitHistoryBundle(await oldRepo());
    const perWeek = Object.fromEntries((bundle?.contributors ?? []).map((c) => [c.displayName, c.commitsPerWeek]));
    expect(perWeek).toEqual({ Alice: 0.5, Bob: 0.5 });
  });
});
