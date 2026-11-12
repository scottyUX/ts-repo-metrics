// Validates a list of benchmark rows in Docker, one after another, and writes one result JSON per
// row plus a summary. Dry run: it writes nothing to Supabase. Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--snapshots-from DIR] [--only id,id] [--redo] [--timeout SECONDS]
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

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRows, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { batchRun, validateBatchRow, writeBatchFiles } from "@/lib/cse115a/benchmark/validation/batchRun";
import { snapshotOnly } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const USAGE = "Usage: validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--snapshots-from DIR] [--only id,id] [--redo] [--timeout SECONDS]";

function parseArgs(argv: string[]) {
  const args = { rowsPath: "", out: "", snapshots: false, snapshotOnly: false, snapshotsFrom: "", only: [] as string[], redo: false, timeoutSeconds: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--snapshots") args.snapshots = true;
    else if (arg === "--snapshot-only") args.snapshotOnly = true;
    else if (arg === "--snapshots-from") args.snapshotsFrom = argv[++i] ?? "";
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--redo") args.redo = true;
    else if (arg === "--timeout") args.timeoutSeconds = Number(argv[++i]);
    else if (!args.rowsPath) args.rowsPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowsPath || !args.out) throw new Error(USAGE);
  if (args.snapshots && args.snapshotOnly) throw new Error("--snapshots and --snapshot-only do not go together: --snapshot-only already writes the bundles");
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
  await mkdir(join(out, "results"), { recursive: true });
  await mkdir(join(out, "cache"), { recursive: true });
  const startedAt = Date.now();
  log(`${rows.length} row(s); output in ${out}`);

  const ctx = batchRun({ out, snapshots: args.snapshots, snapshotsFrom: args.snapshotsFrom ? resolve(args.snapshotsFrom) : undefined, timeoutSeconds: args.timeoutSeconds, log });

  for (const [index, row] of rows.entries()) {
    const resultFile = join(out, "results", `${row.instance_id}.json`);
    if (!args.redo && (await exists(resultFile))) {
      log(`[${index + 1}/${rows.length}] ${row.instance_id}: already done, skipping (use --redo to rerun)`);
      continue;
    }
    log(`[${index + 1}/${rows.length}] ${row.instance_id}`);
    const result: ValidationResult = await validateBatchRow(ctx, row, join(out, "logs", row.instance_id));
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
