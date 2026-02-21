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
import { parseTypeScript } from "../parsing/tsParser.js";
import { countFunctions } from "../extract/functionCount.js";
import { extractFunctionMetrics } from "../extract/functionMetrics.js";
import { computeComplexity, summarizeComplexity } from "../extract/complexity.js";
import { detectSmells } from "../extract/smells.js";
import { LONG_FUNCTION_THRESHOLD } from "../utils/constants.js";
import { median } from "../utils/math.js";
import type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionComplexity,
  ComplexitySummary,
  SmellCounts,
} from "../types/report.js";

function flavorForFile(filePath: string): "ts" | "tsx" {
  return filePath.endsWith(".tsx") ? "tsx" : "ts";
}

/**
 * Run the full analysis pipeline on a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns A JSON-serializable report with profile, totals, and per-file data.
 */
export async function analyzeRepo(repoPath: string) {
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
  const perFile: Array<{
    file: string;
    functions: number;
    functionsByType: Record<string, number>;
    functionMetrics: FunctionDetail[];
    complexity: FunctionComplexity[];
  }> = [];

  for (const filePath of files) {
    const code = await readFile(filePath, "utf8");
    const tree = parseTypeScript(code, flavorForFile(filePath));
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

  return {
    repoPath,
    filesAnalyzed: files.length,
    profile,
    totals: {
      functions: totalFunctions,
    },
    functionMetricsSummary,
    complexity: complexitySummary,
    smells: totalSmells,
    perFile,
  };
}
