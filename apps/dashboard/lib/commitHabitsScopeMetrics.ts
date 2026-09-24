import type { ContributorActivity, RepoReport } from "@/lib/reportTypes";

/** Sentinel: aggregate metrics use full git history */
export const COMMIT_HABITS_SCOPE_TEAM = "team" as const;

export type CommitHabitsScopeId = typeof COMMIT_HABITS_SCOPE_TEAM | string;

/**
 * Finds a contributor row for the scope selector. Matches by `id` first, then normalized email
 * (helps when select value and stored id differ slightly in casing/format).
 */
export function findContributorForScope(
  report: RepoReport,
  scopeId: CommitHabitsScopeId,
): ContributorActivity | undefined {
  const list = report.contributors;
  if (!list?.length || scopeId === COMMIT_HABITS_SCOPE_TEAM) return undefined;
  const trimmed = String(scopeId ?? "").trim();
  if (trimmed === "") return undefined;
  const want = trimmed.toLowerCase();
  const byId = list.find((x) => String(x.id).trim().toLowerCase() === want);
  if (byId) return byId;
  return list.find((x) => String(x.authorEmail ?? "").trim().toLowerCase() === want);
}

export interface CommitHabitsMetricValues {
  mode: "team" | "contributor";
  contributorDisplayName: string | null;
  contributorEmail: string | null;
  totalCommits: number;
  /** Recent-window commits/week (13-week window); repo row from `git`, contributor from `ContributorActivity.commitsPerWeek`. */
  commitsPerWeek: number | null;
  medianCommitSize: number;
  avgLinesPerCommit: number;
  largeCommitRatio: number;
  burstRatio: number;
  /** Std. dev. of gaps between consecutive commits (ms). */
  entropy: number;
  /**
   * Typical gap between consecutive commits (ms): the median, or the mean on
   * older reports that have no median. One long pause dominates the mean.
   */
  commitSpacingMeanMs: number;
  duplication: number;
  framework: string;
}

/**
 * Resolves KPI numbers for Commit Habits cards from either repo-wide git stats or a contributor row.
 */
export function getCommitHabitsMetricValues(
  report: RepoReport,
  scopeId: CommitHabitsScopeId,
): CommitHabitsMetricValues {
  const git = report.git;
  const gv2 = report.gitMetricsV2;
  const duplication = report.duplication?.percentage ?? 0;
  const framework = report.framework?.type ?? "—";

  const fallbackTeam = (): CommitHabitsMetricValues => ({
    mode: "team",
    contributorDisplayName: null,
    contributorEmail: null,
    totalCommits: git?.totalCommits ?? 0,
    commitsPerWeek: git?.commitsPerWeek ?? 0,
    medianCommitSize: gv2?.commitStats?.medianCommitSize ?? git?.medianCommitSize ?? 0,
    avgLinesPerCommit: git?.avgLinesPerCommit ?? 0,
    largeCommitRatio: gv2?.commitStats?.pctOver500Loc ?? git?.largeCommitRatio ?? 0,
    burstRatio: gv2?.burstStats?.burstRatio ?? 0,
    entropy: gv2?.entropy?.stdDevTimeBetweenCommits ?? 0,
    commitSpacingMeanMs:
      gv2?.entropy?.medianTimeBetweenCommits ?? gv2?.entropy?.meanTimeBetweenCommits ?? 0,
    duplication,
    framework,
  });

  const trimmedScope = String(scopeId ?? "").trim();
  if (scopeId === COMMIT_HABITS_SCOPE_TEAM || trimmedScope === "") {
    return fallbackTeam();
  }

  const c = findContributorForScope(report, scopeId);
  if (!c) {
    return fallbackTeam();
  }

  const avgLinesPerCommit =
    c.commitCount > 0 ? (c.linesAdded + c.linesDeleted) / c.commitCount : 0;

  return {
    mode: "contributor",
    contributorDisplayName: c.displayName,
    contributorEmail: c.authorEmail,
    totalCommits: c.commitCount,
    commitsPerWeek: typeof c.commitsPerWeek === "number" ? c.commitsPerWeek : null,
    medianCommitSize: c.commitStats.medianCommitSize,
    avgLinesPerCommit,
    largeCommitRatio: c.commitStats.pctOver500Loc,
    burstRatio: c.burstStats.burstRatio,
    entropy: c.entropy.stdDevTimeBetweenCommits,
    commitSpacingMeanMs: c.entropy.medianTimeBetweenCommits ?? c.entropy.meanTimeBetweenCommits ?? 0,
    duplication,
    framework,
  };
}
