"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CommitHabitsMetricsTab } from "./rq/CommitHabitsMetricsTab";
import { TestingMetricsTab } from "./rq/TestingMetricsTab";
import { CodeQualityMetricsTab } from "./rq/CodeQualityMetricsTab";
import { ReactComponentsMetricsTab } from "./rq/ReactComponentsMetricsTab";
import { Phase2ComplexityTab } from "./rq/Phase2ComplexityTab";
import { AIMaturityTab } from "./rq/AIMaturityTab";
import { DocReviewTab } from "./rq/DocReviewTab";
import { DatasetTab } from "./dataset/DatasetTab";
import { GlobalCoachSays } from "./coach";
import { GitHubRepositoryPanel } from "./GitHubRepositoryPanel";
import { OverviewCardsStrip } from "./OverviewCardsStrip";
import { buildOverviewScoreStrip } from "@/lib/buildOverviewCards";
import { hasReactUiScope } from "@/lib/hasReactUiScope";
import type { RepoReport } from "@/lib/reportTypes";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import { RepoChat } from "@/components/chat/RepoChat";
import { CoachExplainProvider } from "@/lib/repoCoachContext";
import { ResultsTabPanelIntro } from "./ResultsTabPanelIntro";
import { CommitHabitsTabInsightProvider } from "./CommitHabitsTabInsightContext";
import { RESULTS_TAB, type ResultsTabId } from "@/lib/resultsNavigation";
import { COMMIT_HABITS_SCOPE_TEAM, type CommitHabitsScopeId } from "@/lib/commitHabitsScopeMetrics";

interface ResultsDashboardProps {
  report: RepoReport;
  resultId: string;
}

function reportHasGitHubSource(report: RepoReport): boolean {
  const u = report.source?.url ?? "";
  return typeof u === "string" && u.includes("github.com");
}

/** Aligned with UCSC Developer Analytics tab strip (Figma). */
const resultsTabTriggerClass = cn(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-none border border-transparent px-4 py-2.5 text-sm font-medium shadow-none transition-colors",
  "text-muted-foreground hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "data-[state=active]:z-[1] data-[state=active]:-mb-px data-[state=active]:rounded-none data-[state=active]:border-x data-[state=active]:border-t data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:bg-neutral-800/30 data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-neutral-800/30",
);

