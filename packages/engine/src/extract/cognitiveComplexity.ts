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

  /**
   * Sonar's spec keeps three things separate, which an earlier version of this
   * function conflated:
   *
   *   B1  flat increment    +1 for `if`, `else if`, `else`, ternary, `switch`,
   *                         loops, `catch`
   *   B3  nesting increment +nesting, for `if`, ternary, `switch`, loops,
   *                         `catch` — but NOT for `else if` and NOT for `else`
   *   B2  nesting level     raised for the BODIES of all of the above,
   *                         including `else if` and `else`
   *
   * `nesting` is the B2 level. `asElseIfLink` marks the `if_statement` that
   * belongs to an `else if`: it still earns B1's flat +1, but takes no B3
   * increment.
   */
  function visit(
    node: SyntaxNode,
    nesting: number,
    asElseIfLink = false,
  ): void {
    if (node !== fnNode && profile.functionNodeTypes.has(node.type)) {
      return;
    }

    if (profile.cognitiveControlTypes.has(node.type)) {
      score += 1 + (asElseIfLink ? 0 : nesting);

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;

        if (child.type === "else_clause") {
          if (profile.language !== "ecmascript") {
            // Python's chain shape differs (`elif_clause` is a sibling of the
            // `if`, not an `if` nested inside an `else`) and there is no
            // SonarJS baseline for Python in research/validation, so this path
            // is left exactly as it was rather than changed unvalidated.
            score += 1;
            visit(child, nesting);
            continue;
          }

          const elseIfTarget = isElseIfLink(child) ? child.namedChild(0) : null;
          if (elseIfTarget) {
            // `else if`: descend straight to the inner `if` with `nesting`
            // UNCHANGED. Its body then lands at nesting + 1 through the generic
            // descent below — the same level as the leading `if`'s body,
            // because a chain does not deepen as it extends. Passing nesting+1
            // here instead puts the body one level too deep and over-scores an
            // `if` written inside an `else if` body.
            visit(elseIfTarget, nesting, true);
          } else {
            // Terminal `else`: B1's flat +1 and no B3 increment, but it does
            // raise the nesting level for whatever it contains (B2).
            score += 1;
            visit(child, nesting + 1);
          }
          continue;
        }

        // B2: the body of this structure sits one level deeper.
        visit(child, nesting + 1);
      }
      return;
    }

    if (profile.jumpTypes.has(node.type) && nesting > 0) {
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
      if (child) visit(child, nesting);
    }
  }

  visit(fnNode, 0);
  return score;
}
