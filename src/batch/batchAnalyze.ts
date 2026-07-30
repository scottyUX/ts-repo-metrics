/**
 * Batch analysis module.
 *
 * Scans a parent directory for repository sub-directories, runs analyzeRepo() on
 * each, writes individual JSON reports to an output directory, and produces a
 * CSV summary plus a manifest.
 *
 * Every target is accounted for in the OUTPUT ARTIFACTS, not only on stderr. A
 * previous version gated on a root `package.json` and skipped anything without
 * one, while still writing a summary.csv from whatever survived — so a run that
 * analyzed one of six repositories produced a single-row CSV that looked like a
 * complete batch result, with the five exclusions visible only in the terminal.
 * Five of the six CSE 115A cohort repositories are Python or plain-JavaScript
 * projects with no root `package.json`, which is exactly the population that
 * gate excluded. See research/validation/regeneration_gate.md.
 */

import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeRepo, type RepoReport } from "@repo-metrics/engine";

/** Directory names never treated as analysis targets. */
const NON_TARGET_DIRS = new Set(["node_modules"]);

export type BatchEntryStatus = "analyzed" | "skipped" | "failed";

export interface BatchEntry {
  repo: string;
  status: BatchEntryStatus;
  /** Empty for `analyzed`; a human-readable cause otherwise. */
  reason: string;
}

/**
 * Does this directory contain anything the engine can analyze?
 *
 * Deliberately NOT a `package.json` check. The engine analyzes TypeScript,
 * JavaScript and Python, so requiring a Node manifest excluded whole languages
 * from batch runs. A directory qualifies if it holds any analyzable source at
 * any depth, or looks like a repository root.
 */
async function findsAnalyzableSource(dirPath: string): Promise<boolean> {
  const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/;
  const MAX_DEPTH = 4;

  async function walk(dir: string, depth: number): Promise<boolean> {
    if (depth > MAX_DEPTH) return false;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.isFile() && SOURCE_RE.test(e.name)) return true;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || NON_TARGET_DIRS.has(e.name)) continue;
      if (await walk(path.join(dir, e.name), depth + 1)) return true;
    }
    return false;
  }

  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) return false;
  } catch {
    return false;
  }
  return walk(dirPath, 0);
}

/**
 * Generate a CSV summary covering every target, analyzed or not.
 *
 * `status` and `reason` come first, right after the repo name, so a partial run
 * is obvious from the artifact itself. Rows for skipped and failed targets carry
 * empty metric cells rather than being omitted — an absent row is invisible, a
 * row of blanks is not.
 */
function buildCsv(
  entries: BatchEntry[],
  reportsByName: Map<string, RepoReport>,
): string {
  const headers = [
    "repo",
    "status",
    "reason",
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

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = entries.map((entry) => {
    const r = reportsByName.get(entry.repo);
    if (!r) {
      // 17 metric columns left blank so the row width stays constant.
      return [entry.repo, entry.status, entry.reason, ...Array(17).fill("")];
    }
    return [
      entry.repo,
      entry.status,
      entry.reason,
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
    ];
  });

  return (
    [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n") +
    "\n"
  );
}

export interface BatchOptions {
  parentDir: string;
  outputDir: string;
  csv: boolean;
}

export interface BatchManifest {
  parentDir: string;
  generatedAt: string;
  targetsFound: number;
  analyzed: number;
  skipped: number;
  failed: number;
  /** True when every target produced a report. */
  complete: boolean;
  entries: BatchEntry[];
}

/**
 * Analyze every repo sub-directory under parentDir.
 *
 * Always writes `batch_manifest.json` — including when nothing could be
 * analyzed, since "no output" and "output covering zero repos" must not look
 * alike. The CSV is likewise written whenever requested, even if every target
 * failed, so a failed batch leaves evidence rather than silence.
 *
 * @param opts - Batch configuration (parent dir, output dir, csv flag).
 * @returns Number of repos successfully analyzed.
 */
export async function batchAnalyze(opts: BatchOptions): Promise<number> {
  const { parentDir, outputDir, csv } = opts;

  await mkdir(outputDir, { recursive: true });

  const dirEntries = await readdir(parentDir, { withFileTypes: true });
  const dirs = dirEntries
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        !NON_TARGET_DIRS.has(e.name),
    )
    .map((e) => path.join(parentDir, e.name))
    .sort();

  const entries: BatchEntry[] = [];
  const reportsByName = new Map<string, RepoReport>();

  for (const dir of dirs) {
    const name = path.basename(dir);

    if (!(await findsAnalyzableSource(dir))) {
      const reason = "no analyzable source files (.ts/.tsx/.js/.jsx/.mjs/.cjs/.py)";
      console.error(`Skipping ${name}: ${reason}`);
      entries.push({ repo: name, status: "skipped", reason });
      continue;
    }

    try {
      console.error(`Analyzing ${name}...`);
      const report = await analyzeRepo(dir);
      reportsByName.set(name, report);
      entries.push({ repo: name, status: "analyzed", reason: "" });

      const outPath = path.join(outputDir, `${name}.json`);
      await writeFile(outPath, JSON.stringify(report, null, 2));
      console.error(`  -> ${outPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  Error analyzing ${name}: ${reason}`);
      entries.push({ repo: name, status: "failed", reason });
    }
  }

  const analyzed = entries.filter((e) => e.status === "analyzed").length;
  const skipped = entries.filter((e) => e.status === "skipped").length;
  const failed = entries.filter((e) => e.status === "failed").length;

  const manifest: BatchManifest = {
    parentDir,
    generatedAt: new Date().toISOString(),
    targetsFound: entries.length,
    analyzed,
    skipped,
    failed,
    complete: analyzed === entries.length,
    entries,
  };
  const manifestPath = path.join(outputDir, "batch_manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.error(`Manifest -> ${manifestPath}`);

  if (csv) {
    const csvPath = path.join(outputDir, "summary.csv");
    await writeFile(csvPath, buildCsv(entries, reportsByName));
    console.error(`CSV summary -> ${csvPath}`);
  }

  if (!manifest.complete) {
    console.error(
      `WARNING: batch incomplete — ${analyzed}/${entries.length} analyzed ` +
        `(${skipped} skipped, ${failed} failed). See ${manifestPath}.`,
    );
  }

  return analyzed;
}
