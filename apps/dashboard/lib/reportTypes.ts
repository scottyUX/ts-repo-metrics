/**
 * Types for the analysis report (matches RepoReport from repo-metrics).
 */

export interface DistributionMetrics {
  p50_function_length: number;
  p75_function_length: number;
  p90_function_length: number;
  p50_complexity: number;
  p75_complexity: number;
  p90_complexity: number;
  percent_high_complexity_in_top_10_percent_files: number;
}

export interface FunctionDetail {
  name: string;
  type: string;
  startLine: number;
  lines: number;
  maxNestingDepth: number;
  parameterCount: number;
}

export interface FunctionComplexity {
  name: string;
  type: string;
  startLine: number;
  complexity: number;
}

export interface PerFileEntry {
  file: string;
  functions: number;
  functionsByType: Record<string, number>;
  functionMetrics: FunctionDetail[];
  complexity: FunctionComplexity[];
}

export interface RepoReport {
  repoPath: string;
  source: { type: string; url: string; commit: string; branch: string };
  filesAnalyzed: number;
  filesSkipped?: number;
  analyzer_version?: string;
  analysis_timestamp?: string;
  distributions?: DistributionMetrics;
  profile: {
    totalFiles: number;
    tsFiles: number;
    tsxFiles: number;
    testFiles: number;
    totalLOC: number;
    sourceLOC: number;
    testLOC: number;
  };
  totals: { functions: number };
  functionMetricsSummary: {
    totalFunctions: number;
    averageLength: number;
    medianLength: number;
    maxNestingDepth: number;
    longFunctionPercentage: number;
  };
  complexity: {
    average: number;
    max: number;
    highComplexityFunctions: number;
  };
  smells: {
    longFunctions: number;
    deepNesting: number;
    longParameterLists: number;
    emptyCatchBlocks: number;
    consoleLogs: number;
  };
  maintainability?: { score: number; classification: string };
  testCoverageProxy?: { ratio: number; classification: string };
  duplication?: { percentage: number; duplicateLines: number; cloneClusters: number } | null;
  git?: {
    totalCommits: number;
    medianCommitSize: number;
    avgLinesPerCommit: number;
    largeCommitRatio: number;
    commitsPerWeek: number;
  } | null;
  gitMetricsV2?: {
    commitStats: { medianCommitSize: number; p90CommitSize: number; pctOver500Loc: number; pctOver1000Loc: number };
    burstStats: { burstCount: number; burstRatio: number };
    entropy: { stdDevTimeBetweenCommits: number };
    churn: { topByModifications: unknown[]; topByLinesChanged: unknown[] };
    refactorBehavior: { refactorCommitRatio: number };
    testCoupling: { pctCommitsTouchingTests: number; testToFeatureCommitRatio: number };
  } | null;
  framework?: { type: string; hasReact: boolean; hasBackend: boolean } | null;
  perFile: PerFileEntry[];
}
