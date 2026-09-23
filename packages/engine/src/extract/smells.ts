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
  LONG_FUNCTION_THRESHOLD,
  DEEP_NESTING_THRESHOLD,
  LONG_PARAM_LIST_THRESHOLD,
} from "../utils/constants.js";
import { walkTree } from "../utils/astWalker.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";
import { countParameters } from "./functionNodes.js";
import type { SmellCounts } from "../types/report.js";

export type { SmellCounts } from "../types/report.js";

/**
 * Count functions that exceed the long-function line threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions longer than LONG_FUNCTION_THRESHOLD lines.
 */
export function detectLongFunctions(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let count = 0;
  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        const lines = node.endPosition.row - node.startPosition.row + 1;
        if (lines > LONG_FUNCTION_THRESHOLD) count++;
      }
    },
  });
  return count;
}

/**
 * Count functions whose maximum nesting depth exceeds the threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions with nesting deeper than DEEP_NESTING_THRESHOLD.
 */
function maxNestingDepth(
  node: SyntaxNode,
  depth: number,
  profile: LanguageProfile,
): number {
  const d = profile.nestingNodeTypes.has(node.type) ? depth + 1 : depth;
  let max = d;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      const cm = maxNestingDepth(child, d, profile);
      if (cm > max) max = cm;
    }
  }
  return max;
}

export function detectDeepNesting(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let count = 0;
  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        if (maxNestingDepth(node, 0, profile) > DEEP_NESTING_THRESHOLD) count++;
      }
    },
  });
  return count;
}

/**
 * Count functions with more parameters than the threshold.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of functions with more than LONG_PARAM_LIST_THRESHOLD parameters.
 */
export function detectLongParameterLists(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let count = 0;
  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        if (countParameters(node, profile) > LONG_PARAM_LIST_THRESHOLD) count++;
      }
    },
  });
  return count;
}

/**
 * Count empty catch blocks (`catch (e) {}`).
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of catch clauses with an empty body.
 */
function isEmptyExceptBlock(block: SyntaxNode | null): boolean {
  if (!block) return true;
  if (block.namedChildCount === 0) return true;
  return (
    block.namedChildCount === 1 &&
    block.namedChild(0)?.type === "pass_statement"
  );
}

export function detectEmptyCatchBlocks(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let count = 0;
  walkTree(root, {
    enter(node) {
      if (profile.language === "python") {
        if (node.type !== "except_clause") return;
        const block = node.namedChildren.find((child) => child.type === "block") ?? null;
        if (isEmptyExceptBlock(block)) count++;
        return;
      }
      if (node.type === "catch_clause") {
        const body = node.childForFieldName("body");
        if (body && body.namedChildCount === 0) count++;
      }
    },
  });
  return count;
}

/**
 * Count console.log, console.warn, and console.error calls.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Number of console logging calls found.
 */
const CONSOLE_METHODS = new Set(["log", "warn", "error"]);

export function detectConsoleLogs(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let count = 0;
  walkTree(root, {
    enter(node) {
      if (profile.language === "python") {
        if (node.type === "call") {
          const fn = node.childForFieldName("function");
          if (fn?.type === "identifier" && fn.text === "print") count++;
        }
        return;
      }
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
    },
  });
  return count;
}

/**
 * Run all smell detectors on a syntax tree and return aggregated counts.
 *
 * @param root - Root node of a Tree-sitter syntax tree.
 * @returns Combined smell counts for the file.
 */
export function detectSmells(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): SmellCounts {
  return {
    longFunctions: detectLongFunctions(root, profile),
    deepNesting: detectDeepNesting(root, profile),
    longParameterLists: detectLongParameterLists(root, profile),
    emptyCatchBlocks: detectEmptyCatchBlocks(root, profile),
    consoleLogs: detectConsoleLogs(root, profile),
  };
}
