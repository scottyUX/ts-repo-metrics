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

/** Code duplication metrics from jscpd analysis. */
export interface DuplicationMetrics {
  percentage: number;
  duplicateLines: number;
  cloneClusters: number;
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

/**
 * Complete repository analysis report.
 *
 * Each section is nullable so the report degrades gracefully if a
 * module fails or is not applicable (e.g., git metrics on a non-git repo).
 */
export interface RepoReport {
  repoPath: string;
  filesAnalyzed: number;
  profile: RepoProfile;
  totals: { functions: number };
  functionMetricsSummary: FunctionMetricsSummary;
  complexity: ComplexitySummary;
  smells: SmellCounts;
  maintainability: MaintainabilityResult;
  testCoverageProxy: TestCoverageProxy;
  duplication: DuplicationMetrics | null;
  git: GitMetrics | null;
  framework: FrameworkInfo | null;
  perFile: PerFileEntry[];
}
