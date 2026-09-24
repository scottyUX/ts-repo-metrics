// Per-function engine cognitive + Halstead for every .py file the engine would discover.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const dist = new URL("../../../packages/engine/dist", import.meta.url).pathname;
const { discoverSourceFiles } = await import(`${dist}/collect/fileDiscovery.js`);
const { parseSource } = await import(`${dist}/parsing/tsParser.js`);
const { extractFunctionMetrics } = await import(`${dist}/extract/functionMetrics.js`);
const { PYTHON_PROFILE } = await import(`${dist}/utils/languageProfile.js`);
const { computePythonCognitiveComplexity } = await import(`${dist}/extract/python/lexical.js`);
const [repo, listOut, out] = process.argv.slice(2);
const files = (await discoverSourceFiles(repo)).filter((f) => f.endsWith(".py")).map((f) => path.relative(repo, f));
await writeFile(listOut, files.join("\n"));
const rows = [];
for (const rel of files) {
  const code = await readFile(path.join(repo, rel), "utf8");
  const tree = parseSource(code, "py");
  const fm = extractFunctionMetrics(tree.rootNode, { relativeFilePath: rel, languageProfile: PYTHON_PROFILE });
  // Top-level vs nested: find the def node at each function's start line.
  const defs = tree.rootNode.descendantsOfType("function_definition");
  const nestedLines = new Set(defs.filter((d) => {
    for (let p = d.parent; p; p = p.parent) if (p.type === "function_definition" || p.type === "lambda") return true;
    return false;
  }).map((d) => d.startPosition.row + 1));
  const methodOf = new Map(defs.map((d) => {
    let p = d.parent; if (p?.type === "decorated_definition") p = p.parent;
    const cls = p?.type === "block" && p.parent?.type === "class_definition" ? p.parent.childForFieldName("name")?.text : null;
    return [d.startPosition.row + 1, cls];
  }));
  const defAt = new Map(defs.map((d) => [d.startPosition.row + 1, d]));
  for (const f of fm.functions) {
    if (f.type !== "function_definition") continue;
    const cognitiveGaps = computePythonCognitiveComplexity(defAt.get(f.startLine), { emulateComplexipyGaps: true });
    const dn = defAt.get(f.startLine); const joinLine = dn?.parent?.type === "decorated_definition" ? dn.parent.startPosition.row + 1 : f.startLine;
    rows.push({ file: rel, name: f.name, line: joinLine, defLine: f.startLine, cls: methodOf.get(f.startLine) ?? null, nested: nestedLines.has(f.startLine), cognitive: f.cognitiveComplexity, cognitiveGaps, ...f.halstead, hasError: tree.rootNode.hasError });
  }
}
await writeFile(out, JSON.stringify(rows));
