import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommitHabitsPanelIntro } from "@/components/results/CommitHabitsPanelIntro";
import { HotspotTables } from "@/components/results/HotspotTables";
import { ResultsTabPanelIntro } from "@/components/results/ResultsTabPanelIntro";
import { CodeQualityComplexityDistributionCard } from "@/components/results/rq/CodeQualityComplexityDistributionCard";
import { CommitHabitsMetricsTab } from "@/components/results/rq/CommitHabitsMetricsTab";
import {
  CodeQualityMaintainabilityClassBody,
  CodeQualityMaintainabilityScoreBody,
  CommitHabitsDuplicationPercentBody,
} from "@/components/results/rq/metricHelpContent";
import { Phase2CodeComplexityCoreSignals } from "@/components/results/rq/Phase2CodeComplexityCoreSignals";
import { TestingMetricsTab } from "@/components/results/rq/TestingMetricsTab";
import { TooltipProvider } from "@/components/ui/tooltip";
import { COMMIT_HABITS_SCOPE_TEAM } from "@/lib/commitHabitsScopeMetrics";
import type { Phase2Summary } from "@/lib/phase2Summary";
import type { RepoReport } from "@/lib/reportTypes";
import { RESULTS_TAB } from "@/lib/resultsNavigation";
import { visibleText } from "./helpers/visibleText";

// The tested components read only these fields; `scope` is "pr" when only a pull request's files were analyzed.
function report(scope?: "pr", overrides: object = {}): RepoReport {
  return {
    source: { type: "git", url: "https://github.com/example/team-project", commit: "abc123", branch: "main", scope },
    complexity: { average: 0, max: 0, highComplexityFunctions: 0 },
    smells: { longFunctions: 0, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 },
    profile: { sourceLOC: 100, testLOC: 10 },
    perFile: [],
    distributions: { percent_high_complexity_in_top_10_percent_files: 50 },
    ...overrides,
  } as unknown as RepoReport;
}

/** Visible text of the verification half of "Your risk profile", up to the score formula. */
function verificationText(r: RepoReport): string {
  const html = renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(TestingMetricsTab, { report: r, scopeId: COMMIT_HABITS_SCOPE_TEAM, onScopeIdChange: () => {} }),
    ),
  );
  const text = visibleText(html);
  return text.slice(text.indexOf("Verification score"), text.indexOf("Score is 5×"));
}

describe("Verification footnote scope", () => {
  it("says the files come from the pull request on a PR report (#259)", () => {
    const text = verificationText(report("pr"));
    expect(text).toContain("(files in this PR)");
    expect(text).not.toContain("repo snapshot");
  });

  it("keeps 'repo snapshot' on a whole-repo report", () => {
    const text = verificationText(report());
    expect(text).toContain("(repo snapshot)");
    expect(text).not.toContain("files in this PR");
  });
});

/** Visible text of one element, without HTML tags. */
function textOf(element: ReactElement): string {
  return visibleText(renderToStaticMarkup(createElement(TooltipProvider, null, element)));
}

const MI_SUMMARY = {
  halsteadVolMean: 50,
  halsteadVolP90: 100,
  cognitiveMean: 3,
  cognitiveP90: 6,
  miNormMean: 72,
  miNormMedian: 72,
  reactShare: 0,
  functionsWithPhase2: 1,
  totalFunctionRows: 1,
} satisfies Phase2Summary;

