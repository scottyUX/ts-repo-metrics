/**
 * Structural code smell detectors.
 *
 * Each detector is a standalone function that walks an AST and returns a count.
 * Thresholds are imported from shared constants so they're easy to tune.
 *
 * Detected smells:
 * - Long functions (> LONG_FUNCTION_THRESHOLD lines)
 * - Deep nesting (> DEEP_NESTING_THRESHOLD levels)
 * - Long parameter lists (> LONG_PARAM_LIST_THRESHOLD params)
 * - Empty catch blocks (catch with an empty statement_block body)
 * - Console usage (console.log / console.warn / console.error)
 */

import type { SyntaxNode } from "tree-sitter";
import {
  FUNCTION_NODE_TYPES,
  NESTING_NODE_TYPES,
  LONG_FUNCTION_THRESHOLD,
  DEEP_NESTING_THRESHOLD,
  LONG_PARAM_LIST_THRESHOLD,
} from "../utils/constants.js";
import type { SmellCounts } from "../types/report.js";

export type { SmellCounts } from "../types/report.js";

/**
 * Count functions that exceed the long-function line threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions longer than LONG_FUNCTION_THRESHOLD lines.
 */
export function detectLongFunctions(root: SyntaxNode): number {
  let count = 0;
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const lines = node.endPosition.row - node.startPosition.row + 1;
      if (lines > LONG_FUNCTION_THRESHOLD) count++;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return count;
}

/**
 * Count functions whose maximum nesting depth exceeds the threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions with nesting deeper than DEEP_NESTING_THRESHOLD.
 */
export function detectDeepNesting(root: SyntaxNode): number {
  let count = 0;

  function maxNesting(node: SyntaxNode, depth: number): number {
    const d = NESTING_NODE_TYPES.has(node.type) ? depth + 1 : depth;
    let max = d;
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) {
        const cm = maxNesting(child, d);
        if (cm > max) max = cm;
      }
    }
    return max;
  }

  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      if (maxNesting(node, 0) > DEEP_NESTING_THRESHOLD) count++;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return count;
}

/**
 * Count functions with more parameters than the threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions with more than LONG_PARAM_LIST_THRESHOLD parameters.
 */
export function detectLongParameterLists(root: SyntaxNode): number {
  let count = 0;
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const params = node.childForFieldName("parameters");
      if (params) {
        let pCount = 0;
        for (let i = 0; i < params.namedChildCount; i++) {
          const child = params.namedChild(i);
          if (
            child &&
            (child.type === "required_parameter" ||
              child.type === "optional_parameter" ||
              child.type === "rest_parameter" ||
              child.type === "identifier")
          ) {
            pCount++;
          }
        }
        if (pCount > LONG_PARAM_LIST_THRESHOLD) count++;
      }
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return count;
}

/**
 * Count empty catch blocks (`catch (e) {}`).
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of catch clauses with an empty body.
 */
export function detectEmptyCatchBlocks(root: SyntaxNode): number {
  let count = 0;
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "catch_clause") {
      const body = node.childForFieldName("body");
      if (body && body.namedChildCount === 0) count++;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return count;
}

/**
 * Count console.log, console.warn, and console.error calls.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of console logging calls found.
 */
export function detectConsoleLogs(root: SyntaxNode): number {
  const CONSOLE_METHODS = new Set(["log", "warn", "error"]);
  let count = 0;
  const stack: SyntaxNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "member_expression") {
        const obj = fn.childForFieldName("object");
        const prop = fn.childForFieldName("property");
        if (
          obj?.type === "identifier" &&
          obj.text === "console" &&
          prop &&
          CONSOLE_METHODS.has(prop.text)
        ) {
          count++;
        }
      }
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return count;
}

/**
 * Run all smell detectors on a syntax tree and return aggregated counts.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Combined smell counts for the file.
 */
export function detectSmells(root: SyntaxNode): SmellCounts {
  return {
    longFunctions: detectLongFunctions(root),
    deepNesting: detectDeepNesting(root),
    longParameterLists: detectLongParameterLists(root),
    emptyCatchBlocks: detectEmptyCatchBlocks(root),
    consoleLogs: detectConsoleLogs(root),
  };
}
