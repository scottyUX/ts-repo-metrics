"use client";

import { useMemo } from "react";
import { MetricCard } from "../MetricCard";
import { CodeQualityImprovementSection } from "./CodeQualityImprovementSection";
import { CodeQualityComplexityDistributionCard } from "./CodeQualityComplexityDistributionCard";
import { CodeQualityCoreSignalsSection } from "./CodeQualityCoreSignalsSection";
import { HotspotTables } from "../HotspotTables";
import { FileTable } from "../FileTable";
import type { RepoReport } from "@/lib/reportTypes";
import {
  COMMIT_HABITS_SCOPE_TEAM,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import { analysisTeamOptionLabel, isPrScopedReport } from "@/lib/analysisScope";
import {
  buildCodeQualityDisplayReport,
  resolveCodeQualityScope,
} from "@/lib/codeQualityScope";
import {
  CodeQualityAvgFunctionLengthBody,
  CodeQualityCyclomaticAvgBody,
  CodeQualityCyclomaticMaxBody,
  CodeQualityDuplicationPercentBody,
  CodeQualityHighComplexityCountBody,
  CodeQualityLongFunctionCountBody,
  CodeQualityMaintainabilityClassBody,
  CodeQualityMaintainabilityScoreBody,
  CodeQualityMaxNestingDepthBody,
  CodeQualityP90ComplexityBody,
  CodeQualityP90FunctionLengthBody,
} from "./metricHelpContent";

interface CodeQualityMetricsTabProps {
  report: RepoReport;
  scopeId: CommitHabitsScopeId;
  onScopeIdChange: (next: CommitHabitsScopeId) => void;
  onOpenTestingTab?: () => void;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function CodeQualityMetricsTab({
  report,
  scopeId,
  onScopeIdChange,
  onOpenTestingTab,
}: CodeQualityMetricsTabProps) {
  const contributors = useMemo(() => report.contributors ?? [], [report.contributors]);

  const scope = useMemo(() => resolveCodeQualityScope(report, scopeId), [report, scopeId]);

  const displayReport = useMemo(
    () => buildCodeQualityDisplayReport(report, scope),
    [report, scope],
  );

  const r = displayReport;
  const dist = r.distributions;
  const comp = r.complexity;
  const fm = r.functionMetricsSummary;

  const baseSmells = report.smells;

  const totalFunctions = r.totals?.functions ?? 0;
  const avgComplexity = comp?.average ?? 0;
  const maxComplexity = comp?.max ?? 0;
  const highComplexityCount = comp?.highComplexityFunctions ?? 0;
  const avgFunctionLength = fm?.averageLength ?? 0;
  const longFunctionCount = scope.longFunctionCount;
  const maxNestingDepth = fm?.maxNestingDepth ?? 0;
  const p90FunctionLength = dist?.p90_function_length ?? 0;
  const p90Complexity = dist?.p90_complexity ?? 0;
  const maintainabilityScore = report.maintainability?.score ?? 0;
  const maintainabilityClass = report.maintainability?.classification ?? "—";
  const duplicationPercent = report.duplication?.percentage ?? 0;
  const consoleLogCount = baseSmells?.consoleLogs ?? 0;
  const emptyCatchBlocks = baseSmells?.emptyCatchBlocks ?? 0;
  const longParamCount = baseSmells?.longParameterLists ?? 0;

  const hygieneHint =
    scope.mode === "contributor" && (scope.pathFilterActive || scope.pathFilterMissing)
      ? " Full repository snapshot — not limited to this author’s paths."
      : "";

  const structuralSubtitle = (() => {
    if (scope.contributorFilterYieldedNone) {
      return "No files in this view — contributor paths did not overlap the analysis.";
    }
    if (scope.pathFilterActive && scope.contributorDisplayName) {
      const n = scope.scopedPerFile.length;
      return `${n} file${n === 1 ? "" : "s"} from ${scope.contributorDisplayName}'s git-touched source paths.`;
    }
    return isPrScopedReport(report)
      ? "Pull-request static scan of changed source files."
      : "Whole-repository static scan.";
  })();

  return (
    <div className="space-y-8">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="code-quality-scope" className="text-sm font-medium text-foreground">
              View metrics for
            </label>
            <select
              id="code-quality-scope"
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

      {scope.pathFilterMissing && scope.mode === "contributor" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/25 dark:text-amber-50">
          Path-level scoping is unavailable for this contributor (no source path list in this run).
          Structural metrics show the full analyzed tree; hygiene cards are always repo-wide.
        </p>
      ) : null}

      {scope.contributorFilterYieldedNone ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          No analyzed files overlap this contributor&apos;s recorded source paths. Select{" "}
          {isPrScopedReport(report) ? "this pull request" : "whole repository"}{" "}
          or re-run with git history that includes path stats.
        </p>
      ) : null}

      {scope.pathFilterActive && !scope.contributorFilterYieldedNone ? (
        <p className="text-sm text-muted-foreground max-w-3xl">
          <strong>Structural scope:</strong> {structuralSubtitle}
        </p>
      ) : null}

      <CodeQualityCoreSignalsSection report={displayReport} />

      <section aria-labelledby="code-quality-additional-signals-heading" className="space-y-8">
        <h2 id="code-quality-additional-signals-heading" className="text-lg font-semibold">
          Additional signals
        </h2>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Structural complexity</h3>
          <p className="text-xs text-muted-foreground max-w-3xl">{structuralSubtitle}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Total functions"
              value={totalFunctions}
              metricCategory="code-quality"
              hideResearchBadge
              description="Callable units with paired complexity in this view (matches hotspot rows)."
              tooltip="Paired function + complexity rows in scoped files."
            />
            <MetricCard
              label="Avg complexity"
              value={formatNumber(avgComplexity)}
              metricCategory="code-quality"
              hideResearchBadge
              description="Mean cyclomatic complexity across functions in this view."
              tooltip="Mean cyclomatic complexity across functions."
              metricHelp={{
                title: "Average cyclomatic complexity",
                children: <CodeQualityCyclomaticAvgBody />,
              }}
            />
            <MetricCard
              label="Max complexity"
              value={maxComplexity}
              metricCategory="code-quality"
              hideResearchBadge
              description="Worst single-function cyclomatic value in this view."
              tooltip="Largest per-function cyclomatic value in this view."
              metricHelp={{
                title: "Maximum cyclomatic complexity",
                children: <CodeQualityCyclomaticMaxBody />,
              }}
            />
            <MetricCard
              label="High complexity count"
              value={highComplexityCount}
              metricCategory="code-quality"
              hideResearchBadge
              description="Functions with cyclomatic > 10 (engine threshold), in this view."
              tooltip="Strictly > 10 — matches highComplexityFunctions for this scope."
              metricHelp={{
                title: "High complexity function count",
                children: <CodeQualityHighComplexityCountBody />,
              }}
            />
            <MetricCard
              label="Avg function length"
              value={formatNumber(avgFunctionLength)}
              metricCategory="code-quality"
              hideResearchBadge
              description="Average physical lines per function (size proxy, not complexity)."
              tooltip="Mean physical lines per function."
              metricHelp={{
                title: "Average function length",
                children: <CodeQualityAvgFunctionLengthBody />,
              }}
            />
            <MetricCard
              label="Long function count"
              value={longFunctionCount}
              metricCategory="code-quality"
              hideResearchBadge
              description="Functions over 50 lines in this view."
              tooltip="Paired rows with more than 50 lines."
              metricHelp={{
                title: "Long function count",
                children: <CodeQualityLongFunctionCountBody />,
              }}
            />
            <MetricCard
              label="Max nesting depth"
              value={maxNestingDepth}
              metricCategory="code-quality"
              hideResearchBadge
              description="Deepest nesting of control structures in any function in this view."
              tooltip="Deepest control-structure nesting in any function."
              metricHelp={{
                title: "Maximum nesting depth",
                children: <CodeQualityMaxNestingDepthBody />,
              }}
            />
            <MetricCard
              label="P90 function length"
              value={formatNumber(p90FunctionLength)}
              metricCategory="code-quality"
              hideResearchBadge
              description="90th percentile length in this view."
              tooltip="90th percentile of function lengths."
              metricHelp={{
                title: "P90 function length",
                children: <CodeQualityP90FunctionLengthBody />,
              }}
            />
            <MetricCard
              label="P90 complexity"
              value={formatNumber(p90Complexity)}
              metricCategory="code-quality"
              hideResearchBadge
              description="90th percentile cyclomatic in this view."
              tooltip="90th percentile of cyclomatic complexity."
              metricHelp={{
                title: "P90 cyclomatic complexity",
                children: <CodeQualityP90ComplexityBody />,
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Maintainability &amp; hygiene</h3>
          {hygieneHint ? (
            <p className="text-xs text-muted-foreground max-w-3xl">
              These cards reflect the <strong>{isPrScopedReport(report) ? "pull-request" : "full repository"}</strong> snapshot from the analyzer, not
              the contributor path filter.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Maintainability score"
              value={formatNumber(maintainabilityScore)}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Composite maintainability index (0–100-style) when the engine emits it.${hygieneHint}`}
              tooltip="Repo-level index on 0–100 (Coleman-style composite)."
              metricHelp={{
                title: "Maintainability score",
                children: <CodeQualityMaintainabilityScoreBody />,
              }}
            />
            <MetricCard
              label="Maintainability class"
              value={maintainabilityClass}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Bucket derived from the score—for quick communication, not a grade.${hygieneHint}`}
              tooltip="Band from the score: low / moderate / high."
              metricHelp={{
                title: "Maintainability class",
                children: <CodeQualityMaintainabilityClassBody />,
              }}
            />
            <MetricCard
              label="Duplication %"
              value={`${formatNumber(duplicationPercent)}%`}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Estimated duplicated lines (jscpd) when duplication analysis ran.${hygieneHint}`}
              tooltip="jscpd duplicate-line percentage when available."
              metricHelp={{
                title: "Duplication percentage",
                children: <CodeQualityDuplicationPercentBody />,
              }}
            />
            <MetricCard
              label="Console log count"
              value={consoleLogCount}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Calls to console.log, warn, or error—often noise before production.${hygieneHint}`}
              tooltip="Calls to console.log, console.warn, or console.error"
            />
            <MetricCard
              label="Empty catch blocks"
              value={emptyCatchBlocks}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Catches with empty bodies—errors can fail silently.${hygieneHint}`}
              tooltip="Catch clauses with an empty body"
            />
            <MetricCard
              label="Long parameter list count"
              value={longParamCount}
              metricCategory="code-quality"
              hideResearchBadge
              description={`Functions with more than four parameters—consider objects or splits.${hygieneHint}`}
              tooltip="Functions with more than 4 parameters"
            />
          </div>
        </div>
      </section>

      <section
        id="code-quality-hotspots"
        className="scroll-mt-8 space-y-4"
        aria-label="Complexity distribution and hotspots"
      >
        <div className="space-y-4">
          <CodeQualityComplexityDistributionCard report={displayReport} />
          <HotspotTables report={displayReport} />
        </div>
      </section>

      <section aria-labelledby="code-quality-per-file-heading">
        <h2 id="code-quality-per-file-heading" className="text-lg font-semibold mb-4">
          Per-file table
        </h2>
        <FileTable report={displayReport} />
      </section>

      <CodeQualityImprovementSection onOpenTestingTab={onOpenTestingTab} />
    </div>
  );
}
