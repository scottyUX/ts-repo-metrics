// Rebuilds one benchmark row from its PR's merge commit (see rebuildRow.ts and the "Rebuilt rows"
// section of docs/CSE115A_BENCHMARK_VALIDATION.md) and writes it as a rows file the batch accepts.
// Reads the submission snapshot the row was captured from with the service-role key; writes nothing
// to the database (write-back does that after validation). Run from the repo root:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/rebuildBenchmarkRow.ts \
//     --rows ROWS.json --only <instance_id> --pr <n> --out REBUILT.json [--repo-dir DIR]
//
// ROWS.json holds the row as stored (fetchCandidateRows.ts --all writes it). The merge commit is the
// snapshot's pr.mergeCommitSha; --pr must match the snapshot's PR number. Without --repo-dir the
// repository is cloned into a temp folder (the course App token when configured) and deleted after.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseRows } from "@/lib/cse115a/benchmark/validation/batch";
import { loadRebuildSource, rebuildRow, type RebuildSourceClient } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import { cloneRepo, ensureCommit, run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { rows: "", only: "", pr: 0, out: "", repoDir: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--rows") args.rows = argv[++i] ?? "";
    else if (arg === "--only") args.only = argv[++i] ?? "";
    else if (arg === "--pr") args.pr = Number(argv[++i]);
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--repo-dir") args.repoDir = argv[++i] ?? "";
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rows || !args.only || !Number.isInteger(args.pr) || args.pr <= 0 || !args.out) {
    throw new Error("Usage: rebuildBenchmarkRow.ts --rows ROWS.json --only <instance_id> --pr <n> --out REBUILT.json [--repo-dir DIR]");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (line: string) => console.error(line);
  const row = parseRows(await readFile(args.rows, "utf8")).find((r) => r.instance_id === args.only) as (TaskRow & Record<string, unknown>) | undefined;
  if (!row) throw new Error(`${args.only} is not in ${args.rows}`);

  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read-only use: the submission snapshot).");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { task, assignmentNumber, attempt, studentEmail } = await loadRebuildSource(db as unknown as RebuildSourceClient, row.instance_id);
  log(`${row.instance_id}: PR #${task.prNumber}, merge commit ${task.pr.mergeCommitSha} (sprint ${assignmentNumber}, attempt ${attempt})`);

  const cloned = !args.repoDir;
  const repoDir = cloned ? await cloneRepo(row.repo, await mkdtemp(join(tmpdir(), "hecate-rebuild-")), log) : resolve(args.repoDir);
  try {
    await ensureCommit(repoDir, task.pr.mergeCommitSha, log);
    const { row: rebuilt, flags, droppedFiles } = await rebuildRow({
      row, task, assignmentNumber, studentEmail, expectedPr: args.pr,
      git: (gitArgs) => run("git", gitArgs, repoDir),
    });
    await writeFile(args.out, JSON.stringify([rebuilt], null, 2) + "\n");
    log(`base_commit ${row.base_commit} → ${rebuilt.base_commit} (merge commit's first parent)`);
    log(`patch ${row.patch.length} → ${rebuilt.patch.length} bytes; test_patch ${row.test_patch.length} → ${rebuilt.test_patch.length} bytes; static FAIL_TO_PASS ${rebuilt.FAIL_TO_PASS.length}`);
    if (droppedFiles.length) log(`dropped task file(s): ${droppedFiles.join(", ")}`);
    if (flags.length) log(`capture flags on the rebuilt diff: ${flags.join(", ")}`);
    log(`Wrote ${args.out}. Validate it with validateBenchmarkBatch.ts, then write back; nothing was written to the database.`);
  } finally {
    if (cloned) await rm(repoDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
