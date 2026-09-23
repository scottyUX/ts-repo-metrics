/**
 * Builds a flat feature vector from the analysis report for research export.
 * Features use snake_case. Categories and dashboard-tab constructs support the Dataset tab.
 */

import type { RepoReport, FunctionDetail } from "./reportTypes";
import type { ResultsConstructId } from "./resultsConstructConfig";

export type FeatureCategory =
  | "Structural"
  | "Behavioral"
  | "Verification"
  | "Distribution";

/** Which Results dashboard construct (tab theme) primarily owns this feature for exports. */
export type FeatureResultsConstruct = ResultsConstructId | "tbd";

/** Canonical feature list with category and Results-tab mapping.
 * commit-habits ≈ workflow cadence; testing ≈ verification signals; code-quality ≈ structural outcomes.
 */
export const FEATURE_SPEC: Record<
  string,
  { category: FeatureCategory; construct: FeatureResultsConstruct }
> = {
  total_commits: { category: "Behavioral", construct: "commit-habits" },
  commits_per_week: { category: "Behavioral", construct: "commit-habits" },
  median_commit_size: { category: "Behavioral", construct: "commit-habits" },
  average_lines_per_commit: { category: "Behavioral", construct: "commit-habits" },
  large_commit_ratio: { category: "Behavioral", construct: "commit-habits" },
  pct_over_500_loc: { category: "Behavioral", construct: "commit-habits" },
  pct_over_1000_loc: { category: "Behavioral", construct: "commit-habits" },
  burst_count: { category: "Behavioral", construct: "commit-habits" },
  burst_ratio: { category: "Behavioral", construct: "commit-habits" },
  std_dev_time_between_commits: { category: "Behavioral", construct: "commit-habits" },
  duplication_percent: { category: "Behavioral", construct: "commit-habits" },
  test_loc_ratio: { category: "Verification", construct: "testing" },
  test_coverage_classification: { category: "Verification", construct: "testing" },
  pct_commits_touching_tests: { category: "Verification", construct: "testing" },
  test_to_feature_commit_ratio: { category: "Verification", construct: "testing" },
  refactor_commit_ratio: { category: "Verification", construct: "testing" },
  empty_catch_block_count: { category: "Verification", construct: "testing" },
  console_log_count: { category: "Verification", construct: "testing" },
  high_complexity_count: { category: "Structural", construct: "testing" },
  long_function_count: { category: "Structural", construct: "testing" },
  max_complexity: { category: "Structural", construct: "testing" },
  total_functions: { category: "Structural", construct: "code-quality" },
  avg_complexity: { category: "Structural", construct: "code-quality" },
  avg_function_length: { category: "Structural", construct: "code-quality" },
  median_function_length: { category: "Structural", construct: "code-quality" },
  max_nesting_depth: { category: "Structural", construct: "code-quality" },
  long_parameter_list_count: { category: "Structural", construct: "code-quality" },
  maintainability_score: { category: "Structural", construct: "code-quality" },
  maintainability_classification: { category: "Structural", construct: "code-quality" },
  total_loc: { category: "Structural", construct: "tbd" },
  source_loc: { category: "Structural", construct: "tbd" },
  test_loc: { category: "Structural", construct: "tbd" },
  files_analyzed: { category: "Structural", construct: "tbd" },
  files_skipped: { category: "Structural", construct: "tbd" },
  analysis_skipped: { category: "Structural", construct: "tbd" },
  notebook_files: { category: "Structural", construct: "tbd" },
  python_backend: { category: "Structural", construct: "tbd" },
  python_stack: { category: "Structural", construct: "tbd" },
  avg_complexity_ecmascript: { category: "Structural", construct: "code-quality" },
  avg_complexity_python: { category: "Structural", construct: "code-quality" },
  avg_complexity_notebook: { category: "Structural", construct: "code-quality" },
  py_param_type_coverage: { category: "Structural", construct: "code-quality" },
  py_return_type_coverage: { category: "Structural", construct: "code-quality" },
  py_top_level_files: { category: "Structural", construct: "code-quality" },
  py_top_level_max_complexity: { category: "Structural", construct: "code-quality" },
  endpoint_count: { category: "Structural", construct: "code-quality" },
  fat_handler_share: { category: "Structural", construct: "code-quality" },
  avg_handler_complexity: { category: "Structural", construct: "code-quality" },
  blocking_calls_in_async: { category: "Structural", construct: "code-quality" },
  p90_commit_size: { category: "Behavioral", construct: "commit-habits" },
  p50_function_length: { category: "Distribution", construct: "code-quality" },
  p75_function_length: { category: "Distribution", construct: "code-quality" },
  p90_function_length: { category: "Distribution", construct: "code-quality" },
  p50_complexity: { category: "Distribution", construct: "code-quality" },
  p75_complexity: { category: "Distribution", construct: "code-quality" },
  p90_complexity: { category: "Distribution", construct: "code-quality" },
  percent_high_complexity_in_top_10_percent_files: {
    category: "Distribution",
    construct: "code-quality",
  },
  phase2_halstead_volume_mean: { category: "Structural", construct: "code-quality" },
  phase2_halstead_volume_p90: { category: "Distribution", construct: "code-quality" },
  phase2_halstead_volume_max: { category: "Structural", construct: "code-quality" },
  phase2_cognitive_mean: { category: "Structural", construct: "code-quality" },
  phase2_cognitive_p90: { category: "Distribution", construct: "code-quality" },
  phase2_cognitive_max: { category: "Structural", construct: "code-quality" },
  phase2_mi_norm_mean: { category: "Structural", construct: "code-quality" },
  phase2_mi_norm_median: { category: "Distribution", construct: "code-quality" },
  phase2_mi_raw_mean: { category: "Structural", construct: "code-quality" },
  phase2_react_component_count: { category: "Structural", construct: "code-quality" },
  phase2_react_component_share: { category: "Structural", construct: "code-quality" },
};

