/**
 * Function-level structural metrics extractor.
 *
 * For every function-like AST node in a file, computes line count, maximum
 * nesting depth, and parameter count. Also produces a file-level summary
 * with averages, medians, maximums, and percentages.
 */

import type { SyntaxNode } from "tree-sitter";
import {
  FUNCTION_NODE_TYPES,
  NESTING_NODE_TYPES,
  LONG_FUNCTION_THRESHOLD,
} from "../utils/constants.js";
import { walkTree } from "../utils/astWalker.js";
import { median } from "../utils/math.js";
import type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionMetricsResult,
} from "../types/report.js";

export type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionMetricsResult,
} from "../types/report.js";

/**
 * Derive a human-readable name for a function node.
 *
 * @param node - A function-like AST node.
 * @returns The function name, or "(anonymous)" if none can be determined.
 */
function getFunctionName(node: SyntaxNode): string {
  const nameChild = node.childForFieldName("name");
  if (nameChild) return nameChild.text;

  if (node.parent?.type === "variable_declarator") {
    const id = node.parent.childForFieldName("name");
    if (id) return id.text;
  }

  if (node.parent?.type === "pair") {
    const key = node.parent.childForFieldName("key");
    if (key) return key.text;
  }

  return "(anonymous)";
}

/**
 * Count parameters of a function node.
 *
 * @param node - A function-like AST node.
 * @returns Number of declared parameters.
 */
function countParameters(node: SyntaxNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  let count = 0;
  for (let i = 0; i < params.namedChildCount; i++) {
    const child = params.namedChild(i);
    if (child && (child.type === "required_parameter" ||
                  child.type === "optional_parameter" ||
                  child.type === "rest_parameter" ||
                  child.type === "identifier")) {
      count++;
    }
  }
  return count;
}

/**
 * Compute the maximum nesting depth within a subtree.
 * Only counts nesting structures (if, for, while, do, switch, try).
 *
 * @param node - Root of the subtree to measure.
 * @param currentDepth - Depth accumulated from parent nesting nodes.
 * @returns The deepest nesting level found.
 */
function maxNesting(node: SyntaxNode, currentDepth: number): number {
  const depth = NESTING_NODE_TYPES.has(node.type)
    ? currentDepth + 1
    : currentDepth;

  let max = depth;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      const childMax = maxNesting(child, depth);
      if (childMax > max) max = childMax;
    }
  }
  return max;
}

/**
 * Extract structural metrics for every function in a syntax tree.
 *
 * @param root - The root node of a Tree-sitter syntax tree.
 * @returns Per-function details and a repo-level summary.
 */
export function extractFunctionMetrics(root: SyntaxNode): FunctionMetricsResult {
  const functions: FunctionDetail[] = [];

  walkTree(root, {
    enter(node) {
      if (FUNCTION_NODE_TYPES.has(node.type)) {
        const lines = node.endPosition.row - node.startPosition.row + 1;
        functions.push({
          name: getFunctionName(node),
          type: node.type,
          startLine: node.startPosition.row + 1,
          lines,
          maxNestingDepth: maxNesting(node, 0),
          parameterCount: countParameters(node),
        });
      }
    },
  });

  const lengths = functions.map((f) => f.lines).sort((a, b) => a - b);
  const totalFunctions = functions.length;
  const averageLength =
    totalFunctions > 0
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / totalFunctions) * 10) / 10
      : 0;
  const maxNestingDepth = functions.reduce(
    (max, f) => Math.max(max, f.maxNestingDepth),
    0,
  );
  const longCount = functions.filter((f) => f.lines > LONG_FUNCTION_THRESHOLD).length;
  const longFunctionPercentage =
    totalFunctions > 0
      ? Math.round((longCount / totalFunctions) * 1000) / 10
      : 0;

  return {
    functions,
    summary: {
      totalFunctions,
      averageLength,
      medianLength: median(lengths),
      maxNestingDepth,
      longFunctionPercentage,
    },
  };
}
