/**
 * Function-count extractor.
 *
 * Walks a Tree-sitter syntax tree and counts every function-like node.
 */

import type { SyntaxNode } from "tree-sitter";
import { walkTree } from "../utils/astWalker.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";
import type { FunctionCounts } from "../types/report.js";

export type { FunctionCounts } from "../types/report.js";

export function countFunctions(
  root: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): FunctionCounts {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const t of profile.functionNodeTypes) byType[t] = 0;

  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        total++;
        byType[node.type]!++;
      }
    },
  });

  return { total, byType };
}
