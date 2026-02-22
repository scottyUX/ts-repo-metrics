/**
 * Git metrics V2 (Epic D).
 *
 * Extended commit analysis: size distribution, bursts, entropy, churn,
 * test coupling, refactor rate. Uses git log --numstat for per-commit,
 * per-file data.
 */

import { simpleGit } from "simple-git";
import { median, percentile } from "../utils/math.js";
import { TEST_FILE_RE } from "../utils/constants.js";
import type {
  GitMetricsV2,
  CommitStats,
  BurstStats,
  EntropyStats,
  ChurnStats,
  ChurnHotspot,
  TestCouplingStats,
  RefactorBehaviorStats,
} from "../types/report.js";

export type { GitMetricsV2 } from "../types/report.js";

const LARGE_COMMIT_500 = 500;
const LARGE_COMMIT_1000 = 1000;
const BURST_WINDOW_MS = 30 * 60 * 1000;
const BURST_MIN_COMMITS = 3;
const CHURN_TOP_N = 10;
const REFACTOR_KEYWORDS = /\b(refactor|cleanup|restructure|rename)\b/i;

interface ParsedCommit {
  hash: string;
  timestamp: number;
  subject: string;
  files: Array<{ path: string; add: number; del: number }>;
  totalLines: number;
}

async function parseLogWithNumstat(repoPath: string): Promise<ParsedCommit[]> {
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return [];

  const raw = await git.raw([
    "log",
    "--all",
    "--numstat",
    "--format=COMMIT_END%n%H%n%at%n%s",
  ]);

  const commits: ParsedCommit[] = [];
  const blocks = raw.split("COMMIT_END\n").filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    const [hash, tsStr, subject, ...numstatLines] = lines;
    const timestamp = parseInt(tsStr ?? "0", 10);
    if (isNaN(timestamp)) continue;

    const files: ParsedCommit["files"] = [];
    let totalLines = 0;

    for (const line of numstatLines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const add = parseInt(parts[0], 10) || 0;
      const del = parseInt(parts[1], 10) || 0;
      const path = parts[2]!;
      if (path === "-" || !path.trim()) continue;
      files.push({ path, add, del });
      totalLines += add + del;
    }

    commits.push({
      hash: hash ?? "",
      timestamp,
      subject: subject ?? "",
      files,
      totalLines,
    });
  }

  return commits;
}

function computeCommitStats(commits: ParsedCommit[]): CommitStats {
  const sizes = commits.map((c) => c.totalLines).filter((s) => s >= 0);
  if (sizes.length === 0) {
    return {
      medianCommitSize: 0,
      p90CommitSize: 0,
      pctOver500Loc: 0,
      pctOver1000Loc: 0,
    };
  }
  const sorted = [...sizes].sort((a, b) => a - b);
  const over500 = sizes.filter((s) => s > LARGE_COMMIT_500).length;
  const over1000 = sizes.filter((s) => s > LARGE_COMMIT_1000).length;
  return {
    medianCommitSize: median(sorted),
    p90CommitSize: percentile(sorted, 90),
    pctOver500Loc: Math.round((over500 / sizes.length) * 1000) / 10,
    pctOver1000Loc: Math.round((over1000 / sizes.length) * 1000) / 10,
  };
}

function computeBurstStats(commits: ParsedCommit[]): BurstStats {
  const byTime = [...commits].sort((a, b) => a.timestamp - b.timestamp);
  if (byTime.length < BURST_MIN_COMMITS) return { burstCount: 0, burstRatio: 0 };

  const clusters: number[][] = [];
  let cluster: number[] = [byTime[0]!.timestamp];

  for (let i = 1; i < byTime.length; i++) {
    const prev = byTime[i - 1]!.timestamp * 1000;
    const curr = byTime[i]!.timestamp * 1000;
    if (curr - prev <= BURST_WINDOW_MS) {
      cluster.push(byTime[i]!.timestamp);
    } else {
      clusters.push(cluster);
      cluster = [byTime[i]!.timestamp];
    }
  }
  clusters.push(cluster);

  const bursts = clusters.filter((c) => c.length >= BURST_MIN_COMMITS);
  const burstCount = bursts.length;
  const commitsInBursts = bursts.reduce((s, c) => s + c.length, 0);
  const burstRatio =
    commits.length > 0
      ? Math.round((commitsInBursts / commits.length) * 1000) / 10
      : 0;
  return { burstCount, burstRatio };
}

