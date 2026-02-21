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

/** Re-export function metric types from the extractor for convenience. */
export type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionMetricsResult,
} from "../extract/functionMetrics.js";
