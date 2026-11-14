// The batch's repository clones and snapshot bundles, shared by a normal run and the snapshot-only
// pass (validateBenchmarkBatch.ts --snapshot-only). A bundle holds every commit reachable from the
// row's base_commit, so the files are kept even if the repository is later deleted or made private.
// When GitHub can no longer supply a row's code, a normal run validates from that bundle instead
// (rowCheckout). With a snapshot store configured (snapshotStore.ts: SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY set), every bundle written is also uploaded there, and a bundle neither
// the folder nor --snapshots-from has is downloaded from it; without one, nothing here changes.

import { access, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assertRow, bundleRepo, cloneRepo, CloneError, ensureCommit, redactToken, run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { SnapshotStore } from "@/lib/cse115a/benchmark/validation/snapshotStore";
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
 * Throws unless `file` is a whole bundle holding `commit`: `git bundle verify` (the header), then a
 * fetch of every branch into a throwaway repository (the pack itself: verify alone passes a
 * truncated file), then the commit. Run in an empty repository because verify needs one.
 */
export async function verifyBundle(file: string, commit: string): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), "hecate-bundle-verify-"));
  try {
    await run("git", ["init", "-q"], scratch);
    await run("git", ["bundle", "verify", "-q", file], scratch);
    await run("git", ["fetch", "-q", file, "refs/heads/*:refs/heads/*"], scratch);
    await run("git", ["cat-file", "-e", `${commit}^{commit}`], scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * The row's bundle as an absolute path: `<out>/snapshots/<instance_id>.bundle`, else the same name in
 * `snapshotsFrom` (validateBenchmarkBatch.ts --snapshots-from), else the store's copy, downloaded
 * straight into `<out>/snapshots/` and checked (verifyBundle) before it is returned; a copy that fails
 * the check is deleted. Null when none of them has a usable one. A store failure is logged, never thrown.
 */
export async function findBundle(out: string, row: Pick<TaskRow, "instance_id" | "base_commit">, options: { snapshotsFrom?: string; store?: SnapshotStore | null; log?: Log } = {}): Promise<string | null> {
  const log = options.log ?? (() => {});
  const own = join(out, snapshotPath(row.instance_id));
  if (await exists(own)) return own;
  if (options.snapshotsFrom) {
    const other = join(options.snapshotsFrom, `${row.instance_id}.bundle`);
    if (await exists(other)) return other;
  }
  if (!options.store) return null;
  try {
    await mkdir(dirname(own), { recursive: true });
    if (!(await options.store.download(row.instance_id, own))) {
      log("  the snapshot store has no copy of this row's snapshot");
      return null;
    }
  } catch (error) {
    log(`  the snapshot store could not be read: ${firstLine(error)}`);
    return null;
  }
  try {
    await verifyBundle(own, row.base_commit);
  } catch (error) {
    await rm(own, { force: true });
    log(`  the snapshot store's copy failed the check and was deleted: ${firstLine(error)}`);
    return null;
  }
  log(`  downloaded the snapshot from the store into ${own}`);
  return own;
}

/**
 * The checkout a normal run validates a row from: the batch's clone (batchRepo) when GitHub supplies
 * the repository and base_commit. When the clone or the fetch fails, for any reason, and the row has a
 * bundle (findBundle: the folder, --snapshots-from, then the store; the store is asked only here,
 * never when GitHub works), the bundle is cloned into `<out>/repos-from-snapshot/<instance_id>/` (reused
 * when already there; per row, because bundles are per row) and the run goes on from that. A bundle
 * found only in `snapshotsFrom` is also copied into `<out>/snapshots/`, so the result records it and
 * the Harbor export and gold check find it. With no bundle, the original error is thrown unchanged.
 */
export async function rowCheckout(options: {
  out: string; row: Pick<TaskRow, "instance_id" | "repo" | "base_commit">; clones: Map<string, string>; log: Log; git?: BatchGit; snapshotsFrom?: string; store?: SnapshotStore | null;
}): Promise<RowCheckout> {
  const { out, row, log } = options;
  try {
    return { repoDir: await batchRepo(out, row.repo, row.base_commit, options.clones, log, options.git), source: "github", failure: null };
  } catch (error) {
    const bundle = await findBundle(out, row, { snapshotsFrom: options.snapshotsFrom, store: options.store, log });
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

export const SNAPSHOT_STORED = "stored";
export const SNAPSHOT_ALREADY_STORED = "already stored";
export const SNAPSHOT_UPLOAD_FAILED = "upload failed";

/** What happened to a bundle in the store: the line's second part, and how to count it. */
export type StoreOutcome = { part: string; outcome: "stored" | "already stored" | "failed" };

/**
 * Puts the row's bundle in the store unless it is there already: `checkFirst` asks `has` before
 * uploading (a bundle that was already in the folder); a new bundle goes straight to `upload`, which
 * never overwrites either. Never throws: a failure is the outcome, with its first line.
 */
export async function storeBundle(store: SnapshotStore, instanceId: string, file: string, checkFirst: boolean): Promise<StoreOutcome> {
  try {
    if (checkFirst && (await store.has(instanceId))) return { part: SNAPSHOT_ALREADY_STORED, outcome: "already stored" };
    const answer = await store.upload(instanceId, file);
    return answer === "uploaded" ? { part: SNAPSHOT_STORED, outcome: "stored" } : { part: SNAPSHOT_ALREADY_STORED, outcome: "already stored" };
  } catch (error) {
    return { part: `${SNAPSHOT_UPLOAD_FAILED}: ${firstLine(error)}`, outcome: "failed" };
  }
}

/**
 * The snapshot a normal run records for a row. With `create`, a new bundle is written (null when that
 * fails, logged) and, with a store, uploaded (the outcome logged; an upload failure changes nothing
 * else). Without it, a bundle already in the folder (from an earlier run or a snapshot-only pass; the
 * base commit does not change) is recorded; undefined when there is none.
 */
export async function recordSnapshot(out: string, row: Pick<TaskRow, "instance_id" | "base_commit">, repoDir: string, create: boolean, log: Log, store?: SnapshotStore | null): Promise<string | null | undefined> {
  const bundle = snapshotPath(row.instance_id);
  if (create) {
    try {
      await bundleRepo(repoDir, row.base_commit, join(out, bundle));
    } catch (error) {
      log(`  snapshot failed: ${firstLine(error)}`);
      return null;
    }
    if (store) log(`  ${SNAPSHOT_WRITTEN}; ${(await storeBundle(store, row.instance_id, join(out, bundle), false)).part}`);
    return bundle;
  }
  return (await exists(join(out, bundle))) ? bundle : undefined;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((l) => l.trim()).find(Boolean) ?? message;
}

export const SNAPSHOT_WRITTEN = "snapshot written";
export const SNAPSHOT_EXISTS = "already has a snapshot";

/** `stored` and `uploadFailures` count only with a store. */
export type SnapshotOnlyReport = { lines: string[]; written: number; existing: number; failed: number; stored: number; uploadFailures: number };

/**
 * The snapshot-only pass: for each row, clone (the batch's clone, reused), make sure base_commit is
 * there, write `snapshots/<instance_id>.bundle`, and stop. No Docker, no environment detection, no
 * result, summary or write-back file. A row with a bundle is skipped unless `redo`. A row that fails
 * (a refused clone, say) gets its reason on its line; the pass goes on. `print` gets each line as it is
 * decided (the script prints them to stdout).
 *
 * With a store, each bundle written is uploaded, and a bundle already in the folder is uploaded if
 * the store does not have it yet (so rerunning the pass fills the store); the row's line gets a
 * second part (`; stored`, `; already stored`, `; upload failed: <first line>`) and the count line
 * adds `N stored, N upload failures`. An upload failure never fails the row.
 */
export async function snapshotOnly(options: { rows: TaskRow[]; out: string; redo: boolean; log?: Log; print?: Log; git?: BatchGit; store?: SnapshotStore | null }): Promise<SnapshotOnlyReport> {
  const log = options.log ?? (() => {});
  const store = options.store ?? null;
  const clones = new Map<string, string>();
  const report: SnapshotOnlyReport = { lines: [], written: 0, existing: 0, failed: 0, stored: 0, uploadFailures: 0 };
  const say = (line: string) => { report.lines.push(line); options.print?.(line); };
  const withStore = async (id: string, first: string, checkFirst: boolean): Promise<string> => {
    if (!store) return first;
    const stored = await storeBundle(store, id, join(options.out, snapshotPath(id)), checkFirst);
    if (stored.outcome === "stored") report.stored++;
    if (stored.outcome === "failed") report.uploadFailures++;
    return `${first}; ${stored.part}`;
  };
  for (const row of options.rows) {
    const id = row.instance_id;
    if (!options.redo && (await exists(join(options.out, snapshotPath(id))))) {
      report.existing++;
      say(`${id}: ${await withStore(id, SNAPSHOT_EXISTS, true)}`);
      continue;
    }
    try {
      assertRow(row);
      const repoDir = await batchRepo(options.out, row.repo, row.base_commit, clones, log, options.git);
      await bundleRepo(repoDir, row.base_commit, join(options.out, snapshotPath(id)));
    } catch (error) {
      report.failed++;
      say(`${id}: ${error instanceof CloneError ? error.message : firstLine(error)}`);
      continue;
    }
    report.written++;
    say(`${id}: ${await withStore(id, SNAPSHOT_WRITTEN, false)}`);
  }
  const storeCount = store ? `, ${report.stored} stored, ${report.uploadFailures} upload failures` : "";
  say(`${report.written} snapshot(s) written, ${report.existing} already had one, ${report.failed} failed, of ${options.rows.length} row(s)${storeCount}`);
  return report;
}
