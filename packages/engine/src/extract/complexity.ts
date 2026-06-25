/**
 * Cyclomatic complexity extractor.
 */

import type { SyntaxNode } from "tree-sitter";
import { HIGH_COMPLEXITY_THRESHOLD } from "../utils/constants.js";
import { walkTree } from "../utils/astWalker.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";
import type { FunctionComplexity, ComplexitySummary } from "../types/report.js";

export type { FunctionComplexity, ComplexitySummary } from "../types/report.js";

/**
 * Count branch points within a function body (not descending into nested functions).
 */
export function countCyclomaticBranchPoints(
  node: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  return countBranchesInner(node, profile);
}

function countBranchesInner(
  node: SyntaxNode,
  profile: LanguageProfile,
): number {
  let count = 0;

  if (profile.complexityBranchTypes.has(node.type)) {
    count++;
  }

  if (profile.language === "ecmascript") {
    if (
      node.type === "binary_expression" &&
      node.childForFieldName("operator")
    ) {
      const op = node.childForFieldName("operator")!.text;
      if (op === "&&" || op === "||") count++;
    }
  } else if (node.type === "boolean_operator") {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child && (child.text === "and" || child.text === "or")) count++;
    }
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && !profile.functionNodeTypes.has(child.type)) {
      count += countBranchesInner(child, profile);
    }
  }

  return count;
}

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

export function computeComplexity(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): FunctionComplexity[] {
  const results: FunctionComplexity[] = [];

  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        const complexity = 1 + countBranchesInner(node, profile);
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
