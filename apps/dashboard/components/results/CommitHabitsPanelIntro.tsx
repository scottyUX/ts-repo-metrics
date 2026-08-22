"use client";

import { CoachInsightTone } from "@/components/results/coach/CoachInsightTone";
import type { RepoReport } from "@/lib/reportTypes";

/** Rule-based Commit Habits intro (fallback when tab-insight API unavailable). */
export function CommitHabitsPanelIntro({
  report,
  className,
}: {
  report: RepoReport;
  className?: string;
}) {
  const git = report.git;
  const tc = git?.totalCommits ?? 0;
  const cpw = git?.commitsPerWeek ?? 0;
  const hasV2 = Boolean(report.gitMetricsV2);

  const recentWindowEmpty = tc > 0 && cpw === 0;

  const cadenceStrong = tc >= 15 && cpw >= 1.2;
  const cadenceWeak =
    tc < 8 || (cpw > 0 && cpw < 0.35) || (tc > 0 && cpw === 0 && !hasV2);

  if (recentWindowEmpty && hasV2) {
    return (
      <CoachInsightTone
        tone="informational"
        className={className}
        aria-label="Commit habits"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          This analysis found <strong className="text-foreground">{tc}</strong> commits in history, but{" "}
          <strong className="text-foreground">none in the recent 13-week window</strong> used for weekly
          cadence. Activity below reflects full-history totals; integrate again to refresh signals.
        </p>
      </CoachInsightTone>
    );
  }

  if (cadenceStrong) {
    return (
      <CoachInsightTone
        tone="positive"
        className={className}
        aria-label="Commit habits"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Commit habits look healthy in this snapshot—about{" "}
          <strong className="text-foreground">{cpw.toFixed(1)}</strong> commits per week with{" "}
          <strong className="text-foreground">{tc}</strong> commits in parsed history. Use Core signals
          below to watch for drift on the next analysis.
        </p>
      </CoachInsightTone>
    );
  }

  if (cadenceWeak) {
    return (
      <CoachInsightTone
        tone="concern"
        className={className}
        aria-label="Commit habits"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Commit volume or cadence looks thin compared with active teams. Even small, frequent pushes
          improve integration and review. Check git mode in your export (API-only runs sometimes omit line
          stats) and aim for steadier batches below.
        </p>
      </CoachInsightTone>
    );
  }

  return (
    <CoachInsightTone
      tone="informational"
      className={className}
      aria-label="Commit habits"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        You have <strong className="text-foreground">{tc}</strong> commits in parsed history and about{" "}
        <strong className="text-foreground">{cpw.toFixed(1)}</strong> commits per week in the recent
        window—reasonable rhythm. Refine batch size and bursts using the signals and commit activity below.
      </p>
    </CoachInsightTone>
  );
}
