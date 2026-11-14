// Exports validated rows from a batch run as Harbor task directories (docs.harborframework.com).
// Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/exportHarbor.ts ROWS.json --batch DIR --to DIR [--only id,id]
//
// ROWS.json is the same row list the batch ran (it supplies problem_statement, hints and patches).
// DIR (--batch) is the batch output folder: results/<id>.json and snapshots/<id>.bundle are read from
// it. Only rows whose result is `validated` and that have a snapshot bundle are exported. The task is
// built from the result's Harbor recipe (harbor_env), so the Dockerfile and verifier match what the
// validator ran; an older result without one has its environment detected again from the bundle.
// The repository comes from the bundle, copied next to the Dockerfile (the course website's zip uses
// the github source instead). Needs git; no Docker, no database. Not gated on the gold check: this is
// how a task whose check failed is built to investigate it.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRows } from "@/lib/cse115a/benchmark/validation/batch";
import { writeBundleTask } from "@/lib/cse115a/benchmark/validation/bundleTask";
import type { HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { rowsPath: "", batch: "", to: "", only: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch") args.batch = argv[++i] ?? "";
    else if (arg === "--to") args.to = argv[++i] ?? "";
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (!args.rowsPath) args.rowsPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowsPath || !args.batch || !args.to) throw new Error("Usage: exportHarbor.ts ROWS.json --batch DIR --to DIR [--only id,id]");
  return args;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batch = resolve(args.batch);
  const to = resolve(args.to);
  const rows = parseRows(await readFile(args.rowsPath, "utf8")) as HarborRow[];
  const log = (line: string) => console.error(line);
  let exported = 0;

  for (const row of rows) {
    if (args.only.length && !args.only.includes(row.instance_id)) continue;
    const result = await readJson<ValidationResult>(join(batch, "results", `${row.instance_id}.json`));
    if (!result) { log(`${row.instance_id}: no result in the batch, skipping`); continue; }
    if (result.validation_status !== "validated") { log(`${row.instance_id}: ${result.validation_status} (${result.reason}), skipping`); continue; }
    // The task folder, from the result's recipe and the bundle (validation/bundleTask.ts).
    const task = await writeBundleTask({ row, result, batch, to });
    if ("skip" in task) { log(`${row.instance_id}: ${task.skip}, skipping`); continue; }
    exported++;
    log(`${row.instance_id} → ${task.taskDir}`);
  }
  log(`${exported} Harbor task(s) written to ${to}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
