/**
 * Git history metrics collector.
 *
 * Uses simple-git to extract commit-level statistics: total commits,
 * median and average commit size (lines changed), large commit ratio
 * (> 500 LOC), and commit frequency (commits per week over the last
 * 3 months). Returns null for non-git repos or shallow clones with
 * insufficient history.
 */

import { simpleGit } from "simple-git";
import { median } from "../utils/math.js";
import type { GitMetrics } from "../types/report.js";

export type { GitMetrics } from "../types/report.js";

const LARGE_COMMIT_THRESHOLD = 500;
const WEEKS_WINDOW = 13; // ~3 months

/**
 * Extract commit-level metrics from a repository's Git history.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Git metrics, or null if the repo has no history or is not a git repo.
 */
export async function extractGitMetrics(
  repoPath: string,
): Promise<GitMetrics | null> {
  try {
    const git = simpleGit(repoPath);

    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;

    const log = await git.log(["--numstat", "--all"]);
    if (!log.all.length) return null;

    const commitSizes: number[] = [];

    for (const commit of log.all) {
      const diff = (commit as unknown as { diff?: { files?: Array<{ insertions: number; deletions: number }> } }).diff;
      if (!diff?.files) continue;

      let linesChanged = 0;
      for (const file of diff.files) {
        linesChanged += (file.insertions || 0) + (file.deletions || 0);
      }
      commitSizes.push(linesChanged);
    }

    const totalCommits = log.all.length;

    if (commitSizes.length === 0) {
      return {
        totalCommits,
        medianCommitSize: 0,
        avgLinesPerCommit: 0,
        largeCommitRatio: 0,
        commitsPerWeek: 0,
      };
    }

    const sorted = [...commitSizes].sort((a, b) => a - b);
    const totalLines = commitSizes.reduce((a, b) => a + b, 0);
    const largeCount = commitSizes.filter(
      (s) => s > LARGE_COMMIT_THRESHOLD,
    ).length;

    const now = Date.now();
    const windowStart = now - WEEKS_WINDOW * 7 * 24 * 60 * 60 * 1000;
    const recentCommits = log.all.filter((c) => {
      const d = new Date(c.date).getTime();
      return d >= windowStart;
    }).length;

    return {
      totalCommits,
      medianCommitSize: median(sorted),
      avgLinesPerCommit:
        Math.round((totalLines / commitSizes.length) * 10) / 10,
      largeCommitRatio:
        Math.round((largeCount / commitSizes.length) * 1000) / 10,
      commitsPerWeek:
        Math.round((recentCommits / WEEKS_WINDOW) * 10) / 10,
    };
  } catch {
    return null;
  }
}
