/**
 * Client-side percentile for distribution metrics fallback.
 */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    Math.floor((p / 100) * sorted.length),
    sorted.length - 1
  );
  return sorted[idx] ?? 0;
}
