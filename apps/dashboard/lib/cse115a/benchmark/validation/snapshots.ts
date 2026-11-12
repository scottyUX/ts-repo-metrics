// The batch's repository clones and snapshot bundles, shared by a normal run and the snapshot-only
// pass (validateBenchmarkBatch.ts --snapshot-only). A bundle holds every commit reachable from the
// row's base_commit, so the files are kept even if the repository is later deleted or made private.

import { access } from "node:fs/promises";
import { join } from "node:path";
import { assertRow, bundleRepo, cloneRepo, CloneError, ensureCommit } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

type Log = (line: string) => void;

/** How the batch reaches GitHub; tests hand in a clone from a local repository. */
export type BatchGit = {
  clone?: (fullName: string, dir: string, log: Log) => Promise<unknown>;
  ensure?: (repoDir: string, commit: string, log: Log, fullName: string) => Promise<void>;
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** `snapshots/<instance_id>.bundle`, relative to the batch folder (as results record it). */
export function snapshotPath(instanceId: string): string {
  return join("snapshots", `${instanceId}.bundle`);
}

/**
 * The batch's clone of `repo`: `<out>/repos/<owner>__<name>`, cloned the first time and reused after
 * (across rows and across runs into the same folder), then `commit` fetched into it if missing.
 */
export async function batchRepo(out: string, repo: string, commit: string, clones: Map<string, string>, log: Log, git: BatchGit = {}): Promise<string> {
  let repoDir = clones.get(repo);
  if (!repoDir) {
    repoDir = join(out, "repos", repo.replace("/", "__"));
    if (!(await exists(join(repoDir, ".git")))) await (git.clone ?? cloneRepo)(repo, repoDir, log);
    clones.set(repo, repoDir);
  }
  await (git.ensure ?? ensureCommit)(repoDir, commit, log, repo);
  return repoDir;
}

/**
 * The snapshot a normal run records for a row. With `create`, a new bundle is written (null when that
 * fails, logged). Without it, a bundle already in the folder (from an earlier run or a snapshot-only
 * pass; the base commit does not change) is recorded; undefined when there is none.
 */
export async function recordSnapshot(out: string, row: Pick<TaskRow, "instance_id" | "base_commit">, repoDir: string, create: boolean, log: Log): Promise<string | null | undefined> {
  const bundle = snapshotPath(row.instance_id);
  if (create) {
    try {
      await bundleRepo(repoDir, row.base_commit, join(out, bundle));
      return bundle;
    } catch (error) {
      log(`  snapshot failed: ${firstLine(error)}`);
      return null;
    }
  }
  return (await exists(join(out, bundle))) ? bundle : undefined;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((l) => l.trim()).find(Boolean) ?? message;
}

export const SNAPSHOT_WRITTEN = "snapshot written";
export const SNAPSHOT_EXISTS = "already has a snapshot";

export type SnapshotOnlyReport = { lines: string[]; written: number; existing: number; failed: number };

/**
 * The snapshot-only pass: for each row, clone (the batch's clone, reused), make sure base_commit is
 * there, write `snapshots/<instance_id>.bundle`, and stop. No Docker, no environment detection, no
 * result, summary or write-back file. A row with a bundle is skipped unless `redo`. A row that fails
 * (a refused clone, say) gets its reason on its line; the pass goes on. `print` gets each line as it is
 * decided (the script prints them to stdout).
 */
export async function snapshotOnly(options: { rows: TaskRow[]; out: string; redo: boolean; log?: Log; print?: Log; git?: BatchGit }): Promise<SnapshotOnlyReport> {
  const log = options.log ?? (() => {});
  const clones = new Map<string, string>();
  const report: SnapshotOnlyReport = { lines: [], written: 0, existing: 0, failed: 0 };
  const say = (line: string) => { report.lines.push(line); options.print?.(line); };
  for (const row of options.rows) {
    const id = row.instance_id;
    if (!options.redo && (await exists(join(options.out, snapshotPath(id))))) {
      report.existing++;
      say(`${id}: ${SNAPSHOT_EXISTS}`);
      continue;
    }
    try {
      assertRow(row);
      const repoDir = await batchRepo(options.out, row.repo, row.base_commit, clones, log, options.git);
      await bundleRepo(repoDir, row.base_commit, join(options.out, snapshotPath(id)));
      report.written++;
      say(`${id}: ${SNAPSHOT_WRITTEN}`);
    } catch (error) {
      report.failed++;
      say(`${id}: ${error instanceof CloneError ? error.message : firstLine(error)}`);
    }
  }
  say(`${report.written} snapshot(s) written, ${report.existing} already had one, ${report.failed} failed, of ${options.rows.length} row(s)`);
  return report;
}
