/**
 * Halstead complexity metrics from operator/operand multisets.
 */

import type { HalsteadMetrics } from "../types/report.js";
import { collectHalsteadAtoms, type HalsteadAtomLists } from "../parsing/tokenScanner.js";
import type { LanguageProfile } from "../utils/languageProfile.js";
import type { SyntaxNode } from "tree-sitter";

export type { HalsteadMetrics } from "../types/report.js";

function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

/**
 * Aggregate Halstead metrics from raw atom lists.
 */
export function halsteadFromAtoms(atoms: HalsteadAtomLists): HalsteadMetrics {
  const n1 = new Set(atoms.operators).size;
  const n2 = new Set(atoms.operands).size;
  const N1 = atoms.operators.length;
  const N2 = atoms.operands.length;

  const distinct = n1 + n2;
  let volume = 0;
  if (distinct > 0 && N1 + N2 > 0) {
    volume = (N1 + N2) * log2(distinct);
  }

  let difficulty = 0;
  if (n2 > 0) {
    difficulty = (n1 / 2) * (N2 / n2);
  }

  const effort = difficulty * volume;

  return {
    n1,
    n2,
    N1,
    N2,
    volume: Math.round(volume * 1000) / 1000,
    difficulty: Math.round(difficulty * 1000) / 1000,
    effort: Math.round(effort * 1000) / 1000,
  };
}

/**
 * Compute Halstead metrics for a function AST subtree.
 */
export function computeHalsteadForFunction(
  fnNode: SyntaxNode,
  profile?: LanguageProfile,
): HalsteadMetrics {
  return halsteadFromAtoms(collectHalsteadAtoms(fnNode, profile));
}
