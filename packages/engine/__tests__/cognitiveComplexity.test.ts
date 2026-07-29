import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../src/parsing/tsParser.js";
import { computeCognitiveComplexity } from "../src/extract/cognitiveComplexity.js";
import { walkTree } from "../src/utils/astWalker.js";
import { FUNCTION_NODE_TYPES } from "../src/utils/constants.js";
import type { SyntaxNode } from "tree-sitter";

function firstFunction(root: SyntaxNode): SyntaxNode {
  let fn: SyntaxNode | null = null;
  walkTree(root, {
    enter(node) {
      if (fn) return;
      if (FUNCTION_NODE_TYPES.has(node.type)) fn = node;
    },
  });
  if (!fn) throw new Error("expected a function");
  return fn;
}

describe("computeCognitiveComplexity", () => {
  it("is 0 for empty function body", () => {
    const tree = parseTypeScript(`function f() {}`, "ts");
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(0);
  });

  it("adds 1 for root-level if", () => {
    const tree = parseTypeScript(
      `function f() { if (true) { return 1; } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(1);
  });

  it("adds 1 + 2 for nested if (additive story)", () => {
    const tree = parseTypeScript(
      `function f() { if (a) { if (b) { return 1; } } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(3);
  });

  it("does not add a penalty for an unlabeled break inside a loop (D5)", () => {
    // An unlabeled `break` ending a loop or switch case is ordinary control
    // flow, not a jump that breaks the reader's model of what runs next.
    // Sonar's cognitive-complexity spec only penalizes jumps to a label.
    const tree = parseTypeScript(
      `function f() { while (true) { break; } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(1);
  });

  it("adds a penalty for a labeled break (D5)", () => {
    const tree = parseTypeScript(
      `function f() { outer: while (true) { while (true) { break outer; } } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    // while(1) + nested while(2) + labeled break(1) = 4
    expect(computeCognitiveComplexity(fn)).toBe(4);
  });

  it("leaves unlabeled continue/throw penalized — D5 is scoped to break only", () => {
    // The fix is deliberately scoped to `break`: an unlabeled `break` ending a
    // loop or switch case is ordinary control flow, but `continue` and `throw`
    // were not part of this pass and keep their existing (unlabeled) penalty.
    const tree = parseTypeScript(
      `function f() { while (true) { continue; } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(2);
  });

  it("scores a terminal else at the same depth as its if, not nested (D3/D4)", () => {
    // Sonar's cognitive-complexity spec gives `if` and a terminal (non-"else
    // if") `else` each a flat +1, with no nesting increment for the else
    // branch itself. Matches the sonarjs baseline in
    // research/validation/fixtures/conventions.ts (h1_else, scored 2 there).
    const tree = parseTypeScript(
      `function f(n: number) { if (n === 1) { return 1; } else { return 0; } }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(2);
  });

  it("scores an else-if chain as one flat increment per link, not escalating (D3)", () => {
    // Initial if + 3 else-if links + terminal else = 5 flat increments, none
    // deeper than the first `if`. Before the fix this scored 1+2+3+4 = 10 (the
    // nesting-escalation bug) and even after removing the escalation alone
    // would only reach 4, because a terminal else needs its own +1 too (D4) to
    // land on Sonar's actual count. The fixture is
    // research/validation/fixtures/else_chains.ts (elseIfChain, sonarjs = 5).
    const tree = parseTypeScript(
      `function elseIfChain(n: number) {
        if (n === 1) { return 1; }
        else if (n === 2) { return 2; }
        else if (n === 3) { return 3; }
        else if (n === 4) { return 4; }
        else { return 0; }
      }`,
      "ts",
    );
    const fn = firstFunction(tree.rootNode);
    expect(computeCognitiveComplexity(fn)).toBe(5);
  });
});
