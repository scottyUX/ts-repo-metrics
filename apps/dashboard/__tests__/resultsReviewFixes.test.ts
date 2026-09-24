import { describe, expect, it } from "vitest";
import { countUiComplexityBucketsPaired } from "../lib/codeQualityScope";
import { COMMIT_HABITS_SCOPE_TEAM, getCommitHabitsMetricValues } from "../lib/commitHabitsScopeMetrics";
import type { PerFileEntry, RepoReport } from "../lib/reportTypes";

function file(complexities: number[]): PerFileEntry {
  return {
    file: "a.py",
    functions: complexities.length,
    functionsByType: {},
    functionMetrics: complexities.map((_, i) => ({
      name: `f${i}`,
      type: "function_definition",
      startLine: i + 1,
      lines: 5,
      maxNestingDepth: 1,
      parameterCount: 0,
    })),
    complexity: complexities.map((c, i) => ({ name: `f${i}`, type: "function_definition", startLine: i + 1, complexity: c })),
  };
}

describe("complexity distribution buckets", () => {
  it("puts every function in exactly one of healthy, moderate, or high", () => {
    const b = countUiComplexityBucketsPaired([file([1, 9, 10, 12, 15, 16, 31])]);
    expect(b).toEqual({ healthyLtUi: 2, moderateUi: 3, highGtUi: 2, criticalGtUi: 1, totalPaired: 7 });
    expect(b.healthyLtUi + b.moderateUi + b.highGtUi).toBe(b.totalPaired);
  });
});

describe("commit spacing typical gap", () => {
  const base = {
    repoPath: ".",
    source: { type: "local", url: "", commit: "abc", branch: "main" },
    filesAnalyzed: 0,
    profile: { totalFiles: 0, tsFiles: 0, tsxFiles: 0, testFiles: 0, totalLOC: 0, sourceLOC: 0, testLOC: 0 },
    totals: { functions: 0 },
    functionMetricsSummary: { totalFunctions: 0, averageLength: 0, medianLength: 0, maxNestingDepth: 0, longFunctionPercentage: 0 },
    complexity: { average: 0, max: 0, highComplexityFunctions: 0 },
    smells: { longFunctions: 0, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 },
    perFile: [],
  } as unknown as RepoReport;

  const withEntropy = (entropy: Record<string, number>): RepoReport =>
    ({ ...base, gitMetricsV2: { entropy } } as unknown as RepoReport);

  it("uses the median gap when the report has one", () => {
    const mv = getCommitHabitsMetricValues(
      withEntropy({ stdDevTimeBetweenCommits: 9e9, meanTimeBetweenCommits: 4e9, medianTimeBetweenCommits: 1_080_000 }),
      COMMIT_HABITS_SCOPE_TEAM,
    );
    expect(mv.commitSpacingMeanMs).toBe(1_080_000);
    expect(mv.entropy).toBe(9e9);
  });

  it("falls back to the mean on older reports", () => {
    const mv = getCommitHabitsMetricValues(
      withEntropy({ stdDevTimeBetweenCommits: 9e9, meanTimeBetweenCommits: 4e9 }),
      COMMIT_HABITS_SCOPE_TEAM,
    );
    expect(mv.commitSpacingMeanMs).toBe(4e9);
  });
});
