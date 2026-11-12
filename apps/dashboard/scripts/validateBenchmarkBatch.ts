// Validates a list of benchmark rows in Docker, one after another, and writes one result JSON per
// row plus a summary. Dry run: it writes nothing to Supabase. Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--only id,id] [--redo] [--timeout SECONDS]
//
// ROWS.json is a JSON array of rows (Supabase: `select json_agg(t) from (...) t`) or JSON Lines.
// DIR gets: results/<instance_id>.json, logs/<instance_id>/<run>.log, repos/<owner>__<name> (one
// clone per repository, reused across rows), cache/ (npm, pnpm, yarn and corepack downloads, shared
// by every run), snapshots/<instance_id>.bundle with --snapshots
// (restore with `git clone -b hecate-snapshot <file>.bundle`), summary.json and summary.md. A row whose result file already exists is skipped unless --redo.
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

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRows, preflight, rejectedWithoutRun, summarize, summaryMarkdown, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { assertRow, imageDigest, validateRow } from "@/lib/cse115a/benchmark/validation/runRow";
import { batchRepo, recordSnapshot, snapshotOnly } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { rowsPath: "", out: "", snapshots: false, snapshotOnly: false, only: [] as string[], redo: false, timeoutSeconds: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--snapshots") args.snapshots = true;
    else if (arg === "--snapshot-only") args.snapshotOnly = true;
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--redo") args.redo = true;
    else if (arg === "--timeout") args.timeoutSeconds = Number(argv[++i]);
    else if (!args.rowsPath) args.rowsPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowsPath || !args.out) throw new Error("Usage: validateBenchmarkBatch.ts ROWS.json --out DIR [--snapshots | --snapshot-only] [--only id,id] [--redo] [--timeout SECONDS]");
  if (args.snapshots && args.snapshotOnly) throw new Error("--snapshots and --snapshot-only do not go together: --snapshot-only already writes the bundles");
  return args;
}

/** The first non-empty line of an error message (Docker's often starts with a blank one). */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((l) => l.trim()).find(Boolean) ?? message;
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
  if (args.snapshotOnly) {
    console.error(`${rows.length} row(s), snapshots only; output in ${out}`);
    // Exit 0 whatever the rows did: each failure is on its own line.
    await snapshotOnly({ rows, out, redo: args.redo, log: (line) => console.error(line), print: (line) => console.log(line) });
    return;
  }
  await mkdir(join(out, "results"), { recursive: true });
  await mkdir(join(out, "cache"), { recursive: true });
  const log = (line: string) => console.error(line);
  const startedAt = Date.now();
  log(`${rows.length} row(s); output in ${out}`);

  const clones = new Map<string, string>();
  const digests = new Map<string, string | null>();
  const results: ValidationResult[] = [];

  for (const [index, row] of rows.entries()) {
    const resultFile = join(out, "results", `${row.instance_id}.json`);
    if (!args.redo && (await exists(resultFile))) {
      results.push(JSON.parse(await readFile(resultFile, "utf8")) as ValidationResult);
      log(`[${index + 1}/${rows.length}] ${row.instance_id}: already done, skipping (use --redo to rerun)`);
      continue;
    }
    log(`[${index + 1}/${rows.length}] ${row.instance_id}`);
    let result: ValidationResult;
    try {
      assertRow(row);
      const skip = preflight(row);
      if (skip) {
        result = rejectedWithoutRun(row, skip.reason, skip.detail);
      } else {
        const repoDir = await batchRepo(out, row.repo, row.base_commit, clones, log);
        result = await validateRow({ row, repoDir, logDir: join(out, "logs", row.instance_id), cacheDir: join(out, "cache"), timeoutSeconds: args.timeoutSeconds, log });
        // Extras: a failure here is logged and must never discard the verdict above.
        if (result.image) {
          if (!digests.has(result.image)) digests.set(result.image, await imageDigest(result.image));
          result.image_digest = digests.get(result.image) ?? null;
          if (result.harbor_env && result.image_digest) result.harbor_env = { ...result.harbor_env, image: result.image_digest };
        }
        // A bundle from an earlier run of this row is still valid (the base commit does not change), so
        // it is recorded even without --snapshots; the flag only decides whether to create a new one.
        // (A snapshot-only pass writes the same bundles.)
        const bundle = await recordSnapshot(out, row, repoDir, args.snapshots, log);
        if (bundle !== undefined) result.snapshot_bundle = bundle;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = rejectedWithoutRun(row, "env_error", message.slice(0, 2000));
      log(`  env_error: ${firstLine(error)}`);
    }
    await writeFile(resultFile, JSON.stringify(result, null, 2) + "\n");
    results.push(result);
    log(`  ${result.validation_status}${result.reason ? ` (${result.reason})` : ""}`);
  }

  // The summary and writeback.sql cover every result in the folder, not only the rows this invocation
  // ran, so a --only or --redo pass never shrinks them to the rows it touched.
  const allResults = await readAllResults(join(out, "results"));
  const summary = summarize(allResults);
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  await writeFile(join(out, "summary.md"), summaryMarkdown(summary));
  await writeFile(join(out, "writeback.sql"), writebackSql(allResults));
  if (allResults.length !== results.length) log(`Summary covers all ${allResults.length} result(s) in the folder; ${results.length} ran or were checked this time.`);
  console.log(summaryMarkdown(summary));
  log(`Done in ${Math.round((Date.now() - startedAt) / 1000)} s. Dry run, nothing written to the database.`);
}

/** Every results/*.json in the folder, sorted by file name. */
async function readAllResults(dir: string): Promise<ValidationResult[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(join(dir, n), "utf8")) as ValidationResult));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
