/**
 * Language-scoped aggregation for the cohort.
 *
 * Halstead (volume/difficulty/effort) and maintainabilityIndexGradAi (raw+norm)
 * are reported for the TypeScript/JavaScript subset ONLY. The Python operand
 * path deliberately still collapses literals by kind — the D7 fix and its
 * escomplex baseline are JavaScript-only — so a mixed-language mean would
 * average two incompatible operand conventions.
 *
 * File counts, source LOC, function counts and duplication are NOT operand
 * dependent and are reported across all six repos including Python.
 *
 * Usage: node language_scope.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COHORT = ["alexandria", "wayfinder", "SlugSync", "Lens", "VeriFi", "CsLife"];

const isPython = (f) => f.endsWith(".py");
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const med = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f2 = (x, d = 2) => (x === null ? "—" : x.toFixed(d));

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(HERE, "reports", `${name}.json`), "utf8"));
}

function split(j) {
  const py = [], es = [];
  for (const pf of j.perFile ?? []) {
    for (const fn of pf.functionMetrics ?? []) (isPython(pf.file) ? py : es).push(fn);
  }
  return { py, es };
}

const stats = (fns) => ({
  n: fns.length,
  vol: mean(fns.map((f) => f.halstead.volume)),
  volMed: med(fns.map((f) => f.halstead.volume)),
  diff: mean(fns.map((f) => f.halstead.difficulty)),
  eff: mean(fns.map((f) => f.halstead.effort)),
  miRaw: mean(fns.map((f) => f.maintainabilityIndexGradAiRaw ?? 0)),
  miNorm: mean(fns.map((f) => f.maintainabilityIndexGradAiNorm ?? 0)),
  cog: mean(fns.map((f) => f.cognitiveComplexity)),
  cyc: mean(fns.map((f) => f.cyclomaticComplexity)),
});

const rows = [];
let allEs = [], allPy = [];
let totFiles = 0, totLoc = 0, totFns = 0;

for (const name of COHORT) {
  const j = load(name);
  const { py, es } = split(j);
  allEs = allEs.concat(es);
  allPy = allPy.concat(py);
  totFiles += j.filesAnalyzed;
  totLoc += j.profile.sourceLOC;
  totFns += j.totals.functions;
  rows.push({ name, j, py, es });
}

console.log("=".repeat(100));
console.log("A. ALL SIX REPOS — operand-independent, safe to report cohort-wide");
console.log("=".repeat(100));
console.log("repo            files  sourceLOC  functions  duplication%  cyclomatic(mean)");
for (const { name, j, py, es } of rows) {
  console.log(
    name.padEnd(15) +
      String(j.filesAnalyzed).padStart(5) +
      String(j.profile.sourceLOC).padStart(11) +
      String(j.totals.functions).padStart(11) +
      String(j.duplication?.percentage ?? "null").padStart(14) +
      f2(stats([...py, ...es]).cyc).padStart(18),
  );
}
console.log(
  "COHORT TOTAL".padEnd(15) +
    String(totFiles).padStart(5) +
    String(totLoc).padStart(11) +
    String(totFns).padStart(11),
);

console.log();
console.log("=".repeat(100));
console.log("B. TS/JS SUBSET ONLY — Halstead + maintainabilityIndexGradAi");
console.log("   (Python EXCLUDED: unvalidated operand convention, see FINAL_NUMBERS.md)");
console.log("=".repeat(100));
console.log(
  "repo            fns(ts/js)  vol(mean)  vol(med)  difficulty  effort      MI_raw   MI_norm",
);
for (const { name, es } of rows) {
  const s = stats(es);
  if (!s.n) {
    console.log(name.padEnd(15) + "0".padStart(10) + "   — (no TS/JS functions)");
    continue;
  }
  console.log(
    name.padEnd(15) +
      String(s.n).padStart(10) +
      f2(s.vol, 1).padStart(11) +
      f2(s.volMed, 1).padStart(10) +
      f2(s.diff).padStart(12) +
      f2(s.eff, 1).padStart(12) +
      f2(s.miRaw).padStart(9) +
      f2(s.miNorm).padStart(10),
  );
}
const E = stats(allEs);
console.log(
  "TS/JS COHORT".padEnd(15) +
    String(E.n).padStart(10) +
    f2(E.vol, 1).padStart(11) +
    f2(E.volMed, 1).padStart(10) +
    f2(E.diff).padStart(12) +
    f2(E.eff, 1).padStart(12) +
    f2(E.miRaw).padStart(9) +
    f2(E.miNorm).padStart(10),
);

console.log();
console.log("=".repeat(100));
console.log("C. PYTHON SUBSET — reported separately, NOT to be pooled with B");
console.log("=".repeat(100));
const P = stats(allPy);
console.log(
  `python functions: ${P.n} of ${P.n + E.n} (${((100 * P.n) / (P.n + E.n)).toFixed(1)}%)`,
);
console.log(
  `python mean volume ${f2(P.vol, 1)} | difficulty ${f2(P.diff)} | MI_norm ${f2(P.miNorm)}`,
);
console.log(
  "These use the collapsed-by-kind operand convention and are NOT comparable to B.",
);

console.log();
console.log("=".repeat(100));
console.log("D. COGNITIVE COMPLEXITY by language — see the Python finding");
console.log("=".repeat(100));
console.log(`TS/JS  mean cognitive: ${f2(E.cog)}  (n=${E.n})  [D4 B1/B2/B3 rule, SonarJS-validated]`);
console.log(`Python mean cognitive: ${f2(P.cog)}  (n=${P.n})  [pre-D4 rule, NEVER validated]`);

fs.writeFileSync(
  path.join(HERE, "language_scope.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Halstead/MI are TS/JS-only. Python uses an unvalidated operand convention.",
      allSix: { files: totFiles, sourceLOC: totLoc, functions: totFns },
      tsJs: E,
      python: P,
      perRepo: rows.map(({ name, j, py, es }) => ({
        repo: name,
        commit: j.source?.commit ?? null,
        files: j.filesAnalyzed,
        sourceLOC: j.profile.sourceLOC,
        functions: j.totals.functions,
        duplication: j.duplication?.percentage ?? null,
        tsJs: stats(es),
        python: stats(py),
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log("\nwrote language_scope.json");