export function getFeatureCategory(name: string): FeatureCategory {
  return FEATURE_SPEC[name]?.category ?? "Structural";
}

export function getFeatureResultsConstruct(name: string): FeatureResultsConstruct {
  return FEATURE_SPEC[name]?.construct ?? "tbd";
}

function flattenFunctionDetails(report: RepoReport): FunctionDetail[] {
  const out: FunctionDetail[] = [];
  for (const pf of report.perFile ?? []) {
    out.push(...(pf.functionMetrics ?? []));
  }
  return out;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sortedCopy(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b);
}

function percentileSorted(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.ceil((p / 100) * (sortedAsc.length - 1)),
  );
  return sortedAsc[idx]!;
}

function medianSorted(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor((sortedAsc.length - 1) / 2);
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid]!;
  return (sortedAsc[mid]! + sortedAsc[mid + 1]!) / 2;
}

/**
 * Build a flat feature vector from the report.
 * Each repository = one row in dataset. Variables are model-ready.
 */
export function buildFeatureVector(
  report: RepoReport
): Record<string, number | string> {
  const r = report;
  const vec: Record<string, number | string> = {};

  vec.total_functions = r.totals.functions;
  vec.avg_complexity =
    typeof r.complexity?.average === "number" ? r.complexity.average : 0;
  vec.max_complexity =
    typeof r.complexity?.max === "number" ? r.complexity.max : 0;
  vec.high_complexity_count =
    r.complexity?.highComplexityFunctions ?? 0;
  vec.avg_function_length =
    r.functionMetricsSummary?.averageLength ?? 0;
  vec.median_function_length =
    r.functionMetricsSummary?.medianLength ?? 0;
  vec.long_function_count = r.smells?.longFunctions ?? 0;
  vec.max_nesting_depth =
    r.functionMetricsSummary?.maxNestingDepth ?? 0;
  vec.long_parameter_list_count = r.smells?.longParameterLists ?? 0;
  vec.empty_catch_block_count = r.smells?.emptyCatchBlocks ?? 0;
  vec.console_log_count = r.smells?.consoleLogs ?? 0;
  vec.maintainability_score = r.maintainability?.score ?? 0;
  vec.maintainability_classification =
    r.maintainability?.classification ?? "";
  vec.total_loc = r.profile?.totalLOC ?? 0;
  vec.source_loc = r.profile?.sourceLOC ?? 0;
  vec.test_loc = r.profile?.testLOC ?? 0;
  vec.files_analyzed = r.filesAnalyzed ?? 0;
  vec.files_skipped = r.filesSkipped ?? 0;
  vec.analysis_skipped = r.analysisSkipped?.id ?? "";
  vec.notebook_files = r.profile?.notebookFiles ?? 0;
  vec.python_backend = r.framework?.pythonBackend ?? "";
  vec.python_stack = (r.framework?.pythonStack ?? []).join(";");

  for (const bucket of ["ecmascript", "python", "notebook"] as const) {
    const summary = r.byLanguage?.[bucket];
    if (summary) vec[`avg_complexity_${bucket}`] = summary.averageComplexity;
  }
  if (r.python) {
    const th = r.python.typeHints;
    vec.py_param_type_coverage = th.parameterCoverage ?? -1;
    vec.py_return_type_coverage = th.returnCoverage ?? -1;
    vec.py_top_level_files = r.python.moduleScope.filesWithTopLevelCode;
    vec.py_top_level_max_complexity = r.python.moduleScope.maxComplexity;
  }
  if (r.backendMetrics) {
    const b = r.backendMetrics.summary;
    vec.endpoint_count = b.endpointCount;
    vec.fat_handler_share = b.fatHandlerShare;
    vec.avg_handler_complexity = b.averageHandlerComplexity;
    vec.blocking_calls_in_async = b.blockingCallsInAsync;
  }

  vec.test_loc_ratio =
    r.profile?.sourceLOC && r.profile.sourceLOC > 0
      ? Math.round((r.profile.testLOC / r.profile.sourceLOC) * 1000) / 1000
      : 0;
  vec.test_coverage_classification = r.testCoverageProxy?.classification ?? "";
  vec.duplication_percent = r.duplication?.percentage ?? 0;

  if (r.gitMetricsV2) {
    vec.pct_commits_touching_tests =
      r.gitMetricsV2.testCoupling.pctCommitsTouchingTests ?? 0;
    vec.test_to_feature_commit_ratio =
      r.gitMetricsV2.testCoupling.testToFeatureCommitRatio ?? 0;
    vec.median_commit_size = r.gitMetricsV2.commitStats.medianCommitSize ?? 0;
    vec.p90_commit_size = r.gitMetricsV2.commitStats.p90CommitSize ?? 0;
    vec.pct_over_500_loc = r.gitMetricsV2.commitStats.pctOver500Loc ?? 0;
    vec.pct_over_1000_loc = r.gitMetricsV2.commitStats.pctOver1000Loc ?? 0;
    vec.burst_count = r.gitMetricsV2.burstStats.burstCount ?? 0;
    vec.burst_ratio = r.gitMetricsV2.burstStats.burstRatio ?? 0;
    vec.std_dev_time_between_commits =
      r.gitMetricsV2.entropy.stdDevTimeBetweenCommits ?? 0;
    vec.refactor_commit_ratio =
      r.gitMetricsV2.refactorBehavior.refactorCommitRatio ?? 0;
  }
  if (r.git) {
    vec.total_commits = r.git.totalCommits ?? 0;
    vec.commits_per_week = r.git.commitsPerWeek ?? 0;
    vec.average_lines_per_commit = r.git.avgLinesPerCommit ?? 0;
    vec.large_commit_ratio = r.git.largeCommitRatio ?? 0;
  }

  if (r.distributions) {
    vec.p50_function_length = r.distributions.p50_function_length;
    vec.p75_function_length = r.distributions.p75_function_length;
    vec.p90_function_length = r.distributions.p90_function_length;
    vec.p50_complexity = r.distributions.p50_complexity;
    vec.p75_complexity = r.distributions.p75_complexity;
    vec.p90_complexity = r.distributions.p90_complexity;
    vec.percent_high_complexity_in_top_10_percent_files =
      r.distributions.percent_high_complexity_in_top_10_percent_files;
  }

  const fds = flattenFunctionDetails(r);
  const p2 = fds.filter((f) => f.halstead != null);
  if (p2.length > 0) {
    const vol = p2.map((f) => f.halstead!.volume);
    const cog = p2.map((f) => f.cognitiveComplexity ?? 0);
    const miN = p2.map((f) => f.maintainabilityIndexGradAiNorm ?? 0);
    const miR = p2.map((f) => f.maintainabilityIndexGradAiRaw ?? 0);
    const sv = sortedCopy(vol);
    const sc = sortedCopy(cog);
    const sm = sortedCopy(miN);
    vec.phase2_halstead_volume_mean = Math.round(mean(vol) * 1000) / 1000;
    vec.phase2_halstead_volume_p90 = Math.round(percentileSorted(sv, 90) * 1000) / 1000;
    vec.phase2_halstead_volume_max = Math.max(...vol, 0);
    vec.phase2_cognitive_mean = Math.round(mean(cog) * 1000) / 1000;
    vec.phase2_cognitive_p90 = Math.round(percentileSorted(sc, 90) * 1000) / 1000;
    vec.phase2_cognitive_max = Math.max(...cog, 0);
    vec.phase2_mi_norm_mean = Math.round(mean(miN) * 1000) / 1000;
    vec.phase2_mi_norm_median = Math.round(medianSorted(sm) * 1000) / 1000;
    vec.phase2_mi_raw_mean = Math.round(mean(miR) * 1000) / 1000;
    const reactC = p2.filter((f) => Boolean(f.isReactComponent)).length;
    vec.phase2_react_component_count = reactC;
    vec.phase2_react_component_share =
      Math.round((reactC / p2.length) * 1000) / 1000;
  }

  if (r.phase3) {
    const p3 = r.phase3;
    vec.phase3_sfd = Math.round(p3.sfd * 1000) / 1000;
    vec.phase3_srs = Math.round(p3.srs * 1000) / 1000;
    vec.phase3_mcr =
      p3.mcr === null ? -1 : Math.round(p3.mcr * 1000) / 1000;
    vec.phase3_silent_failure_count = p3.silentFailureEvents.length;
    vec.phase3_monolithic_component_count = p3.monolithicComponentCount;
    vec.phase3_react_component_count = p3.reactComponentCount;
    vec.phase3_srs_weighted_numerator =
      Math.round(p3.srsWeightedNumerator * 1000) / 1000;
  }

  return vec;
}

/** Count features by category. */
export function getFeaturesByCategoryCount(
  vec: Record<string, number | string>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of Object.keys(vec)) {
    const cat = getFeatureCategory(name);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return counts;
}
