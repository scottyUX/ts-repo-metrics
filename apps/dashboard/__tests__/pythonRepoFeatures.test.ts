import { describe, expect, it } from "vitest";
import { FEATURE_SPEC, buildFeatureVector } from "../lib/featureVector";
import { DATA_DICTIONARY } from "../lib/dataDictionary";
import type { RepoReport } from "../lib/reportTypes";

const smells = { longFunctions: 0, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 };

function baseReport(): RepoReport {
  return {
    repoPath: ".",
    source: { type: "local", url: "", commit: "abc", branch: "main" },
    filesAnalyzed: 3,
    profile: {
      totalFiles: 3,
      tsFiles: 0,
      tsxFiles: 1,
      jsFiles: 0,
      jsxFiles: 0,
      pyFiles: 1,
      notebookFiles: 1,
      testFiles: 0,
      totalLOC: 90,
      sourceLOC: 90,
      testLOC: 0,
    },
    totals: { functions: 4 },
    functionMetricsSummary: { totalFunctions: 4, averageLength: 10, medianLength: 9, maxNestingDepth: 2, longFunctionPercentage: 0 },
    complexity: { average: 3, max: 6, highComplexityFunctions: 0 },
    smells,
    perFile: [],
  };
}

const NEW_FEATURES = [
  "notebook_files",
  "python_backend",
  "python_stack",
  "avg_complexity_ecmascript",
  "avg_complexity_python",
  "avg_complexity_notebook",
  "py_param_type_coverage",
  "py_return_type_coverage",
  "py_top_level_files",
  "py_top_level_max_complexity",
  "endpoint_count",
  "fat_handler_share",
  "avg_handler_complexity",
  "blocking_calls_in_async",
];

describe("Python repo features", () => {
  it("registers every new feature in FEATURE_SPEC and the data dictionary", () => {
    for (const name of NEW_FEATURES) {
      expect(FEATURE_SPEC[name], name).toBeDefined();
      expect(DATA_DICTIONARY[name], name).toBeDefined();
    }
  });

  it("exports backend, stack, per-language, and type-hint features", () => {
    const report: RepoReport = {
      ...baseReport(),
      framework: { type: "React", hasReact: true, hasBackend: true, pythonBackend: "FastAPI", pythonStack: ["torch", "openai"] },
      byLanguage: {
        ecmascript: { files: 1, sourceLOC: 30, testLOC: 0, functions: 2, averageComplexity: 2.5, maxComplexity: 3, highComplexityFunctions: 0, averageFunctionLength: 8, smells },
        python: { files: 1, sourceLOC: 40, testLOC: 0, functions: 1, averageComplexity: 4, maxComplexity: 4, highComplexityFunctions: 0, averageFunctionLength: 12, smells },
      },
      python: {
        typeHints: { functions: 1, functionsWithReturnAnnotation: 1, parameters: 0, typedParameters: 0, parameterCoverage: null, returnCoverage: 1 },
        moduleScope: { filesWithTopLevelCode: 1, topLevelLines: 5, maxComplexity: 3, averageComplexity: 3 },
      },
      backendMetrics: {
        endpoints: [],
        summary: { endpointCount: 4, asyncEndpoints: 2, fatHandlers: 1, fatHandlerShare: 0.25, averageHandlerComplexity: 3.5, maxHandlerComplexity: 7, blockingCallsInAsync: 2, asyncHandlersWithBlockingCalls: 1 },
      },
    };
    const vec = buildFeatureVector(report);
    expect(vec).toMatchObject({
      notebook_files: 1,
      python_backend: "FastAPI",
      python_stack: "torch;openai",
      avg_complexity_ecmascript: 2.5,
      avg_complexity_python: 4,
      py_param_type_coverage: -1,
      py_return_type_coverage: 1,
      py_top_level_files: 1,
      py_top_level_max_complexity: 3,
      endpoint_count: 4,
      fat_handler_share: 0.25,
      avg_handler_complexity: 3.5,
      blocking_calls_in_async: 2,
    });
    expect(vec.avg_complexity_notebook).toBeUndefined();
  });

  it("leaves Python features blank on a report without them", () => {
    const report = baseReport();
    delete report.profile.notebookFiles;
    const vec = buildFeatureVector(report);
    expect(vec).toMatchObject({ notebook_files: 0, python_backend: "", python_stack: "" });
    expect(vec.endpoint_count).toBeUndefined();
    expect(vec.py_param_type_coverage).toBeUndefined();
  });
});
