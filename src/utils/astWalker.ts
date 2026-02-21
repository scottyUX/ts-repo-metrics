/**
 * Shared AST walker for Tree-sitter syntax trees.
 *
 * Provides a consistent traversal API used by all AST-based extractors.
 * Reduces duplication and ensures uniform visit order across modules.
 */

import type { SyntaxNode } from "tree-sitter";

/** Return value from enter(): 'skip' to avoid traversing the node's children. */
export const SKIP = "skip" as const;

/**
 * Visitor interface for walkTree.
 * - enter(node): Called before visiting children. Return SKIP to skip children.
 * - leave(node): Called after visiting children (and their descendants).
 */
export interface AstVisitor {
  enter?(node: SyntaxNode): void | typeof SKIP;
  leave?(node: SyntaxNode): void;
}

/**
 * Walk a syntax tree with a visitor.
 * Uses pre-order (enter) and post-order (leave) traversal.
 * Children are visited in document order (first child first).
 *
 * @param root - Root node of the Tree-sitter syntax tree.
 * @param visitor - Visitor with optional enter and leave callbacks.
 */
export function walkTree(root: SyntaxNode, visitor: AstVisitor): void {
  const stack: { node: SyntaxNode; phase: "enter" | "leave" }[] = [
    { node: root, phase: "enter" },
  ];

  while (stack.length) {
    const { node, phase } = stack.pop()!;

    if (phase === "enter") {
      const skip = visitor.enter?.(node);
      if (skip === SKIP) continue;

      stack.push({ node, phase: "leave" });
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) stack.push({ node: child, phase: "enter" });
      }
    } else {
      visitor.leave?.(node);
    }
  }
}
