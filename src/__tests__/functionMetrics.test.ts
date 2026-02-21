/**
 * Unit tests for src/extract/functionMetrics.ts.
 * Covers extraction of line count, parameter count, and nesting depth from function AST nodes.
 * Asserts exact values for length, nesting, parameters; includes arrow, method, nested functions.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../parsing/tsParser.js";
import { extractFunctionMetrics } from "../extract/functionMetrics.js";

describe("extractFunctionMetrics", () => {
  it("returns empty functions for empty program", () => {
    const tree = parseTypeScript("", "ts");
    const result = extractFunctionMetrics(tree.rootNode);
    expect(result.functions).toHaveLength(0);
    expect(result.summary.totalFunctions).toBe(0);
  });

  it("extracts exact line count for function", () => {
    const code = `
function add(a: number, b: number) {
  return a + b;
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = extractFunctionMetrics(tree.rootNode);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe("add");
    expect(result.functions[0]!.parameterCount).toBe(2);
    expect(result.functions[0]!.lines).toBe(3);
  });

  it("extracts exact nesting depth", () => {
    const code = `
function nested() {
  if (true) {
    for (let i = 0; i < 1; i++) {}
  }
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = extractFunctionMetrics(tree.rootNode);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.maxNestingDepth).toBe(2);
  });

  it("extracts parameter counts for arrow and method", () => {
    const code = `
const arrow = (a: number, b: number) => a + b;
class C {
  m(x: number, y: number, z: number) { return x + y + z; }
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = extractFunctionMetrics(tree.rootNode);
    expect(result.functions).toHaveLength(2);
    const arrow = result.functions.find((f) => f.type === "arrow_function");
    const method = result.functions.find((f) => f.type === "method_definition");
    expect(arrow!.parameterCount).toBe(2);
    expect(arrow!.lines).toBe(1);
    expect(method!.parameterCount).toBe(3);
    expect(method!.name).toBe("m");
  });

  it("includes nested functions and counts each", () => {
    const code = `
function outer() {
  function inner() {
    return 1;
  }
  return inner();
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = extractFunctionMetrics(tree.rootNode);
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]!.name).toBe("outer");
    expect(result.functions[1]!.name).toBe("inner");
    expect(result.functions[0]!.lines).toBe(6);
    expect(result.functions[1]!.lines).toBe(3);
  });
});
