/**
 * Test coverage proxy metric.
 *
 * Computes the ratio of test LOC to source LOC as a static proxy for
 * actual test coverage. Classified as:
 *   - low:      ratio < 0.1
 *   - moderate: 0.1 <= ratio <= 0.3
 *   - high:     ratio > 0.3
 *
 * This avoids the need to run tests with instrumentation while still
 * providing a useful signal of testing investment.
 */

import type { RepoProfile, TestCoverageProxy } from "../types/report.js";

export type { TestCoverageProxy } from "../types/report.js";

/**
 * Compute the test coverage proxy from LOC data.
 *
 * @param profile - Repository profile with sourceLOC and testLOC.
 * @returns Ratio and classification.
 */
export function computeTestCoverageProxy(
  profile: RepoProfile,
): TestCoverageProxy {
  if (profile.sourceLOC === 0) {
    return { ratio: 0, classification: "low" };
  }

  const ratio =
    Math.round((profile.testLOC / profile.sourceLOC) * 100) / 100;

  let classification: TestCoverageProxy["classification"];
  if (ratio < 0.1) classification = "low";
  else if (ratio <= 0.3) classification = "moderate";
  else classification = "high";

  return { ratio, classification };
}
