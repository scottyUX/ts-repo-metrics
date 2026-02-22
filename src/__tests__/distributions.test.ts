/**
 * Unit tests for src/extract/distributions.ts.
 * Covers computeDistributions: percentiles, concentration metric, edge cases.
 */

import { describe, it, expect } from "vitest";
import { computeDistributions } from "../extract/distributions.js";
import type { FunctionDetail, FunctionComplexity, PerFileEntry } from "../types/report.js";

describe("computeDistributions", () => {
  it("returns zeros for empty inputs", () => {
    const result = computeDistributions([], [], []);
    expect(result).toEqual({
      p50_function_length: 0,
      p75_function_length: 0,
      p90_function_length: 0,
      p50_complexity: 0,
      p75_complexity: 0,
      p90_complexity: 0,
      percent_high_complexity_in_top_10_percent_files: 0,
    });
  });

  it("computes percentiles for function length and complexity", () => {
    const details: FunctionDetail[] = [
      { name: "a", type: "fn", startLine: 1, lines: 5, maxNestingDepth: 0, parameterCount: 0 },
      { name: "b", type: "fn", startLine: 2, lines: 10, maxNestingDepth: 0, parameterCount: 0 },
      { name: "c", type: "fn", startLine: 3, lines: 15, maxNestingDepth: 0, parameterCount: 0 },
      { name: "d", type: "fn", startLine: 4, lines: 20, maxNestingDepth: 0, parameterCount: 0 },
      { name: "e", type: "fn", startLine: 5, lines: 25, maxNestingDepth: 0, parameterCount: 0 },
    ];
    const complexities: FunctionComplexity[] = [
      { name: "a", type: "fn", startLine: 1, complexity: 1 },
      { name: "b", type: "fn", startLine: 2, complexity: 2 },
      { name: "c", type: "fn", startLine: 3, complexity: 3 },
      { name: "d", type: "fn", startLine: 4, complexity: 4 },
      { name: "e", type: "fn", startLine: 5, complexity: 5 },
    ];
    const perFile: PerFileEntry[] = [
      { file: "a.ts", functions: 5, functionsByType: {}, functionMetrics: details, complexity: complexities },
    ];
    const result = computeDistributions(details, complexities, perFile);
    expect(result.p50_function_length).toBe(15);
    expect(result.p75_function_length).toBe(20);
    expect(result.p90_function_length).toBe(25);
    expect(result.p50_complexity).toBe(3);
    expect(result.p75_complexity).toBe(4);
    expect(result.p90_complexity).toBe(5);
  });

  it("computes percent_high_complexity_in_top_10_percent_files when concentrated in top files", () => {
    // 2 high-complexity functions (>= 10), both in top 10% of files by total complexity
    const details: FunctionDetail[] = [
      { name: "hc1", type: "fn", startLine: 1, lines: 20, maxNestingDepth: 0, parameterCount: 0 },
      { name: "hc2", type: "fn", startLine: 2, lines: 30, maxNestingDepth: 0, parameterCount: 0 },
      ...Array.from({ length: 18 }, (_, i) => ({
        name: `low${i}`,
        type: "fn" as const,
        startLine: 10 + i,
        lines: 2,
        maxNestingDepth: 0 as const,
        parameterCount: 0 as const,
      })),
    ];
    const complexities: FunctionComplexity[] = [
      { name: "hc1", type: "fn", startLine: 1, complexity: 12 },
      { name: "hc2", type: "fn", startLine: 2, complexity: 15 },
      ...Array.from({ length: 18 }, (_, i) => ({
        name: `low${i}`,
        type: "fn" as const,
        startLine: 10 + i,
        complexity: 1,
      })),
    ];
    const perFile: PerFileEntry[] = [
      { file: "high.ts", functions: 2, functionsByType: {}, functionMetrics: details.slice(0, 2), complexity: complexities.slice(0, 2) },
      ...Array.from({ length: 9 }, (_, i) => ({
        file: `low${i}.ts`,
        functions: 2,
        functionsByType: {} as Record<string, number>,
        functionMetrics: details.slice(2 + i * 2, 4 + i * 2),
        complexity: complexities.slice(2 + i * 2, 4 + i * 2),
      })),
    ];
    const result = computeDistributions(details, complexities, perFile);
    expect(result.percent_high_complexity_in_top_10_percent_files).toBe(100);
  });

  it("handles single function", () => {
    const details: FunctionDetail[] = [
      { name: "only", type: "fn", startLine: 1, lines: 42, maxNestingDepth: 1, parameterCount: 2 },
    ];
    const complexities: FunctionComplexity[] = [
      { name: "only", type: "fn", startLine: 1, complexity: 3 },
    ];
    const perFile: PerFileEntry[] = [
      { file: "single.ts", functions: 1, functionsByType: {}, functionMetrics: details, complexity: complexities },
    ];
    const result = computeDistributions(details, complexities, perFile);
    expect(result.p50_function_length).toBe(42);
    expect(result.p90_function_length).toBe(42);
    expect(result.p50_complexity).toBe(3);
    expect(result.p90_complexity).toBe(3);
  });
});
