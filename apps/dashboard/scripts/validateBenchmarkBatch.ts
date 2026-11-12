// Validates a list of benchmark rows in Docker, one after another, and writes one result JSON per
// row plus a summary. Dry run: it writes nothing to Supabase. Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--snapshots-from DIR] [--gold-check | --gold-only] [--gold-timeout SECONDS] [--fix-coverage | --fix-coverage-only] [--only id,id] [--redo] [--timeout SECONDS]
//
// ROWS.json is a JSON array of rows (Supabase: `select json_agg(t) from (...) t`) or JSON Lines.
// DIR gets: results/<instance_id>.json, logs/<instance_id>/<run>.log, repos/<owner>__<name> (one
// clone per repository, reused across rows), cache/ (npm, pnpm, yarn and corepack downloads, shared
// by every run), snapshots/<instance_id>.bundle with --snapshots
// (restore with `git clone -b hecate-snapshot <file>.bundle`), summary.json and summary.md. A row whose result file already exists is skipped unless --redo.
// A result's Harbor recipe records whether the repository is public (an anonymous `git ls-remote`,
// once per repository); the course website's zip leaves private ones out.
// Rows with an empty patch or test_patch are rejected without a container run. A crashed run is
// recorded as rejected / env_error with the message, and the batch continues.
// Private repositories need GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY; a clone GitHub
// refuses is recorded as env_error with a detail that says so.
//
// --snapshot-only: for each row, clone, fetch base_commit, write snapshots/<instance_id>.bundle and
// stop (no Docker, no results, no summary, no writeback.sql). A row with a bundle is skipped unless
// --redo. Prints one line per row and a count, and exits 0 even when some rows failed to clone.
// Meant to run daily over the candidate rows, so the files are kept soon after Submit; a later
// normal run into the same DIR reuses the clone in repos/ and records the bundle.
//
// Snapshot fallback: when cloning the repository or fetching base_commit fails for any reason and
// the row has a bundle (in DIR/snapshots/, or in --snapshots-from DIR, which is then copied into
// DIR/snapshots/), the bundle is cloned into repos-from-snapshot/<instance_id>/ and the row is
// validated from it. The result says repo_source: "snapshot" and its detail carries the GitHub
// failure; the summary's reason cell says "from snapshot". With no bundle, env_error as before.
//
// --gold-check: after a row validates, build its Harbor task from the bundle into
// harbor-gold/<task>/ and run `harbor run` with the oracle agent (must score 1.0) and the nop agent
// (must score 0.0), jobs in harbor-gold/jobs/. Recorded as harbor_gold and harbor_env.gold; never
// changes the verdict. Skipped (with the reason) when Harbor is not installed, the row had a
// database service, or there is no bundle. --gold-timeout SECONDS limits each Harbor run (default
// 1200). --gold-only: only that, for the rows whose result file exists and is validated, updating
// those files in place and rewriting the summary files; no clone, no Docker validation.
//
// --fix-coverage: after a row validates, one more R2 run per suite with line coverage on, running
// only the proving test files (c8 for node --test, @vitest/coverage-v8 at the repository's Vitest
// version, Jest's own --coverage, coverage.py for pytest), in a clone made inside the container so
// nothing it installs reaches repos/. Recorded as fix_coverage; untested_files is then derived from
// it (untested_files_source says how). Never changes the verdict; any failure is fix_coverage
// status "unavailable" with the reason, and untested_files stays the import rule's. Log:
// logs/<instance_id>/coverage.log. --timeout applies to it. --fix-coverage-only: only that, for
// the rows whose result file exists and is validated, updating fix_coverage, untested_files and
// untested_files_source in those files (nothing else) and rewriting the summary files. It needs
// Docker and the checkout: the clone in repos/ (cloned again when missing), else the row's bundle
// in DIR/snapshots/ or --snapshots-from DIR (the snapshot fallback above); with neither, the row's
// fix_coverage is "unavailable" with the clone error. It never re-runs the three states.

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRows, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { batchRun, coverageLogLine, fixCoverageBatchRow, fixCoverageOnly, goldOnly, validateBatchRow, writeBatchFiles } from "@/lib/cse115a/benchmark/validation/batchRun";
import type { HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import { CliHarborRunner, GOLD_TIMEOUT_SECONDS, goldCheck, withGold } from "@/lib/cse115a/benchmark/validation/harborGold";
import { snapshotOnly } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const USAGE = "Usage: validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--snapshots-from DIR] [--gold-check | --gold-only] [--gold-timeout SECONDS] [--fix-coverage | --fix-coverage-only] [--only id,id] [--redo] [--timeout SECONDS]";

function parseArgs(argv: string[]) {
  const args = { rowsPath: "", out: "", snapshots: false, snapshotOnly: false, snapshotsFrom: "", goldCheck: false, goldOnly: false, goldTimeoutSeconds: GOLD_TIMEOUT_SECONDS, fixCoverage: false, fixCoverageOnly: false, only: [] as string[], redo: false, timeoutSeconds: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--snapshots") args.snapshots = true;
    else if (arg === "--snapshot-only") args.snapshotOnly = true;
    else if (arg === "--snapshots-from") args.snapshotsFrom = argv[++i] ?? "";
    else if (arg === "--gold-check") args.goldCheck = true;
    else if (arg === "--gold-only") args.goldOnly = true;
    else if (arg === "--gold-timeout") args.goldTimeoutSeconds = Number(argv[++i]);
    else if (arg === "--fix-coverage") args.fixCoverage = true;
    else if (arg === "--fix-coverage-only") args.fixCoverageOnly = true;
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--redo") args.redo = true;
    else if (arg === "--timeout") args.timeoutSeconds = Number(argv[++i]);
    else if (!args.rowsPath) args.rowsPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowsPath || !args.out) throw new Error(USAGE);
  if (args.snapshots && args.snapshotOnly) throw new Error("--snapshots and --snapshot-only do not go together: --snapshot-only already writes the bundles");
  if (args.goldOnly && (args.snapshotOnly || args.snapshots || args.redo || args.goldCheck)) throw new Error("--gold-only runs only the gold check on existing results: it does not go with --snapshots, --snapshot-only, --redo or --gold-check");
  if (args.snapshotOnly && args.goldCheck) throw new Error("--snapshot-only validates nothing, so there is nothing to gold-check");
  if (!(args.goldTimeoutSeconds > 0)) throw new Error("--gold-timeout needs a number of seconds");
  if (args.fixCoverage && args.fixCoverageOnly) throw new Error("--fix-coverage and --fix-coverage-only do not go together: --fix-coverage-only already runs the coverage run");
  if (args.fixCoverageOnly && (args.snapshotOnly || args.snapshots || args.redo || args.goldCheck || args.goldOnly)) throw new Error("--fix-coverage-only runs only the coverage run on existing results: it does not go with --snapshots, --snapshot-only, --redo, --gold-check or --gold-only");
  if (args.fixCoverage && (args.snapshotOnly || args.goldOnly)) throw new Error("--fix-coverage runs after a validation, so it does not go with --snapshot-only or --gold-only (use --fix-coverage-only for existing results)");
  return args;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out);
  const rows = parseRows(await readFile(args.rowsPath, "utf8")).filter((r) => args.only.length === 0 || args.only.includes(r.instance_id));
  const log = (line: string) => console.error(line);
  if (args.snapshotOnly) {
    console.error(`${rows.length} row(s), snapshots only; output in ${out}`);
    // Exit 0 whatever the rows did: each failure is on its own line.
    await snapshotOnly({ rows, out, redo: args.redo, log, print: (line) => console.log(line) });
    return;
  }
  const harbor = new CliHarborRunner();
  const goldTimeoutMs = args.goldTimeoutSeconds * 1000;
  if (args.goldOnly) {
    log(`${rows.length} row(s), gold check only; output in ${out}`);
    const { summary } = await goldOnly({ rows: rows as HarborRow[], out, harbor, timeoutMs: goldTimeoutMs, log });
    console.log(summaryMarkdown(summary));
    log("Dry run, nothing written to the database.");
    return;
  }
  await mkdir(join(out, "results"), { recursive: true });
  await mkdir(join(out, "cache"), { recursive: true });
  const startedAt = Date.now();
  const ctx = batchRun({ out, snapshots: args.snapshots, snapshotsFrom: args.snapshotsFrom ? resolve(args.snapshotsFrom) : undefined, timeoutSeconds: args.timeoutSeconds, log });
  if (args.fixCoverageOnly) {
    log(`${rows.length} row(s), fix coverage only; output in ${out}`);
    const { summary } = await fixCoverageOnly(ctx, rows);
    console.log(summaryMarkdown(summary));
    log(`Done in ${Math.round((Date.now() - startedAt) / 1000)} s. Dry run, nothing written to the database.`);
    return;
  }
  log(`${rows.length} row(s); output in ${out}`);

  for (const [index, row] of rows.entries()) {
    const resultFile = join(out, "results", `${row.instance_id}.json`);
    if (!args.redo && (await exists(resultFile))) {
      log(`[${index + 1}/${rows.length}] ${row.instance_id}: already done, skipping (use --redo to rerun)`);
      continue;
    }
    log(`[${index + 1}/${rows.length}] ${row.instance_id}`);
    let result: ValidationResult = await validateBatchRow(ctx, row, join(out, "logs", row.instance_id));
    // The coverage run: after the verdict is final, recorded next to it, never changes it.
    if (args.fixCoverage && result.validation_status === "validated") {
      result = await fixCoverageBatchRow(ctx, row, result, join(out, "logs", row.instance_id));
      log(`  ${coverageLogLine(result)}`);
    }
    // The gold check: recorded next to the verdict, never changes it.
    if (args.goldCheck && result.validation_status === "validated") {
      const gold = await goldCheck({ out, row: row as HarborRow, result, harbor, timeoutMs: goldTimeoutMs, log });
      result = withGold(result, gold);
      log(`  gold check ${gold.status}${gold.reason ? `: ${gold.reason}` : ""}`);
    }
    await writeFile(resultFile, JSON.stringify(result, null, 2) + "\n");
    log(`  ${result.validation_status}${result.reason ? ` (${result.reason})` : ""}${result.repo_source === "snapshot" ? ", from snapshot" : ""}`);
  }

  const { summary, results } = await writeBatchFiles(out);
  if (results.length !== rows.length) log(`Summary covers all ${results.length} result(s) in the folder; ${rows.length} ran or were checked this time.`);
  console.log(summaryMarkdown(summary));
  log(`Done in ${Math.round((Date.now() - startedAt) / 1000)} s. Dry run, nothing written to the database.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
