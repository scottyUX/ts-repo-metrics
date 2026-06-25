/**
 * Additive cognitive complexity (Sonar-inspired).
 */

import type { SyntaxNode } from "tree-sitter";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";

export function computeCognitiveComplexity(
  fnNode: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  let score = 0;

  function visit(node: SyntaxNode, controlDepth: number): void {
    if (node !== fnNode && profile.functionNodeTypes.has(node.type)) {
      return;
    }

    if (profile.cognitiveControlTypes.has(node.type)) {
      score += controlDepth + 1;
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) visit(child, controlDepth + 1);
      }
      return;
    }

    if (profile.jumpTypes.has(node.type) && controlDepth > 0) {
      score += 1;
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, controlDepth);
    }
  }

  visit(fnNode, 0);
  return score;
}
