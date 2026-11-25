// What scripts/writebackValidation.ts runs, with its inputs passed in so a test can drive either mode
// with made-up results and a fake client. One run does one thing: the verdict write-back (the
// default, unchanged), or with `--attempts` the last-attempt flags (attempts.ts, #452), never both.

import { applyAttempts, attemptLine, attemptPlan, attemptSummary, type AttemptClient } from "@/lib/cse115a/benchmark/validation/attempts";
import { detailNote, goldNote, guardedWriteback, writebackPlan, type ColumnProbeClient, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export const WRITEBACK_USAGE = "Usage: writebackValidation.ts --batch DIR [--attempts] [--only id,id] [--dry-run]";

export type WritebackArgs = { batch: string; only: string[]; dryRun: boolean; mode: "verdicts" | "attempts" };

export function parseWritebackArgs(argv: string[]): WritebackArgs {
  const args: WritebackArgs = { batch: "", only: [], dryRun: false, mode: "verdicts" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch") args.batch = argv[++i] ?? "";
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--attempts") {
      if (args.mode === "attempts") throw new Error("--attempts given twice");
      args.mode = "attempts";
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.batch) throw new Error(WRITEBACK_USAGE);
  return args;
}

export type WritebackDeps = {
  /** The batch's results (DIR/results/*.json), in file-name order. */
  results: ValidationResult[];
  /** The service-role client; asked for only on a real run. */
  client: () => Promise<WritebackClient & ColumnProbeClient & AttemptClient>;
  /** stdout: the per-task lines. */
  out: (line: string) => void;
  /** stderr: counts and notes. */
  err: (line: string) => void;
};

export async function runWriteback(args: WritebackArgs, deps: WritebackDeps): Promise<void> {
  const results = deps.results.filter((r) => args.only.length === 0 || args.only.includes(r.instance_id));
  if (args.mode === "attempts") return runAttempts(args, results, deps);

  const ops = writebackPlan(results);
  deps.err(`${results.length} result(s), ${ops.length} to write (${results.length - ops.length} env_error skipped)`);
  if (args.dryRun) {
    for (const op of ops) deps.out(`${op.instance_id}: ${op.validation_status}${op.reasonFlag ? ` (${op.reasonFlag})` : ""}${op.task ? ` F2P=${op.task.FAIL_TO_PASS.length} P2P=${op.task.PASS_TO_PASS.length} image=${op.task.image}${op.task.harbor_env ? " harbor_env" : ""}, ${detailNote(op.task.validation_detail)}` : ""}${op.dropCaptureFlags.length ? `, drops capture flag(s) if present: ${op.dropCaptureFlags.join(", ")}` : ""}${goldNote(op.gold)}`);
    deps.err("Dry run: nothing written.");
    return;
  }
  for (const line of await guardedWriteback(await deps.client(), ops)) deps.out(line);
}

async function runAttempts(args: WritebackArgs, results: ValidationResult[], deps: WritebackDeps): Promise<void> {
  const plan = attemptPlan(results);
  deps.err(`${results.length} result(s), ${plan.ops.length} attempt(s) to note (${plan.skippedValidated} validated skipped: write those back without --attempts)`);
  if (plan.skippedNoReason.length) deps.err(`Not validated but no reason recorded, skipped: ${plan.skippedNoReason.join(", ")}`);
  if (args.dryRun) {
    for (const op of plan.ops) deps.out(attemptLine(op));
    deps.err("Dry run: nothing written. It reads no database: source rows already validated or rejected are skipped on the real run.");
    return;
  }
  const outcome = await applyAttempts(await deps.client(), plan.ops);
  for (const line of outcome.lines) deps.out(line);
  deps.err(attemptSummary(outcome));
}
