// One row of a normal batch run and the batch's summary files: the parts of
// validateBenchmarkBatch.ts that touch the disk, git and Docker, with each of those reachable
// through options so tests can hand in fakes.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preflight, rejectedWithoutRun, summarize, summaryMarkdown, writebackSql, type Summary } from "@/lib/cse115a/benchmark/validation/batch";
import { withRepoPublic } from "@/lib/cse115a/benchmark/validation/harbor";
import { assertRow, imageDigest, repoIsPublic, validateRow } from "@/lib/cse115a/benchmark/validation/runRow";
import type { SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { recordSnapshot, rowCheckout, withRepoSource, type BatchGit } from "@/lib/cse115a/benchmark/validation/snapshots";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

type Log = (line: string) => void;

/** The first non-empty line of an error message (Docker's often starts with a blank one). */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((l) => l.trim()).find(Boolean) ?? message;
}

/** What a batch run keeps across rows, and how it reaches the outside world. */
export type BatchRun = {
  out: string;
  /** Write a new snapshot bundle for each row (--snapshots). */
  snapshots: boolean;
  /** A folder of `<instance_id>.bundle` files to fall back on when `<out>/snapshots/` has none (--snapshots-from). */
  snapshotsFrom?: string;
  timeoutSeconds: number;
  log: Log;
  /** Clones by repository, image digests by image, publicity by repository: each looked up once. */
  clones: Map<string, string>;
  digests: Map<string, string | null>;
  publicity: Map<string, boolean | undefined>;
  /** Fakes for tests; the real git, Docker and GitHub otherwise. */
  git?: BatchGit;
  runner?: SuiteRunner;
  imageDigest?: (image: string) => Promise<string | null>;
  repoIsPublic?: (fullName: string, options: { log?: Log }) => Promise<boolean | undefined>;
};

export function batchRun(options: Omit<BatchRun, "clones" | "digests" | "publicity">): BatchRun {
  return { ...options, clones: new Map(), digests: new Map(), publicity: new Map() };
}

/**
 * Validates one row the way a normal batch run does: preflight, the checkout (GitHub, or the row's
 * snapshot when GitHub cannot supply it: rowCheckout), the Docker runs, then the extras (image
 * digest, repo_public, the snapshot bundle), none of which can discard the verdict. Any failure
 * before a verdict becomes `env_error` with the message as detail.
 */
export async function validateBatchRow(ctx: BatchRun, row: TaskRow, logDir: string): Promise<ValidationResult> {
  const { out, log } = ctx;
  try {
    assertRow(row);
    const skip = preflight(row);
    if (skip) return rejectedWithoutRun(row, skip.reason, skip.detail);
    const checkout = await rowCheckout({ out, row, clones: ctx.clones, log, git: ctx.git, snapshotsFrom: ctx.snapshotsFrom });
    let result = await validateRow({ row, repoDir: checkout.repoDir, logDir, cacheDir: join(out, "cache"), timeoutSeconds: ctx.timeoutSeconds, log, runner: ctx.runner });
    result = withRepoSource(result, checkout);
    // Extras: a failure here is logged and must never discard the verdict above.
    if (result.image) {
      if (!ctx.digests.has(result.image)) ctx.digests.set(result.image, await (ctx.imageDigest ?? imageDigest)(result.image));
      result.image_digest = ctx.digests.get(result.image) ?? null;
      if (result.harbor_env && result.image_digest) result.harbor_env = { ...result.harbor_env, image: result.image_digest };
    }
    // Whether the repository is public, checked once per repository; never fails the row.
    if (result.harbor_env) {
      if (!ctx.publicity.has(row.repo)) ctx.publicity.set(row.repo, await (ctx.repoIsPublic ?? repoIsPublic)(row.repo, { log }));
      result.harbor_env = withRepoPublic(result.harbor_env, ctx.publicity.get(row.repo));
    }
    // A bundle from an earlier run of this row is still valid (the base commit does not change), so
    // it is recorded even without --snapshots; the flag only decides whether to create a new one.
    // (A snapshot-only pass writes the same bundles; a snapshot fallback has just used one.)
    const bundle = await recordSnapshot(out, row, checkout.repoDir, ctx.snapshots, log);
    if (bundle !== undefined) result.snapshot_bundle = bundle;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  env_error: ${firstLine(error)}`);
    return rejectedWithoutRun(row, "env_error", message.slice(0, 2000));
  }
}

/** Every results/*.json in the folder, sorted by file name. */
export async function readAllResults(dir: string): Promise<ValidationResult[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(join(dir, n), "utf8")) as ValidationResult));
}

/**
 * Writes summary.json, summary.md and writeback.sql from every result in the folder, not only the
 * rows this invocation touched, so a --only or --redo pass never shrinks them.
 */
export async function writeBatchFiles(out: string): Promise<{ summary: Summary; results: ValidationResult[] }> {
  const results = await readAllResults(join(out, "results"));
  const summary = summarize(results);
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  await writeFile(join(out, "summary.md"), summaryMarkdown(summary));
  await writeFile(join(out, "writeback.sql"), writebackSql(results));
  return { summary, results };
}
