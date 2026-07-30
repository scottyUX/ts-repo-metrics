/**
 * Investigation only — no engine change.
 *
 * Question: does Python cognitive complexity have the same defect class the D4
 * port fixed for TypeScript/JavaScript?
 *
 * The D4 port is gated to `profile.language === "ecmascript"`, so Python still
 * runs the pre-D4 code path. Python's grammar is also shaped differently:
 * `elif_clause` is a SIBLING child of `if_statement`, not an `if` nested inside
 * an `else`, and `elif_clause` is itself listed in PYTHON_COGNITIVE_CONTROL.
 *
 * This scores structurally equivalent Python and JS/TS snippets side by side.
 * The JS column is SonarJS-validated (research/validation/d4_generalization);
 * the Python column has no baseline anywhere, which is the point.
 *
 * Usage: node python_cognitive_probe.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const cog = await import(path.join(ROOT, "packages/engine/dist/extract/cognitiveComplexity.js"));
const parser = await import(path.join(ROOT, "packages/engine/dist/parsing/sourceParser.js"));
const prof = await import(path.join(ROOT, "packages/engine/dist/utils/languageProfile.js"));

function score(src, lang) {
  const tree = parser.parseSource(src, lang === "py" ? "py" : "ts");
  const fnType = lang === "py" ? "function_definition" : "function_declaration";
  let fn = null;
  (function walk(n) {
    if (!fn && n.type === fnType) fn = n;
    for (let i = 0; i < n.namedChildCount; i++) walk(n.namedChild(i));
  })(tree.rootNode);
  return cog.computeCognitiveComplexity(
    fn,
    lang === "py" ? prof.PYTHON_PROFILE : prof.ECMASCRIPT_PROFILE,
  );
}

/**
 * Each case is the SAME control-flow shape written in both languages, with the
 * value Sonar's spec implies (B1 flat +1 per if/elif/else, B3 nesting increment
 * for `if` only, B2 nesting for bodies).
 */
const CASES = [
  {
    name: "if / elif / else  (flat)",
    spec: 3,
    py: "def f(n):\n    if n == 1:\n        return 1\n    elif n == 2:\n        return 2\n    else:\n        return 0\n",
    js: "function f(n) {\n  if (n === 1) { return 1; } else if (n === 2) { return 2; } else { return 0; }\n}",
  },
  {
    name: "if / elif x3 / else  (flat, longer)",
    spec: 5,
    py:
      "def f(n):\n    if n == 1:\n        return 1\n    elif n == 2:\n        return 2\n" +
      "    elif n == 3:\n        return 3\n    elif n == 4:\n        return 4\n    else:\n        return 0\n",
    js:
      "function f(n) {\n  if (n === 1) { return 1; }\n  else if (n === 2) { return 2; }\n" +
      "  else if (n === 3) { return 3; }\n  else if (n === 4) { return 4; }\n  else { return 0; }\n}",
  },
  {
    name: "chain nested 1 level inside an if",
    spec: 5,
    py:
      "def f(n, flag):\n    if flag:\n        if n == 1:\n            return 1\n" +
      "        elif n == 2:\n            return 2\n        else:\n            return 0\n    return -1\n",
    js:
      "function f(n, flag) {\n  if (flag) {\n    if (n === 1) { return 1; }\n" +
      "    else if (n === 2) { return 2; }\n    else { return 0; }\n  }\n  return -1;\n}",
  },
  {
    name: "if / else { if }  (else body nests)",
    spec: 4,
    py:
      "def f(n, flag):\n    if n == 1:\n        return 1\n    else:\n        if flag:\n            return 2\n        return 0\n",
    js:
      "function f(n, flag) {\n  if (n === 1) { return 1; } else {\n    if (flag) { return 2; }\n    return 0;\n  }\n}",
  },
  {
    name: "bare if / else",
    spec: 2,
    py: "def f(n):\n    if n == 1:\n        return 1\n    else:\n        return 0\n",
    js: "function f(n) {\n  if (n === 1) { return 1; } else { return 0; }\n}",
  },
];

console.log(
  "case".padEnd(38) + "Sonar spec".padStart(11) + "JS (validated)".padStart(16) + "Python".padStart(9) + "   verdict",
);
console.log("-".repeat(92));
let pyWrong = 0;
for (const c of CASES) {
  const js = score(c.js, "js");
  const py = score(c.py, "py");
  const jsOk = js === c.spec;
  const pyOk = py === c.spec;
  if (!pyOk) pyWrong++;
  console.log(
    c.name.padEnd(38) +
      String(c.spec).padStart(11) +
      `${js}${jsOk ? " ok" : " MISMATCH"}`.padStart(16) +
      String(py).padStart(9) +
      `   ${pyOk ? "matches spec" : `PYTHON OFF BY ${py - c.spec > 0 ? "+" : ""}${py - c.spec}`}`,
  );
}
console.log("-".repeat(92));
console.log(`Python disagrees with the Sonar spec on ${pyWrong}/${CASES.length} shapes.`);
