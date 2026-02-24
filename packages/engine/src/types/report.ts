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

/** Detected framework and runtime classification. */
export interface FrameworkInfo {
  type: string;
  hasReact: boolean;
  hasBackend: boolean;
}

/** Git history metrics derived from commit log analysis. */
export interface GitMetrics {
  totalCommits: number;
  medianCommitSize: number;
  avgLinesPerCommit: number;
  largeCommitRatio: number;
  commitsPerWeek: number;
}

/** D1: Extended commit size distribution. */
export interface CommitStats {
  medianCommitSize: number;
  p90CommitSize: number;
  pctOver500Loc: number;
  pctOver1000Loc: number;
}

/** D2: Commit burst detection (≥3 commits in 30 min). */
export interface BurstStats {
  burstCount: number;
  burstRatio: number;
}

/** D3: Temporal irregularity of commits. */
export interface EntropyStats {
  stdDevTimeBetweenCommits: number;
}

/** D4: Top files by churn. */
export interface ChurnHotspot {
  file: string;
  modifications: number;
  linesChanged: number;
}

/** D4: Churn hotspots output. */
export interface ChurnStats {
  topByModifications: ChurnHotspot[];
  topByLinesChanged: ChurnHotspot[];
}

/** D5: Test coupling metrics. */
export interface TestCouplingStats {
  pctCommitsTouchingTests: number;
  testToFeatureCommitRatio: number;
}

/** D6: Refactor commit rate. */
export interface RefactorBehaviorStats {
  refactorCommitRatio: number;
}

/** Epic D: Combined git metrics V2. */
export interface GitMetricsV2 {
  commitStats: CommitStats;
  burstStats: BurstStats;
  entropy: EntropyStats;
  churn: ChurnStats;
  refactorBehavior: RefactorBehaviorStats;
  testCoupling: TestCouplingStats;
}

/** Code duplication metrics from jscpd analysis. */
export interface DuplicationMetrics {
  percentage: number;
  duplicateLines: number;
  cloneClusters: number;
}

/** Source origin metadata (local path or cloned GitHub URL). */
export interface SourceInfo {
  type: "local" | "git";
  url: string;
  commit: string;
  branch: string;
}

/** Aggregated code smell counts across the repository. */
export interface SmellCounts {
  longFunctions: number;
  deepNesting: number;
  longParameterLists: number;
  emptyCatchBlocks: number;
  consoleLogs: number;
}

/** Maintainability Index score and classification. */
export interface MaintainabilityResult {
  score: number;
  classification: "low" | "moderate" | "high";
}

/** Test coverage proxy derived from LOC ratios. */
export interface TestCoverageProxy {
  ratio: number;
  classification: "low" | "moderate" | "high";
}

/** Per-file metrics entry in the report. */
export interface PerFileEntry {
  file: string;
  functions: number;
  functionsByType: Record<string, number>;
  functionMetrics: FunctionDetail[];
  complexity: FunctionComplexity[];
}

/** Distribution percentiles for function length and complexity (tail risk indicators). */
export interface DistributionMetrics {
  p50_function_length: number;
  p75_function_length: number;
  p90_function_length: number;
  p50_complexity: number;
  p75_complexity: number;
  p90_complexity: number;
  percent_high_complexity_in_top_10_percent_files: number;
}

/**
 * Complete repository analysis report.
 *
 * Each section is nullable so the report degrades gracefully if a
 * module fails or is not applicable (e.g., git metrics on a non-git repo).
 */
export interface RepoReport {
  repoPath: string;
  source: SourceInfo;
  filesAnalyzed: number;
  /** Files skipped due to read or parse errors. */
  filesSkipped?: number;
  /** Analyzer package version (e.g. from package.json). */
  analyzer_version?: string;
  /** ISO 8601 timestamp when analysis ran. */
  analysis_timestamp?: string;
  /** Distribution percentiles (p50/p75/p90) and concentration metric. */
  distributions?: DistributionMetrics;
  profile: RepoProfile;
  totals: { functions: number };
  functionMetricsSummary: FunctionMetricsSummary;
  complexity: ComplexitySummary;
  smells: SmellCounts;
  maintainability: MaintainabilityResult;
  testCoverageProxy: TestCoverageProxy;
  duplication: DuplicationMetrics | null;
  git: GitMetrics | null;
  gitMetricsV2: GitMetricsV2 | null;
  framework: FrameworkInfo | null;
  perFile: PerFileEntry[];
}
