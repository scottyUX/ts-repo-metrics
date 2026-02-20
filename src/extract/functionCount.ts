/**
 * Function-count extractor.
 *
 * Walks a Tree-sitter syntax tree using an iterative depth-first traversal
 * and counts every function-like node: function declarations, generator
 * declarations, method definitions, arrow functions, and function expressions.
 */

import type { SyntaxNode } from "tree-sitter";

const FUNCTION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
  "arrow_function",
  "function",
  "generator_function",
]);

export interface FunctionCounts {
  total: number;
  byType: Record<string, number>;
}

export function countFunctions(root: SyntaxNode): FunctionCounts {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const t of FUNCTION_NODE_TYPES) byType[t] = 0;

  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      total++;
      byType[node.type]!++;
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }

  return { total, byType };
}
