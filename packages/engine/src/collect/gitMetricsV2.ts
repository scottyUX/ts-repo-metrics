/**
 * Git metrics V2 (Epic D).
 *
 * Extended commit analysis: size distribution, bursts, entropy, churn,
 * test coupling, refactor rate. Uses git log --numstat for per-commit,
 * per-file data. Contributor activity groups the same metrics by author.
 */

import { simpleGit } from "simple-git";
import { median, percentile } from "../utils/math.js";
import { isTestFilePath } from "../utils/constants.js";
import type {
  GitMetricsV2,
  CommitStats,
  BurstStats,
  EntropyStats,
  ChurnStats,
  TestCouplingStats,
  RefactorBehaviorStats,
  ContributorActivity,
  CommitCalendar,
} from "../types/report.js";

export type { GitMetricsV2, ContributorActivity } from "../types/report.js";

const LARGE_COMMIT_500 = 500;
const LARGE_COMMIT_1000 = 1000;
/** GitHub-style columns: one per week, ~12 months. */
const HEATMAP_WEEK_COLUMNS = 52;
/** Same rolling window as `extractGitMetrics` for commits/week (≈3 months). */
const CPW_WINDOW_WEEKS = 13;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function commitsPerWeekInRecentWindow(group: ParsedCommit[], windowWeeks: number): number {
  if (group.length === 0 || windowWeeks <= 0) return 0;
  const now = Date.now();
  const windowStartMs = now - windowWeeks * 7 * MS_PER_DAY;
  let n = 0;
  for (const c of group) {
    if (c.timestamp * 1000 >= windowStartMs) n++;
  }
  return Math.round((n / windowWeeks) * 10) / 10;
}

function utcMondayStart(tsMs: number): number {
  const d = new Date(tsMs);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const mondayOffset = (day + 6) % 7; // Mon -> 0
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function isoDateUtc(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build a Mon–Sun × week columns grid (GitHub-style) for the last `weekCount` weeks ending at the
 * week that contains the latest commit.
 */
export function buildCommitCalendar(
  commits: ParsedCommit[],
  weekCount: number,
): CommitCalendar | null {
  if (commits.length === 0) return null;

  const latestSec = commits.reduce((a, c) => Math.max(a, c.timestamp), 0);
  const latestMs = latestSec * 1000;
  const endMonday = utcMondayStart(latestMs);
  const startMonday = endMonday - (weekCount - 1) * 7 * MS_PER_DAY;

  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: weekCount }, () => 0),
  );
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];

  for (const c of commits) {
    const tsMs = c.timestamp * 1000;
    const cm = utcMondayStart(tsMs);
    if (cm < startMonday || cm > endMonday) continue;
    const w = Math.round((cm - startMonday) / (7 * MS_PER_DAY));
    if (w < 0 || w >= weekCount) continue;

    const day = new Date(tsMs);
    const weekdayFromMonday = (day.getUTCDay() + 6) % 7;
    grid[weekdayFromMonday]![w] = (grid[weekdayFromMonday]![w] ?? 0) + 1;
    weekdayTotals[weekdayFromMonday] = (weekdayTotals[weekdayFromMonday] ?? 0) + 1;
  }

  const columnWeekStarts: string[] = [];
  for (let w = 0; w < weekCount; w++) {
    columnWeekStarts.push(isoDateUtc(startMonday + w * 7 * MS_PER_DAY));
  }

  let busiestWeekdayIndex: number | null = null;
  let maxD = -1;
  for (let d = 0; d < 7; d++) {
    if (weekdayTotals[d]! > maxD) {
      maxD = weekdayTotals[d]!;
      busiestWeekdayIndex = d;
    }
  }
  if (maxD <= 0) busiestWeekdayIndex = null;

  return {
    grid,
    columnWeekStarts,
    busiestWeekdayIndex,
  };
}

const BURST_WINDOW_MS = 30 * 60 * 1000;
const BURST_MIN_COMMITS = 3;
const CHURN_TOP_N = 10;
const REFACTOR_KEYWORDS = /\b(refactor|cleanup|restructure|rename)\b/i;

/** One commit as parsed from git log --numstat (includes author fields). */
export interface ParsedCommit {
  hash: string;
  timestamp: number;
  authorEmail: string;
  authorName: string;
  subject: string;
  files: Array<{ path: string; add: number; del: number }>;
  totalLines: number;
}

function authorKey(email: string, name: string): string {
  const e = (email ?? "").trim().toLowerCase();
  if (e) return e;
  const n = (name ?? "").trim();
  if (n) return `name:${n.toLowerCase().replace(/\s+/g, " ")}`;
  return "unknown";
}

function pickDisplayName(group: ParsedCommit[]): string {
  const names = group.map((c) => c.authorName.trim()).filter(Boolean);
  if (names.length === 0) return "Unknown";
  const counts = new Map<string, number>();
  for (const n of names) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = names[0]!;
  let bestC = 0;
  for (const [n, c] of counts) {
    if (c > bestC) {
      best = n;
      bestC = c;
    }
  }
  return best;
}

