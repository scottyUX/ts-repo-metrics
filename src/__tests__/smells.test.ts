/**
 * Unit tests for src/extract/smells.ts.
 * Covers all 5 detectors: empty catch, console.log, long params, long functions (>50 lines),
 * deep nesting (>4 levels), and detectSmells aggregation.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../parsing/tsParser.js";
import {
  detectEmptyCatchBlocks,
  detectConsoleLogs,
  detectLongParameterLists,
  detectLongFunctions,
  detectDeepNesting,
  detectSmells,
} from "../extract/smells.js";

describe("detectEmptyCatchBlocks", () => {
  it("returns 0 when no catch blocks", () => {
    const code = `function f() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    expect(detectEmptyCatchBlocks(tree.rootNode)).toBe(0);
  });

  it("counts empty catch block", () => {
    const code = `
try {
  foo();
} catch (e) {}
`;
    const tree = parseTypeScript(code, "ts");
    expect(detectEmptyCatchBlocks(tree.rootNode)).toBe(1);
  });
});

describe("detectConsoleLogs", () => {
  it("returns 0 when no console calls", () => {
    const code = `function f() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    expect(detectConsoleLogs(tree.rootNode)).toBe(0);
  });

  it("counts console.log", () => {
    const code = `console.log("test");`;
    const tree = parseTypeScript(code, "ts");
    expect(detectConsoleLogs(tree.rootNode)).toBe(1);
  });

  it("counts multiple console methods", () => {
    const code = `console.log(1); console.warn(2); console.error(3);`;
    const tree = parseTypeScript(code, "ts");
    expect(detectConsoleLogs(tree.rootNode)).toBe(3);
  });
});

describe("detectLongFunctions", () => {
  it("returns 0 when no functions exceed threshold", () => {
    const code = `function short() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    expect(detectLongFunctions(tree.rootNode)).toBe(0);
  });

  it("counts function with more than 50 lines", () => {
    const lines = Array(51).fill("  x();").join("\n");
    const code = `function long() {\n${lines}\n}`;
    const tree = parseTypeScript(code, "ts");
    expect(detectLongFunctions(tree.rootNode)).toBe(1);
  });
});

describe("detectDeepNesting", () => {
  it("returns 0 when no function exceeds 4 levels", () => {
    const code = `
function shallow() {
  if (a) { if (b) { if (c) { return 1; } } }
}
`;
    const tree = parseTypeScript(code, "ts");
    expect(detectDeepNesting(tree.rootNode)).toBe(0);
  });

  it("counts function with nesting deeper than 4", () => {
    const code = `
function deeplyNested() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) return 1;
        }
      }
    }
  }
}
`;
    const tree = parseTypeScript(code, "ts");
    expect(detectDeepNesting(tree.rootNode)).toBe(1);
  });
});

describe("detectLongParameterLists", () => {
  it("returns 0 for function with few params", () => {
    const code = `function f(a: number, b: number) {}`;
    const tree = parseTypeScript(code, "ts");
    expect(detectLongParameterLists(tree.rootNode)).toBe(0);
  });

  it("counts function with more than 4 params", () => {
    const code = `function f(a: number, b: number, c: number, d: number, e: number) {}`;
    const tree = parseTypeScript(code, "ts");
    expect(detectLongParameterLists(tree.rootNode)).toBe(1);
  });
});

describe("detectSmells", () => {
  it("aggregates all detectors", () => {
    const code = `
console.log("x");
try { } catch (e) {}
`;
    const tree = parseTypeScript(code, "ts");
    const result = detectSmells(tree.rootNode);
    expect(result.consoleLogs).toBe(1);
    expect(result.emptyCatchBlocks).toBe(1);
    expect(result.longFunctions).toBe(0);
    expect(result.deepNesting).toBe(0);
    expect(result.longParameterLists).toBe(0);
  });

  it("includes longFunctions and deepNesting from dedicated detectors", () => {
    const longLines = Array(51).fill("  x();").join("\n");
    const code = `
function long() {
${longLines}
}
function deep() {
  if (a) { if (b) { if (c) { if (d) { if (e) return 1; } } } }
}
`;
    const tree = parseTypeScript(code, "ts");
    const result = detectSmells(tree.rootNode);
    expect(result.longFunctions).toBe(1);
    expect(result.deepNesting).toBe(1);
  });
});
