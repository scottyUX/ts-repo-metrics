/**
 * Maintainability Index (MI) calculator.
 *
 * Uses a simplified version of the Visual Studio / SEI formula:
 *
 *   MI = max(0, 171 - 5.2·ln(avgComplexity) - 0.23·ln(totalLOC) - 16.2·ln(avgFunctionLength)) × 100 / 171
 *
 * Normalized to a 0–100 scale. Classified as:
 *   - low:      score < 40
 *   - moderate: 40 <= score <= 65
 *   - high:     score > 65
 *
 * Reference: Coleman, D. et al. "Using Metrics to Evaluate Software System
 * Maintainability," IEEE Computer, 1994.
 */

import type { MaintainabilityResult } from "../types/report.js";

export type { MaintainabilityResult } from "../types/report.js";

/**
 * Compute the Maintainability Index from pre-computed metrics.
 *
 * @param avgComplexity - Average cyclomatic complexity across all functions.
 * @param totalLOC - Total lines of code in the repository.
 * @param avgFunctionLength - Average function length in lines.
 * @returns Normalized MI score (0–100) and classification.
 */
export function computeMaintainabilityIndex(
  avgComplexity: number,
  totalLOC: number,
  avgFunctionLength: number,
): MaintainabilityResult {
  const safeLog = (v: number) => Math.log(Math.max(v, 1));

  const raw =
    171 -
    5.2 * safeLog(avgComplexity) -
    0.23 * safeLog(totalLOC) -
    16.2 * safeLog(avgFunctionLength);

  const score = Math.round(Math.max(0, raw) * 100 / 171 * 10) / 10;

  let classification: MaintainabilityResult["classification"];
  if (score < 40) classification = "low";
  else if (score <= 65) classification = "moderate";
  else classification = "high";

  return { score, classification };
}
