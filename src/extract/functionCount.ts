/**
 * Function-count extractor.
 *
 * Walks a Tree-sitter syntax tree and counts every function-like node:
 * function declarations, generator declarations, method definitions,
 * arrow functions, and function expressions.
 */

import type { SyntaxNode } from "tree-sitter";
import { FUNCTION_NODE_TYPES } from "../utils/constants.js";
import { walkTree } from "../utils/astWalker.js";
import type { FunctionCounts } from "../types/report.js";

export type { FunctionCounts } from "../types/report.js";

export function countFunctions(root: SyntaxNode): FunctionCounts {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const t of FUNCTION_NODE_TYPES) byType[t] = 0;

  walkTree(root, {
    enter(node) {
      if (FUNCTION_NODE_TYPES.has(node.type)) {
        total++;
        byType[node.type]!++;
      }
    },
  });

  return { total, byType };
}
