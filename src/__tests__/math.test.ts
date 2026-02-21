/**
 * Unit tests for src/utils/math.ts.
 * Covers median calculation: empty arrays, single element, odd/even length, edge cases.
 */

import { describe, it, expect } from "vitest";
import { median } from "../utils/math.js";

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns single element for one-element array", () => {
    expect(median([42])).toBe(42);
  });

  it("returns middle element for odd-length array", () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it("returns average of two middle elements for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles two elements", () => {
    expect(median([10, 20])).toBe(15);
  });
});
