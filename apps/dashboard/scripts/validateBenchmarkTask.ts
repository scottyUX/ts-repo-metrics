// Validates one benchmark row in Docker and prints the result as JSON. Dry run: it writes
// nothing to Supabase. Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkTask.ts ROW.json [--repo-dir DIR] [--out RESULT.json] [--timeout SECONDS]
//
// ROW.json holds the row's instance_id, repo, base_commit, patch, test_patch, FAIL_TO_PASS and
// PASS_TO_PASS. Without --repo-dir the repository is cloned into a temp folder and deleted after; a
// private repository needs GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY in the environment
// so the course App's installation token can be used. Docker must be running. For many rows, use
// validateBenchmarkBatch.ts.

import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertRow, cloneRepo, ensureCommit, validateRow } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { rowPath: "", repoDir: "", out: "", timeoutSeconds: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo-dir") args.repoDir = argv[++i] ?? "";
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--timeout") args.timeoutSeconds = Number(argv[++i]);
    else if (!args.rowPath) args.rowPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowPath) throw new Error("Usage: validateBenchmarkTask.ts ROW.json [--repo-dir DIR] [--out RESULT.json] [--timeout SECONDS]");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const row = JSON.parse(await readFile(args.rowPath, "utf8")) as Partial<TaskRow>;
  assertRow(row);
  const log = (line: string) => console.error(line);

  const cloned = !args.repoDir;
  const repoDir = cloned ? await cloneRepo(row.repo, undefined, log) : resolve(args.repoDir);
  await ensureCommit(repoDir, row.base_commit, log, row.repo);
  try {
    const logDir = join(tmpdir(), "hecate-validate-logs", row.instance_id);
    const result = await validateRow({ row, repoDir, logDir, timeoutSeconds: args.timeoutSeconds, log });
    const json = JSON.stringify(result, null, 2);
    if (args.out) await writeFile(args.out, json + "\n");
    console.log(json);
    console.error(`${result.validation_status}${result.reason ? ` (${result.reason})` : ""} — dry run, nothing written to the database.`);
  } finally {
    if (cloned) await rm(repoDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
