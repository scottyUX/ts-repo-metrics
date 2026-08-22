/**
 * @repo-metrics/engine
 * Pure analysis engine: pipeline, collect, parsing, extract.
 * Consumed by the dashboard API and the CLI.
 */

export { analyzeRepo, type AnalyzeOptions } from "./pipeline/analyzeRepo.js";
export {
  analyzeFromGitHubUrl,
  type AnalyzeFromGitHubUrlOptions,
  type AnalyzeRef,
} from "./pipeline/analyzeFromGitHubUrl.js";
export { getSourceMetadata } from "./collect/repoMetadata.js";
export {
  parseGitHubUrl,
  isGitHubUrl,
  sanitizeRefForKey,
  type ParsedGitHubUrl,
} from "./utils/githubUrl.js";

export type {
  RepoReport,
  SourceInfo,
  RepoProfile,
  FunctionDetail,
  FunctionMetricsSummary,
  HalsteadMetrics,
  ComplexitySummary,
  SmellCounts,
  PerFileEntry,
  SymbolVerificationRisk,
  VerificationEvidence,
  ReactHookSafetyFlags,
  ReactComponentMetrics,
  ReactMetricsSummary,
  ReactMetricsReport,
  Phase3Metrics,
  SilentFailureEvent,
  ContributorActivity,
  GitHubRepositoryMeta,
  GitHubLanguageShare,
  GitHubRepoContributor,
} from "./types/report.js";

export {
  calculateMIGradAiRaw,
  normalizeMIGradAi,
} from "./utils/metrics.js";
export { computeHalsteadForFunction } from "./extract/halstead.js";
export { computeCognitiveComplexity } from "./extract/cognitiveComplexity.js";
