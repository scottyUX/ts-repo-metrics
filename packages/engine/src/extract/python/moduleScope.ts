/**
 * Top-level Python code (scripts, training loops, notebook cells) scored as
 * one unit. Functions and classes are skipped; they are scored on their own.
 */

import type { SyntaxNode } from "tree-sitter";
import { countCyclomaticBranchPoints } from "../complexity.js";
import { PYTHON_PROFILE } from "../../utils/languageProfile.js";
import type { ModuleScopeMetrics } from "../../types/report.js";

const NOT_TOP_LEVEL_LOGIC = new Set([
  "function_definition",
  "class_definition",
  "decorated_definition",
  "import_statement",
  "import_from_statement",
  "future_import_statement",
  "comment",
]);

function isDocstring(node: SyntaxNode): boolean {
  return node.type === "expression_statement" && node.namedChild(0)?.type === "string";
}

function isTopLevelLogic(node: SyntaxNode): boolean {
  return !NOT_TOP_LEVEL_LOGIC.has(node.type) && !isDocstring(node);
}

function nestingOutsideDefinitions(node: SyntaxNode, depth: number): number {
  if (NOT_TOP_LEVEL_LOGIC.has(node.type) || PYTHON_PROFILE.functionNodeTypes.has(node.type)) {
    return depth;
  }
  const d = PYTHON_PROFILE.nestingNodeTypes.has(node.type) ? depth + 1 : depth;
  let max = d;
  for (const child of node.namedChildren) {
    max = Math.max(max, nestingOutsideDefinitions(child, d));
  }
  return max;
}

/**
 * Score a module's top-level statements. Returns null when the module has none,
 * so a file of only defs and imports carries no `moduleScope`.
 */
export function computeModuleScope(root: SyntaxNode): ModuleScopeMetrics | null {
  const statements = root.namedChildren.filter(isTopLevelLogic);
  if (statements.length === 0) return null;
  let branches = 0;
  let maxNestingDepth = 0;
  let lines = 0;
  for (const s of statements) {
    branches += countCyclomaticBranchPoints(s, PYTHON_PROFILE);
    maxNestingDepth = Math.max(maxNestingDepth, nestingOutsideDefinitions(s, 0));
    lines += s.endPosition.row - s.startPosition.row + 1;
  }
  return { cyclomaticComplexity: 1 + branches, maxNestingDepth, lines };
}
