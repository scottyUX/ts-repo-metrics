/**
 * One combined regeneration pass for the six-repo cohort and the self-analysis,
 * under analyzer_version 0.2.0.
 *
 * Supersedes the 0.1.0 run (commit 0ff89a1), which predates all three of:
 *   D7  Halstead operands keyed by literal value  -> volume, difficulty, effort, MI
 *   D4  cognitive complexity replaced by B1/B2/B3 -> cognitiveComplexity
 *   Bug 1 jscpd ignore globs                      -> duplication, and analysis wall clock
 *
 * Wall clock and jscpd time are measured separately so Figure 3 can subtract the
 * duplication step, matching how timing_data.csv was built before.
 *
 * Usage: node regenerate.mjs [reposDir]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const REPOS = process.argv[2] ?? path.join(process.env.HOME, "Documents/GitHub/cse15/repos");

const { analyzeRepo } = await import(path.join(ROOT, "packages/engine/dist/index.js"));
const { detectDuplication } = await import(
  path.join(ROOT, "packages/engine/dist/collect/duplication.js")
);

/**
 * The canonical six. `StudyPet-Plus` is physically present in repos/ but is not
 * a cohort member (no gitlink, no pinned SHA — see step0_cohort_sources.md), so
 * it is deliberately excluded here even though batch mode now analyzes it.
 * Output names match the previous run so the before/after diff lines up.
 */
const COHORT = [
  { name: "alexandria", dir: "alexandria" },
  { name: "wayfinder", dir: "Wayfinder" },
  { name: "SlugSync", dir: "SlugSync" },
  { name: "Lens", dir: "Lens" },
  { name: "VeriFi", dir: "VeriFi" },
  { name: "CsLife", dir: "CsLife" },
];

const outReports = path.join(HERE, "reports");
await mkdir(outReports, { recursive: true });

const timing = [];
const rows = [];
const integrity = [];

async function run(label, repoPath, outFile) {
  // jscpd measured on its own so Figure 3's y axis excludes duplication.
  const dupStart = Date.now();
  const dup = await detectDuplication(repoPath);
  const jscpdS = (Date.now() - dupStart) / 1000;

  const t0 = Date.now();
  const report = await analyzeRepo(repoPath);
  const wallS = (Date.now() - t0) / 1000;

  await writeFile(path.join(outReports, outFile), JSON.stringify(report, null, 2));

  timing.push({
    repo: label,
    source_loc: report.profile.sourceLOC,
    files: report.filesAnalyzed,
    wall_clock_s: wallS.toFixed(2),
    jscpd_s: jscpdS.toFixed(2),
    analysis_excl_dup_s: Math.max(0, wallS - jscpdS).toFixed(2),
    jscpd_status: dup ? "completed" : "FAILED",
    duplication_pct: report.duplication?.percentage ?? "",
  });

  // Integrity discipline: both are recorded per repo, and `filesSkipped` is
  // reported as "absent" vs a number, since the key is omitted when nothing was
  // skipped and an absent key must not be read as a zero that was measured.
  integrity.push({
    repo: label,
    commit: report.source?.commit ?? "(local)",
    filesSkipped:
      report.filesSkipped === undefined ? "none (key absent)" : report.filesSkipped,
    analysisSkipped: report.analysisSkipped
      ? `FIRED: ${report.analysisSkipped.id}`
      : "not fired",
    duplication: report.duplication?.percentage ?? "null",
  });

  console.error(
    `  ${label.padEnd(24)} files=${String(report.filesAnalyzed).padStart(4)} ` +
      `sourceLOC=${String(report.profile.sourceLOC).padStart(6)} ` +
      `fn=${String(report.totals.functions).padStart(5)} ` +
      `dup=${report.duplication?.percentage ?? "null"}% ` +
      `skipped=${report.filesSkipped === undefined ? "absent" : report.filesSkipped} ` +
      `analysisSkipped=${report.analysisSkipped ? report.analysisSkipped.id : "no"} ` +
      `wall=${wallS.toFixed(2)}s jscpd=${jscpdS.toFixed(2)}s ` +
      `analyzer=${report.analyzer_version}`,
  );
  return report;
}

console.error("=== cohort (6) ===");
for (const { name, dir } of COHORT) {
  const report = await run(name, path.join(REPOS, dir), `${name}.json`);
  rows.push([
    name,
    report.filesAnalyzed,
    report.profile.totalLOC,
    report.profile.sourceLOC,
    report.profile.testLOC,
    report.totals.functions,
    report.functionMetricsSummary.averageLength,
    report.functionMetricsSummary.medianLength,
    report.functionMetricsSummary.maxNestingDepth,
    report.complexity.average,
    report.complexity.max,
    report.smells.longFunctions,
    report.smells.deepNesting,
    report.smells.emptyCatchBlocks,
    report.smells.consoleLogs,
    report.duplication?.percentage ?? "",
    report.framework?.type ?? "",
    report.git?.totalCommits ?? "",
  ]);
}

console.error("=== self ===");
const self = await run("ts-repo-metrics (self)", ROOT, "self_ts-repo-metrics.json");
// The root-level self reports consumed elsewhere in the repo.
await writeFile(path.join(ROOT, "report.json"), JSON.stringify(self, null, 2));
await mkdir(path.join(ROOT, "reports"), { recursive: true });
await writeFile(
  path.join(ROOT, "reports", "ts-repo-metrics.json"),
  JSON.stringify(self, null, 2),
);

const SUMMARY_HEADERS = [
  "repo", "files", "totalLOC", "sourceLOC", "testLOC", "functions",
  "avgFunctionLength", "medianFunctionLength", "maxNesting", "avgComplexity",
  "maxComplexity", "longFunctions", "deepNesting", "emptyCatches",
  "consoleLogs", "duplicationPct", "framework", "totalCommits",
];
await writeFile(
  path.join(HERE, "summary.csv"),
  [SUMMARY_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n",
);

const TIMING_HEADERS = [
  "repo", "source_loc", "files", "wall_clock_s", "jscpd_s",
  "analysis_excl_dup_s", "jscpd_status", "duplication_pct",
];
await writeFile(
  path.join(HERE, "timing_data.csv"),
  [
    TIMING_HEADERS.join(","),
    ...timing.map((t) => TIMING_HEADERS.map((h) => t[h]).join(",")),
  ].join("\n") + "\n",
);

console.error("\n=== integrity check (per repo) ===");
console.error(
  "repo".padEnd(24) + "commit".padEnd(14) + "filesSkipped".padEnd(20) +
  "analysisSkipped".padEnd(18) + "duplication",
);
for (const i of integrity) {
  console.error(
    i.repo.padEnd(24) + String(i.commit).slice(0, 12).padEnd(14) +
    String(i.filesSkipped).padEnd(20) + String(i.analysisSkipped).padEnd(18) +
    i.duplication,
  );
}
await writeFile(path.join(HERE, "integrity.json"), JSON.stringify(integrity, null, 2) + "\n");

console.error("\nwrote reports/, summary.csv, timing_data.csv, report.json, reports/ts-repo-metrics.json");
