/**
 * Repository analysis pipeline.
 *
 * Orchestrates the end-to-end flow: profiles the repo (LOC and file counts),
 * discovers source files, reads each one, parses it with Tree-sitter, and
 * runs every registered extractor (currently function count). Returns a
 * JSON-serializable report with aggregate totals and per-file breakdowns.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverSourceFiles } from "../collect/fileDiscovery.js";
import { profileRepo } from "../collect/loc.js";
import { detectDuplication } from "../collect/duplication.js";
import { extractGitMetrics } from "../collect/gitMetrics.js";
import { extractGitMetricsV2 } from "../collect/gitMetricsV2.js";
import { detectFramework } from "../collect/frameworkDetection.js";
import { parseTypeScript } from "../parsing/tsParser.js";
import { countFunctions } from "../extract/functionCount.js";
import { extractFunctionMetrics } from "../extract/functionMetrics.js";
import { computeComplexity, summarizeComplexity } from "../extract/complexity.js";
import { detectSmells } from "../extract/smells.js";
import { computeTestCoverageProxy } from "../extract/testCoverageProxy.js";
import { computeMaintainabilityIndex } from "../extract/maintainabilityIndex.js";
import { LONG_FUNCTION_THRESHOLD } from "../utils/constants.js";
import { median } from "../utils/math.js";
import { getSourceMetadata } from "../collect/repoMetadata.js";
import type {
  RepoReport,
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionComplexity,
  SmellCounts,
  PerFileEntry,
  SourceInfo,
} from "../types/report.js";

function flavorForFile(filePath: string): "ts" | "tsx" {
  return filePath.endsWith(".tsx") ? "tsx" : "ts";
}

export interface AnalyzeOptions {
  /** Pre-computed source metadata. If omitted, computed from repo path. */
  source?: SourceInfo;
}

/**
 * Run the full analysis pipeline on a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param options - Optional source metadata (for cloned repos).
 * @returns A JSON-serializable report with profile, totals, and per-file data.
 */
export async function analyzeRepo(
  repoPath: string,
  options?: AnalyzeOptions,
): Promise<RepoReport> {
  const source =
    options?.source ??
    (await getSourceMetadata(repoPath, "local", ""));
  const profile = await profileRepo(repoPath);
  const files = await discoverSourceFiles(repoPath);

  let totalFunctions = 0;
  const allFunctionDetails: FunctionDetail[] = [];
  const allComplexities: FunctionComplexity[] = [];
  const totalSmells: SmellCounts = {
    longFunctions: 0,
    deepNesting: 0,
    longParameterLists: 0,
    emptyCatchBlocks: 0,
    consoleLogs: 0,
  };
  const perFile: PerFileEntry[] = [];

  for (const filePath of files) {
    let code: string;
    try {
      code = await readFile(filePath, "utf8");
    } catch {
      console.error(`Skipping ${path.relative(repoPath, filePath)}: could not read file`);
      continue;
    }

    let tree;
    try {
      tree = parseTypeScript(code, flavorForFile(filePath));
    } catch (err) {
      console.error(`Skipping ${path.relative(repoPath, filePath)}: parse error`, err instanceof Error ? err.message : err);
      continue;
    }

    const fnCount = countFunctions(tree.rootNode);
    const fnMetrics = extractFunctionMetrics(tree.rootNode);
    const fileComplexity = computeComplexity(tree.rootNode);
    const fileSmells = detectSmells(tree.rootNode);

    totalFunctions += fnCount.total;
    allFunctionDetails.push(...fnMetrics.functions);
    allComplexities.push(...fileComplexity);

    for (const key of Object.keys(totalSmells) as (keyof SmellCounts)[]) {
      totalSmells[key] += fileSmells[key];
    }

    perFile.push({
      file: path.relative(repoPath, filePath),
      functions: fnCount.total,
      functionsByType: fnCount.byType,
      functionMetrics: fnMetrics.functions,
      complexity: fileComplexity,
    });
  }

  const lengths = allFunctionDetails.map((f) => f.lines).sort((a, b) => a - b);

  const functionMetricsSummary: FunctionMetricsSummary = {
    totalFunctions,
    averageLength: totalFunctions > 0
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / totalFunctions) * 10) / 10
      : 0,
    medianLength: median(lengths),
    maxNestingDepth: allFunctionDetails.reduce((max, f) => Math.max(max, f.maxNestingDepth), 0),
    longFunctionPercentage: totalFunctions > 0
      ? Math.round((allFunctionDetails.filter((f) => f.lines > LONG_FUNCTION_THRESHOLD).length / totalFunctions) * 1000) / 10
      : 0,
  };

  const complexitySummary = summarizeComplexity(allComplexities);
  const maintainability = computeMaintainabilityIndex(
    complexitySummary.average,
    profile.totalLOC,
    functionMetricsSummary.averageLength,
  );
  const testCoverageProxy = computeTestCoverageProxy(profile);
  const duplication = await detectDuplication(repoPath);
  const git = await extractGitMetrics(repoPath);
  const gitMetricsV2 = await extractGitMetricsV2(repoPath);
  const framework = await detectFramework(repoPath);

  return {
    repoPath,
    source,
    filesAnalyzed: files.length,
    profile,
    totals: {
      functions: totalFunctions,
    },
    functionMetricsSummary,
    complexity: complexitySummary,
    smells: totalSmells,
    maintainability,
    testCoverageProxy,
    duplication,
    git,
    gitMetricsV2,
    framework,
    perFile,
  };
}
