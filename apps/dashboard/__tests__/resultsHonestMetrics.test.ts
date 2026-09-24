import { describe, expect, it } from "vitest";
import { buildOverviewScoreStrip } from "../lib/buildOverviewCards";
import { buildLanguageSummaryView, roundedShares } from "../lib/languageSummary";
import type { LanguageSummary, RepoReport } from "../lib/reportTypes";
import { RESULTS_TAB, availableResultsTabs, formatTabList } from "../lib/resultsNavigation";

function baseReport(overrides: Partial<RepoReport> = {}): RepoReport {
  return {
    repoPath: ".",
    source: { type: "local", url: "", commit: "abc", branch: "main" },
    filesAnalyzed: 0,
    profile: {
      totalFiles: 0,
      tsFiles: 0,
      tsxFiles: 0,
      jsFiles: 0,
      jsxFiles: 0,
      pyFiles: 0,
      testFiles: 0,
      totalLOC: 0,
      sourceLOC: 0,
      testLOC: 0,
    },
    totals: { functions: 0 },
    functionMetricsSummary: {
      totalFunctions: 0,
      averageLength: 0,
      medianLength: 0,
      maxNestingDepth: 0,
      longFunctionPercentage: 0,
    },
    complexity: { average: 0, max: 0, highComplexityFunctions: 0 },
    smells: {
      longFunctions: 0,
      deepNesting: 0,
      longParameterLists: 0,
      emptyCatchBlocks: 0,
      consoleLogs: 0,
    },
    perFile: [],
    ...overrides,
  } as RepoReport;
}

function lang(files: number, sourceLOC: number): LanguageSummary {
  return { files, sourceLOC } as LanguageSummary;
}

describe("availableResultsTabs", () => {
  it("hides Testing, Code Quality, and React but keeps Code Complexity when skipped", () => {
    const tabs = availableResultsTabs({ analysisSkipped: true, showReact: true });
    expect(tabs).toEqual([
      RESULTS_TAB.commitHabits,
      RESULTS_TAB.codeComplexity,
      RESULTS_TAB.aiUsage,
      RESULTS_TAB.documentation,
      RESULTS_TAB.dataset,
    ]);
    expect(formatTabList(tabs)).toBe(
      "Commit Habits, Code Complexity, AI Usage, Documentation, and Dataset",
    );
  });

  it("drops only React when the report has no React UI", () => {
    const tabs = availableResultsTabs({ analysisSkipped: false, showReact: false });
    expect(tabs).not.toContain(RESULTS_TAB.reactComponents);
    expect(tabs).toContain(RESULTS_TAB.testing);
  });
});

describe("roundedShares", () => {
  it("adds up to 100", () => {
    expect(roundedShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundedShares([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("is all zeros for an empty total", () => {
    expect(roundedShares([0, 0])).toEqual([0, 0]);
  });
});

describe("buildLanguageSummaryView", () => {
  it("is null without byLanguage or when analysis was skipped", () => {
    expect(buildLanguageSummaryView(baseReport())).toBeNull();
    expect(
      buildLanguageSummaryView(
        baseReport({
          byLanguage: { python: lang(2, 100) },
          analysisSkipped: { id: "django", message: "skipped" },
        }),
      ),
    ).toBeNull();
  });

  it("shows file counts without a share for buckets with no source lines", () => {
    const view = buildLanguageSummaryView(
      baseReport({ byLanguage: { ecmascript: lang(40, 999), python: lang(1, 0) } }),
    );
    expect(view?.segments).toEqual(["TS/JS 100% of source lines · 40 files", "Python · 1 file"]);
  });

  it("says under 1% instead of 0%", () => {
    const view = buildLanguageSummaryView(
      baseReport({ byLanguage: { ecmascript: lang(40, 1000), python: lang(1, 1) } }),
    );
    expect(view?.segments[1]).toBe("Python under 1% of source lines · 1 file");
  });

  it("does not repeat the backend or a plain Python type as a badge", () => {
    const view = buildLanguageSummaryView(
      baseReport({
        byLanguage: { python: lang(3, 50) },
        framework: {
          type: "FastAPI",
          hasReact: false,
          hasBackend: true,
          pythonBackend: "FastAPI",
          pythonStack: ["openai", "FastAPI"],
        },
      }),
    );
    expect(view?.badges).toEqual(["FastAPI", "openai"]);

    const plain = buildLanguageSummaryView(
      baseReport({
        byLanguage: { python: lang(3, 50) },
        framework: { type: "Python", hasReact: false, hasBackend: false, pythonBackend: null },
      }),
    );
    expect(plain?.badges).toEqual([]);
  });
});

describe("buildOverviewScoreStrip", () => {
  it("keeps only Commit Habits and Code Complexity when skipped", () => {
    const strip = buildOverviewScoreStrip(
      baseReport({ analysisSkipped: { id: "web2py", message: "skipped" } }),
      true,
    );
    expect(strip.items.map((i) => i.id).sort()).toEqual(["code-complexity", "commit-habits"]);
  });

  it("marks Code Complexity as not measured instead of scoring it 50", () => {
    const strip = buildOverviewScoreStrip(baseReport(), false);
    const tile = strip.items.find((i) => i.id === "code-complexity");
    expect(tile?.score).toBeNull();
    expect(tile?.tier).toBe("no_data");
    expect(strip.weakestCardId).not.toBe("code-complexity");
    expect(strip.items[strip.items.length - 1]?.id).toBe("code-complexity");
  });
});