export function ResultsDashboard({ report, resultId }: ResultsDashboardProps) {
  const submission = report._submission;
  const courseIdTrim = submission?.course_id?.trim();
  const teamTrim = submission?.team_name?.trim();
  const courseSubmissionLabel =
    courseIdTrim ? `${courseIdTrim}${teamTrim ? ` · ${teamTrim}` : ""}` : null;

  const showReact = hasReactUiScope(report);
  const commit = report?.source?.commit?.slice(0, 7) ?? "—";
  const exportFilename = `repo-metrics-${resultId}-${commit}.json`;
  const [newAnalysisHref, setNewAnalysisHref] = useState("/");
  const [resultsTab, setResultsTab] = useState<ResultsTabId>(RESULTS_TAB.commitHabits);
  const [commitHabitsScopeId, setCommitHabitsScopeId] = useState<CommitHabitsScopeId>(
    COMMIT_HABITS_SCOPE_TEAM,
  );
  const [testingScopeId, setTestingScopeId] = useState<CommitHabitsScopeId>(
    COMMIT_HABITS_SCOPE_TEAM,
  );
  const [codeQualityScopeId, setCodeQualityScopeId] = useState<CommitHabitsScopeId>(
    COMMIT_HABITS_SCOPE_TEAM,
  );

  useEffect(() => {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = createUserSupabaseBrowserClient();
    const syncHref = () => {
      void supabase.auth.getUser().then(({ data }) => {
        setNewAnalysisHref(data.user ? "/repos" : "/");
      });
    };
    syncHref();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      syncHref();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setResultsTab(RESULTS_TAB.commitHabits);
    setCommitHabitsScopeId(COMMIT_HABITS_SCOPE_TEAM);
    setTestingScopeId(COMMIT_HABITS_SCOPE_TEAM);
    setCodeQualityScopeId(COMMIT_HABITS_SCOPE_TEAM);
  }, [resultId, report.analysis_timestamp, report.source?.commit]);

  useEffect(() => {
    if (!showReact && resultsTab === RESULTS_TAB.reactComponents) {
      setResultsTab(RESULTS_TAB.commitHabits);
    }
  }, [showReact, resultsTab]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, exportFilename]);

  const coachSendRef = useRef<((message: string) => void) | null>(null);
  const coachExplain = useCallback((message: string) => {
    coachSendRef.current?.(message);
  }, []);

  const { items: overviewCards, weakestCardId } = useMemo(
    () => buildOverviewScoreStrip(report, showReact),
    [report, showReact],
  );

  return (
    <CoachExplainProvider value={coachExplain}>
      <div className="space-y-8">
        {courseSubmissionLabel ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
            <span className="font-medium text-blue-900 dark:text-blue-100">
              Research submission
            </span>
            <span className="ml-2 text-blue-800 dark:text-blue-200">{courseSubmissionLabel}</span>
            <span className="ml-4 text-blue-700 dark:text-blue-300">
              This analysis is not used to grade individual students.
            </span>
          </div>
        ) : null}
        {report.analysisSkipped ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Static analysis not available
            </p>
            <p className="mt-1 text-amber-900 dark:text-amber-200">
              {report.analysisSkipped.message}
            </p>
            <p className="mt-2 text-amber-800 dark:text-amber-300">
              Commit history and GitHub metadata below may still be useful. Code quality and testing
              tabs reflect no parsed source files.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Analysis Results</h1>
            <p className="text-muted-foreground text-sm">Commit: {commit}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleExport}
              variant="ghost"
              className="h-9 gap-2 rounded-lg px-3 font-medium text-muted-foreground hover:text-foreground"
            >
              <Upload className="size-4 shrink-0" aria-hidden />
              Export JSON
            </Button>
            <Button
              asChild
              className="h-9 rounded-lg border-0 bg-gradient-to-r from-primary to-[#8b5cf6] font-medium text-primary-foreground shadow-none hover:opacity-90"
            >
              <Link href={newAnalysisHref}>Run New Analysis</Link>
            </Button>
          </div>
        </div>

        {reportHasGitHubSource(report) ? (
          <GitHubRepositoryPanel
            meta={report.github ?? null}
            repoUrl={report.source?.url}
            totalCommits={report.git?.totalCommits ?? null}
          />
        ) : null}

        <GlobalCoachSays report={report} setResultsTab={setResultsTab} />

        <section aria-label="Score overview">
          <OverviewCardsStrip
            items={overviewCards}
            selectedId={weakestCardId}
            onRequestTab={setResultsTab}
          />
        </section>

        <CommitHabitsTabInsightProvider
          report={report}
          enabled={resultsTab === RESULTS_TAB.commitHabits}
          commitHabitsScopeId={commitHabitsScopeId}
        >
          <Tabs value={resultsTab} onValueChange={(v) => setResultsTab(v as ResultsTabId)} className="w-full">
            <div className="w-full max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
              <TabsList
                aria-label="Result categories"
                className="flex h-12 min-h-12 w-max min-w-full flex-nowrap items-end gap-0 rounded-none border-b border-border bg-transparent p-0"
              >
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.commitHabits}
                  title="Commit cadence, size, bursts, and churn — engineering habits from git history"
                >
                  Commit Habits
                </TabsTrigger>
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.testing}
                  title="Testing and verification — test density, commits touching tests, structural risk signals"
                >
                  Testing
                </TabsTrigger>
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.codeQuality}
                  title="Code quality — complexity, maintainability, duplication"
                >
                  Code Quality
                </TabsTrigger>
                {showReact ? (
                  <TabsTrigger
                    className={resultsTabTriggerClass}
                    value={RESULTS_TAB.reactComponents}
                    title="React and TSX — hooks, JSX depth, component cohesion heuristics"
                  >
                    React Components
                  </TabsTrigger>
                ) : null}
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.codeComplexity}
                  title="Code complexity — Halstead and cognitive complexity, maintainability index (per function)"
                >
                  Code Complexity
                </TabsTrigger>
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.aiUsage}
                  title="AI usage — upload ai_usage_trace.csv from agent_stats to inspect student-facing AI workflow metrics"
                >
                  AI Usage
                </TabsTrigger>
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.documentation}
                  title="Documentation review — classify and review planning docs against course rubrics"
                >
                  Documentation
                </TabsTrigger>
                <TabsTrigger
                  className={resultsTabTriggerClass}
                  value={RESULTS_TAB.dataset}
                  title="Export analysis fields for research or downstream tools"
                >
                  Dataset
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="mt-4">
              <ResultsTabPanelIntro activeTab={resultsTab} report={report} codeQualityScopeId={codeQualityScopeId} testingScopeId={testingScopeId} />
            </div>
            <TabsContent
              value={RESULTS_TAB.commitHabits}
              id="commit-habits-panel"
              className="mt-6 scroll-mt-8"
            >
              <CommitHabitsMetricsTab
                report={report}
                scopeId={commitHabitsScopeId}
                onScopeIdChange={setCommitHabitsScopeId}
              />
            </TabsContent>
            <TabsContent value={RESULTS_TAB.testing} className="mt-6">
              <div id="testing-panel" className="scroll-mt-8 space-y-8">
                <TestingMetricsTab
                  report={report}
                  scopeId={testingScopeId}
                  onScopeIdChange={setTestingScopeId}
                  onOpenCodeQualityTab={() => setResultsTab(RESULTS_TAB.codeQuality)}
                />
              </div>
            </TabsContent>
            <TabsContent value={RESULTS_TAB.codeQuality} id="code-quality-panel" className="mt-6 scroll-mt-8">
              <CodeQualityMetricsTab
                report={report}
                scopeId={codeQualityScopeId}
                onScopeIdChange={setCodeQualityScopeId}
                onOpenTestingTab={() => setResultsTab(RESULTS_TAB.testing)}
              />
            </TabsContent>
            {showReact ? (
              <TabsContent
                value={RESULTS_TAB.reactComponents}
                id="react-components-panel"
                className="mt-6 scroll-mt-8"
              >
                <ReactComponentsMetricsTab
                  report={report}
                  onOpenCodeQualityTab={() => setResultsTab(RESULTS_TAB.codeQuality)}
                />
              </TabsContent>
            ) : null}
            <TabsContent
              value={RESULTS_TAB.codeComplexity}
              id="code-complexity-panel"
              className="mt-6 scroll-mt-8"
            >
              <Phase2ComplexityTab
                report={report}
                onOpenCodeQualityTab={() => setResultsTab(RESULTS_TAB.codeQuality)}
              />
            </TabsContent>
            <TabsContent value={RESULTS_TAB.aiUsage} id="ai-usage-panel" className="mt-6 scroll-mt-8">
              <AIMaturityTab resultId={resultId} />
            </TabsContent>
            <TabsContent
              value={RESULTS_TAB.documentation}
              id="documentation-panel"
              className="mt-6 scroll-mt-8"
            >
              <DocReviewTab resultId={resultId} report={report} />
            </TabsContent>
            <TabsContent value={RESULTS_TAB.dataset} className="mt-6">
              <DatasetTab report={report} resultId={resultId} />
            </TabsContent>
          </Tabs>
        </CommitHabitsTabInsightProvider>

        <RepoChat
          report={report}
          onRegisterCoachSend={(fn) => {
            coachSendRef.current = fn;
          }}
        />
      </div>
    </CoachExplainProvider>
  );
}
