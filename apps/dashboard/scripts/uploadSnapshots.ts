// Uploads a batch folder's snapshot bundles to the private Supabase Storage bucket
// benchmark-snapshots: every DIR/snapshots/*.bundle the bucket does not have yet, never overwriting
// one it has. One line per file (stored, already stored, upload failed: ...), then a count; exits 1
// when any upload failed. --dry-run lists what would be uploaded and uploads nothing (it still asks
// the bucket which bundles it has). --only limits it to those instance ids. Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/uploadSnapshots.ts --dir DIR [--only id,id] [--dry-run]
//
// The bucket must exist first (createSnapshotBucket.ts). A bundle over the bucket's 50 MB limit is
// not uploaded; its line says so and it stays only in DIR.

import { resolve } from "node:path";
import { SNAPSHOT_BUCKET, supabaseSnapshotStore, uploadSnapshotDir } from "@/lib/cse115a/benchmark/validation/snapshotStore";

const USAGE = "Usage: uploadSnapshots.ts --dir DIR [--only id,id] [--dry-run]";

export function parseArgs(argv: string[]) {
  const args = { dir: "", only: [] as string[], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") args.dir = argv[++i] ?? "";
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
  }
  if (!args.dir) throw new Error(USAGE);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = supabaseSnapshotStore(process.env);
  if (!store) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const dir = resolve(args.dir);
  console.error(`${args.dryRun ? "Dry run: " : ""}bundles in ${dir}/snapshots -> Supabase bucket ${SNAPSHOT_BUCKET}`);
  const report = await uploadSnapshotDir({ dir, store, only: args.only, dryRun: args.dryRun, print: (line) => console.log(line) });
  if (report.failures > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("uploadSnapshots.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
