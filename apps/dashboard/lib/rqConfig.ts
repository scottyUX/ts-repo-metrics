/**
 * RQ definitions and operationalization copy for the dashboard.
 * Each RQ tab uses this for framing headers.
 */

export type RQId = "RQ1" | "RQ2" | "RQ3";

export interface RQConfig {
  id: RQId;
  title: string;
  question: string;
  operationalization: string;
}

export const RQ_CONFIGS: Record<RQId, RQConfig> = {
  RQ1: {
    id: "RQ1",
    title: "Behavioral Shift",
    question:
      "How does access to generative AI tools correspond with observable software engineering behaviors?",
    operationalization:
      "We measure workflow cadence, commit structure, burst patterns, and churn concentration.",
  },
  RQ2: {
    id: "RQ2",
    title: "Verification & Engagement",
    question:
      "Within AI-using teams, how do verification efforts and cognitive engagement patterns relate to repository indicators of quality and stability?",
    operationalization:
      "We compare verification effort (test coverage proxy, test-touch commits) against minimal structural risk exposure to assess moderation.",
  },
  RQ3: {
    id: "RQ3",
    title: "Quality Outcomes",
    question:
      "Do projects developed with AI exhibit differences in complexity, maintainability, documentation, and testability?",
    operationalization:
      "We measure structural complexity, maintainability index, distribution metrics, and concentration of risk.",
  },
};

/** Metric keys mapped to their primary RQ for badge display. */
export const METRIC_TO_RQ: Record<string, RQId> = {
  total_commits: "RQ1",
  commits_per_week: "RQ1",
  median_commit_size: "RQ1",
  average_lines_per_commit: "RQ1",
  large_commit_ratio: "RQ1",
  burst_ratio: "RQ1",
  burst_count: "RQ1",
  std_dev_time_between_commits: "RQ1",
  pct_over_500_loc: "RQ1",
  pct_over_1000_loc: "RQ1",
  duplication_percent: "RQ1",
  framework_detected: "RQ1",
  test_loc_ratio: "RQ2",
  test_loc: "RQ2",
  source_loc: "RQ2",
  test_files: "RQ2",
  pct_commits_touching_tests: "RQ2",
  refactor_commit_ratio: "RQ2",
  empty_catch_block_count: "RQ2",
  console_log_count: "RQ2",
  high_complexity_count: "RQ2",
  long_function_count: "RQ2",
  max_complexity: "RQ2",
  total_functions: "RQ3",
  avg_complexity: "RQ3",
  p90_complexity: "RQ3",
  avg_function_length: "RQ3",
  p90_function_length: "RQ3",
  max_nesting_depth: "RQ3",
  long_parameter_list_count: "RQ3",
  maintainability_score: "RQ3",
  maintainability_classification: "RQ3",
  percent_high_complexity_in_top_10_percent_files: "RQ3",
};
