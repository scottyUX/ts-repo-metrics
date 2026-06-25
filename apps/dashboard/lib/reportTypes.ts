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

export interface HalsteadMetrics {
  n1: number;
  n2: number;
  N1: number;
  N2: number;
  volume: number;
  difficulty: number;
  effort: number;
}

export interface FunctionDetail {
  name: string;
  type: string;
  startLine: number;
  lines: number;
  maxNestingDepth: number;
  parameterCount: number;
  /** Per-function lexical metrics; absent in older cached reports. */
  cyclomaticComplexity?: number;
  halstead?: HalsteadMetrics;
  cognitiveComplexity?: number;
  maintainabilityIndexGradAiRaw?: number;
  maintainabilityIndexGradAiNorm?: number;
  isReactComponent?: boolean;
  /** Phase 3: React component with SLOC above monolithic threshold. */
  isMonolithic?: boolean;
}

/** Phase 3 — silent failure in TSX (empty or console-only catch). */
export interface SilentFailureEvent {
  file: string;
  line: number;
  kind: "empty_catch" | "console_only_catch";
}

/** Phase 3 aggregates: SFD, MCR, SRS. */
export interface Phase3Metrics {
  sfd: number;
  mcr: number | null;
  srs: number;
  silentFailureEvents: SilentFailureEvent[];
  srsWeightedNumerator: number;
  srsExactWeightedLines: number;
  srsNearWeightedLines: number;
  monolithicComponentCount: number;
  reactComponentCount: number;
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

/** GitHub REST sidebar-style metadata. */
export interface GitHubLanguageShare {
  language: string;
  bytes: number;
  percentage: number;
}

export interface GitHubRepoContributor {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
  name?: string;
}

export interface GitHubRepositoryMeta {
  description: string | null;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  subscribersCount: number;
  languages: GitHubLanguageShare[];
  contributors: GitHubRepoContributor[];
}

/** Per-author git activity (matches engine ContributorActivity). */
export interface ContributorActivity {
  id: string;
  displayName: string;
  authorEmail: string;
  commitCount: number;
  linesAdded: number;
  linesDeleted: number;
  /** Git numstat Σ(add+del) on test paths in this author's commits (not snapshot LOC). */
  testLineChurn: number;
  /** Σ(add+del) on non-test paths. */
  sourceLineChurn: number;
  /** Distinct test paths touched. */
  testFilesTouched: number;
  /** Distinct non-test paths touched. */
  sourceFilesTouched: number;
  /**
   * Distinct non-test paths from git numstat for this author (forward slashes), sorted.
   * Present when extended git history was analyzed; used to scope symbol-level Testing views.
   */
  sourcePathsTouchedList?: string[];
  commitStats: {
    medianCommitSize: number;
    p90CommitSize: number;
    pctOver500Loc: number;
    pctOver1000Loc: number;
  };
  burstStats: { burstCount: number; burstRatio: number };
  entropy: { stdDevTimeBetweenCommits: number; meanTimeBetweenCommits: number };
  refactorBehavior: { refactorCommitRatio: number };
  testCoupling: {
    pctCommitsTouchingTests: number;
    testToFeatureCommitRatio: number;
  };
  /** Per-author churn hotspots; same shape as `gitMetricsV2.churn` when the engine includes it. */
  churn?: {
    topByModifications: Array<{ file: string; modifications?: number; linesChanged?: number }>;
    topByLinesChanged: Array<{ file: string; modifications?: number; linesChanged?: number }>;
  };
  commitCalendar?: {
    grid: number[][];
    columnWeekStarts: string[];
    busiestWeekdayIndex: number | null;
  } | null;
  commitsPerWeek?: number;
}

/** Per-symbol row for complexity vs test-proximity (engine heuristic, not Istanbul). */
export interface SymbolVerificationRisk {
  file: string;
  name: string;
  startLine: number;
  cyclomaticComplexity: number;
  verificationScore: number;
  evidence: "referenced_in_test" | "paired_file_only" | "none";
  pairedTestPath?: string;
  riskScore: number;
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
    jsFiles: number;
    jsxFiles: number;
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
    /** When set by the engine: local clone vs GitHub API vs unavailable. */
    mode?: "local" | "api" | "none";
  } | null;
  gitMetricsV2?: {
    commitStats: { medianCommitSize: number; p90CommitSize: number; pctOver500Loc: number; pctOver1000Loc: number };
    burstStats: { burstCount: number; burstRatio: number };
    entropy: { stdDevTimeBetweenCommits: number; meanTimeBetweenCommits: number };
    churn: { topByModifications: unknown[]; topByLinesChanged: unknown[] };
    refactorBehavior: { refactorCommitRatio: number };
    testCoupling: { pctCommitsTouchingTests: number; testToFeatureCommitRatio: number };
    /** Mon–Sun × week columns, when the analyzer had commit timestamps (local git). */
    commitCalendar?: {
      grid: number[][];
      columnWeekStarts: string[];
      busiestWeekdayIndex: number | null;
    } | null;
  } | null;
  /**
   * API-only heatmap (zipball). Prefer `gitMetricsV2?.commitCalendar ?? commitCalendar`.
   */
  commitCalendar?: {
    grid: number[][];
    columnWeekStarts: string[];
    busiestWeekdayIndex: number | null;
  } | null;
  contributors?: ContributorActivity[];
  github?: GitHubRepositoryMeta;
  framework?: { type: string; hasReact: boolean; hasBackend: boolean } | null;
  perFile: PerFileEntry[];
  /** Present when the analyzer includes optional React/TSX metrics (`reactMetrics`). */
  reactMetrics?: ReactMetricsReport;
  /** Phase 3 — AI smell / pathology metrics when the engine version supports them. */
  phase3?: Phase3Metrics;
  /** Per-symbol complexity vs test proximity; absent in older cached reports. */
  symbolVerificationRisks?: SymbolVerificationRisk[];

  /** Injected server-side when persisting course/research submissions (not from engine). */
  _submission?: {
    course_id?: string | null;
    team_name?: string | null;
    github_login?: string | null;
  };
}

export interface ReactHookSafetyFlags {
  conditionalHookCalls: number;
  asyncUseEffect: number;
  missingOrInvalidDepsArray: number;
  nonPrimitiveDepRisk: number;
}

export interface ReactComponentMetrics {
  name: string;
  file: string;
  startLine: number;
  lines: number;
  hookCount: number;
  hooksPerSloc: number;
  ferreiraLackOfCohesion: boolean;
  maxJsxDepth: number;
  tampereJsxDepthExceeded: boolean;
  propDrillingEdges: number;
  hookSafety: ReactHookSafetyFlags;
}

export interface ReactMetricsSummary {
  tsxFilesAnalyzed: number;
  componentsAnalyzed: number;
  ferreiraLackOfCohesionCount: number;
  tampereJsxDepthExceededCount: number;
  totalPropDrillingEdges: number;
  totalConditionalHookCalls: number;
  totalAsyncUseEffect: number;
  totalMissingOrInvalidDepsArray: number;
  totalNonPrimitiveDepRisk: number;
  maxJsxDepthRepo: number;
}

export interface ReactMetricsReport {
  components: ReactComponentMetrics[];
  summary: ReactMetricsSummary;
}