// Where, the element for a PR report (true) or a whole-repo report (false), PR wording, whole-repo wording.
const scopedText: [string, (pr: boolean) => ReactElement, string, string][] = [
  [
    "Commit Habits profile heading",
    (pr) => createElement(CommitHabitsMetricsTab, { report: report(pr ? "pr" : undefined), scopeId: COMMIT_HABITS_SCOPE_TEAM, onScopeIdChange: () => {} }),
    "Pull request profile",
    "Repository profile",
  ],
  [
    "Duplication help, what it measures",
    (pr) => createElement(CommitHabitsDuplicationPercentBody, { prScoped: pr }),
    "across the files in this pull request",
    "across this repository",
  ],
  [
    "Duplication help, how it is calculated",
    (pr) => createElement(CommitHabitsDuplicationPercentBody, { prScoped: pr }),
    "it stays a pull-request-level snapshot",
    "it stays a repository-level snapshot",
  ],
  [
    "Maintainability score help",
    (pr) => createElement(CodeQualityMaintainabilityScoreBody, { prScoped: pr }),
    "A single pull-request-level maintainability index",
    "A single repo-level maintainability index",
  ],
  [
    "Maintainability class help",
    (pr) => createElement(CodeQualityMaintainabilityClassBody, { prScoped: pr }),
    "A discrete band for the pull request",
    "A discrete band for the repo-level maintainability score",
  ],
  [
    "Top Complexity Hotspots",
    (pr) => createElement(HotspotTables, { report: report(pr ? "pr" : undefined) }),
    "highest-risk functions in this pull request",
    "highest-risk functions in your codebase",
  ],
  [
    "Complexity Distribution",
    (pr) => createElement(CodeQualityComplexityDistributionCard, { report: report(pr ? "pr" : undefined) }),
    "across the files in this pull request",
    "across the whole tree",
  ],
  [
    "Code Complexity maintainability card",
    (pr) => createElement(Phase2CodeComplexityCoreSignals, { summary: MI_SUMMARY, prScoped: pr }),
    "The average for this pull request",
    "Your codebase average is 72.0",
  ],
  [
    "Testing test-to-source card",
    (pr) => createElement(TestingMetricsTab, { report: report(pr ? "pr" : undefined), scopeId: COMMIT_HABITS_SCOPE_TEAM, onScopeIdChange: () => {} }),
    "of source across the files in this PR",
    "of source in the snapshot",
  ],
  [
    "Testing test files card",
    (pr) =>
      createElement(TestingMetricsTab, {
        report: report(pr ? "pr" : undefined, { profile: { sourceLOC: 100, testLOC: 10, testFiles: 2 } }),
        scopeId: COMMIT_HABITS_SCOPE_TEAM,
        onScopeIdChange: () => {},
      }),
    "Only 2 test files in this PR",
    "Only 2 test files on the snapshot",
  ],
  [
    "Testing intro with no test files",
    (pr) => createElement(ResultsTabPanelIntro, { activeTab: RESULTS_TAB.testing, report: report(pr ? "pr" : undefined) }),
    "This PR has no test files yet",
    "The snapshot shows no test files yet",
  ],
  [
    "Testing intro when verification looks healthy",
    (pr) =>
      createElement(ResultsTabPanelIntro, {
        activeTab: RESULTS_TAB.testing,
        report: report(pr ? "pr" : undefined, {
          profile: { sourceLOC: 100, testLOC: 20 },
          gitMetricsV2: { testCoupling: { pctCommitsTouchingTests: 50 } },
        }),
      }),
    "relative to this pull request",
    "relative to this snapshot",
  ],
  [
    "Code Quality intro",
    (pr) =>
      createElement(ResultsTabPanelIntro, {
        activeTab: RESULTS_TAB.codeQuality,
        report: report(pr ? "pr" : undefined, { duplication: { percentage: 25 } }),
      }),
    "Structural risk is elevated in this pull request",
    "Structural risk is elevated in this snapshot",
  ],
  [
    "Commit Habits intro",
    (pr) => createElement(CommitHabitsPanelIntro, { report: report(pr ? "pr" : undefined, { git: { totalCommits: 20, commitsPerWeek: 2 } }) }),
    "Commit habits look healthy in this pull request",
    "Commit habits look healthy in this snapshot",
  ],
];

describe.each(scopedText)("%s", (_where, render, prText, repoText) => {
  it("names the pull request on a PR report (#259)", () => {
    const text = textOf(render(true));
    expect(text).toContain(prText);
    expect(text).not.toContain(repoText);
  });

  it("keeps the whole-repo wording on a whole-repo report", () => {
    const text = textOf(render(false));
    expect(text).toContain(repoText);
    expect(text).not.toContain(prText);
  });
});