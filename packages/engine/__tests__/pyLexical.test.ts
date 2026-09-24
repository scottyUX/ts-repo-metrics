/**
 * Python cognitive complexity (complexipy 8.0.1 rules) and Halstead (radon 6.0.1).
 * Expected values were produced by those tools; see research/validation/python/.
 */

import { describe, it, expect } from "vitest";
import type { SyntaxNode } from "tree-sitter";
import { parseSource } from "../src/parsing/tsParser.js";
import {
  computePythonCognitiveComplexity,
  computePythonHalstead,
} from "../src/extract/python/lexical.js";

function firstDef(code: string): SyntaxNode {
  const def = parseSource(code, "py").rootNode.descendantsOfType("function_definition")[0];
  if (!def) throw new Error("no def in fixture");
  return def;
}

const cognitive = (code: string, emulateComplexipyGaps = false) =>
  computePythonCognitiveComplexity(firstDef(code), { emulateComplexipyGaps });

/** [shape, source, complexipy score] */
const COGNITIVE_CASES: [string, string, number][] = [
  ["if", "def f(a):\n    if a:\n        pass\n", 1],
  ["if/else", "def f(a):\n    if a:\n        pass\n    else:\n        pass\n", 2],
  ["if/elif/else", "def f(a,b):\n    if a:\n        pass\n    elif b:\n        pass\n    else:\n        pass\n", 3],
  ["four-link elif chain", "def f(a):\n    if a==1:\n        pass\n    elif a==2:\n        pass\n    elif a==3:\n        pass\n    elif a==4:\n        pass\n", 4],
  ["nested if", "def f(a,b):\n    if a:\n        if b:\n            pass\n", 3],
  ["if inside elif", "def f(a,b,c):\n    if a:\n        pass\n    elif b:\n        if c:\n            pass\n", 4],
  ["for/else adds nothing", "def f(a):\n    for x in a:\n        pass\n    else:\n        pass\n", 1],
  ["if inside for", "def f(a):\n    for x in a:\n        if x:\n            pass\n", 3],
  ["two excepts", "def f():\n    try:\n        pass\n    except E:\n        pass\n    except F:\n        pass\n", 2],
  ["try/finally", "def f():\n    try:\n        pass\n    finally:\n        pass\n", 0],
  ["try body does not nest", "def f(a):\n    try:\n        if a:\n            pass\n    except E:\n        pass\n", 2],
  ["except body nests", "def f(a):\n    try:\n        pass\n    except E:\n        if a:\n            pass\n", 3],
  ["with adds nothing", "def f(a):\n    with a:\n        if a:\n            pass\n", 1],
  ["ternary inside if", "def f(a,b):\n    if a:\n        return 1 if b else 2\n", 3],
  ["and chain", "def f(a,b,c):\n    return a and b and c\n", 1],
  ["and/or", "def f(a,b,c):\n    return a and b or c\n", 2],
  ["and/or/and", "def f(a,b,c,d):\n    return a and b or c and d\n", 3],
  ["parens looked through", "def f(a,b,c):\n    return a or (b or c)\n", 1],
  ["comprehension for", "def f(a):\n    return [x for x in a]\n", 1],
  ["comprehension ifs are flat", "def f(a):\n    return [x for x in a if x if x > 1]\n", 3],
  ["comprehension at depth 2", "def f(a,b):\n    if a:\n        if b:\n            return [x for x in a if x]\n", 7],
  ["comprehension inside comprehension", "def f(a):\n    return [[y for y in x] for x in a]\n", 3],
  ["match", "def f(a):\n    match a:\n        case 1:\n            pass\n        case 2:\n            pass\n", 1],
  ["if inside case", "def f(a,b):\n    match a:\n        case 1:\n            if b:\n                pass\n", 3],
  ["recursion counts once", "def f(a):\n    if a:\n        return f(a-1) + f(a-2)\n", 2],
  ["lambda nests", "def f(a):\n    return lambda x: 1 if x else 2\n", 2],
  ["nested def nests", "def f(a):\n    def g():\n        if a:\n            pass\n", 2],
  ["decorator shape does not nest", "def f(a):\n    def g(x):\n        if x:\n            pass\n    return g\n", 1],
  ["docstring breaks decorator shape", "def f(fn):\n    \"\"\"doc\"\"\"\n    def g(*a):\n        if a:\n            pass\n    return g\n", 2],
  ["def inside if/for does not nest", "def f(a):\n    for x in a:\n        if x:\n            def g():\n                if x:\n                    pass\n", 6],
  ["def inside def inside def", "def f(a):\n    def g():\n        def h():\n            if a:\n                pass\n", 3],
  ["method of a nested class", "def f(a):\n    class K:\n        def g(self):\n            if a:\n                pass\n    return K\n", 1],
  ["deep", "def f(a):\n    for x in a:\n        while x:\n            if x:\n                try:\n                    pass\n                except E:\n                    if a:\n                        pass\n", 15],
];

describe("Python cognitive complexity", () => {
  it.each(COGNITIVE_CASES)("%s matches complexipy", (_shape, code, expected) => {
    expect(cognitive(code)).toBe(expected);
  });

  it("counts structures complexipy does not look inside", () => {
    const kwarg = "def f(a):\n    g(x=1 if a else 2)\n";
    const binop = "def f(a):\n    return sum(x for x in a) - 1\n";
    const awaited = "async def f(a):\n    await g([x for x in a])\n";
    for (const code of [kwarg, binop, awaited]) {
      expect(cognitive(code)).toBe(1);
      expect(cognitive(code, true)).toBe(0);
    }
  });

  it("follows the spec, not complexipy, for `not` beside mixed and/or", () => {
    expect(cognitive("def f(a,b,c):\n    return (a or b) and not c\n")).toBe(2);
  });
});

/** [case, source, radon h1/h2/N1/N2/volume] */
const HALSTEAD_CASES: [string, string, { n1: number; n2: number; N1: number; N2: number; volume: number }][] = [
  ["arithmetic and boolean", "def f(a, b):\n    if a and b or a:\n        return 1\n    return a + b * 2\n", { n1: 4, n2: 5, N1: 4, N2: 8, volume: 38.039 }],
  ["names and equal strings are one operand", "def f(bump, major, minor):\n    if bump == \"major\":\n        return major + 1\n    return minor + 1\n", { n1: 2, n2: 4, N1: 3, N2: 6, volume: 23.265 }],
  ["chained, negated, and augmented", "def f(a, b):\n    x = a < b <= 3\n    y = a not in b\n    a += 1\n    return not x, -y\n", { n1: 6, n2: 6, N1: 6, N2: 9, volume: 53.774 }],
  ["nested def rolls up", "def f(a):\n    def g(x):\n        return x * 2\n    return g(a) + 1\n", { n1: 2, n2: 4, N1: 2, N2: 4, volume: 15.51 }],
  ["attributes keyed by name, parens unwrapped", "def f(self, other):\n    return (self.x - other.x) * (self.y + 1)\n", { n1: 3, n2: 5, N1: 3, N2: 6, volume: 27 }],
];

describe("Python Halstead", () => {
  it.each(HALSTEAD_CASES)("%s matches radon", (_case, code, expected) => {
    expect(computePythonHalstead(firstDef(code))).toMatchObject(expected);
  });

  it("ignores a line continuation inside a comparison", () => {
    const h = computePythonHalstead(firstDef("def f(r):\n    return r.m['a'] >= \\\n        r.m['b']\n"));
    expect(h).toMatchObject({ n1: 1, n2: 2, N1: 1, N2: 2 });
  });
});
