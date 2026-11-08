// Writes the rows the batch should validate — every `candidate` benchmark row, optionally one sprint —
// as a JSON array, using the service-role key. The glue between the database and
// validateBenchmarkBatch.ts on the VM. Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fetchCandidateRows.ts --out rows.json [--sprint 2] [--all]
//
// --all includes validated and rejected rows too (for a full re-run). Not yet run against the real
// database; the embedded-select shape follows the app's own loaders.

import { writeFile } from "node:fs/promises";

function parseArgs(argv: string[]) {
  const args = { out: "", sprint: 0, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--sprint") args.sprint = Number(argv[++i]);
    else if (arg === "--all") args.all = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.out) throw new Error("Usage: fetchCandidateRows.ts --out rows.json [--sprint N] [--all]");
  return args;
}

type SourceRow = { instance_id: string; validation_status: string; cse_benchmark_tasks: Record<string, unknown> | null };

/** One row per instance, in instance-id order; an instance submitted by two students appears once. */
export function dedupeRows(sources: SourceRow[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const s of sources) if (s.cse_benchmark_tasks && !byId.has(s.instance_id)) byId.set(s.instance_id, s.cse_benchmark_tasks);
  return [...byId.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  let query = client
    .from("cse_benchmark_task_sources")
    .select("instance_id,validation_status,cse_benchmark_tasks(*),cse_assignment_submissions!inner(assignment_number)");
  if (!args.all) query = query.eq("validation_status", "candidate");
  if (args.sprint) query = query.eq("cse_assignment_submissions.assignment_number", args.sprint);
  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);

  const rows = dedupeRows((data ?? []) as unknown as SourceRow[]);
  await writeFile(args.out, JSON.stringify(rows, null, 2) + "\n");
  console.error(`${rows.length} row(s) written to ${args.out}${args.sprint ? ` (sprint ${args.sprint})` : ""}${args.all ? " (all statuses)" : " (candidates only)"}`);
}

if (process.argv[1]?.endsWith("fetchCandidateRows.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
