// Writes a batch's verdicts to Supabase with the service-role key: the unattended version of
// writeback.sql, for the VM. Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/writebackValidation.ts --batch DIR [--only id,id] [--dry-run]
//
// Reads DIR/results/*.json. Validated rows get verified FAIL_TO_PASS (with ABSENT_TO_PASS folded in),
// PASS_TO_PASS, image (digest when known), eval_script, log_parser, harbor_env (the Harbor recipe, when
// the result has one) and validation_status = validated. Stops before writing anything if the
// harbor_env column is missing (apply supabase/migrations/20261110000000_cse115a_benchmark_harbor_env.sql).
// Validated rows also get validation_detail: the result's fix_coverage, untested_files (and its source),
// repo_source, snapshot_bundle, the ABSENT_TO_PASS / flaky / outside counts and validated_at, copied from
// the result file; rejected rows leave it alone. Stops before writing anything if that column is missing
// (apply supabase/migrations/20261114000000_cse115a_benchmark_validation_detail.sql).
// Validated rows whose patch changes code no proving test reaches get the untested_files flag (removed
// again when a later result lists none). Rejected rows get validation_status = rejected and a
// validation_reason:<reason> flag. env_error rows are skipped (they stay candidate). A staff-rebuilt
// row also gets its rebuilt base and patches, and loses the capture flags the rebuild made untrue
// (staleCaptureFlags). A validated result's Harbor gold check (harbor_gold, from the batch's
// --gold-check or --gold-only) goes into harbor_env.gold (a result without one keeps the stored gold),
// and a failed check sets the harbor_gold_failed flag (removed again by any write-back without one).
// --dry-run prints the plan and touches nothing (each validated row ends with `detail: N/M files, N/M
// lines` or `detail: no coverage`); it reads no database, so it
// lists the capture flags it would drop "if present" rather than the ones the row has.

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { detailNote, goldNote, guardedWriteback, writebackPlan, type ColumnProbeClient, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { batch: "", only: [] as string[], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch") args.batch = argv[++i] ?? "";
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.batch) throw new Error("Usage: writebackValidation.ts --batch DIR [--only id,id] [--dry-run]");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsDir = join(resolve(args.batch), "results");
  const names = (await readdir(resultsDir)).filter((n) => n.endsWith(".json")).sort();
  const results: ValidationResult[] = [];
  for (const name of names) {
    const r = JSON.parse(await readFile(join(resultsDir, name), "utf8")) as ValidationResult;
    if (args.only.length === 0 || args.only.includes(r.instance_id)) results.push(r);
  }
  const ops = writebackPlan(results);
  console.error(`${results.length} result(s), ${ops.length} to write (${results.length - ops.length} env_error skipped)`);
  if (args.dryRun) {
    for (const op of ops) console.log(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag})` : ""}${op.task ? ` F2P=${op.task.FAIL_TO_PASS.length} P2P=${op.task.PASS_TO_PASS.length} image=${op.task.image}${op.task.harbor_env ? " harbor_env" : ""}, ${detailNote(op.task.validation_detail)}` : ""}${op.dropCaptureFlags.length ? `, drops capture flag(s) if present: ${op.dropCaptureFlags.join(", ")}` : ""}${goldNote(op.gold)}`);
    console.error("Dry run: nothing written.");
    return;
  }
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  for (const line of await guardedWriteback(supabase as unknown as WritebackClient & ColumnProbeClient, ops)) console.log(line);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
