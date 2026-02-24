/**
 * Distribution metrics for research (tail risk indicators).
 * Computes p50/p75/p90 for function length and complexity,
 * and percent_high_complexity_in_top_10_percent_files.
 */

import { percentile } from "../utils/math.js";
import type { FunctionDetail, FunctionComplexity, PerFileEntry } from "../types/report.js";
import type { DistributionMetrics } from "../types/report.js";

const HIGH_COMPLEXITY_THRESHOLD = 10;

/**
 * Compute distribution percentiles and concentration metric.
 *
 * @param allFunctionDetails - All function metrics across the repo.
 * @param allComplexities - All complexity values across the repo.
 * @param perFile - Per-file entries for concentration metric.
 * @returns Distribution metrics.
 */
export function computeDistributions(
  allFunctionDetails: FunctionDetail[],
  allComplexities: FunctionComplexity[],
  perFile: PerFileEntry[],
): DistributionMetrics {
  const lengths = allFunctionDetails.map((f) => f.lines).sort((a, b) => a - b);
  const complexities = allComplexities.map((c) => c.complexity).sort((a, b) => a - b);

  const p50_function_length = percentile(lengths, 50);
  const p75_function_length = percentile(lengths, 75);
  const p90_function_length = percentile(lengths, 90);
  const p50_complexity = percentile(complexities, 50);
  const p75_complexity = percentile(complexities, 75);
  const p90_complexity = percentile(complexities, 90);

  const totalHighComplexity = allComplexities.filter(
    (c) => c.complexity >= HIGH_COMPLEXITY_THRESHOLD,
  ).length;

  let percent_high_complexity_in_top_10_percent_files = 0;
  if (totalHighComplexity > 0 && perFile.length > 0) {
    const fileComplexitySums = perFile.map((entry) => ({
      file: entry.file,
      totalComplexity: entry.complexity.reduce((sum, c) => sum + c.complexity, 0),
      highComplexityCount: entry.complexity.filter(
        (c) => c.complexity >= HIGH_COMPLEXITY_THRESHOLD,
      ).length,
    }));
    fileComplexitySums.sort((a, b) => b.totalComplexity - a.totalComplexity);
    const top10Count = Math.max(1, Math.ceil(perFile.length * 0.1));
    const topFiles = new Set(
      fileComplexitySums.slice(0, top10Count).map((f) => f.file),
    );
    const highInTop = perFile
      .filter((p) => topFiles.has(p.file))
      .reduce(
        (sum, p) =>
          sum +
          p.complexity.filter((c) => c.complexity >= HIGH_COMPLEXITY_THRESHOLD)
            .length,
        0,
      );
    percent_high_complexity_in_top_10_percent_files =
      Math.round((highInTop / totalHighComplexity) * 1000) / 10;
  }

  return {
    p50_function_length,
    p75_function_length,
    p90_function_length,
    p50_complexity,
    p75_complexity,
    p90_complexity,
    percent_high_complexity_in_top_10_percent_files,
  };
}
