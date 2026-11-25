// Writes a batch's verdicts to Supabase with the service-role key: the unattended version of
// writeback.sql, for the VM. Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/writebackValidation.ts --batch DIR [--attempts] [--only id,id] [--dry-run]
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
//
// --attempts (#452) does the other job, never both in one run: for every result that is not validated,
// env_error included, it sets a validation_attempt:<reason> flag on the task's candidate source rows
// (test_file_never_loaded in place of the reason when the test patch files never loaded after the fix),
// replacing any earlier attempt flag, and changes nothing else: not the status, not the task row, not
// any other flag. Validated results are skipped (write them back without --attempts), and so are source
// rows already validated or rejected. --dry-run prints `<id>: <reason>` per task; the real run prints
// the same line with "noted". Logic in lib/cse115a/benchmark/validation/attempts.ts and writebackCli.ts.

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AttemptClient } from "@/lib/cse115a/benchmark/validation/attempts";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import type { ColumnProbeClient, WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import { parseWritebackArgs, runWriteback } from "@/lib/cse115a/benchmark/validation/writebackCli";

async function main() {
  const args = parseWritebackArgs(process.argv.slice(2));
  const resultsDir = join(resolve(args.batch), "results");
  const names = (await readdir(resultsDir)).filter((n) => n.endsWith(".json")).sort();
  const results: ValidationResult[] = [];
  for (const name of names) results.push(JSON.parse(await readFile(join(resultsDir, name), "utf8")) as ValidationResult);
  await runWriteback(args, {
    results,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    client: async () => {
      const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).");
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(url, key, { auth: { persistSession: false } }) as unknown as WritebackClient & ColumnProbeClient & AttemptClient;
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
