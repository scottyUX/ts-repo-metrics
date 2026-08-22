"use client";

import { useContext } from "react";
import type { CoachInsightToneKind } from "@/components/results/coach/CoachInsightTone";
import { CoachInsightTone } from "@/components/results/coach/CoachInsightTone";
import type { RepoReport } from "@/lib/reportTypes";
import { CommitHabitsTabInsightContext } from "./CommitHabitsTabInsightContext";
import { CommitHabitsPanelIntro } from "./CommitHabitsPanelIntro";

function toneForTier(tier: string): CoachInsightToneKind {
  if (tier === "critical" || tier === "needs_work") return "concern";
  if (tier === "strong") return "positive";
  return "informational";
}

/**
 * Commit Habits strip intro: AI when configured + tab active; otherwise template fallback.
 */
export function CommitHabitsTabInsightIntro({
  report,
  className,
}: {
  report: RepoReport;
  className?: string;
}) {
  const ctx = useContext(CommitHabitsTabInsightContext);

  if (!ctx) {
    return <CommitHabitsPanelIntro report={report} className={className} />;
  }

  const { facts, data, error, isLoading } = ctx;

  if (error && !data) {
    return <CommitHabitsPanelIntro report={report} className={className} />;
  }

  if (isLoading && !data) {
    return (
      <CoachInsightTone
        tone="informational"
        className={className}
        aria-label="Commit habits"
        bodyClassName="text-muted-foreground text-sm"
      >
        <p>Generating a tailored summary from your git metrics…</p>
      </CoachInsightTone>
    );
  }

  if (data) {
    return (
      <CoachInsightTone
        tone={toneForTier(facts.overallTier)}
        className={className}
        aria-label="Commit habits"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p className="leading-relaxed">{data.intro}</p>
      </CoachInsightTone>
    );
  }

  return <CommitHabitsPanelIntro report={report} className={className} />;
}
