"use client";

import type { RepoReport } from "@/lib/reportTypes";
import type { CommitHabitsMetricValues } from "@/lib/commitHabitsScopeMetrics";
import { CoreSignalCard, type CoreSignalTier } from "./CoreSignalsPrimitives";
import {
  CommitHabitsAvgLinesPerCommitBody,
  CommitHabitsDuplicationPercentBody,
} from "./metricHelpContent";
import { MetricCard } from "../MetricCard";

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function tierTotalCommits(n: number): CoreSignalTier {
  if (n <= 0) return "critical";
  if (n < 8) return "needs_work";
  if (n < 40) return "good";
  return "strong";
}

function tierCommitsPerWeek(cpw: number | null): CoreSignalTier {
  if (cpw == null || !Number.isFinite(cpw)) return "no_data";
  if (cpw < 0.25) return "critical";
  if (cpw < 1.5) return "needs_work";
  if (cpw < 4) return "good";
  return "strong";
}

/** Lower large-commit share is healthier. */
function tierLargeCommitRatio(pct: number): CoreSignalTier {
  if (pct > 40) return "critical";
  if (pct > 20) return "needs_work";
  if (pct > 8) return "good";
  return "strong";
}

function tierMedianCommitSize(lines: number, hasData: boolean): CoreSignalTier {
  if (!hasData) return "no_data";
  if (lines <= 80) return "strong";
  if (lines <= 200) return "good";
  if (lines <= 500) return "needs_work";
  return "critical";
}

function tierEntropy(entropy: number, hasData: boolean): CoreSignalTier {
  if (!hasData) return "no_data";
  if (entropy === 0) return "strong";
  if (entropy < 3_600_000) return "strong";
  if (entropy < 86_400_000) return "good";
  return "needs_work";
}

/** Human-readable band for commit spacing (badge text). */
function commitSpacingBandLabel(tier: CoreSignalTier): string {
  switch (tier) {
    case "no_data":
      return "No timing data";
    case "strong":
      return "Very regular spacing";
    case "good":
      return "Moderately variable";
    case "needs_work":
      return "Highly irregular";
    case "critical":
      return "Highly irregular";
    default:
      return "";
  }
}

/** Compact duration from milliseconds (for gaps between commits). */
function formatGapDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms === 0) return "0";
  const s = ms / 1000;
  if (s < 90) return `${Math.round(s)} sec`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) {
    const whole = Math.floor(h);
    const remM = Math.round((h - whole) * 60);
    if (whole === 0) return `${remM} min`;
    return remM > 0 ? `${whole} h ${remM} m` : `${whole} h`;
  }
  const d = h / 24;
  const wholeD = Math.floor(d);
  const remH = Math.round((d - wholeD) * 24);
  return remH > 0 ? `${wholeD} d ${remH} h` : `${wholeD} d`;
}

function tierBurst(pct: number, hasData: boolean): CoreSignalTier {
  if (!hasData) return "no_data";
  if (pct <= 5) return "strong";
  if (pct <= 20) return "good";
  if (pct <= 45) return "needs_work";
  return "critical";
}

export interface CommitHabitsSignalQuality {
  median: boolean;
  entropy: boolean;
  burst: boolean;
}

export function resolveCommitHabitsSignalQuality(report: RepoReport): CommitHabitsSignalQuality {
  const gv2 = report.gitMetricsV2;
  const api = report.git?.mode === "api";
  return {
    median: Boolean(gv2) && !api,
    entropy: Boolean(gv2),
    burst: Boolean(gv2),
  };
}

function describeTotalCommits(n: number, tier: CoreSignalTier): string {
  if (tier === "critical") {
    return "Very few commits in the parsed window. Push small, frequent changes so the team gets steady integration signal.";
  }
  if (tier === "needs_work") {
    return "Activity is thin relative to a healthy cadence. Aim for smaller commits landing more often.";
  }
  if (tier === "strong") {
    return `${n} commits in parsed history—a solid volume for habits and review rhythm.`;
  }
  return `${n} commits recorded. Rhythm looks reasonable; keep integrating often.`;
}

