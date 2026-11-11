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
import { rebuildRow } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import { cloneRepo, ensureCommit, run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";
import type { SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";

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

type SourceRow = {
  task_slot: number;
  course_id: string;
  user_id: string;
  cse_assignment_submissions: { assignment_number: number; attempt: number; superseded_at: string | null; snapshot: SubmissionSnapshot };
};

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

  // The submission the row was captured from: the current attempt, else the latest one.
  const { data, error } = await db.from("cse_benchmark_task_sources")
    .select("task_slot,course_id,user_id,cse_assignment_submissions!inner(assignment_number,attempt,superseded_at,snapshot)")
    .eq("instance_id", row.instance_id);
  if (error) throw new Error(`Supabase: ${error.message}`);
  const sources = ((data ?? []) as unknown as SourceRow[])
    .sort((a, b) => Number(a.cse_assignment_submissions.superseded_at != null) - Number(b.cse_assignment_submissions.superseded_at != null)
      || b.cse_assignment_submissions.attempt - a.cse_assignment_submissions.attempt);
  const source = sources[0];
  if (!source) throw new Error(`${row.instance_id}: no cse_benchmark_task_sources row`);
  const submission = source.cse_assignment_submissions;
  const task = submission.snapshot.tasks.find((t) => t.slot === source.task_slot);
  if (!task) throw new Error(`${row.instance_id}: the submission snapshot has no task in slot ${source.task_slot}`);
  const { data: member, error: memberError } = await db.from("cse_course_memberships")
    .select("ucsc_email").eq("course_id", source.course_id).eq("user_id", source.user_id).maybeSingle();
  if (memberError) throw new Error(`Supabase: ${memberError.message}`);
  const studentEmail = (member?.ucsc_email as string | undefined) ?? null;
  log(`${row.instance_id}: PR #${task.prNumber}, merge commit ${task.pr.mergeCommitSha} (sprint ${submission.assignment_number}, attempt ${submission.attempt})`);

  const cloned = !args.repoDir;
  const repoDir = cloned ? await cloneRepo(row.repo, await mkdtemp(join(tmpdir(), "hecate-rebuild-")), log) : resolve(args.repoDir);
  try {
    await ensureCommit(repoDir, task.pr.mergeCommitSha, log);
    const { row: rebuilt, flags, droppedFiles } = await rebuildRow({
      row, task, assignmentNumber: submission.assignment_number, studentEmail, expectedPr: args.pr,
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
