/**
 * Unit tests for src/parsing/sourceParser.ts.
 *
 * Covers D9: node-tree-sitter reads source through a fixed-size UTF-16 buffer
 * (default 32 * 1024 code units, i.e. 32,768 characters). Below that boundary a
 * plain `parser.parse(code)` call works; at or above it, it throws
 * `Invalid argument` and the source is never parsed at all, silently dropping
 * every function it contains from every metric. parseSource must size the
 * buffer to the source so this can't happen.
 */

import { describe, it, expect } from "vitest";
import { parseSource } from "../src/parsing/sourceParser.js";

/**
 * A syntactically valid TS source of at least `minChars` characters, built from
 * whole statements so a length target never lands mid-token.
 */
function sourceOfLength(minChars: number): string {
  const unit = "const x = 1;\n"; // 14 chars
  const copies = Math.ceil(minChars / unit.length);
  return unit.repeat(copies);
}

describe("parseSource", () => {
  it("parses a source right at the historical 32,768-character boundary", () => {
    const code = sourceOfLength(32 * 1024);
    const tree = parseSource(code, "ts");
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.endIndex).toBe(code.length);
  });

  it("parses a source one character past the historical boundary", () => {
    const code = sourceOfLength(32 * 1024 + 1);
    const tree = parseSource(code, "ts");
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.endIndex).toBe(code.length);
  });

  it("parses a source several times past the historical boundary", () => {
    const code = sourceOfLength(200 * 1024);
    const tree = parseSource(code, "ts");
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.endIndex).toBe(code.length);
  });

  it("finds every function in a large .tsx source, not just those before the boundary", () => {
    const before = "function early() { return 1; }\n";
    const padding = "// padding padding padding padding padding padding\n".repeat(
      1200, // pushes `late` well past 32,768 characters
    );
    const after = "function late() { return 2; }\n";
    const code = before + padding + after;
    expect(code.length).toBeGreaterThan(32 * 1024);

    const tree = parseSource(code, "tsx");
    expect(tree.rootNode.hasError).toBe(false);

    const names: string[] = [];
    (function walk(node): void {
      if (node.type === "function_declaration") {
        names.push(node.childForFieldName("name")?.text ?? "");
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) walk(child);
      }
    })(tree.rootNode);

    expect(names).toEqual(["early", "late"]);
  });
});
