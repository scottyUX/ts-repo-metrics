/**
 * Data dictionary for the feature vector. Each entry includes definition,
 * unit, Results construct, and interpretation guidance.
 */

import type { FeatureResultsConstruct } from "./featureVector";

export interface DataDictionaryEntry {
  definition: string;
  unit: "count" | "ratio" | "percentage" | "loc" | "ms" | "string";
  resultsConstruct: FeatureResultsConstruct;
  interpretation: string;
}

export const DATA_DICTIONARY: Record<string, DataDictionaryEntry> = {
  total_functions: {
    definition: "Count of function-like AST nodes (functions, methods, arrow functions).",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: many functions; Low: fewer entry points.",
  },
  avg_complexity: {
    definition: "Mean cyclomatic complexity across all functions.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: more branches/decisions; Low: simpler control flow.",
  },
  max_complexity: {
    definition: "Highest single-function cyclomatic complexity.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: at least one very complex function.",
  },
  high_complexity_count: {
    definition: "Functions with cyclomatic complexity ≥ 10.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: more risk hotspots; Low: fewer complex functions.",
  },
  avg_function_length: {
    definition: "Mean line count across all functions.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "High: longer functions on average; Low: shorter, more focused.",
  },
  median_function_length: {
    definition: "Median line count across all functions.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Typical function size; less influenced by outliers than mean.",
  },
  long_function_count: {
    definition: "Functions with more than 50 lines.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: more long functions; Low: functions kept shorter.",
  },
  max_nesting_depth: {
    definition: "Deepest nesting level of control flow in any function.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: deeply nested logic; Low: flatter structure.",
  },
  long_parameter_list_count: {
    definition: "Functions with more than 4 parameters.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: more complex interfaces; Low: simpler signatures.",
  },
  empty_catch_block_count: {
    definition: "Catch clauses with empty body.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: swallowed errors; Low: explicit error handling.",
  },
  console_log_count: {
    definition: "console.log, console.warn, console.error calls.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "High: more debug/logging; Low: cleaner production code.",
  },
  maintainability_score: {
    definition: "Maintainability Index (0–100) based on complexity, LOC, and function length.",
    unit: "percentage",
    resultsConstruct: "commit-habits",
    interpretation: "High: easier to maintain; Low: higher maintenance burden.",
  },
  maintainability_classification: {
    definition: "Maintainability band: low (<40), moderate (40–65), high (>65).",
    unit: "string",
    resultsConstruct: "commit-habits",
    interpretation: "Human-readable classification of maintainability.",
  },
  total_loc: {
    definition: "Total lines of code across all TypeScript files.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Repository size.",
  },
  source_loc: {
    definition: "Lines of code in non-test files.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Production code size.",
  },
  test_loc: {
    definition: "Lines of code in test files.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Test code size.",
  },
  files_analyzed: {
    definition: "Total .ts, .tsx, .js, .jsx, and .py files successfully parsed.",
    unit: "count",
    resultsConstruct: "commit-habits",
    interpretation: "Scope of analysis.",
  },
  files_skipped: {
    definition: "Files skipped due to read or parse errors.",
    unit: "count",
    resultsConstruct: "tbd",
    interpretation: "High: parsing issues; Low: clean codebase.",
  },
  test_loc_ratio: {
    definition: "testLOC / sourceLOC (test coverage proxy).",
    unit: "ratio",
    resultsConstruct: "testing",
    interpretation: "High: more test code relative to source; Low: less.",
  },
  test_coverage_classification: {
    definition: "Band: low (<0.1), moderate (0.1–0.3), high (>0.3).",
    unit: "string",
    resultsConstruct: "testing",
    interpretation: "Relative test investment.",
  },
  pct_commits_touching_tests: {
    definition: "Percent of commits that modify test files.",
    unit: "percentage",
    resultsConstruct: "testing",
    interpretation: "High: tests evolve with code; Low: tests lag.",
  },
  test_to_feature_commit_ratio: {
    definition: "Ratio of test-only commits to feature commits.",
    unit: "ratio",
    resultsConstruct: "testing",
    interpretation: "Test-first vs feature-first workflow.",
  },
  duplication_percent: {
    definition: "Duplicate code percentage (jscpd).",
    unit: "percentage",
    resultsConstruct: "commit-habits",
    interpretation: "High: more duplication; Low: less redundancy.",
  },
  total_commits: {
    definition: "Total commits in history.",
    unit: "count",
    resultsConstruct: "testing",
    interpretation: "Project activity level.",
  },
  commits_per_week: {
    definition: "Commits per week (last 13 weeks).",
    unit: "count",
    resultsConstruct: "testing",
    interpretation: "Recent development intensity.",
  },
  median_commit_size: {
    definition: "Median lines changed per commit.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Typical commit size.",
  },
  average_lines_per_commit: {
    definition: "Mean lines changed per commit.",
    unit: "loc",
    resultsConstruct: "commit-habits",
    interpretation: "Average commit size.",
  },
  large_commit_ratio: {
    definition: "Percent of commits > 500 lines changed.",
    unit: "percentage",
    resultsConstruct: "commit-habits",
    interpretation: "High: frequent large commits.",
  },
  p90_commit_size: {
    definition: "90th percentile lines changed per commit.",
    unit: "loc",
    resultsConstruct: "testing",
    interpretation: "Large commits; tail risk indicator.",
  },
  pct_over_500_loc: {
    definition: "Percent of commits > 500 lines changed.",
    unit: "percentage",
    resultsConstruct: "testing",
    interpretation: "High: frequent large commits.",
  },
  pct_over_1000_loc: {
    definition: "Percent of commits > 1000 lines changed.",
    unit: "percentage",
    resultsConstruct: "testing",
    interpretation: "High: very large commits.",
  },
  burst_count: {
    definition: "Count of bursts (≥3 commits in 30 min).",
    unit: "count",
    resultsConstruct: "testing",
    interpretation: "High: sprint-like or AI-assisted patterns.",
  },
  burst_ratio: {
    definition: "Percent of commits that fall in a burst.",
    unit: "percentage",
    resultsConstruct: "testing",
    interpretation: "Concentration of commits in short windows.",
  },
  std_dev_time_between_commits: {
    definition: "Standard deviation of time between consecutive commits (ms).",
    unit: "ms",
    resultsConstruct: "testing",
    interpretation: "High: irregular commit patterns.",
  },
  refactor_commit_ratio: {
    definition: "Percent of commits with refactor/cleanup/restructure/rename in message.",
    unit: "percentage",
    resultsConstruct: "testing",
    interpretation: "High: more deliberate refactoring.",
  },
  p50_function_length: {
    definition: "50th percentile function length (LOC).",
    unit: "loc",
    resultsConstruct: "code-quality",
    interpretation: "Median function size.",
  },
  p75_function_length: {
    definition: "75th percentile function length (LOC).",
    unit: "loc",
    resultsConstruct: "code-quality",
    interpretation: "Upper-mid function size.",
  },
  p90_function_length: {
    definition: "90th percentile function length (LOC).",
    unit: "loc",
    resultsConstruct: "code-quality",
    interpretation: "Tail risk: long functions.",
  },
  p50_complexity: {
    definition: "50th percentile cyclomatic complexity.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Median complexity.",
  },
  p75_complexity: {
    definition: "75th percentile cyclomatic complexity.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Upper-mid complexity.",
  },
  p90_complexity: {
    definition: "90th percentile cyclomatic complexity.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Tail risk: complex functions.",
  },
  percent_high_complexity_in_top_10_percent_files: {
    definition:
      "Percent of high-complexity functions located in the top 10% of files by total complexity.",
    unit: "percentage",
    resultsConstruct: "code-quality",
    interpretation: "High: complexity concentrated in few files; Low: spread out.",
  },
  phase2_halstead_volume_mean: {
    definition: "Mean Halstead volume per function (lexical / operator-operand volume).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Higher: denser operator/operand mix (Imai-style wordiness).",
  },
  phase2_halstead_volume_p90: {
    definition: "90th percentile Halstead volume across functions.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Tail risk for lexical complexity.",
  },
  phase2_halstead_volume_max: {
    definition: "Maximum Halstead volume among functions.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Worst single-function lexical volume.",
  },
  phase2_cognitive_mean: {
    definition: "Mean cognitive complexity (additive, nesting-aware).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Higher: harder human verification (Verification Gap narrative).",
  },
  phase2_cognitive_p90: {
    definition: "90th percentile cognitive complexity.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Tail risk for cognitive load.",
  },
  phase2_cognitive_max: {
    definition: "Maximum cognitive complexity among functions.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Single worst hotspot for understandability.",
  },
  phase2_mi_norm_mean: {
    definition: "Mean GRAD-AI normalized MI (0–100) per function.",
    unit: "percentage",
    resultsConstruct: "code-quality",
    interpretation: "Higher: better modeled maintainability (Gambo et al.–style).",
  },
  phase2_mi_norm_median: {
    definition: "Median GRAD-AI normalized MI across functions.",
    unit: "percentage",
    resultsConstruct: "code-quality",
    interpretation: "Typical function maintainability on 0–100 scale.",
  },
  phase2_mi_raw_mean: {
    definition: "Mean raw GRAD-AI MI before 0–100 normalization (analysis / modeling).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Unbounded raw score; pair with MI_norm for dashboards.",
  },
  phase2_react_component_count: {
    definition: "Count of functions flagged as React components (TSX heuristic).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Stratify UI vs logic in statistical tests.",
  },
  phase2_react_component_share: {
    definition: "Share of functions that are heuristic React components.",
    unit: "ratio",
    resultsConstruct: "code-quality",
    interpretation: "0–1 fraction of functions in TSX-tagged components.",
  },
  phase3_sfd: {
    definition:
      "Silent failure density: TSX empty/console-only catch events per 1000 non-test source lines.",
    unit: "ratio",
    resultsConstruct: "code-quality",
    interpretation: "Higher: more swallowed or log-only error handling in UI code.",
  },
  phase3_mcr: {
    definition:
      "Monolithic component rate: share of heuristic React components with SLOC above threshold.",
    unit: "ratio",
    resultsConstruct: "code-quality",
    interpretation:
      "Use with care: value is -1 when the engine reports null (no React components in scope).",
  },
  phase3_srs: {
    definition:
      "Structural redundancy score: jscpd weighted duplicate mass per 1000 source lines (exact vs near clones).",
    unit: "ratio",
    resultsConstruct: "code-quality",
    interpretation: "Higher: more duplicated structure weighted by clone similarity.",
  },
  phase3_silent_failure_count: {
    definition: "Count of TSX silent-failure events (empty catch or console-only catch).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Raw event count before normalization by sourceLOC.",
  },
  phase3_monolithic_component_count: {
    definition: "Count of heuristic React components exceeding the monolithic SLOC threshold.",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Larger UI components; see Bollu / Tampere-style maintainability framing.",
  },
  phase3_react_component_count: {
    definition: "Count of functions flagged as React components (denominator for MCR).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation:
      "Compare with phase2_react_component_count (counts reflect functions where Halstead volume is present).",
  },
  phase3_srs_weighted_numerator: {
    definition:
      "Weighted sum of duplicate line mass before dividing by KLOC (1.0 exact, 0.5 near-clone).",
    unit: "count",
    resultsConstruct: "code-quality",
    interpretation: "Intermediate value; pairs with phase3_srs for decomposition.",
  },
};
