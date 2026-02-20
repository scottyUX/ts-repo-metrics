/**
 * Repository analysis pipeline.
 *
 * Orchestrates the end-to-end flow: discovers source files, reads each one,
 * parses it with Tree-sitter, and runs every registered extractor (currently
 * function count). Returns a JSON-serializable report with aggregate totals
 * and per-file breakdowns.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverSourceFiles } from "../collect/fileDiscovery.js";
import { parseTypeScript } from "../parsing/tsParser.js";
import { countFunctions } from "../extract/functionCount.js";

function flavorForFile(filePath: string): "ts" | "tsx" {
  return filePath.endsWith(".tsx") ? "tsx" : "ts";
}

export async function analyzeRepo(repoPath: string) {
  const files = await discoverSourceFiles(repoPath);

  let totalFunctions = 0;
  const perFile: Array<{ file: string; functions: number; functionsByType: Record<string, number> }> = [];

  for (const filePath of files) {
    const code = await readFile(filePath, "utf8");
    const tree = parseTypeScript(code, flavorForFile(filePath));
    const fnCount = countFunctions(tree.rootNode);

    totalFunctions += fnCount.total;
    perFile.push({
      file: path.relative(repoPath, filePath),
      functions: fnCount.total,
      functionsByType: fnCount.byType,
    });
  }

  return {
    repoPath,
    filesAnalyzed: files.length,
    totals: {
      functions: totalFunctions,
    },
    perFile,
  };
}