function describeCommitsPerWeek(
  cpw: number | null,
  tier: CoreSignalTier,
  scopeContributor: boolean,
): string {
  if (tier === "no_data" && scopeContributor) {
    return "Per-week rate is calculated for the whole repository (13-week window), not per author. Whole-repo figure is shown in the value above when available.";
  }
  if (tier === "no_data") {
    return "Not enough git timeline data to estimate a weekly rate.";
  }
  const w = cpw ?? 0;
  if (tier === "strong" || tier === "good") {
    return `You commit about ${formatNumber(w)} times per week on average in the recent window—steady integration.`;
  }
  if (tier === "needs_work") {
    return "Weekly commit frequency is low. Smaller, more frequent commits usually reduce merge pain.";
  }
  return "Cadence is very low. Even tiny incremental commits help keep CI and reviewers in sync.";
}

function describeLargeCommit(pct: number, tier: CoreSignalTier): string {
  if (tier === "strong") {
    return "Few commits exceed 500 lines—batches stay reviewable.";
  }
  if (tier === "good") {
    return "Most changes land in moderate-sized commits. Watch for occasional large diffs.";
  }
  if (tier === "needs_work") {
    return "A noticeable share of commits are very large. Split work where you can to ease review.";
  }
  return "Many commits are very large. Break work into smaller, testable slices.";
}

function describeMedian(lines: number, tier: CoreSignalTier, hasData: boolean): string {
  if (!hasData) {
    return "Line-level commit sizes need full git numstat history (not available in GitHub-API-only mode or when extended metrics are missing).";
  }
  if (tier === "strong" || tier === "good") {
    return "Typical commit size stays moderate—good for review and rollback safety.";
  }
  return "Median churn per commit is high. Consider smaller steps so feedback arrives earlier.";
}

function describeEntropyMs(
  stdDevMs: number,
  meanMs: number,
  tier: CoreSignalTier,
  hasData: boolean,
): string {
  if (!hasData) {
    return "Timing patterns need consecutive commit timestamps from full git history.";
  }
  const meanPhrase =
    meanMs > 0
      ? ` Typical time from one commit to the next is about ${formatGapDurationMs(meanMs)}.`
      : "";
  if (tier === "strong") {
    return `Gaps between commits are fairly similar (low spread in timing).${meanPhrase}`;
  }
  if (tier === "good") {
    return `Some spread in when commits land—common when priorities shift.${meanPhrase}`;
  }
  return `Very uneven spacing between commits—bursts and long quiet stretches.${meanPhrase}`;
}

function describeBurst(pct: number, tier: CoreSignalTier, hasData: boolean): string {
  if (!hasData) {
    return "Burst detection needs clustered commit timestamps from git history.";
  }
  if (tier === "strong" || tier === "good") {
    return "Few rapid-fire commit clusters—less thrash for neighbors rebasing.";
  }
  if (tier === "needs_work") {
    return "Several commits land in tight bursts. Batch consciously if it strains review.";
  }
  return "Many commits fall in burst clusters; consider spacing work or coordinating with reviewers.";
}

const COMMIT_SPACING_TITLE_INFO =
  "We look at the time between each commit and the next. The large number shows how much that timing varies: if it is high, you often alternate between busy stretches and long gaps; if it is low, your commits land at a more steady pace. The line underneath is the usual gap—the median time between one commit and the next, so a single long pause does not inflate it. It is fine if this shifts with how your team works; use it as a rhythm check, not a grade.";

const cardProps = { metricCategory: "commit-habits" as const, hideResearchBadge: true };

