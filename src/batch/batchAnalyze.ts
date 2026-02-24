/**
 * Batch analysis module.
 *
 * Scans a parent directory for sub-directories that contain a package.json,
 * runs analyzeRepo() on each, writes individual JSON reports to an output
 * directory, and optionally produces a CSV summary with one row per repo.
 */

import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeRepo, type RepoReport } from "@repo-metrics/engine";

/**
 * Check whether a directory looks like a valid repo (has package.json).
 */
async function isRepo(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(path.join(dirPath, "package.json"));
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Generate a CSV summary from an array of reports.
 *
 * @param reports - Array of [repoName, report] tuples.
 * @returns CSV string with headers and one row per repo.
 */
function buildCsv(reports: Array<[string, RepoReport]>): string {
  const headers = [
    "repo",
    "files",
    "totalLOC",
    "sourceLOC",
    "testLOC",
    "functions",
    "avgFunctionLength",
    "medianFunctionLength",
    "maxNesting",
    "avgComplexity",
    "maxComplexity",
    "longFunctions",
    "deepNesting",
    "emptyCatches",
    "consoleLogs",
    "duplicationPct",
    "framework",
    "totalCommits",
  ];

  const rows = reports.map(([name, r]) => [
    name,
    r.filesAnalyzed,
    r.profile.totalLOC,
    r.profile.sourceLOC,
    r.profile.testLOC,
    r.totals.functions,
    r.functionMetricsSummary.averageLength,
    r.functionMetricsSummary.medianLength,
    r.functionMetricsSummary.maxNestingDepth,
    r.complexity.average,
    r.complexity.max,
    r.smells.longFunctions,
    r.smells.deepNesting,
    r.smells.emptyCatchBlocks,
    r.smells.consoleLogs,
    r.duplication?.percentage ?? "",
    r.framework?.type ?? "",
    r.git?.totalCommits ?? "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

export interface BatchOptions {
  parentDir: string;
  outputDir: string;
  csv: boolean;
}

/**
 * Analyze every repo sub-directory under parentDir.
 *
 * @param opts - Batch configuration (parent dir, output dir, csv flag).
 * @returns Number of repos successfully analyzed.
 */
export async function batchAnalyze(opts: BatchOptions): Promise<number> {
  const { parentDir, outputDir, csv } = opts;

  await mkdir(outputDir, { recursive: true });

  const entries = await readdir(parentDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(parentDir, e.name));

  const reports: Array<[string, RepoReport]> = [];

  for (const dir of dirs) {
    const name = path.basename(dir);

    if (!(await isRepo(dir))) {
      console.error(`Skipping ${name}: no package.json`);
      continue;
    }

    try {
      console.error(`Analyzing ${name}...`);
      const report = await analyzeRepo(dir);
      reports.push([name, report]);

      const outPath = path.join(outputDir, `${name}.json`);
      await writeFile(outPath, JSON.stringify(report, null, 2));
      console.error(`  -> ${outPath}`);
    } catch (err) {
      console.error(`  Error analyzing ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  if (csv && reports.length > 0) {
    const csvPath = path.join(outputDir, "summary.csv");
    await writeFile(csvPath, buildCsv(reports));
    console.error(`CSV summary -> ${csvPath}`);
  }

  return reports.length;
}
