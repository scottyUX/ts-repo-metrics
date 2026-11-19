// Creates the Supabase Storage bucket that keeps a copy of every snapshot bundle
// (benchmark-snapshots): private (public: false), 50 MB file size limit, no policies, so only the
// service-role key can read or write it. Run once. If the bucket exists it prints its settings and
// changes nothing; if it exists and is public it refuses and exits 1. No migration. Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/createSnapshotBucket.ts

import { ensureSnapshotBucket, supabaseBucketAdmin } from "@/lib/cse115a/benchmark/validation/snapshotStore";

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: createSnapshotBucket.ts (no arguments)");
  const admin = supabaseBucketAdmin(process.env);
  if (!admin) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  await ensureSnapshotBucket(admin, (line) => console.log(line));
}

if (process.argv[1]?.endsWith("createSnapshotBucket.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
