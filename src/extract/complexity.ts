/**
 * Cyclomatic complexity extractor.
 *
 * Computes cyclomatic complexity per function by counting control flow
 * branch points in the AST. The formula is:
 *
 *   complexity = 1 + (branch nodes) + (logical operators)
 *
 * Branch nodes: if_statement, else_clause, for_statement, for_in_statement,
 * while_statement, do_statement, switch_case, catch_clause, ternary_expression.
 *
 * Logical operators: `&&` and `||` inside binary_expression nodes each add 1.
 */

import type { SyntaxNode } from "tree-sitter";
import {
  FUNCTION_NODE_TYPES,
  COMPLEXITY_BRANCH_TYPES,
  HIGH_COMPLEXITY_THRESHOLD,
} from "../utils/constants.js";
import { walkTree } from "../utils/astWalker.js";
import type { FunctionComplexity, ComplexitySummary } from "../types/report.js";

export type { FunctionComplexity, ComplexitySummary } from "../types/report.js";

/**
 * Count branch points within a function body (not descending into nested functions).
 *
 * @param node - Current AST node.
 * @returns Number of branch points found in the subtree.
 */
function countBranches(node: SyntaxNode): number {
  let count = 0;

  if (COMPLEXITY_BRANCH_TYPES.has(node.type)) {
    count++;
  }

  if (
    node.type === "binary_expression" &&
    node.childForFieldName("operator")
  ) {
    const op = node.childForFieldName("operator")!.text;
    if (op === "&&" || op === "||") count++;
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && !FUNCTION_NODE_TYPES.has(child.type)) {
      count += countBranches(child);
    }
  }

  return count;
}

/**
 * Derive a human-readable name for a function node.
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
 * Compute cyclomatic complexity for every function in a syntax tree.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Per-function complexity entries.
 */
export function computeComplexity(root: SyntaxNode): FunctionComplexity[] {
  const results: FunctionComplexity[] = [];

  walkTree(root, {
    enter(node) {
      if (FUNCTION_NODE_TYPES.has(node.type)) {
        const complexity = 1 + countBranches(node);
        results.push({
          name: getFunctionName(node),
          type: node.type,
          startLine: node.startPosition.row + 1,
          complexity,
        });
      }
    },
  });

  return results;
}

/**
 * Aggregate per-function complexities into a repo-level summary.
 *
 * @param allComplexities - Flat array of per-function complexity entries across all files.
 * @returns Repo-level complexity summary with average, max, and high-complexity count.
 */
export function summarizeComplexity(
  allComplexities: FunctionComplexity[],
): ComplexitySummary {
  if (allComplexities.length === 0) {
    return { average: 0, max: 0, highComplexityFunctions: 0 };
  }

  const total = allComplexities.reduce((sum, c) => sum + c.complexity, 0);
  const max = allComplexities.reduce(
    (m, c) => Math.max(m, c.complexity),
    0,
  );
  const highCount = allComplexities.filter(
    (c) => c.complexity > HIGH_COMPLEXITY_THRESHOLD,
  ).length;

  return {
    average: Math.round((total / allComplexities.length) * 10) / 10,
    max,
    highComplexityFunctions: highCount,
  };
}
