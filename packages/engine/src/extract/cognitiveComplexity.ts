/**
 * Additive cognitive complexity (Sonar-inspired).
 */

import type { SyntaxNode } from "tree-sitter";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";

/** True for a `break`/`continue` that names a label, e.g. `break outer;`. */
function hasJumpLabel(node: SyntaxNode): boolean {
  const first = node.namedChild(0);
  return first !== null && first.type === "statement_identifier";
}

/** True for an `else_clause` whose only content is another `if` — "else if". */
function isElseIfLink(node: SyntaxNode): boolean {
  return node.namedChildCount === 1 && node.namedChild(0)?.type === "if_statement";
}

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
        if (!child) continue;
        if (child.type === "else_clause") {
          // An `else` branch does not nest what it contains: `else if` is one
          // more link in the same chain, not a level deeper inside the previous
          // `if`. Visiting at the current depth (not controlDepth + 1) keeps
          // every link in a chain worth the same as the first `if`, instead of
          // the 1+2+3+4... escalation that made long chains grow quadratically.
          if (isElseIfLink(child)) {
            // The nested if_statement is itself a cognitiveControlType and will
            // score its own +1 when visited below — do not double-count the
            // `else if` as both an else_clause and an if_statement.
            visit(child, controlDepth);
          } else {
            // A terminal, non-"else if" else has no nested if to carry its
            // score, so — matching Sonar's spec, which gives `if`, `else if`,
            // and `else` each a flat +1 — it scores here directly.
            score += 1;
            visit(child, controlDepth);
          }
          continue;
        }
        visit(child, controlDepth + 1);
      }
      return;
    }

    if (profile.jumpTypes.has(node.type) && controlDepth > 0) {
      // An unlabeled `break` ending a `switch` case or a loop is ordinary
      // control flow. Only a jump that names a label breaks the reader's model
      // of where control goes next, so only that one scores.
      const isUnlabeledBreak =
        profile.language === "ecmascript" &&
        node.type === "break_statement" &&
        !hasJumpLabel(node);
      if (!isUnlabeledBreak) {
        score += 1;
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, controlDepth);
    }
  }

  visit(fnNode, 0);
  return score;
}
