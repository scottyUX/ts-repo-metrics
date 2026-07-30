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

/**
 * Regression suite for the B1/B2/B3 port that replaced D4.
 *
 * D4 gave a terminal `else` a flat +1. That was derived to hit one target value
 * and only held for FLAT chains: it over-scored chains nested inside another
 * structure (an `else if` wrongly took a nesting increment) and under-scored
 * anything inside an `else` body (the body was not nested). See
 * research/validation/d4_generalization/findings_d4.md.
 *
 * Every expected value below was measured against eslint-plugin-sonarjs@3.0.7
 * (`sonarjs/cognitive-complexity` at threshold 0), not derived by hand — the
 * probe is research/validation/d4_generalization/probe_d4.mjs. The first three
 * cases vary chain LENGTH (which D4 already handled); the rest vary chain
 * DEPTH, which is what D4 got wrong.
 */
describe("computeCognitiveComplexity — else-if chains vs SonarJS", () => {
  const score = (code: string) =>
    computeCognitiveComplexity(firstFunction(parseTypeScript(code, "ts").rootNode));

  // --- chain length: these already passed under D4, kept so a future change
  // --- cannot regress them ---

  it("2-link chain: if / else if / else = 3", () => {
    expect(
      score(`function f(n: number) {
        if (n === 1) { return 1; } else if (n === 2) { return 2; } else { return 0; }
      }`),
    ).toBe(3);
  });

  it("4-link chain: if / else if x3 / else = 5", () => {
    expect(
      score(`function f(n: number) {
        if (n === 1) { return 1; }
        else if (n === 2) { return 2; }
        else if (n === 3) { return 3; }
        else if (n === 4) { return 4; }
        else { return 0; }
      }`),
    ).toBe(5);
  });

  it("chain with no terminal else: if / else if x2 = 3", () => {
    expect(
      score(`function f(n: number) {
        if (n === 1) { return 1; }
        else if (n === 2) { return 2; }
        else if (n === 3) { return 3; }
        return 0;
      }`),
    ).toBe(3);
  });

  it("6-link chain: if / else if x5 / else = 7 (length generalizes)", () => {
    expect(
      score(`function f(n: number) {
        if (n === 1) { return 1; }
        else if (n === 2) { return 2; }
        else if (n === 3) { return 3; }
        else if (n === 4) { return 4; }
        else if (n === 5) { return 5; }
        else if (n === 6) { return 6; }
        else { return 0; }
      }`),
    ).toBe(7);
  });

  it("bare if / else = 2", () => {
    expect(
      score(`function f(n: number) {
        if (n === 1) { return 1; } else { return 0; }
      }`),
    ).toBe(2);
  });

  // --- chain depth: every one of these was WRONG under D4 ---

  it("chain nested 1 level inside an if = 5 (D4 scored 6)", () => {
    // if(flag) +1 at nesting 0; inner if +1+1 nesting; else if +1 flat;
    // else +1 flat. `else if` must NOT take the nesting increment.
    expect(
      score(`function f(n: number, flag: boolean) {
        if (flag) {
          if (n === 1) { return 1; } else if (n === 2) { return 2; } else { return 0; }
        }
        return -1;
      }`),
    ).toBe(5);
  });

  it("chain nested 2 levels deep = 8 (D4 scored 10)", () => {
    expect(
      score(`function f(n: number, a: boolean, b: boolean) {
        if (a) {
          if (b) {
            if (n === 1) { return 1; } else if (n === 2) { return 2; } else { return 0; }
          }
        }
        return -1;
      }`),
    ).toBe(8);
  });

  it("if inside a terminal else = 4 (D4 scored 3: the else body must nest)", () => {
    expect(
      score(`function f(n: number, flag: boolean) {
        if (n === 1) { return 1; } else {
          if (flag) { return 2; }
          return 0;
        }
      }`),
    ).toBe(4);
  });

  it("if inside an else-if body = 4 (a chain does not deepen as it extends)", () => {
    // The subtle one: the `else if` body sits at the SAME nesting level as the
    // leading `if`'s body, so the inner `if` is worth +2, not +3.
    expect(
      score(`function f(n: number, flag: boolean) {
        if (n === 1) { return 1; } else if (n === 2) {
          if (flag) { return 2; }
          return 0;
        }
        return -1;
      }`),
    ).toBe(4);
  });

  it("loop inside a terminal else = 7 (D4 scored 5; under-nesting compounds)", () => {
    expect(
      score(`function f(n: number, items: number[]) {
        if (n === 1) { return 1; } else {
          for (const it of items) {
            if (it > 0) { return it; }
          }
          return 0;
        }
      }`),
    ).toBe(7);
  });
});
