/**
 * Unit tests for src/utils/astWalker.ts.
 * Covers enter/leave order, skip-children behavior, visitor invocation.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../parsing/tsParser.js";
import { walkTree, SKIP } from "../utils/astWalker.js";

describe("walkTree", () => {
  it("calls enter before leave for each node", () => {
    const code = `function f() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    const order: string[] = [];
    walkTree(tree.rootNode, {
      enter(n) {
        order.push(`enter:${n.type}`);
      },
      leave(n) {
        order.push(`leave:${n.type}`);
      },
    });
    expect(order[0]).toMatch(/enter/);
    expect(order.at(-1)).toMatch(/leave/);
    expect(order.filter((s) => s.startsWith("enter")).length).toBe(
      order.filter((s) => s.startsWith("leave")).length,
    );
  });

  it("visits parent enter before children enter, children leave before parent leave", () => {
    const code = `function f() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    const order: string[] = [];
    walkTree(tree.rootNode, {
      enter(n) {
        if (["program", "function_declaration", "statement_block"].includes(n.type)) {
          order.push(n.type);
        }
      },
    });
    expect(order.indexOf("program")).toBeLessThan(order.indexOf("function_declaration"));
    expect(order.indexOf("function_declaration")).toBeLessThan(order.indexOf("statement_block"));
  });

  it("skips children when enter returns SKIP", () => {
    const code = `function a() {} function b() {}`;
    const tree = parseTypeScript(code, "ts");
    let functionCount = 0;
    walkTree(tree.rootNode, {
      enter(n) {
        if (n.type === "function_declaration") {
          functionCount++;
          return SKIP;
        }
      },
    });
    expect(functionCount).toBe(2);
  });

  it("leave is not called for skipped subtrees", () => {
    const code = `function f() { return 1; }`;
    const tree = parseTypeScript(code, "ts");
    const entered: string[] = [];
    const left: string[] = [];
    walkTree(tree.rootNode, {
      enter(n) {
        entered.push(n.type);
        if (n.type === "function_declaration") return SKIP;
      },
      leave(n) {
        left.push(n.type);
      },
    });
    expect(entered).toContain("function_declaration");
    expect(left).not.toContain("function_declaration");
  });

  it("works with visitor that only has enter", () => {
    const code = `const x = 1;`;
    const tree = parseTypeScript(code, "ts");
    let count = 0;
    walkTree(tree.rootNode, {
      enter() {
        count++;
      },
    });
    expect(count).toBeGreaterThan(0);
  });

  it("works with visitor that only has leave", () => {
    const code = `const x = 1;`;
    const tree = parseTypeScript(code, "ts");
    let count = 0;
    walkTree(tree.rootNode, {
      leave() {
        count++;
      },
    });
    expect(count).toBeGreaterThan(0);
  });
});
