/**
 * CLI entrypoint for repo-metrics.
 *
 * Supports two modes:
 *   Single:  npm run dev -- analyze /path/to/repo
 *            npm run dev -- analyze https://github.com/user/repo
 *   Batch:   npm run dev -- batch /path/to/repos-folder [--output dir] [--csv]
 *
 * Single mode prints a JSON report to stdout.
 * Batch mode writes individual JSON reports per repo and optionally a CSV summary.
 */

import path from "node:path";
import {
  analyzeFromGitHubUrl,
  analyzeRepo,
  getSourceMetadata,
} from "@repo-metrics/engine";
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

  const subcommand = args[0];
  const target = subcommand === "analyze" ? args[1] : subcommand;
  if (!target) {
    console.error("Usage: npm run dev -- analyze <local-path>");
    console.error("       npm run dev -- analyze https://github.com/user/repo [--no-cache]");
    console.error("       npm run dev -- batch /path/to/repos [--output dir] [--csv]");
    process.exit(1);
  }
  if (subcommand !== "analyze") {
    const repoPath = path.resolve(target);
    const report = await analyzeRepo(repoPath);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let useCache = true;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--no-cache") useCache = false;
  }

  const looksLikeUrl = target.startsWith("https://") || target.startsWith("http://");
  if (looksLikeUrl) {
    const report = await analyzeFromGitHubUrl(target, { useCache });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const repoPath = path.resolve(target);
  const source = await getSourceMetadata(repoPath, "local", "");
  const report = await analyzeRepo(repoPath, { source });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
