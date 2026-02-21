/**
 * Unit tests for src/utils/text.ts.
 * Covers countLines: empty strings, single line, multiple lines, trailing newlines.
 */

import { describe, it, expect } from "vitest";
import { countLines } from "../utils/text.js";

describe("countLines", () => {
  it("returns 0 for empty string", () => {
    expect(countLines("")).toBe(0);
  });

  it("returns 1 for single line without newline", () => {
    expect(countLines("hello")).toBe(1);
  });

  it("returns 1 for single line with trailing newline", () => {
    expect(countLines("hello\n")).toBe(1);
  });

  it("returns 2 for two lines", () => {
    expect(countLines("line1\nline2")).toBe(2);
  });

  it("returns 2 for two lines with trailing newline", () => {
    expect(countLines("line1\nline2\n")).toBe(2);
  });

  it("counts multiple newlines", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });
});
