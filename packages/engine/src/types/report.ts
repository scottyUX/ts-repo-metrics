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

/**
 * Halstead metrics for one function (lexical / volume-style).
 * Volume uses: (N1+N2) * log2(n1+n2) when n1+n2 > 0.
 */
export interface HalsteadMetrics {
  n1: number;
  n2: number;
  N1: number;
  N2: number;
  volume: number;
  difficulty: number;
  effort: number;
}

/** Metrics for a single function. */
export interface FunctionDetail {
  name: string;
  type: string;
  startLine: number;
  lines: number;
  maxNestingDepth: number;
  parameterCount: number;
  /** Cyclomatic complexity (1 + branch points + logical ops), same rule as `FunctionComplexity`. */
  cyclomaticComplexity: number;
  /** Halstead suite when analyzable (empty body may yield zeros). */
  halstead: HalsteadMetrics;
  /** Sonar-style additive cognitive complexity (nested control increases contribution). */
  cognitiveComplexity: number;
  /** GRAD-AI-style MI from Halstead volume + cyclomatic + LOC; natural-log formula. */
  maintainabilityIndexGradAiRaw: number;
  /** Normalized to 0–100 for dashboards: max(0, MI_raw * 100 / 171). */
  maintainabilityIndexGradAiNorm: number;
  /** Heuristic: `.tsx` and (PascalCase name or JSX in body). */
  isReactComponent: boolean;
  /** Phase 3: React component with SLOC above monolithic threshold (Bollu / Tampere-style). */
  isMonolithic: boolean;
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

/** How we inferred test proximity for a symbol (static heuristic, not line coverage). */
export type VerificationEvidence = "referenced_in_test" | "paired_file_only" | "none";

/** One function-level row for complexity vs test-proximity views. */
export interface SymbolVerificationRisk {
  file: string;
  name: string;
  startLine: number;
  cyclomaticComplexity: number;
  /** 0–1: strength of static evidence the symbol is linked to tests (not Istanbul coverage). */
  verificationScore: number;
  evidence: VerificationEvidence;
  /** Matched test file path when a conventional pair exists. */
  pairedTestPath?: string;
  /** `min(cyclomaticComplexity, 50) * (1 - verificationScore)` for sorting and heat maps. */
  riskScore: number;
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
  /** Source of metrics when set (CLI git vs GitHub API vs unavailable). */
  mode?: "local" | "api" | "none";
  unavailable?: boolean;
  activeDaysLast90Days?: number;
  medianInterCommitHours?: number;
  burstRatio?: number;
  medianCommitMessageLength?: number;
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

/** D3: Temporal irregularity of commits (ms between consecutive commits). */
export interface EntropyStats {
  /** Population standard deviation of gaps between consecutive commits. */
  stdDevTimeBetweenCommits: number;
  /** Mean of those gaps (typical time from one commit to the next). */
  meanTimeBetweenCommits: number;
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

/** GitHub-style contribution grid for the dashboard (last N weeks, Mon–Sun rows). */
export interface CommitCalendar {
  /** 7 rows (Mon..Sun) × `columnWeekStarts.length` columns (oldest week first). */
  grid: number[][];
  /** ISO date (UTC) of the Monday starting each column. */
  columnWeekStarts: string[];
  /** 0 = Monday .. 6 = Sunday; day with the most commits in the window. */
  busiestWeekdayIndex: number | null;
}

/** Epic D: Combined git metrics V2. */
export interface GitMetricsV2 {
  commitStats: CommitStats;
  burstStats: BurstStats;
  entropy: EntropyStats;
  churn: ChurnStats;
  refactorBehavior: RefactorBehaviorStats;
  testCoupling: TestCouplingStats;
  /** Present when commit timestamps were available (local `git log`). */
  commitCalendar?: CommitCalendar | null;
}

/**
 * Per-author git activity (Phase 1): same class of signals as GitMetricsV2,
 * computed on commits attributed to one author identity.
 */
export interface ContributorActivity {
  /** Grouping key: lowercased author email when present, else name-based or "unknown". */
  id: string;
  displayName: string;
  authorEmail: string;
  commitCount: number;
  linesAdded: number;
  linesDeleted: number;
  /** Git numstat Σ(add+del) on paths matching the test convention (historical churn, not snapshot LOC). */
  testLineChurn: number;
  /** Σ(add+del) on non-test paths in this author's commits. */
  sourceLineChurn: number;
  /** Distinct test paths touched (`*.test|spec.tsx?`). */
  testFilesTouched: number;
  /** Distinct non-test paths touched in commits (any path bucketed as production/source side). */
  sourceFilesTouched: number;
  /**
   * Distinct non-test paths this author touched (forward slashes), sorted.
   * Lets the dashboard narrow symbol-level views to files seen in `git log --numstat`.
   */
  sourcePathsTouchedList?: string[];
  commitStats: CommitStats;
  burstStats: BurstStats;
  entropy: EntropyStats;
  churn: ChurnStats;
  testCoupling: TestCouplingStats;
  refactorBehavior: RefactorBehaviorStats;
  /** Mon–Sun heatmap for this author (same shape as `GitMetricsV2.commitCalendar`). */
  commitCalendar?: CommitCalendar | null;
  /** Commits per week in the recent window (aligned with repo `git.commitsPerWeek`: last 13 weeks). */
  commitsPerWeek?: number;
}

/** One language row from GitHub /repos/{owner}/{repo}/languages (bytes + share). */
export interface GitHubLanguageShare {
  language: string;
  bytes: number;
  /** 0–100 with one decimal, same spirit as GitHub’s language bar. */
  percentage: number;
}

/** One contributor from GitHub /repos/{owner}/{repo}/contributors plus optional profile name. */
export interface GitHubRepoContributor {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
  /** Display name from GET /users/{login} when available. */
  name?: string;
}

/** GitHub About / Languages / Contributors (REST API), when analysis target is github.com. */
export interface GitHubRepositoryMeta {
  description: string | null;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  /** Users watching the repo (subscribers). */
  subscribersCount: number;
  languages: GitHubLanguageShare[];
  contributors: GitHubRepoContributor[];
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
  /**
   * Analysis corpus. `"pr"` means changed source files at the pull-request head.
   * Omitted on older reports — treat as `"repo"`.
   */
  scope?: "repo" | "pr";
  /** Pull request number when `scope` is `"pr"`. */
  prNumber?: number;
  /** Merge-base / PR base SHA when `scope` is `"pr"`. */
  baseSha?: string;
  /** PR head SHA when `scope` is `"pr"` (same as `commit` after checkout). */
  headSha?: string;
  /** Repo-relative source paths included in a PR-scoped run. */
  changedFiles?: string[];
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

/** Hook safety heuristics for one React component. */
export interface ReactHookSafetyFlags {
  conditionalHookCalls: number;
  asyncUseEffect: number;
  missingOrInvalidDepsArray: number;
  nonPrimitiveDepRisk: number;
}

/** Per-component React / RQ3 metrics (TSX). */
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

/** Aggregated React metrics for the repo. */
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

/** Optional RQ3 React block when TSX files were analyzed. */
export interface ReactMetricsReport {
  components: ReactComponentMetrics[];
  summary: ReactMetricsSummary;
}

/** Phase 3 — AI smell / pathology metrics (TSX silent failures, monolithic rate, weighted redundancy). */
export interface SilentFailureEvent {
  file: string;
  line: number;
  kind: "empty_catch" | "console_only_catch";
}

export interface Phase3Metrics {
  /** Silent failure density: totalEvents / (sourceLOC / 1000). */
  sfd: number;
  /** Monolithic component rate: monolithicCount / reactComponentCount; null if no React components. */
  mcr: number | null;
  /** Structural redundancy score: weightedNumerator / (sourceLOC / 1000). */
  srs: number;
  silentFailureEvents: SilentFailureEvent[];
  srsWeightedNumerator: number;
  srsExactWeightedLines: number;
  srsNearWeightedLines: number;
  monolithicComponentCount: number;
  reactComponentCount: number;
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
  /**
   * Mon–Sun × week heatmap when git history came from the GitHub API only (no local `.git`).
   * Consumers should use `gitMetricsV2?.commitCalendar ?? commitCalendar`.
   */
  commitCalendar?: CommitCalendar | null;
  /** Per-contributor git activity when history was analyzed (local git or API). */
  contributors?: ContributorActivity[];
  /** GitHub REST metadata (About, languages, repo contributors) for github.com targets. */
  github?: GitHubRepositoryMeta;
  framework: FrameworkInfo | null;
  perFile: PerFileEntry[];
  /** React/TSX static metrics when at least one .tsx file was analyzed. */
  reactMetrics?: ReactMetricsReport;
  /** Phase 3 — silent failures, monolithic rate, weighted jscpd redundancy. */
  phase3?: Phase3Metrics;
  /**
   * Per-symbol complexity vs test-proximity (filename pairing + name match in paired test).
   * Omitted in older cached reports.
   */
  symbolVerificationRisks?: SymbolVerificationRisk[];
}
