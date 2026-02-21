/**
 * Unit tests for src/extract/testCoverageProxy.ts.
 * Covers test/source LOC ratio and classification tiers: low (<0.1), moderate (0.1–0.3), high (>0.3).
 */

import { describe, it, expect } from "vitest";
import { computeTestCoverageProxy } from "../extract/testCoverageProxy.js";

describe("computeTestCoverageProxy", () => {
  it("returns low when sourceLOC is 0", () => {
    const result = computeTestCoverageProxy({
      totalFiles: 0,
      tsFiles: 0,
      tsxFiles: 0,
      testFiles: 0,
      totalLOC: 0,
      sourceLOC: 0,
      testLOC: 0,
    });
    expect(result).toEqual({ ratio: 0, classification: "low" });
  });

  it("returns low when ratio < 0.1", () => {
    const result = computeTestCoverageProxy({
      totalFiles: 10,
      tsFiles: 10,
      tsxFiles: 0,
      testFiles: 1,
      totalLOC: 110,
      sourceLOC: 100,
      testLOC: 5,
    });
    expect(result.classification).toBe("low");
    expect(result.ratio).toBe(0.05);
  });

  it("returns moderate when ratio between 0.1 and 0.3", () => {
    const result = computeTestCoverageProxy({
      totalFiles: 10,
      tsFiles: 10,
      tsxFiles: 0,
      testFiles: 2,
      totalLOC: 250,
      sourceLOC: 200,
      testLOC: 50,
    });
    expect(result.classification).toBe("moderate");
    expect(result.ratio).toBe(0.25);
  });

  it("returns high when ratio > 0.3", () => {
    const result = computeTestCoverageProxy({
      totalFiles: 10,
      tsFiles: 10,
      tsxFiles: 0,
      testFiles: 5,
      totalLOC: 200,
      sourceLOC: 100,
      testLOC: 100,
    });
    expect(result.classification).toBe("high");
    expect(result.ratio).toBe(1);
  });
});