function computeEntropyStats(commits: ParsedCommit[]): EntropyStats {
  const byTime = [...commits].sort((a, b) => a.timestamp - b.timestamp);
  if (byTime.length < 2) return { stdDevTimeBetweenCommits: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < byTime.length; i++) {
    gaps.push((byTime[i]!.timestamp - byTime[i - 1]!.timestamp) * 1000);
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance =
    gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  return {
    stdDevTimeBetweenCommits: Math.round(stdDev * 10) / 10,
  };
}

function computeChurnStats(commits: ParsedCommit[]): ChurnStats {
  const byFile = new Map<string, { modifications: number; linesChanged: number }>();

  for (const commit of commits) {
    for (const f of commit.files) {
      const existing = byFile.get(f.path) ?? {
        modifications: 0,
        linesChanged: 0,
      };
      existing.modifications += 1;
      existing.linesChanged += f.add + f.del;
      byFile.set(f.path, existing);
    }
  }

  const all = Array.from(byFile.entries()).map(([file, data]) => ({
    file,
    ...data,
  }));

  const topByMods = [...all]
    .sort((a, b) => b.modifications - a.modifications)
    .slice(0, CHURN_TOP_N)
    .map(({ file, modifications, linesChanged }) => ({
      file,
      modifications,
      linesChanged,
    }));

  const topByLines = [...all]
    .sort((a, b) => b.linesChanged - a.linesChanged)
    .slice(0, CHURN_TOP_N)
    .map(({ file, modifications, linesChanged }) => ({
      file,
      modifications,
      linesChanged,
    }));

  return {
    topByModifications: topByMods,
    topByLinesChanged: topByLines,
  };
}

function computeTestCoupling(commits: ParsedCommit[]): TestCouplingStats {
  let testCommits = 0;
  let featureCommits = 0;

  for (const c of commits) {
    const touchesTest = c.files.some((f) => TEST_FILE_RE.test(f.path));
    if (touchesTest) testCommits++;
    else featureCommits++;
  }

  const total = commits.length;
  const pct =
    total > 0 ? Math.round((testCommits / total) * 1000) / 10 : 0;
  const ratio =
    featureCommits > 0
      ? Math.round((testCommits / featureCommits) * 100) / 100
      : 0;
  return {
    pctCommitsTouchingTests: pct,
    testToFeatureCommitRatio: ratio,
  };
}

function computeRefactorRate(commits: ParsedCommit[]): RefactorBehaviorStats {
  const refactorCount = commits.filter((c) =>
    REFACTOR_KEYWORDS.test(c.subject),
  ).length;
  const total = commits.length;
  const ratio =
    total > 0 ? Math.round((refactorCount / total) * 1000) / 10 : 0;
  return { refactorCommitRatio: ratio };
}

/**
 * Extract Git metrics V2 (Epic D) from repository history.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns GitMetricsV2 or null if not a git repo or no history.
 */
export async function extractGitMetricsV2(
  repoPath: string,
): Promise<GitMetricsV2 | null> {
  try {
    const commits = await parseLogWithNumstat(repoPath);
    if (commits.length === 0) return null;

    return {
      commitStats: computeCommitStats(commits),
      burstStats: computeBurstStats(commits),
      entropy: computeEntropyStats(commits),
      churn: computeChurnStats(commits),
      refactorBehavior: computeRefactorRate(commits),
      testCoupling: computeTestCoupling(commits),
    };
  } catch {
    return null;
  }
}
