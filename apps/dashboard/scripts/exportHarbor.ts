// Exports validated rows from a batch run as Harbor task directories (docs.harborframework.com).
// Run from the repo root:
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/exportHarbor.ts ROWS.json --batch DIR --to DIR [--only id,id]
//
// ROWS.json is the same row list the batch ran (it supplies problem_statement, hints and patches).
// DIR (--batch) is the batch output folder: results/<id>.json and snapshots/<id>.bundle are read from
// it. Only rows whose result is `validated` and that have a snapshot bundle are exported. The
// environment is detected again from the bundle (base + both patches), so the task's Dockerfile and
// verifier match what the validator ran. Needs git; no Docker, no database.

import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseRows } from "@/lib/cse115a/benchmark/validation/batch";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";
import { buildHarborTask, harborTaskName, type HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import { fileIn, run, withPatchedWorktree } from "@/lib/cse115a/benchmark/validation/runRow";
import { filesInPatch, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

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
    if (!result.snapshot_bundle) { log(`${row.instance_id}: no snapshot bundle (run the batch with --snapshots), skipping`); continue; }
    const bundle = join(batch, result.snapshot_bundle);

    // Rebuild the environment from the bundle so the task matches the validated run.
    const clone = await mkdtemp(join(tmpdir(), "hecate-harbor-"));
    try {
      await run("git", ["clone", "-q", "-b", "hecate-snapshot", bundle, clone]);
      const testFiles = filesInPatch(row.test_patch);
      const env = await withPatchedWorktree(clone, row.base_commit, [row.test_patch, row.patch], (dir) =>
        detectEnvironment({ testFiles, read: (path) => fileIn(dir, path) }));
      if (!env.supported) { log(`${row.instance_id}: environment ${env.detail}, skipping`); continue; }

      const name = harborTaskName(row.instance_id);
      const taskDir = join(to, name);
      const files = buildHarborTask({ row, result, env, bundleFile: "repo.bundle", name });
      for (const [path, contents] of files) {
        const full = join(taskDir, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, contents);
        if (path.endsWith(".sh")) await chmod(full, 0o755);
      }
      await copyFile(bundle, join(taskDir, "environment", "repo.bundle"));
      exported++;
      log(`${row.instance_id} → ${taskDir}`);
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  }
  log(`${exported} Harbor task(s) written to ${to}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
