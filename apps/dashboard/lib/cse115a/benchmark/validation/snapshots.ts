// The batch's repository clones and snapshot bundles, shared by a normal run and the snapshot-only
// pass (validateBenchmarkBatch.ts --snapshot-only). A bundle holds every commit reachable from the
// row's base_commit, so the files are kept even if the repository is later deleted or made private.
// When GitHub can no longer supply a row's code, a normal run validates from that bundle instead
// (rowCheckout).

import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertRow, bundleRepo, cloneRepo, CloneError, ensureCommit, redactToken, run } from "@/lib/cse115a/benchmark/validation/runRow";
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

/** The branch a snapshot bundle holds (bundleRepo); `git clone -b` it to check the snapshot out. */
export const SNAPSHOT_BRANCH = "hecate-snapshot";

/** Where a row's code came from; recorded on the result as `repo_source`. */
export type RepoSource = "github" | "snapshot";

export type RowCheckout = {
  /** A checkout that has the row's base_commit. */
  repoDir: string;
  source: RepoSource;
  /** With `snapshot`: the clone or fetch failure, one line, token-free. Null with `github`. */
  failure: string | null;
};

/**
 * The row's bundle as an absolute path: `<out>/snapshots/<instance_id>.bundle`, else the same name in
 * `snapshotsFrom` (validateBenchmarkBatch.ts --snapshots-from); null when neither has one.
 */
export async function findBundle(out: string, instanceId: string, snapshotsFrom?: string): Promise<string | null> {
  const own = join(out, snapshotPath(instanceId));
  if (await exists(own)) return own;
  if (snapshotsFrom) {
    const other = join(snapshotsFrom, `${instanceId}.bundle`);
    if (await exists(other)) return other;
  }
  return null;
}

/**
 * The checkout a normal run validates a row from: the batch's clone (batchRepo) when GitHub supplies
 * the repository and base_commit. When the clone or the fetch fails, for any reason, and the row has a
 * bundle (findBundle), the bundle is cloned into `<out>/repos-from-snapshot/<instance_id>/` (reused
 * when already there; per row, because bundles are per row) and the run goes on from that. A bundle
 * found only in `snapshotsFrom` is also copied into `<out>/snapshots/`, so the result records it and
 * the Harbor export and gold check find it. With no bundle, the original error is thrown unchanged.
 */
export async function rowCheckout(options: {
  out: string; row: Pick<TaskRow, "instance_id" | "repo" | "base_commit">; clones: Map<string, string>; log: Log; git?: BatchGit; snapshotsFrom?: string;
}): Promise<RowCheckout> {
  const { out, row, log } = options;
  try {
    return { repoDir: await batchRepo(out, row.repo, row.base_commit, options.clones, log, options.git), source: "github", failure: null };
  } catch (error) {
    const bundle = await findBundle(out, row.instance_id, options.snapshotsFrom);
    if (!bundle) throw error;
    const failure = redactToken(firstLine(error));
    log(`  GitHub could not supply the code (${failure}); validating from the snapshot ${bundle}`);
    const own = join(out, snapshotPath(row.instance_id));
    const repoDir = join(out, "repos-from-snapshot", row.instance_id);
    try {
      if (bundle !== own) {
        await mkdir(dirname(own), { recursive: true });
        await copyFile(bundle, own);
      }
      if (!(await exists(join(repoDir, ".git")))) {
        await mkdir(dirname(repoDir), { recursive: true });
        await run("git", ["clone", "-q", "-b", SNAPSHOT_BRANCH, own, repoDir]);
      }
      await run("git", ["cat-file", "-e", `${row.base_commit}^{commit}`], repoDir);
    } catch (snapshotError) {
      throw new Error(`${failure}; the snapshot ${bundle} could not be used either: ${firstLine(snapshotError)}`);
    }
    return { repoDir, source: "snapshot", failure };
  }
}

/** A result with where its code came from; a snapshot run's detail gets the GitHub failure appended. */
export function withRepoSource<T extends { detail: string | null; repo_source?: RepoSource }>(result: T, checkout: RowCheckout): T {
  if (checkout.source === "github") return { ...result, repo_source: "github" };
  const note = `code taken from the snapshot because GitHub failed: ${checkout.failure}`;
  return { ...result, repo_source: "snapshot", detail: result.detail ? `${result.detail}; ${note}` : note };
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
