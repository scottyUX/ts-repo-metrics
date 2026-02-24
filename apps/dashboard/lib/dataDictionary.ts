/**
 * Data dictionary for the feature vector. Each entry includes definition,
 * unit, RQ mapping, and interpretation guidance.
 */

import type { RQMapping } from "./featureVector";

export interface DataDictionaryEntry {
  definition: string;
  unit: "count" | "ratio" | "percentage" | "loc" | "ms" | "string";
  rq: RQMapping;
  interpretation: string;
}

export const DATA_DICTIONARY: Record<string, DataDictionaryEntry> = {
  total_functions: {
    definition: "Count of function-like AST nodes (functions, methods, arrow functions).",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: many functions; Low: fewer entry points.",
  },
  avg_complexity: {
    definition: "Mean cyclomatic complexity across all functions.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: more branches/decisions; Low: simpler control flow.",
  },
  max_complexity: {
    definition: "Highest single-function cyclomatic complexity.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: at least one very complex function.",
  },
  high_complexity_count: {
    definition: "Functions with cyclomatic complexity ≥ 10.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: more risk hotspots; Low: fewer complex functions.",
  },
  avg_function_length: {
    definition: "Mean line count across all functions.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "High: longer functions on average; Low: shorter, more focused.",
  },
  median_function_length: {
    definition: "Median line count across all functions.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Typical function size; less influenced by outliers than mean.",
  },
  long_function_count: {
    definition: "Functions with more than 50 lines.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: more long functions; Low: functions kept shorter.",
  },
  max_nesting_depth: {
    definition: "Deepest nesting level of control flow in any function.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: deeply nested logic; Low: flatter structure.",
  },
  long_parameter_list_count: {
    definition: "Functions with more than 4 parameters.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: more complex interfaces; Low: simpler signatures.",
  },
  empty_catch_block_count: {
    definition: "Catch clauses with empty body.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: swallowed errors; Low: explicit error handling.",
  },
  console_log_count: {
    definition: "console.log, console.warn, console.error calls.",
    unit: "count",
    rq: "RQ1",
    interpretation: "High: more debug/logging; Low: cleaner production code.",
  },
  maintainability_score: {
    definition: "Maintainability Index (0–100) based on complexity, LOC, and function length.",
    unit: "percentage",
    rq: "RQ1",
    interpretation: "High: easier to maintain; Low: higher maintenance burden.",
  },
  maintainability_classification: {
    definition: "Maintainability band: low (<40), moderate (40–65), high (>65).",
    unit: "string",
    rq: "RQ1",
    interpretation: "Human-readable classification of maintainability.",
  },
  total_loc: {
    definition: "Total lines of code across all TypeScript files.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Repository size.",
  },
  source_loc: {
    definition: "Lines of code in non-test files.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Production code size.",
  },
  test_loc: {
    definition: "Lines of code in test files.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Test code size.",
  },
  files_analyzed: {
    definition: "Total .ts and .tsx files successfully parsed.",
    unit: "count",
    rq: "RQ1",
    interpretation: "Scope of analysis.",
  },
  files_skipped: {
    definition: "Files skipped due to read or parse errors.",
    unit: "count",
    rq: "TBD",
    interpretation: "High: parsing issues; Low: clean codebase.",
  },
  test_loc_ratio: {
    definition: "testLOC / sourceLOC (test coverage proxy).",
    unit: "ratio",
    rq: "RQ2",
    interpretation: "High: more test code relative to source; Low: less.",
  },
  test_coverage_classification: {
    definition: "Band: low (<0.1), moderate (0.1–0.3), high (>0.3).",
    unit: "string",
    rq: "RQ2",
    interpretation: "Relative test investment.",
  },
  pct_commits_touching_tests: {
    definition: "Percent of commits that modify test files.",
    unit: "percentage",
    rq: "RQ2",
    interpretation: "High: tests evolve with code; Low: tests lag.",
  },
  test_to_feature_commit_ratio: {
    definition: "Ratio of test-only commits to feature commits.",
    unit: "ratio",
    rq: "RQ2",
    interpretation: "Test-first vs feature-first workflow.",
  },
  duplication_percent: {
    definition: "Duplicate code percentage (jscpd).",
    unit: "percentage",
    rq: "RQ1",
    interpretation: "High: more duplication; Low: less redundancy.",
  },
  total_commits: {
    definition: "Total commits in history.",
    unit: "count",
    rq: "RQ2",
    interpretation: "Project activity level.",
  },
  commits_per_week: {
    definition: "Commits per week (last 13 weeks).",
    unit: "count",
    rq: "RQ2",
    interpretation: "Recent development intensity.",
  },
  median_commit_size: {
    definition: "Median lines changed per commit.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Typical commit size.",
  },
  average_lines_per_commit: {
    definition: "Mean lines changed per commit.",
    unit: "loc",
    rq: "RQ1",
    interpretation: "Average commit size.",
  },
  large_commit_ratio: {
    definition: "Percent of commits > 500 lines changed.",
    unit: "percentage",
    rq: "RQ1",
    interpretation: "High: frequent large commits.",
  },
  p90_commit_size: {
    definition: "90th percentile lines changed per commit.",
    unit: "loc",
    rq: "RQ2",
    interpretation: "Large commits; tail risk indicator.",
  },
  pct_over_500_loc: {
    definition: "Percent of commits > 500 lines changed.",
    unit: "percentage",
    rq: "RQ2",
    interpretation: "High: frequent large commits.",
  },
  pct_over_1000_loc: {
    definition: "Percent of commits > 1000 lines changed.",
    unit: "percentage",
    rq: "RQ2",
    interpretation: "High: very large commits.",
  },
  burst_count: {
    definition: "Count of bursts (≥3 commits in 30 min).",
    unit: "count",
    rq: "RQ2",
    interpretation: "High: sprint-like or AI-assisted patterns.",
  },
  burst_ratio: {
    definition: "Percent of commits that fall in a burst.",
    unit: "percentage",
    rq: "RQ2",
    interpretation: "Concentration of commits in short windows.",
  },
  std_dev_time_between_commits: {
    definition: "Standard deviation of time between consecutive commits (ms).",
    unit: "ms",
    rq: "RQ2",
    interpretation: "High: irregular commit patterns.",
  },
  refactor_commit_ratio: {
    definition: "Percent of commits with refactor/cleanup/restructure/rename in message.",
    unit: "percentage",
    rq: "RQ2",
    interpretation: "High: more deliberate refactoring.",
  },
  p50_function_length: {
    definition: "50th percentile function length (LOC).",
    unit: "loc",
    rq: "RQ3",
    interpretation: "Median function size.",
  },
  p75_function_length: {
    definition: "75th percentile function length (LOC).",
    unit: "loc",
    rq: "RQ3",
    interpretation: "Upper-mid function size.",
  },
  p90_function_length: {
    definition: "90th percentile function length (LOC).",
    unit: "loc",
    rq: "RQ3",
    interpretation: "Tail risk: long functions.",
  },
  p50_complexity: {
    definition: "50th percentile cyclomatic complexity.",
    unit: "count",
    rq: "RQ3",
    interpretation: "Median complexity.",
  },
  p75_complexity: {
    definition: "75th percentile cyclomatic complexity.",
    unit: "count",
    rq: "RQ3",
    interpretation: "Upper-mid complexity.",
  },
  p90_complexity: {
    definition: "90th percentile cyclomatic complexity.",
    unit: "count",
    rq: "RQ3",
    interpretation: "Tail risk: complex functions.",
  },
  percent_high_complexity_in_top_10_percent_files: {
    definition:
      "Percent of high-complexity functions located in the top 10% of files by total complexity.",
    unit: "percentage",
    rq: "RQ3",
    interpretation: "High: complexity concentrated in few files; Low: spread out.",
  },
};
