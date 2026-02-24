/**
 * Unit tests for src/extract/functionCount.ts.
 * Covers function counting from AST: declarations, arrow functions, methods, by-type breakdown.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../src/parsing/tsParser.js";
import { countFunctions } from "../src/extract/functionCount.js";

describe("countFunctions", () => {
  it("returns 0 for empty program", () => {
    const tree = parseTypeScript("", "ts");
    const result = countFunctions(tree.rootNode);
    expect(result.total).toBe(0);
  });

  it("counts single function declaration", () => {
    const code = `function foo() {}`;
    const tree = parseTypeScript(code, "ts");
    const result = countFunctions(tree.rootNode);
    expect(result.total).toBe(1);
    expect(result.byType.function_declaration).toBe(1);
  });

  it("counts arrow function", () => {
    const code = `const f = () => 1;`;
    const tree = parseTypeScript(code, "ts");
    const result = countFunctions(tree.rootNode);
    expect(result.total).toBe(1);
    expect(result.byType.arrow_function).toBe(1);
  });

  it("counts multiple functions of different types", () => {
    const code = `
      function a() {}
      const b = () => {};
      class C { m() {} }
    `;
    const tree = parseTypeScript(code, "ts");
    const result = countFunctions(tree.rootNode);
    expect(result.total).toBe(3);
    expect(result.byType.function_declaration).toBe(1);
    expect(result.byType.arrow_function).toBe(1);
    expect(result.byType.method_definition).toBe(1);
  });
});
