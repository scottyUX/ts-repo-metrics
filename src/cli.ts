/**
 * CLI entrypoint for repo-metrics.
 *
 * Supports two modes:
 *   Single:  npm run dev -- /path/to/repo
 *   Batch:   npm run dev -- batch /path/to/repos-folder [--output dir] [--csv]
 *
 * Single mode prints a JSON report to stdout.
 * Batch mode writes individual JSON files per repo and optionally a CSV summary.
 */

import path from "node:path";
import { analyzeRepo } from "./pipeline/analyzeRepo.js";
import { batchAnalyze } from "./batch/batchAnalyze.js";

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "batch") {
    const parentDir = args[1];
    if (!parentDir) {
      console.error("Usage: npm run dev -- batch /path/to/repos [--output dir] [--csv]");
      process.exit(1);
    }

    let outputDir = path.join(parentDir, "reports");
    let csv = false;

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--output" && args[i + 1]) {
        outputDir = args[++i]!;
      } else if (args[i] === "--csv") {
        csv = true;
      }
    }

    const count = await batchAnalyze({
      parentDir: path.resolve(parentDir),
      outputDir: path.resolve(outputDir),
      csv,
    });
    console.error(`Done. Analyzed ${count} repositories.`);
    return;
  }

  const repoPath = args[0];
  if (!repoPath) {
    console.error("Usage: npm run dev -- /path/to/target/repo");
    console.error("       npm run dev -- batch /path/to/repos [--output dir] [--csv]");
    process.exit(1);
  }

  const report = await analyzeRepo(repoPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
