/**
 * Shared type definitions for the metrics report.
 *
 * All report section interfaces live here so modules can import the
 * shapes they produce without circular dependencies.
 */

/** Breakdown of file counts and lines of code for a repository. */
export interface RepoProfile {
  totalFiles: number;
  tsFiles: number;
  tsxFiles: number;
  testFiles: number;
  totalLOC: number;
  sourceLOC: number;
  testLOC: number;
}

/** Count of function-like AST nodes, with a per-type breakdown. */
export interface FunctionCounts {
  total: number;
  byType: Record<string, number>;
}

/** Metrics for a single function. */
export interface FunctionDetail {
  name: string;
  type: string;
  startLine: number;
  lines: number;
  maxNestingDepth: number;
  parameterCount: number;
}

/** Aggregated function metrics for an entire repository. */
export interface FunctionMetricsSummary {
  totalFunctions: number;
  averageLength: number;
  medianLength: number;
  maxNestingDepth: number;
  longFunctionPercentage: number;
}

/** Combined result: per-function details and file-level summary. */
export interface FunctionMetricsResult {
  functions: FunctionDetail[];
  summary: FunctionMetricsSummary;
}

/** Cyclomatic complexity for a single function. */
export interface FunctionComplexity {
  name: string;
  type: string;
  startLine: number;
  complexity: number;
}

/** Repo-level cyclomatic complexity summary. */
export interface ComplexitySummary {
  average: number;
  max: number;
  highComplexityFunctions: number;
}
