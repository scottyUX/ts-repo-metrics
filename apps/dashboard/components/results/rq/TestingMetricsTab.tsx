"use client";

import { useMemo } from "react";
import { MetricCard } from "../MetricCard";
import { TestingRiskQuadrant } from "./TestingRiskQuadrant";
import { SymbolRiskProximityFullPageDialog } from "./SymbolRiskProximityFullPageDialog";
import { SymbolRiskScatter } from "./SymbolRiskScatter";
import type { RepoReport } from "@/lib/reportTypes";
import {
  COMMIT_HABITS_SCOPE_TEAM,
  findContributorForScope,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import { filterSymbolVerificationRisksForContributor } from "@/lib/filterSymbolVerificationRisksForContributor";
import { getTestingScopeMetricValues } from "@/lib/testingScopeMetrics";
import { analysisTeamOptionLabel, isPrScopedReport } from "@/lib/analysisScope";
import {
  TestingConceptCyclomaticComplexityBody,
  TestingConceptProximityBandsBody,
  TestingConceptRiskTierBody,
  TestingGitSourcePathsTouchedBody,
  TestingGitTestChurnRatioBody,
  TestingGitTestLineChurnBody,
  TestingGitTestPathsTouchedBody,
  TestingPctCommitsTouchingTestsBody,
  TestingRefactorCommitRatioBody,
  TestingSymbolProximityScanBody,
  TestingTestCoverageProxyBody,
  TestingTestLocRatioBody,
} from "./metricHelpContent";
import { ConceptHelpDialog } from "../ConceptHelpDialog";
import { buildScatterPoints } from "@/lib/symbolRiskViz";
import { CoachExplainButton } from "@/components/chat/CoachExplainButton";
import { useCoachExplain } from "@/lib/repoCoachContext";
import { TESTING_EXPLAIN_PROXIMITY, TESTING_EXPLAIN_SAFETY_NETS } from "@/lib/testingCoachExplainPrompts";
import { TestingCoreSignalsSection } from "./TestingCoreSignalsSection";
import { TestingImprovementSection } from "./TestingImprovementSection";

interface TestingMetricsTabProps {
  report: RepoReport;
  scopeId: CommitHabitsScopeId;
  onScopeIdChange: (next: CommitHabitsScopeId) => void;
  /** Switch parent results tabs to Code Quality (structural metrics). */
  onOpenCodeQualityTab?: () => void;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3);
}

function formatRatio(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n);
}

function capitalizeWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TestingMetricsTab({ report, scopeId, onScopeIdChange, onOpenCodeQualityTab }: TestingMetricsTabProps) {
  const coachExplain = useCoachExplain();

  const contributors = useMemo(() => report.contributors ?? [], [report.contributors]);
  const mv = useMemo(() => getTestingScopeMetricValues(report, scopeId), [report, scopeId]);

  const scopedContributor = useMemo(() => {
    if (scopeId === COMMIT_HABITS_SCOPE_TEAM || !String(scopeId ?? "").trim()) return null;
    return findContributorForScope(report, scopeId) ?? null;
  }, [report, scopeId]);

  const symbolRiskFilter = useMemo(
    () =>
      filterSymbolVerificationRisksForContributor(report.symbolVerificationRisks, {
        scopeTeam: mv.mode === "team",
        sourcePathsTouchedList:
          mv.mode === "contributor" ? scopedContributor?.sourcePathsTouchedList : null,
      }),
    [mv.mode, report.symbolVerificationRisks, scopedContributor?.sourcePathsTouchedList],
  );

  const symbolRiskRowsScoped = symbolRiskFilter.rows;
  const scatterPoints = useMemo(
    () => (symbolRiskRowsScoped.length ? buildScatterPoints(symbolRiskRowsScoped) : []),
    [symbolRiskRowsScoped],
  );

  const symbolProximitySummary = useMemo(() => {
    const rows = symbolRiskRowsScoped;
    if (!rows.length) return null;
    let referencedInTest = 0;
    let pairedFileOnly = 0;
    let none = 0;
    for (const r of rows) {
      if (r.evidence === "referenced_in_test") referencedInTest++;
      else if (r.evidence === "paired_file_only") pairedFileOnly++;
      else none++;
    }
    const withSignal = referencedInTest + pairedFileOnly;
    return { total: rows.length, referencedInTest, pairedFileOnly, none, withSignal };
  }, [symbolRiskRowsScoped]);

  const complexity = report.complexity;
  const smells = report.smells;
  const profile = report.profile;
  const testLocRatioForQuadrant =
    profile && profile.sourceLOC > 0 ? profile.testLOC / profile.sourceLOC : 0;

  const { riskIndex, verificationIndex, riskLabel, verificationLabel } = useMemo(() => {
    const highComplexityCount = complexity?.highComplexityFunctions ?? 0;
    const longFunctionCount = smells?.longFunctions ?? 0;
    const riskRaw = highComplexityCount + longFunctionCount;
    const riskIndex = Math.min(1, riskRaw / 20);
    const verificationIndex = Math.min(1, testLocRatioForQuadrant * 5);
    const riskLabel: "Low" | "High" = riskRaw >= 10 ? "High" : "Low";
    const verificationLabel: "Low" | "High" = testLocRatioForQuadrant >= 0.1 ? "High" : "Low";
    return {
      riskIndex,
      verificationIndex,
      riskLabel,
      verificationLabel,
    };
  }, [complexity?.highComplexityFunctions, smells?.longFunctions, testLocRatioForQuadrant]);

  const cardProps = { metricCategory: "testing" as const, hideResearchBadge: true };
  const teamOnly = mv.mode === "team";

  const pctTestTooltip =
    mv.mode === "contributor"
      ? "Among this author's commits, the fraction that touches at least one path detected as a test file."
      : "Commits where any changed path is a test file.";
  const refactorTooltip =
    mv.mode === "contributor"
      ? "Among this author's commits, the fraction whose subjects match refactor-style keywords."
      : "Commits whose subject matches refactor-style keywords.";
  const locSnapshotTooltip =
    "Counted across the entire repository snapshot (not split by contributor).";
  const gitChurnTooltip =
    "Sum of lines added + deleted (git numstat) on paths in this author’s commits, split by test vs non-test file patterns—historical churn, not current tree size.";

  const safetyNetsSectionTitle = useMemo(() => {
    const fromGitHistory = mv.locSource === "gitChurn";
    const label = fromGitHistory ? "Git-based test signals" : "Other Signals";
    if (mv.mode === "team") return label;
    return `${label} (${mv.contributorDisplayName ?? "contributor"})`;
  }, [mv.contributorDisplayName, mv.locSource, mv.mode]);

  const riskProfileTitle =
    mv.mode === "team" ? "Your risk profile" : `Your risk profile (${isPrScopedReport(report) ? "this pull request" : "whole repository"})`;

  const scatterRaw = report.symbolVerificationRisks;
  const scatterUnavailable = scatterRaw === undefined;
  const scatterEmptyRaw = scatterRaw?.length === 0;
  const scatterFilteredEmpty = symbolRiskFilter.contributorFilterYieldedNone;

  const proximitySummaryTooltip = symbolProximitySummary
    ? symbolRiskFilter.contributorFilterActive
      ? `Filtered to functions in source files this author touched (git numstat paths). Referenced in paired test: ${symbolProximitySummary.referencedInTest}. Paired file only: ${symbolProximitySummary.pairedFileOnly}. No static link: ${symbolProximitySummary.none}.`
      : `${isPrScopedReport(report) ? "Pull-request" : "Whole-repository"} symbol scan (same rows as the scatter/table below). Referenced in paired test: ${symbolProximitySummary.referencedInTest}. Paired file only: ${symbolProximitySummary.pairedFileOnly}. No static link: ${symbolProximitySummary.none}.`
    : "";

  const pathScopeUnavailableForContributor =
    mv.mode === "contributor" &&
    scopedContributor != null &&
    !scopedContributor.sourcePathsTouchedList?.length;

  return (
    <div className="space-y-8">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="testing-scope" className="text-sm font-medium text-foreground">
              View metrics for
            </label>
            <select
              id="testing-scope"
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

      <div
        className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5 text-xs leading-snug text-muted-foreground"
        role="note"
        aria-label="How Testing tab metrics are scoped"
      >
        <span className="font-semibold text-foreground">Data scope — </span>
        <span className="text-foreground/90">
          <strong>Per author</strong> (dropdown): test/source churn, unique paths touched, % commits touching tests,
          refactor ratio when git numstat is available.
        </span>{" "}
        <span className="text-foreground/90">
          <strong>{isPrScopedReport(report) ? "This pull request" : "Whole repository"}</strong>: test coverage proxy, risk quadrant, complexity aggregates.
        </span>{" "}
        <span className="text-foreground/90">
          <strong>Symbol scatter</strong>: static analyzer scan
          {symbolRiskFilter.contributorFilterActive
            ? ", narrowed to production files this author touched in git history."
            : pathScopeUnavailableForContributor
              ? " across the full analyzed tree this run (path narrowing unavailable — no per-author source path list)."
              : " for all matching functions."}
        </span>
      </div>

      {pathScopeUnavailableForContributor ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/25 dark:text-amber-50">
          Path-level scoping is unavailable for this contributor (no source path list in this run).
          Structural metrics show the full analyzed tree; hygiene cards are always repo-wide.
        </p>
      ) : null}

      {!teamOnly ? (
        mv.locSource === "gitChurn" ? (
          <>
            <p className="text-sm text-muted-foreground max-w-3xl">
              The first metrics in this section use per-author git churn (test vs
              non-test paths) for your selection. Complexity and the quadrant still describe the whole
              repository scan.
            </p>
            <p className="text-sm font-medium text-foreground max-w-3xl">
              Note: <strong>% commits touching tests</strong> and{" "}
              <strong>Refactor commit ratio</strong> are also computed for the selected author.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Per-author test vs source churn needs a full <code className="text-xs">git log --numstat</code>{" "}
              run (same pipeline as extended git metrics). This report used commit metadata only—test/source
              size below is the analyzer&apos;s snapshot of the repo (same figures for everyone), not churn
              for one person.
            </p>
            <p className="text-sm font-medium text-foreground max-w-3xl">
              Note: <strong>% commits touching tests</strong> and{" "}
              <strong>Refactor commit ratio</strong> still reflect the selected teammate on this analysis.
            </p>
          </>
        )
      ) : null}

      <TestingCoreSignalsSection mv={mv} report={report} testingScopeId={scopeId} />

      <section id="testing-safety-nets">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold flex-1 min-w-0">{safetyNetsSectionTitle}</h2>
          <CoachExplainButton prompt={TESTING_EXPLAIN_SAFETY_NETS} send={coachExplain} />
        </div>
        {mv.locSource === "gitChurn" ? (
          <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
            Test/source churn and file counts below are from git history for the selected teammate (add +
            delete lines per path). Other cards in this section still use repo-wide scan data where noted.
          </p>
        ) : null}
        <div key={`testing-primary-metrics-${scopeId}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            {...cardProps}
            label={mv.locSource === "gitChurn" ? "Test line churn (git)" : "Test LOC"}
            value={mv.testLoc}
            tooltip={
              mv.locSource === "gitChurn"
                ? `Test-path line churn (add + del). ${gitChurnTooltip}`
                : `Lines of code in test files (*.test / *.spec). ${locSnapshotTooltip}`
            }
            metricHelp={
              mv.locSource === "gitChurn"
                ? {
                    title: "Test line churn (git)",
                    children: <TestingGitTestLineChurnBody />,
                  }
                : undefined
            }
          />
          <MetricCard
            {...cardProps}
            label={mv.locSource === "gitChurn" ? "Test churn / source churn" : "Test LOC ratio"}
            value={formatRatio(mv.testLocRatio)}
            tooltip={
              mv.locSource === "gitChurn"
                ? `test line churn divided by source line churn for this author. If source churn is 0 but test churn exists, ratio is shown as 0 (no comparable denominator). ${gitChurnTooltip}`
                : `testLOC ÷ sourceLOC. ${locSnapshotTooltip}`
            }
            metricHelp={
              mv.locSource === "profile"
                ? {
                    title: "Test LOC ratio",
                    children: <TestingTestLocRatioBody />,
                  }
                : {
                    title: "Test churn / source churn",
                    children: <TestingGitTestChurnRatioBody />,
                  }
            }
          />
          <MetricCard
            {...cardProps}
            label={mv.locSource === "gitChurn" ? "Test files touched" : "Test files"}
            value={mv.testFiles}
            tooltip={
              mv.locSource === "gitChurn"
                ? `Distinct paths matching the test file pattern in this author’s commits. ${gitChurnTooltip}`
                : `Files matching *.test.ts, *.spec.ts, etc. ${locSnapshotTooltip}`
            }
            metricHelp={
              mv.locSource === "gitChurn"
                ? {
                    title: "Test paths touched (git)",
                    children: <TestingGitTestPathsTouchedBody />,
                  }
                : undefined
            }
          />
          {mv.sourceFilesTouched != null ? (
            <MetricCard
              {...cardProps}
              label="Source files touched"
              value={mv.sourceFilesTouched}
              tooltip={`Distinct non-test paths in this author’s commits. ${gitChurnTooltip}`}
              metricHelp={
                mv.locSource === "gitChurn"
                  ? {
                      title: "Source files touched (git)",
                      children: <TestingGitSourcePathsTouchedBody />,
                    }
                  : undefined
              }
            />
          ) : null}
          <MetricCard
            {...cardProps}
            label="% commits touching tests"
            value={`${formatNumber(mv.pctCommitsTouchingTests)}%`}
            tooltip={pctTestTooltip}
            metricHelp={{
              title: "Percent of commits touching tests",
              children: <TestingPctCommitsTouchingTestsBody />,
            }}
          />
          {report.testCoverageProxy ? (
            <MetricCard
              {...cardProps}
              label="Test coverage proxy (snapshot)"
              value={`${formatNumber(report.testCoverageProxy.ratio * 100)}% · ${capitalizeWord(report.testCoverageProxy.classification)}`}
              tooltip={`Static test LOC ÷ source LOC on the full tree, bucketed low (&lt;10%), moderate (10–30%), high (&gt;30%). Same snapshot for every scope—not author churn. ${locSnapshotTooltip}`}
              metricHelp={{
                title: "Test coverage proxy",
                children: <TestingTestCoverageProxyBody />,
              }}
            />
          ) : null}
          {symbolProximitySummary ? (
            <MetricCard
              {...cardProps}
              label="Functions with static test link"
              value={`${symbolProximitySummary.withSignal} / ${symbolProximitySummary.total}`}
              tooltip={proximitySummaryTooltip}
              metricHelp={{
                title: "Static test linkage (summary)",
                children: <TestingSymbolProximityScanBody />,
              }}
            />
          ) : null}
          <MetricCard
            {...cardProps}
            label="Refactor commit ratio"
            value={`${formatNumber(mv.refactorCommitRatio)}%`}
            tooltip={refactorTooltip}
            metricHelp={{
              title: "Refactor commit ratio",
              children: <TestingRefactorCommitRatioBody />,
            }}
          />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4 lg:gap-x-6 lg:gap-y-5">
        <div className="col-span-12 flex flex-wrap items-center gap-x-2 gap-y-2">
          <h2 className="text-lg font-semibold flex-1 min-w-[14rem]">
            Complexity versus test proximity
          </h2>
          <div className="flex flex-wrap items-center gap-1">
            <ConceptHelpDialog title="Cyclomatic complexity" ariaLabel="About cyclomatic complexity">
              <TestingConceptCyclomaticComplexityBody />
            </ConceptHelpDialog>
            <ConceptHelpDialog title="Test proximity bands" ariaLabel="About the three proximity bands">
              <TestingConceptProximityBandsBody />
            </ConceptHelpDialog>
            <ConceptHelpDialog title="Risk tier" ariaLabel="About risk tier dot colors">
              <TestingConceptRiskTierBody />
            </ConceptHelpDialog>
            <CoachExplainButton prompt={TESTING_EXPLAIN_PROXIMITY} send={coachExplain} />
          </div>
        </div>
        <p className="col-span-12 max-w-3xl text-sm text-muted-foreground">
          Each dot is one function: <strong>X</strong> is cyclomatic complexity. Rows are{" "}
          <strong>three discrete bands</strong> (no paired test file → paired file only → function name seen
          in paired test)—not a smooth 0–1 axis. Dot <strong>color</strong> is{" "}
          <strong>risk tier</strong> from complexity × proximity. That is{" "}
          <strong>not line coverage</strong>. Cursor/IDE audit logs about AI edits are not incorporated in
          this release.
          {symbolRiskFilter.contributorFilterActive ? (
            <>
              {" "}
              With a teammate selected, dots are limited to functions in <strong>source files that author
              touched</strong> according to git numstat paths (same list that drives “Source files touched”).
            </>
          ) : pathScopeUnavailableForContributor ? (
            <>
              {" "}
              Path narrowing for scatter is unavailable for this contributor on this report; dots include all
              analyzed functions (see notice above).
            </>
          ) : null}
        </p>
        {scatterUnavailable ? (
          <p className="col-span-12 text-sm text-muted-foreground border rounded-md px-4 py-3 bg-muted/30">
            Re-run analysis with the current analyzer to populate this view (cached reports may omit
            symbol-level rows).
          </p>
        ) : scatterEmptyRaw ? (
          <p className="col-span-12 text-sm text-muted-foreground border rounded-md px-4 py-3 bg-muted/30">
            No matching rows (no qualifying functions or no paired-test layout found).
          </p>
        ) : scatterFilteredEmpty ? (
          <p className="col-span-12 text-sm text-muted-foreground border rounded-md px-4 py-3 bg-muted/30">
            No symbol rows remain after narrowing to source files this author touched in git history (paths
            must overlap the static analyzer&apos;s function list). Try {isPrScopedReport(report) ? "this pull request" : "whole repository"} or pick another
            teammate.
          </p>
        ) : (
          <div className="col-span-12 min-w-0 space-y-4">
            <SymbolRiskScatter points={scatterPoints} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SymbolRiskProximityFullPageDialog
                rows={symbolRiskRowsScoped}
                instanceKey={`${report.analysis_timestamp ?? ""}-${scopeId}-${symbolRiskRowsScoped.length}-${symbolRiskFilter.contributorFilterActive ? "author-paths" : "all"}`}
              />
            </div>
          </div>
        )}
      </section>

      <section>
        <TestingRiskQuadrant
          sectionTitle={riskProfileTitle}
          riskIndex={riskIndex}
          verificationIndex={verificationIndex}
          riskLabel={riskLabel}
          verificationLabel={verificationLabel}
          wholeRepositoryNote={!teamOnly}
          structuralRiskSignals={{
            highComplexityFunctions: complexity?.highComplexityFunctions ?? 0,
            longFunctions: smells?.longFunctions ?? 0,
          }}
          testLocShare={testLocRatioForQuadrant}
        />
      </section>

      <TestingImprovementSection mv={mv} onOpenCodeQualityTab={onOpenCodeQualityTab} />
    </div>
  );
}
