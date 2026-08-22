"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { CoachInsightTone } from "@/components/results/coach/CoachInsightTone";
import type { RepoReport } from "@/lib/reportTypes";
import { tryGetPhase2Summary } from "@/lib/phase2Summary";
import { RESULTS_TAB, type ResultsTabId } from "@/lib/resultsNavigation";
import { cn } from "@/lib/utils";
import { CommitHabitsTabInsightIntro } from "./CommitHabitsTabInsightIntro";
import {
  COMMIT_HABITS_SCOPE_TEAM,
  findContributorForScope,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import { getTestingScopeMetricValues } from "@/lib/testingScopeMetrics";
import { resolveCodeQualityScope } from "@/lib/codeQualityScope";
import { UI_COMPLEXITY_CRITICAL_GT } from "@/lib/uiComplexityThresholds";

interface ResultsTabPanelIntroProps {
  activeTab: string;
  report: RepoReport;
  className?: string;
  /** Scoped contributor for Testing tab intro (aligned with “View metrics for”). */
  testingScopeId?: CommitHabitsScopeId;
  /** Scoped contributor for Code Quality tab intro. */
  codeQualityScopeId?: CommitHabitsScopeId;
}

function totalCommitsFromReport(report: RepoReport): number | null {
  const g = report.git?.totalCommits;
  if (typeof g === "number" && g > 0) return g;
  const cs = report.contributors?.map((c) => c.commitCount) ?? [];
  const sum = cs.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

function TestingVerificationIntro({
  report,
  testingScopeId = COMMIT_HABITS_SCOPE_TEAM,
  className,
}: {
  report: RepoReport;
  testingScopeId?: CommitHabitsScopeId;
  className?: string;
}) {
  const mv = getTestingScopeMetricValues(report, testingScopeId);
  const isContributor = mv.mode === "contributor";
  const scopeLabel = mv.contributorDisplayName?.trim() || "This contributor";
  const fromGitChurn = isContributor && mv.locSource === "gitChurn";

  const pct = mv.pctCommitsTouchingTests;
  const testLocRatio = mv.testLocRatio;
  const snapshotTestFiles = report.profile?.testFiles ?? 0;
  /** Distinct test paths (git churn) vs. test files in tree snapshot */
  const testCountForCopy = fromGitChurn ? mv.testFiles : snapshotTestFiles;
  const testCountLabel = fromGitChurn
    ? `distinct test path${testCountForCopy === 1 ? "" : "s"} they touched in parsed history`
    : `test file${snapshotTestFiles === 1 ? "" : "s"} in the repo snapshot`;

  const authorRow =
    isContributor && testingScopeId
      ? findContributorForScope(report, testingScopeId)
      : undefined;
  const authorCommits =
    isContributor &&
    typeof authorRow?.commitCount === "number" &&
    authorRow.commitCount > 0
      ? authorRow.commitCount
      : null;

  const totalCommits = totalCommitsFromReport(report);
  const commitsNoun = isContributor
    ? authorCommits != null
      ? `${authorCommits} commit${authorCommits === 1 ? "" : "s"} for ${scopeLabel}`
      : `${scopeLabel}’s commits in this analysis`
    : totalCommits != null
      ? `${totalCommits} commit${totalCommits === 1 ? "" : "s"}`
      : "your commits";

  const needsTestingFocus = pct < 10 || testLocRatio < 0.12;

  const detailSentence = (() => {
    if (fromGitChurn) {
      if (testCountForCopy === 0 && pct <= 0) {
        return `${scopeLabel} has no test-path churn in parsed history, and none of ${commitsNoun} include test file changes.`;
      }
      if (pct <= 0) {
        return `${scopeLabel} touched ${testCountForCopy} ${testCountLabel}, but none of ${commitsNoun} include test-path changes—tests may live in files they have not modified yet.`;
      }
      return `${scopeLabel} touched ${testCountForCopy} ${testCountLabel}, and about ${Math.round(pct)}% of ${commitsNoun} touch tests—there is still room to make verification a default part of their changes.`;
    }
    if (isContributor && !fromGitChurn) {
      if (snapshotTestFiles === 0 && pct <= 0) {
        return `The snapshot shows no test files yet, and none of ${commitsNoun} include test-path changes (per-author coupling still reflects their commits).`;
      }
      if (pct <= 0) {
        return `The repo snapshot lists ${snapshotTestFiles} test file${snapshotTestFiles === 1 ? "" : "s"}, but none of ${commitsNoun} touch test paths—metrics below use the same snapshot for tree size.`;
      }
      return `The snapshot lists ${snapshotTestFiles} test file${snapshotTestFiles === 1 ? "" : "s"}, and about ${Math.round(pct)}% of ${commitsNoun} touch tests.`;
    }
    if (snapshotTestFiles === 0 && pct <= 0) {
      return `The snapshot shows no test files yet, and none of ${commitsNoun} include test-path changes.`;
    }
    if (pct <= 0) {
      return `You have ${snapshotTestFiles} test file${snapshotTestFiles === 1 ? "" : "s"} but none of ${commitsNoun} are actively adding to them.`;
    }
    return `You have ${snapshotTestFiles} test file${snapshotTestFiles === 1 ? "" : "s"}, and about ${Math.round(pct)}% of ${commitsNoun} touch tests—there is still room to make verification a default part of every change.`;
  })();

  if (!needsTestingFocus) {
    return (
      <CoachInsightTone
        tone="positive"
        className={className}
        aria-label="Testing and verification"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          {isContributor ? (
            <>
              For <strong>{scopeLabel}</strong>, verification signals look healthy on this analysis: their
              test-activity proxy and share of commits touching tests are in a solid range. Use Core
              signals below for detail (tree-wide scans still apply where noted).
            </>
          ) : (
            <>
              Verification looks healthy relative to this snapshot: test share and commits touching tests are
              in a solid range. Use Core signals below to spot drift over the next analyses.
            </>
          )}
        </p>
      </CoachInsightTone>
    );
  }

  return (
    <CoachInsightTone
      tone="concern"
      className={className}
      aria-label="Testing and verification"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        {isContributor ? (
          <>
            Testing stands out as a growth area for <strong>{scopeLabel}</strong> on this analysis.{" "}
            {detailSentence} Use Core signals and commits-touching-tests cards below to turn that into a
            steady habit.
          </>
        ) : (
          <>
            Testing is your most important improvement area right now. {detailSentence} The good news: your
            commit discipline is already strong — you just need to attach testing to that existing habit.
            Here is what the data shows:
          </>
        )}
      </p>
    </CoachInsightTone>
  );
}

function CodeQualityPanelIntro({
  report,
  codeQualityScopeId = COMMIT_HABITS_SCOPE_TEAM,
  className,
}: {
  report: RepoReport;
  codeQualityScopeId?: CommitHabitsScopeId;
  className?: string;
}) {
  const scope = useMemo(
    () => resolveCodeQualityScope(report, codeQualityScopeId ?? COMMIT_HABITS_SCOPE_TEAM),
    [report, codeQualityScopeId],
  );
  const maint = report.maintainability?.score ?? 0;
  const highCx = scope.complexity.highComplexityFunctions;
  const maxCx = scope.complexity.max;
  const dup = report.duplication?.percentage ?? 0;
  const hasMaint = Boolean(report.maintainability);

  const looksStrong =
    (!hasMaint || maint >= 55) && highCx <= 10 && maxCx <= UI_COMPLEXITY_CRITICAL_GT && dup <= 10;

  const needsAttention =
    (hasMaint && maint < 40) || highCx > 20 || maxCx > UI_COMPLEXITY_CRITICAL_GT || dup > 20;

  if (needsAttention) {
    return (
      <CoachInsightTone
        tone="concern"
        className={className}
        aria-label="Code quality"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Structural risk is elevated in this snapshot—either maintainability is low, duplication or
          peak complexity is high, or many functions exceed the engine&apos;s high-complexity
          threshold. Prioritize the hotspot tables below, then re-run analysis to confirm the
          distribution tightens.
        </p>
      </CoachInsightTone>
    );
  }

  if (looksStrong) {
    return (
      <CoachInsightTone
        tone="positive"
        className={className}
        aria-label="Code quality"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Headline complexity and duplication look manageable relative to this scan. Use Core
          signals and additional metrics below to catch drift—complexity tends to creep in as teams
          ship faster.
        </p>
      </CoachInsightTone>
    );
  }

  return (
    <CoachInsightTone
      tone="informational"
      className={className}
      aria-label="Code quality"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        This view summarizes cyclomatic complexity, maintainability heuristics, and duplication from
        the static scan. Treat spikes as triage: simplify the worst hotspots first, then compare the
        next analysis run.
      </p>
    </CoachInsightTone>
  );
}

function ReactComponentsPanelIntro({ report, className }: { report: RepoReport; className?: string }) {
  const rm = report.reactMetrics;
  if (!rm) {
    return (
      <CoachInsightTone
        tone="informational"
        className={className}
        aria-label="React components"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          TSX-focused signals appear here when the analyzer emits a{" "}
          <code className="rounded bg-muted px-1">reactMetrics</code> block for this run. Open Core
          signals below after you re-run with the current engine if this tab looks empty.
        </p>
      </CoachInsightTone>
    );
  }

  const s = rm.summary;
  const tampere = s.tampereJsxDepthExceededCount;
  const ferreira = s.ferreiraLackOfCohesionCount;
  const components = s.componentsAnalyzed;

  const needsAttention =
    tampere >= 5 || ferreira >= 4 || s.totalMissingOrInvalidDepsArray >= 20;

  const looksCalm =
    tampere <= 2 && ferreira === 0 && s.totalConditionalHookCalls === 0;

  if (needsAttention) {
    return (
      <CoachInsightTone
        tone="concern"
        className={className}
        aria-label="React components"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Your React surface needs attention—about <strong className="text-foreground">{tampere}</strong>{" "}
          component{tampere === 1 ? "" : "s"} exceed the JSX depth threshold and{" "}
          <strong className="text-foreground">{ferreira}</strong> show lack-of-cohesion heuristics across{" "}
          <strong className="text-foreground">{components}</strong> analyzed component
          {components === 1 ? "" : "s"}. Focus on shrinking oversized components and tightening hooks
          before adding new UI.
        </p>
      </CoachInsightTone>
    );
  }

  if (looksCalm) {
    return (
      <CoachInsightTone
        tone="positive"
        className={className}
        aria-label="React components"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          TSX signals look relatively healthy: shallow JSX and few cohesion flags relative to{" "}
          {components} components. Use Additional signals and the oversized table below to catch
          regressions on the next run.
        </p>
      </CoachInsightTone>
    );
  }

  return (
    <CoachInsightTone
      tone="informational"
      className={className}
      aria-label="React components"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        Static TSX metrics cover cohesion, JSX depth, prop pass-through, and hook-safety heuristics.
        Prioritize the largest components in the table below, then revisit hook dependency hygiene.
      </p>
    </CoachInsightTone>
  );
}

function CodeComplexityPanelIntro({ report, className }: { report: RepoReport; className?: string }) {
  const p2 = tryGetPhase2Summary(report);
  const rm = report.reactMetrics?.summary;

  if (!p2) {
    return (
      <CoachInsightTone
        tone="informational"
        className={className}
        aria-label="Code complexity"
        bodyClassName="text-foreground/90 font-normal"
      >
        <p>
          Lexical and cognitive metrics show up here after analysis attaches Halstead volume, cognitive complexity, and
          GRAD-AI-style <code className="rounded bg-muted px-1">MI_norm</code> to each function. Re-run with the current{" "}
          <code className="rounded bg-muted px-1">@repo-metrics/engine</code> if this tab looks empty.
        </p>
      </CoachInsightTone>
    );
  }

  const mi = p2.miNormMean;
  const coc = p2.cognitiveMean;
  const hal = p2.halsteadVolMean;

  const miConcern = mi < 55;
  const cocConcern = coc > 12;
  const halConcern = hal > 180;

  let reactSentence: string | null = null;
  if (rm) {
    const bits: string[] = [];
    if (rm.tampereJsxDepthExceededCount > 0) {
      bits.push(
        `${rm.tampereJsxDepthExceededCount} component${rm.tampereJsxDepthExceededCount === 1 ? "" : "s"} have JSX nesting deeper than 5 levels`,
      );
    }
    if (rm.ferreiraLackOfCohesionCount > 0) {
      bits.push(
        `${rm.ferreiraLackOfCohesionCount} component${rm.ferreiraLackOfCohesionCount === 1 ? "" : "s"} lack cohesion heuristics`,
      );
    }
    if (rm.totalMissingOrInvalidDepsArray > 0) {
      bits.push(
        `${rm.totalMissingOrInvalidDepsArray} hook dependenc${rm.totalMissingOrInvalidDepsArray === 1 ? "y is" : "ies are"} missing or invalid`,
      );
    }
    if (bits.length > 0) {
      reactSentence = bits.join(", ") + ". ";
    }
    if (rm.totalConditionalHookCalls === 0) {
      reactSentence =
        (reactSentence ?? "") +
        "Your hook safety is solid with zero conditional hook calls — a strong foundation to build on. ";
    }
  }

  const concerns = [miConcern, cocConcern, halConcern].filter(Boolean).length;
  const tone: "positive" | "concern" | "informational" =
    concerns >= 2 ? "concern" : concerns === 0 && !reactSentence ? "positive" : "informational";

  const scorePhrase =
    mi >= 70
      ? "healthy relative to the GRAD-AI maintainability band"
      : mi >= 55
        ? "above the danger zone but with room to improve"
        : "in a range where refactors will pay off quickly";

  return (
    <CoachInsightTone
      tone={tone}
      className={className}
      aria-label="Code complexity"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        Your code complexity profile is <strong className="text-foreground">{scorePhrase}</strong>
        — mean <strong className="text-foreground">MI_norm</strong>{" "}
        <strong className="text-foreground">{mi.toFixed(1)}</strong>, mean cognitive complexity{" "}
        <strong className="text-foreground">{coc.toFixed(2)}</strong>, mean Halstead volume{" "}
        <strong className="text-foreground">{hal.toFixed(1)}</strong>
        {reactSentence ? (
          <>
            . There are some important areas to address: {reactSentence}
          </>
        ) : (
          ". "
        )}
        Focus on the cognitive and Halstead outliers in the table below—simplifying the largest functions will move
        the averages fastest. Here is what the data shows:
      </p>
    </CoachInsightTone>
  );
}

function AiUsagePanelIntro({ className }: { className?: string }) {
  return (
    <CoachInsightTone
      tone="informational"
      title="AI usage"
      className={className}
      aria-label="AI usage"
      bodyClassName="text-foreground/90 font-normal"
    >
      <p>
        Choose the student's AI platform, copy the `agent_stats` prompt, run it in that same
        coding-agent project, and upload the resulting `ai_usage_trace.csv` to inspect
        student-facing workflow metrics: token efficiency, prompt quality, workflow balance,
        review habits, and a fixed 40-day activity view. Use it as a mirror for habits, not a
        grade.
      </p>
    </CoachInsightTone>
  );
}

function tabBody(activeTab: string): { title: string; body: string } | null {
  switch (activeTab as ResultsTabId) {
    case RESULTS_TAB.dataset:
      return {
        title: "Dataset export",
        body:
          "Research-grade fields extracted from this analysis for spreadsheets or downstream tools. Export includes the metrics you see in the UI plus identifiers needed for reproducibility.",
      };
    default:
      return null;
  }
}

export function ResultsTabPanelIntro({
  activeTab,
  report,
  className,
  testingScopeId,
  codeQualityScopeId,
}: ResultsTabPanelIntroProps) {
  if (activeTab === RESULTS_TAB.testing) {
    return (
      <TestingVerificationIntro
        report={report}
        className={className}
        testingScopeId={testingScopeId ?? COMMIT_HABITS_SCOPE_TEAM}
      />
    );
  }

  if (activeTab === RESULTS_TAB.commitHabits) {
    return <CommitHabitsTabInsightIntro report={report} className={className} />;
  }

  if (activeTab === RESULTS_TAB.codeQuality) {
    return (
      <CodeQualityPanelIntro
        report={report}
        className={className}
        codeQualityScopeId={codeQualityScopeId ?? COMMIT_HABITS_SCOPE_TEAM}
      />
    );
  }

  if (activeTab === RESULTS_TAB.reactComponents) {
    return <ReactComponentsPanelIntro report={report} className={className} />;
  }

  if (activeTab === RESULTS_TAB.codeComplexity) {
    return <CodeComplexityPanelIntro report={report} className={className} />;
  }

  if (activeTab === RESULTS_TAB.aiUsage) {
    return <AiUsagePanelIntro className={className} />;
  }

  const copy = tabBody(activeTab);
  if (!copy) return null;

  return (
    <div
      role="region"
      aria-label={`About: ${copy.title}`}
      className={cn(
        "flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm dark:bg-primary/[0.09]",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="leading-relaxed text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  );
}
