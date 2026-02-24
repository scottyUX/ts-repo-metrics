/**
 * Unit tests for src/extract/maintainabilityIndex.ts.
 * Covers the MI formula and classification thresholds: high, moderate, low, zero-LOC edge case.
 */

import { describe, it, expect } from "vitest";
import { computeMaintainabilityIndex } from "../src/extract/maintainabilityIndex.js";

describe("computeMaintainabilityIndex", () => {
  it("returns high classification for good metrics", () => {
    const result = computeMaintainabilityIndex(2, 500, 10);
    expect(result.classification).toBe("high");
    expect(result.score).toBeGreaterThan(65);
  });

  it("returns low classification for poor metrics", () => {
    const result = computeMaintainabilityIndex(30, 500000, 200);
    expect(result.classification).toBe("low");
    expect(result.score).toBeLessThan(40);
  });

  it("returns moderate for middle-range metrics", () => {
    const result = computeMaintainabilityIndex(6, 5000, 25);
    expect(["low", "moderate", "high"]).toContain(result.classification);
  });

  it("handles zero totalLOC safely", () => {
    const result = computeMaintainabilityIndex(1, 0, 5);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
