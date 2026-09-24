import { describe, expect, it } from "vitest";
import { buildReportSummary } from "../lib/buildReportSummary";
import type { RepoReport } from "../lib/reportTypes";

describe("report summary percentages", () => {
  it("prints engine percentages as-is (13.3 means 13.3%)", () => {
    const report = {
      repoPath: ".",
      source: { type: "local", url: "", commit: "abc", branch: "main" },
      filesAnalyzed: 1,
      profile: { totalFiles: 1, tsFiles: 1, tsxFiles: 0, testFiles: 0, totalLOC: 10, sourceLOC: 10, testLOC: 0 },
      totals: { functions: 1 },
      functionMetricsSummary: { totalFunctions: 1, averageLength: 1, medianLength: 1, maxNestingDepth: 0, longFunctionPercentage: 0 },
      complexity: { average: 1, max: 1, highComplexityFunctions: 0 },
      smells: { longFunctions: 0, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 },
      perFile: [],
      gitMetricsV2: {
        testCoupling: { pctCommitsTouchingTests: 13.3, testToFeatureCommitRatio: 0.15 },
        refactorBehavior: { refactorCommitRatio: 4 },
      },
    } as unknown as RepoReport;
    const text = buildReportSummary(report);
    expect(text).toContain("refactor ratio 4.0% | test-coupling 13.3% commits touch tests");
    expect(text).not.toContain("1330");
  });
});