export function CommitHabitsCoreSignalsSection({
  mv,
}: {
  mv: CommitHabitsMetricValues;
}) {
  const cpwForCard = mv.commitsPerWeek;
  const cpwTier = tierCommitsPerWeek(cpwForCard);
  const totalTier = tierTotalCommits(mv.totalCommits);
  const largeTier = tierLargeCommitRatio(mv.largeCommitRatio);

  const cpwValue =
    cpwForCard == null || !Number.isFinite(cpwForCard) ? "—" : formatNumber(cpwForCard);

  return (
    <section id="commit-habits-core-signals" aria-labelledby="commit-habits-core-signals-heading" className="space-y-4">
      <h2 id="commit-habits-core-signals-heading" className="text-sm font-medium tracking-wide text-muted-foreground">
        Core Signals
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <CoreSignalCard
          title="Total Commits"
          tier={totalTier}
          value={String(mv.totalCommits)}
          description={describeTotalCommits(mv.totalCommits, totalTier)}
        />
        <CoreSignalCard
          title="Commits Per Week"
          tier={cpwTier}
          value={cpwValue}
          description={describeCommitsPerWeek(cpwForCard, cpwTier, mv.mode === "contributor")}
        />
        <CoreSignalCard
          title="Large Commit Ratio"
          tier={largeTier}
          value={`${formatNumber(mv.largeCommitRatio)}%`}
          description={describeLargeCommit(mv.largeCommitRatio, largeTier)}
        />
      </div>
      {mv.mode === "contributor" ? (
        <p className="text-xs text-muted-foreground max-w-3xl">
          Commits per week reflects the whole repository’s recent window when git exposes it, not a
          per-author weekly rate.
        </p>
      ) : null}
    </section>
  );
}

export function CommitHabitsAdditionalSignalsSection({
  mv,
  quality,
}: {
  mv: CommitHabitsMetricValues;
  quality: CommitHabitsSignalQuality;
}) {
  const medTier = tierMedianCommitSize(mv.medianCommitSize, quality.median);
  const entTier = tierEntropy(mv.entropy, quality.entropy);
  const burstTier = tierBurst(mv.burstRatio, quality.burst);

  const spacingStdLabel = quality.entropy ? formatGapDurationMs(mv.entropy) : "—";
  const spacingMeanLabel =
    quality.entropy && mv.commitSpacingMeanMs > 0 ? formatGapDurationMs(mv.commitSpacingMeanMs) : null;

  return (
    <section aria-labelledby="commit-habits-additional-signals-heading" className="space-y-4">
      <h2 id="commit-habits-additional-signals-heading" className="text-sm font-medium tracking-wide text-muted-foreground">
        Additional Signals
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <CoreSignalCard
          title="Median Commit Size"
          tier={medTier}
          value={quality.median ? formatNumber(mv.medianCommitSize) : "—"}
          description={describeMedian(mv.medianCommitSize, medTier, quality.median)}
        />
        <CoreSignalCard
          title="Commit spacing"
          tier={entTier}
          badgeLabel={commitSpacingBandLabel(entTier)}
          titleInfo={COMMIT_SPACING_TITLE_INFO}
          value={quality.entropy ? spacingStdLabel : "—"}
          secondaryValue={spacingMeanLabel ? `Typical gap: ${spacingMeanLabel}` : undefined}
          description={describeEntropyMs(
            mv.entropy,
            mv.commitSpacingMeanMs,
            entTier,
            quality.entropy,
          )}
        />
        <CoreSignalCard
          title="Burst Ratio"
          tier={burstTier}
          value={quality.burst ? `${formatNumber(mv.burstRatio)}%` : "—"}
          description={describeBurst(mv.burstRatio, burstTier, quality.burst)}
        />
      </div>

      <h3 className="text-sm font-medium text-muted-foreground pt-2">Repository profile</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          {...cardProps}
          label="Avg lines per commit"
          value={formatNumber(mv.avgLinesPerCommit)}
          tooltip="Mean total lines changed per commit."
          metricHelp={{
            title: "Average lines per commit",
            children: <CommitHabitsAvgLinesPerCommitBody />,
          }}
        />
        <MetricCard
          {...cardProps}
          label="Duplication %"
          value={`${formatNumber(mv.duplication)}%`}
          tooltip="Repository-wide duplicate-line share from jscpd (same scan as elsewhere in this app)."
          metricHelp={{
            title: "Duplication percentage",
            children: <CommitHabitsDuplicationPercentBody />,
          }}
        />
        <MetricCard
          {...cardProps}
          label="Framework detected"
          value={mv.framework}
          tooltip="Primary framework signal from the analyzer"
        />
      </div>
    </section>
  );
}
