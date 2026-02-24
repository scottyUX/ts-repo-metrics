/**
 * Unit tests for src/extract/complexity.ts.
 * Covers cyclomatic complexity: branch points, if, switch/case, catch, ternary,
 * logical operators, combined boolean chains. Asserts exact counts.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../src/parsing/tsParser.js";
import { computeComplexity, summarizeComplexity } from "../src/extract/complexity.js";

describe("computeComplexity", () => {
  it("returns complexity 1 for function with no branches", () => {
    const code = `function simple() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(1);
  });

  it("adds 1 for each if statement (exact count)", () => {
    const code = `
function withIf(a: number) {
  if (a > 0) return 1;
  if (a < 0) return -1;
  return 0;
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(3);
  });

  it("counts logical operator with proper params", () => {
    const code = `function withOr(a: boolean, b: boolean) { if (a || b) return 1; return 0; }`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(3);
  });

  it("counts switch/case branches", () => {
    const code = `
function withSwitch(n: number) {
  switch (n) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 0;
  }
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(4);
  });

  it("counts catch clause", () => {
    const code = `
function withCatch() {
  try { x(); } catch (e) { return 0; }
  return 1;
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(2);
  });

  it("counts ternary expression", () => {
    const code = `function withTernary(a: boolean) { return a ? 1 : 0; }`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(2);
  });

  it("counts combined boolean chain a && b || c", () => {
    const code = `function chain(a: boolean, b: boolean, c: boolean) { if (a && b || c) return 1; return 0; }`;
    const tree = parseTypeScript(code, "ts");
    const result = computeComplexity(tree.rootNode);
    expect(result).toHaveLength(1);
    expect(result[0]!.complexity).toBe(4);
  });
});

describe("summarizeComplexity", () => {
  it("returns zeros for empty array", () => {
    const result = summarizeComplexity([]);
    expect(result).toEqual({ average: 0, max: 0, highComplexityFunctions: 0 });
  });

  it("computes average and max", () => {
    const result = summarizeComplexity(
      [
        { name: "a", type: "fn", startLine: 1, complexity: 2 },
        { name: "b", type: "fn", startLine: 5, complexity: 4 },
      ],
    );
    expect(result.average).toBe(3);
    expect(result.max).toBe(4);
  });
});
