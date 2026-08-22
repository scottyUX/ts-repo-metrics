/**
 * CLI entrypoint for repo-metrics.
 *
 * Supports two modes:
 *   Single:  npm run dev -- analyze /path/to/repo
 *            npm run dev -- analyze https://github.com/user/repo
 *   Batch:   npm run dev -- batch /path/to/repos-folder [--output dir] [--csv]
 *
 * Single mode prints a JSON report to stdout, or writes it with [--output file.json].
 * Batch mode writes individual JSON reports per repo and optionally a CSV summary.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeFromGitHubUrl,
  analyzeRepo,
  getSourceMetadata,
} from "@repo-metrics/engine";
import { batchAnalyze } from "./batch/batchAnalyze.js";

async function emitReport(report: unknown, outputPath?: string): Promise<void> {
  const json = JSON.stringify(report, null, 2);
  if (!outputPath) {
    console.log(json);
    return;
  }

  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, json);
  console.error(`Wrote report to ${resolved}`);
}

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
    console.error("Usage: npm run dev -- analyze <local-path> [--output file.json]");
    console.error("       npm run dev -- analyze https://github.com/user/repo [--no-cache] [--output file.json]");
    console.error("       npm run dev -- analyze https://github.com/user/repo/pull/42 [--no-cache] [--output file.json]");
    console.error("       npm run dev -- batch /path/to/repos [--output dir] [--csv]");
    process.exit(1);
  }

  const flagStart = subcommand === "analyze" ? 2 : 1;
  let useCache = true;
  let outputPath: string | undefined;
  for (let i = flagStart; i < args.length; i++) {
    if (args[i] === "--no-cache") {
      useCache = false;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i]!;
    }
  }

  if (subcommand !== "analyze") {
    const repoPath = path.resolve(target);
    const report = await analyzeRepo(repoPath);
    await emitReport(report, outputPath);
    return;
  }

  const looksLikeUrl = target.startsWith("https://") || target.startsWith("http://");
  if (looksLikeUrl) {
    const report = await analyzeFromGitHubUrl(target, { useCache });
    await emitReport(report, outputPath);
    return;
  }

  const repoPath = path.resolve(target);
  const source = await getSourceMetadata(repoPath, "local", "");
  const report = await analyzeRepo(repoPath, { source });
  await emitReport(report, outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
