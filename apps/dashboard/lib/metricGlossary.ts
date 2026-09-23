/**
 * Metric definitions and thresholds for the glossary (Story 3.1).
 */

export const KPI_DEFINITIONS: Record<string, string> = {
  filesAnalyzed:
    "Total .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, and .ipynb files parsed and analyzed. web2py and Django repos contribute zero files. Silent-failure density counts JS/TS catch blocks in React-scope files and Python except clauses in every Python file.",
  totalFunctions: "Count of function-like AST nodes (functions, methods, arrow functions).",
  avgFunctionLength: "Mean line count across all functions.",
  maxFunctionLength: "Longest function by line count in the repo.",
  avgComplexity: "Mean cyclomatic complexity across all functions.",
  maxComplexity: "Highest single-function cyclomatic complexity.",
  highComplexityCount: "Functions with cyclomatic complexity ≥ 10.",
  longFunctionCount: "Functions with more than 50 lines.",
  maxNestingDepth: "Deepest nesting level of control flow in any function.",
};

export const THRESHOLDS = {
  highComplexity: 10,
  longFunction: 50,
  deepNesting: 4,
};
