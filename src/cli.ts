/**
 * CLI entrypoint for repo-metrics.
 *
 * Accepts a single argument — the absolute path to a TypeScript repo — runs
 * the full analysis pipeline, and prints a JSON report to stdout containing
 * file counts, total function counts, and per-file function counts.
 *
 * Usage: npm run dev -- /path/to/target/repo
 */

import { analyzeRepo } from "./pipeline/analyzeRepo.js";

async function main() {
  const repoPath = process.argv[2];
  if (!repoPath) {
    console.error("Usage: npm run dev -- /path/to/target/repo");
    process.exit(1);
  }

  const report = await analyzeRepo(repoPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
