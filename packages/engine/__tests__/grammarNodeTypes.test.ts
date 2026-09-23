/**
 * Node-type names and parser limits that must match tree-sitter-typescript 0.23.
 * `function () {}` is `function_expression`, dependency arrays are `array`,
 * and strings of 32 KiB or more need an explicit parser buffer.
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { parseTypeScript } from "../src/parsing/tsParser.js";
import { countFunctions } from "../src/extract/functionCount.js";
import { extractFunctionMetrics } from "../src/extract/functionMetrics.js";
import { analyzeHookSafetyInFunction } from "../src/extract/react/hookSafety.js";
import { FUNCTION_NODE_TYPES } from "../src/utils/constants.js";

const require = createRequire(import.meta.url);

function namedNodeTypes(grammar: "typescript" | "tsx"): Set<string> {
  const types = require(`tree-sitter-typescript/${grammar}/src/node-types.json`) as {
    type: string;
    named: boolean;
  }[];
  return new Set(types.filter((t) => t.named).map((t) => t.type));
}

describe("FUNCTION_NODE_TYPES", () => {
  it("names only node types the grammar produces", () => {
    for (const grammar of ["typescript", "tsx"] as const) {
      const named = namedNodeTypes(grammar);
      for (const t of FUNCTION_NODE_TYPES) {
        expect(named.has(t), `${t} in ${grammar}`).toBe(true);
      }
    }
  });
});

describe("function expressions", () => {
  const code = `
app.get("/", function (req, res) {
  if (req.a) {
    res.send(1);
  } else if (req.b) {
    res.send(2);
  }
});
var named = function helper() {};
var obj = { k: function () {} };
`;

  it("counts callbacks, named expressions, and object values", () => {
    const tree = parseTypeScript(code, "tsx");
    const result = countFunctions(tree.rootNode);
    expect(result.total).toBe(3);
    expect(result.byType.function_expression).toBe(3);
  });

  it("scores a callback like the same body written as a declaration", () => {
    const body = `{
  if (req.a) {
    res.send(1);
  } else if (req.b) {
    res.send(2);
  }
}`;
    const cc = (src: string) =>
      extractFunctionMetrics(parseTypeScript(src, "tsx").rootNode, {
        relativeFilePath: "src/app.js",
      }).functions.map((f) => f.cyclomaticComplexity);

    const asCallback = cc(`app.get("/", function (req, res) ${body});`);
    const asDeclaration = cc(`function handler(req, res) ${body}`);
    expect(asCallback).toHaveLength(1);
    expect(asCallback[0]).toBeGreaterThan(1);
    expect(asCallback).toEqual(asDeclaration);
  });
});

describe("large files", () => {
  it("parses a file longer than 32 KiB", () => {
    const code = "function f() { return 1; }\n".repeat(2000);
    expect(code.length).toBeGreaterThan(32 * 1024);
    const tree = parseTypeScript(code, "ts");
    expect(tree.rootNode.hasError).toBe(false);
    expect(countFunctions(tree.rootNode).total).toBe(2000);
  });

  it("parses a long file with multibyte characters", () => {
    const code = 'const s = "日本語🙂é";\n'.repeat(3000);
    expect(code.length).toBeGreaterThan(32 * 1024);
    const tree = parseTypeScript(code, "tsx");
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.namedChildCount).toBe(3000);
  });

  it("still parses an empty file", () => {
    expect(parseTypeScript("", "ts").rootNode.namedChildCount).toBe(0);
  });
});

describe("useEffect dependency arrays", () => {
  function flags(body: string) {
    const tree = parseTypeScript(`function C() { ${body} }`, "tsx");
    return analyzeHookSafetyInFunction(tree.rootNode);
  }

  it("accepts a primitive dependency array", () => {
    const f = flags("useEffect(() => {}, [a, b]);");
    expect(f.missingOrInvalidDepsArray).toBe(0);
    expect(f.nonPrimitiveDepRisk).toBe(0);
  });

  it("flags object and array dependencies", () => {
    const f = flags("useEffect(() => {}, [{ a: 1 }, [b]]);");
    expect(f.missingOrInvalidDepsArray).toBe(0);
    expect(f.nonPrimitiveDepRisk).toBe(2);
  });

  it("flags a missing dependency array", () => {
    expect(flags("useEffect(() => {});").missingOrInvalidDepsArray).toBe(1);
  });

  it("does not treat a hook inside a function expression as conditional", () => {
    const f = flags("if (x) { const cb = function () { useState(0); }; }");
    expect(f.conditionalHookCalls).toBe(0);
  });
});
