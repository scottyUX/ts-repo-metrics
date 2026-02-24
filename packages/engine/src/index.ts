/**
 * @repo-metrics/engine
 * Pure analysis engine: pipeline, collect, parsing, extract.
 * Consumed by the dashboard API and the CLI.
 */

export { analyzeRepo, type AnalyzeOptions } from "./pipeline/analyzeRepo.js";
export { analyzeFromGitHubUrl, type AnalyzeFromGitHubUrlOptions } from "./pipeline/analyzeFromGitHubUrl.js";
export { getSourceMetadata } from "./collect/repoMetadata.js";
export { parseGitHubUrl, isGitHubUrl, type ParsedGitHubUrl } from "./utils/githubUrl.js";

export type {
  RepoReport,
  SourceInfo,
  RepoProfile,
  FunctionDetail,
  FunctionMetricsSummary,
  ComplexitySummary,
  SmellCounts,
  PerFileEntry,
} from "./types/report.js";
