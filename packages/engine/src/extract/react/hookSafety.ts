/**
 * Heuristic hook safety checks (Rules of Hooks, useEffect deps).
 */

import type { SyntaxNode } from "tree-sitter";
import { walkTree } from "../../utils/astWalker.js";
import type { ReactHookSafetyFlags } from "../../types/report.js";

const CONDITIONAL_PARENTS = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "ternary_expression",
]);

function isUseHookName(name: string): boolean {
  return name.startsWith("use") && name.length > 3;
}

function callCalleeName(node: SyntaxNode): string | null {
  if (node.type !== "call_expression") return null;
  const fn = node.childForFieldName("function") ?? node.namedChild(0);
  if (!fn) return null;
  if (fn.type === "identifier") return fn.text;
  if (fn.type === "member_expression") {
    const prop = fn.childForFieldName("property");
    if (prop) return prop.text;
  }
  return null;
}

function isUnderConditionalHookViolation(node: SyntaxNode): boolean {
  let p: SyntaxNode | null = node.parent;
  while (p) {
    if (CONDITIONAL_PARENTS.has(p.type)) return true;
    if (
      p.type === "call_expression" ||
      p.type === "expression_statement" ||
      p.type === "statement_block" ||
      p.type === "program"
    ) {
      p = p.parent;
      continue;
    }
    if (
      p.type === "arrow_function" ||
      p.type === "function_declaration" ||
      p.type === "function_expression"
    ) {
      return false;
    }
    p = p.parent;
  }
  return false;
}

function analyzeUseEffect(node: SyntaxNode): {
  asyncEffect: number;
  badDeps: number;
  nonPrimitiveDep: number;
} {
  let asyncEffect = 0;
  let badDeps = 0;
  let nonPrimitiveDep = 0;

  const args = node.childForFieldName("arguments");
  if (!args) {
    badDeps++;
    return { asyncEffect, badDeps, nonPrimitiveDep };
  }

  const first = args.namedChild(0);
  if (!first) {
    badDeps++;
    return { asyncEffect, badDeps, nonPrimitiveDep };
  }

  if (
    first.type === "arrow_function" ||
    first.type === "function_expression"
  ) {
    const body = first.childForFieldName("body");
    if (body?.type === "statement_block") {
      const stmt = body.namedChild(0);
      if (stmt?.type === "expression_statement") {
        const exp = stmt.namedChild(0);
        if (exp?.type === "await_expression") asyncEffect++;
      }
    }
  }

  const second = args.namedChild(1);
  if (!second) {
    badDeps++;
    return { asyncEffect, badDeps, nonPrimitiveDep };
  }

  if (second.type !== "array" && second.type !== "parenthesized_expression") {
    badDeps++;
  }

  if (second.type === "array") {
    for (let i = 0; i < second.namedChildCount; i++) {
      const el = second.namedChild(i);
      if (!el) continue;
      if (
        el.type === "object" ||
        el.type === "array" ||
        el.type === "call_expression"
      ) {
        nonPrimitiveDep++;
      }
    }
  }

  return { asyncEffect, badDeps, nonPrimitiveDep };
}

export function analyzeHookSafetyInFunction(body: SyntaxNode): ReactHookSafetyFlags {
  let conditionalHookCalls = 0;
  let asyncUseEffect = 0;
  let missingOrInvalidDepsArray = 0;
  let nonPrimitiveDepRisk = 0;

  walkTree(body, {
    enter(node) {
      if (node.type !== "call_expression") return;

      const name = callCalleeName(node);
      if (!name || !isUseHookName(name)) return;

      if (isUnderConditionalHookViolation(node)) {
        conditionalHookCalls++;
      }

      if (name === "useEffect" || name === "useCallback" || name === "useMemo") {
        const u = analyzeUseEffect(node);
        asyncUseEffect += u.asyncEffect;
        missingOrInvalidDepsArray += u.badDeps;
        nonPrimitiveDepRisk += u.nonPrimitiveDep;
      }
    },
  });

  return {
    conditionalHookCalls,
    asyncUseEffect,
    missingOrInvalidDepsArray,
    nonPrimitiveDepRisk,
  };
}
