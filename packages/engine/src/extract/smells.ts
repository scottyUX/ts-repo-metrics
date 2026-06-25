/**
 * Structural code smell detectors.
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
import type { SmellCounts } from "../types/report.js";

export type { SmellCounts } from "../types/report.js";

const PYTHON_PARAM_TYPES = new Set([
  "identifier",
  "default_parameter",
  "typed_parameter",
  "typed_default_parameter",
  "list_splat_pattern",
  "dictionary_splat_pattern",
]);

function countParameters(node: SyntaxNode, profile: LanguageProfile): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  let count = 0;
  for (let i = 0; i < params.namedChildCount; i++) {
    const child = params.namedChild(i);
    if (!child) continue;
    if (profile.language === "python") {
      if (PYTHON_PARAM_TYPES.has(child.type)) count++;
    } else if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter" ||
      child.type === "rest_parameter" ||
      child.type === "identifier"
    ) {
      count++;
    }
  }
  return count;
}

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

function isEmptyExceptBody(body: SyntaxNode | null): boolean {
  if (!body) return true;
  if (body.namedChildCount === 0) return true;
  return (
    body.namedChildCount === 1 &&
    body.namedChild(0)?.type === "pass_statement"
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
        if (node.type === "except_clause") {
          const body = node.childForFieldName("body");
          if (isEmptyExceptBody(body)) count++;
        }
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
