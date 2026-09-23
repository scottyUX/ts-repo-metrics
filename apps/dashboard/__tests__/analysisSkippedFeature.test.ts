import { describe, expect, it } from "vitest";
import {
  FEATURE_SPEC,
  buildFeatureVector,
} from "../lib/featureVector";
import type { RepoReport } from "../lib/reportTypes";

function skippedReport(id: "web2py" | "django"): RepoReport {
  return {
    repoPath: ".",
    source: { type: "local", url: "", commit: "abc", branch: "main" },
    filesAnalyzed: 0,
    analysisSkipped: { id, message: "skipped" },
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
  };
}

describe("analysis_skipped feature", () => {
  it("is registered and flags a Django skip", () => {
    expect(FEATURE_SPEC.analysis_skipped).toEqual({
      category: "Structural",
      construct: "tbd",
    });
    const vec = buildFeatureVector(skippedReport("django"));
    expect(vec.analysis_skipped).toBe("django");
    expect(vec.files_analyzed).toBe(0);
  });

  it("is empty when the report was scored", () => {
    const report = skippedReport("web2py");
    delete report.analysisSkipped;
    expect(buildFeatureVector(report).analysis_skipped).toBe("");
  });
});
