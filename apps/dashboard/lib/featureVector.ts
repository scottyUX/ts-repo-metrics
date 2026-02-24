/**
 * Builds a flat feature vector from the analysis report for research export.
 * Features use snake_case. Categories and RQ mappings support the Dataset tab.
 */

import type { RepoReport } from "./reportTypes";

export type FeatureCategory =
  | "Structural"
  | "Behavioral"
  | "Verification"
  | "Distribution";

export type RQMapping = "RQ1" | "RQ2" | "RQ3" | "TBD";

/** Canonical feature list with category and RQ mapping.
 * Aligned with RQ-driven IA: RQ1=behavioral, RQ2=verification/risk, RQ3=quality outcomes.
 */
export const FEATURE_SPEC: Record<
  string,
  { category: FeatureCategory; rq: RQMapping }
> = {
  total_commits: { category: "Behavioral", rq: "RQ1" },
  commits_per_week: { category: "Behavioral", rq: "RQ1" },
  median_commit_size: { category: "Behavioral", rq: "RQ1" },
  average_lines_per_commit: { category: "Behavioral", rq: "RQ1" },
  large_commit_ratio: { category: "Behavioral", rq: "RQ1" },
  pct_over_500_loc: { category: "Behavioral", rq: "RQ1" },
  pct_over_1000_loc: { category: "Behavioral", rq: "RQ1" },
  burst_count: { category: "Behavioral", rq: "RQ1" },
  burst_ratio: { category: "Behavioral", rq: "RQ1" },
  std_dev_time_between_commits: { category: "Behavioral", rq: "RQ1" },
  duplication_percent: { category: "Behavioral", rq: "RQ1" },
  test_loc_ratio: { category: "Verification", rq: "RQ2" },
  test_coverage_classification: { category: "Verification", rq: "RQ2" },
  pct_commits_touching_tests: { category: "Verification", rq: "RQ2" },
  test_to_feature_commit_ratio: { category: "Verification", rq: "RQ2" },
  refactor_commit_ratio: { category: "Verification", rq: "RQ2" },
  empty_catch_block_count: { category: "Verification", rq: "RQ2" },
  console_log_count: { category: "Verification", rq: "RQ2" },
  high_complexity_count: { category: "Structural", rq: "RQ2" },
  long_function_count: { category: "Structural", rq: "RQ2" },
  max_complexity: { category: "Structural", rq: "RQ2" },
  total_functions: { category: "Structural", rq: "RQ3" },
  avg_complexity: { category: "Structural", rq: "RQ3" },
  avg_function_length: { category: "Structural", rq: "RQ3" },
  median_function_length: { category: "Structural", rq: "RQ3" },
  max_nesting_depth: { category: "Structural", rq: "RQ3" },
  long_parameter_list_count: { category: "Structural", rq: "RQ3" },
  maintainability_score: { category: "Structural", rq: "RQ3" },
  maintainability_classification: { category: "Structural", rq: "RQ3" },
  total_loc: { category: "Structural", rq: "TBD" },
  source_loc: { category: "Structural", rq: "TBD" },
  test_loc: { category: "Structural", rq: "TBD" },
  files_analyzed: { category: "Structural", rq: "TBD" },
  files_skipped: { category: "Structural", rq: "TBD" },
  p90_commit_size: { category: "Behavioral", rq: "RQ1" },
  p50_function_length: { category: "Distribution", rq: "RQ3" },
  p75_function_length: { category: "Distribution", rq: "RQ3" },
  p90_function_length: { category: "Distribution", rq: "RQ3" },
  p50_complexity: { category: "Distribution", rq: "RQ3" },
  p75_complexity: { category: "Distribution", rq: "RQ3" },
  p90_complexity: { category: "Distribution", rq: "RQ3" },
  percent_high_complexity_in_top_10_percent_files: {
    category: "Distribution",
    rq: "RQ3",
  },
};

export function getFeatureCategory(name: string): FeatureCategory {
  return FEATURE_SPEC[name]?.category ?? "Structural";
}

export function getFeatureRqMapping(name: string): RQMapping {
  return FEATURE_SPEC[name]?.rq ?? "TBD";
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
