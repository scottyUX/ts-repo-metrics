"use client";

import { useMemo } from "react";
import {
  getCommitHabitsMetricValues,
  COMMIT_HABITS_SCOPE_TEAM,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import type { RepoReport } from "@/lib/reportTypes";
import { analysisTeamOptionLabel, isPrScopedReport } from "@/lib/analysisScope";
import { CommitActivityCard } from "./CommitActivityCard";
import { CommitHabitsChurnHotspotCards, CommitHabitsContributorsTableCard } from "./CommitHabitsGitTables";
import { CommitHabitsMomentumPanel } from "./CommitHabitsMomentumPanel";
import {
  CommitHabitsAdditionalSignalsSection,
  CommitHabitsCoreSignalsSection,
  resolveCommitHabitsSignalQuality,
} from "./CommitHabitsSignalSections";

interface CommitHabitsMetricsTabProps {
  report: RepoReport;
  scopeId: CommitHabitsScopeId;
  onScopeIdChange: (next: CommitHabitsScopeId) => void;
}

export function CommitHabitsMetricsTab({ report, scopeId, onScopeIdChange }: CommitHabitsMetricsTabProps) {
  const contributors = useMemo(() => report.contributors ?? [], [report.contributors]);
  const mv = useMemo(() => getCommitHabitsMetricValues(report, scopeId), [report, scopeId]);
  const signalQuality = useMemo(() => resolveCommitHabitsSignalQuality(report), [report]);

  const gv2 = report.gitMetricsV2;

  const churnMods = (gv2?.churn?.topByModifications ?? []) as Array<{
    file: string;
    modifications: number;
    linesChanged: number;
  }>;
  const churnLines = (gv2?.churn?.topByLinesChanged ?? []) as Array<{
    file: string;
    modifications: number;
    linesChanged: number;
  }>;

  const teamOnly = mv.mode === "team";

  return (
    <div className="space-y-8">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="commit-habits-scope" className="text-sm font-medium text-foreground">
              View metrics for
            </label>
            <select
              id="commit-habits-scope"
              value={scopeId}
              onChange={(e) => onScopeIdChange(e.target.value)}
              className="min-w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={COMMIT_HABITS_SCOPE_TEAM}>{analysisTeamOptionLabel(report)}</option>
              {contributors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.authorEmail || c.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <CommitHabitsCoreSignalsSection mv={mv} />
      <CommitHabitsAdditionalSignalsSection mv={mv} quality={signalQuality} />

      <CommitActivityCard report={report} scopeId={scopeId} />

      {contributors.length > 0 ? (
        <section>
          <CommitHabitsContributorsTableCard contributors={contributors} />
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold mb-4">Where changes cluster</h2>
        {!teamOnly ? (
          <p className="text-sm text-muted-foreground mb-2 max-w-3xl">
            Hotspots reflect <strong>{isPrScopedReport(report) ? "this pull request" : "full-repository"}</strong> history across all authors, not this
            person alone.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground mb-4">
          Files that show up most in recent history. <strong>Modifications</strong> counts how often a
          file appears in commit file lists; <strong>lines changed</strong> is add + delete summed
          across commits. Clustered activity often marks integration hotspots worth coordinating on as
          a team.
        </p>
        <CommitHabitsChurnHotspotCards churnMods={churnMods} churnLines={churnLines} />
      </section>

      <CommitHabitsMomentumPanel />
    </div>
  );
}