async function parseLogWithNumstat(repoPath: string): Promise<ParsedCommit[]> {
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return [];

  const raw = await git.raw([
    "log",
    "--all",
    "--numstat",
    "--format=COMMIT_END%n%H%n%at%n%aE%n%aN%n%s",
  ]);

  const commits: ParsedCommit[] = [];
  const blocks = raw.split("COMMIT_END\n").filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 5) continue;

    const [hash, tsStr, authorEmail, authorName, subject, ...numstatLines] =
      lines;
    const timestamp = parseInt(tsStr ?? "0", 10);
    if (isNaN(timestamp)) continue;

    const files: ParsedCommit["files"] = [];
    let totalLines = 0;

    for (const line of numstatLines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const add = parseInt(parts[0] ?? "0", 10) || 0;
      const del = parseInt(parts[1] ?? "0", 10) || 0;
      const filePath = parts[2] ?? "";
      if (filePath === "-" || !filePath.trim()) continue;
      files.push({ path: filePath, add, del });
      totalLines += add + del;
    }

    commits.push({
      hash: hash ?? "",
      timestamp,
      authorEmail: (authorEmail ?? "").trim(),
      authorName: (authorName ?? "").trim(),
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
  if (byTime.length < 2) {
    return { stdDevTimeBetweenCommits: 0, meanTimeBetweenCommits: 0 };
  }

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
    meanTimeBetweenCommits: Math.round(mean * 10) / 10,
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
    const touchesTest = c.files.some((f) => isTestFilePath(f.path));
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

function buildGitMetricsV2FromCommits(commits: ParsedCommit[]): GitMetricsV2 {
  return {
    commitStats: computeCommitStats(commits),
    burstStats: computeBurstStats(commits),
    entropy: computeEntropyStats(commits),
    churn: computeChurnStats(commits),
    refactorBehavior: computeRefactorRate(commits),
    testCoupling: computeTestCoupling(commits),
    commitCalendar: buildCommitCalendar(commits, HEATMAP_WEEK_COLUMNS),
  };
}

/**
 * Build per-contributor activity from parsed commits (local git or API-shaped rows).
 */
export function buildContributorActivityFromParsedCommits(
  commits: ParsedCommit[],
): ContributorActivity[] {
  const byKey = new Map<string, ParsedCommit[]>();
  for (const c of commits) {
    const key = authorKey(c.authorEmail, c.authorName);
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const out: ContributorActivity[] = [];
  for (const [id, group] of byKey) {
    const displayName = pickDisplayName(group);
    const email = (group[0]!.authorEmail ?? "").trim();
    let linesAdded = 0;
    let linesDeleted = 0;
    let testLineChurn = 0;
    let sourceLineChurn = 0;
    const testPathsDistinct = new Set<string>();
    const sourcePathsDistinct = new Set<string>();
    for (const c of group) {
      for (const f of c.files) {
        linesAdded += f.add;
        linesDeleted += f.del;
        const churn = f.add + f.del;
        const rel = f.path.replace(/\\/g, "/");
        if (isTestFilePath(rel)) {
          testLineChurn += churn;
          testPathsDistinct.add(rel);
        } else {
          sourceLineChurn += churn;
          sourcePathsDistinct.add(rel);
        }
      }
    }
    const sourcePathsTouchedList =
      sourcePathsDistinct.size > 0
        ? Array.from(sourcePathsDistinct).sort((a, b) => a.localeCompare(b))
        : undefined;

    out.push({
      id,
      displayName,
      authorEmail: email || id,
      commitCount: group.length,
      linesAdded,
      linesDeleted,
      testLineChurn,
      sourceLineChurn,
      testFilesTouched: testPathsDistinct.size,
      sourceFilesTouched: sourcePathsDistinct.size,
      sourcePathsTouchedList,
      commitStats: computeCommitStats(group),
      burstStats: computeBurstStats(group),
      entropy: computeEntropyStats(group),
      churn: computeChurnStats(group),
      testCoupling: computeTestCoupling(group),
      refactorBehavior: computeRefactorRate(group),
      commitCalendar: buildCommitCalendar(group, HEATMAP_WEEK_COLUMNS),
      commitsPerWeek: commitsPerWeekInRecentWindow(group, CPW_WINDOW_WEEKS),
    });
  }
  out.sort((a, b) => b.commitCount - a.commitCount);
  return out;
}

export interface GitHistoryBundle {
  gitMetricsV2: GitMetricsV2;
  contributors: ContributorActivity[];
}

/**
 * Single git log read: repo-wide V2 metrics plus per-author activity.
 */
export async function extractGitHistoryBundle(
  repoPath: string,
): Promise<GitHistoryBundle | null> {
  try {
    const commits = await parseLogWithNumstat(repoPath);
    if (commits.length === 0) return null;
    return {
      gitMetricsV2: buildGitMetricsV2FromCommits(commits),
      contributors: buildContributorActivityFromParsedCommits(commits),
    };
  } catch {
    return null;
  }
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
  const bundle = await extractGitHistoryBundle(repoPath);
  return bundle?.gitMetricsV2 ?? null;
}
