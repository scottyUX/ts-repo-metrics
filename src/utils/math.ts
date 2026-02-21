/**
 * Numeric utilities shared across extraction and pipeline modules.
 */

/**
 * Compute the median of a sorted numeric array.
 *
 * @param sorted - Array of numbers in ascending order.
 * @returns The median value, or 0 for an empty array.
 */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
