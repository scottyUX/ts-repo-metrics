// A copy of every snapshot bundle in a private Supabase Storage bucket, so a row whose repository
// has since been deleted or made private can still be validated when the batch folder that holds its
// bundle is gone. Object `<instance_id>.<first 12 characters of base_commit>.bundle` in bucket
// `benchmark-snapshots`; only the service-role key reads or writes it (no policies). A copy is never
// overwritten: a resubmission or a staff rebuild that changes a row's base commit gets a second object
// under the new name, and the first stays. Objects uploaded before the name carried the base commit are
// `<instance_id>.bundle`; readers try the new name, then that one, and check the base commit is in the
// copy before using it (findBundle). Writers: the validator (validateBenchmarkBatch.ts,
// uploadSnapshots.ts), whose bundles hold the base commit only and keep that name, and the website,
// which copies each task's repository at Submit when CSE115A_REPO_COPIES=on (repoCopy.ts) and from the
// instructor Benchmark page. The website's copy is complete (#298): the base commit plus the PR's own
// commits (its head, its merge commit, and a paired task's task-file PR head), under
// `<instance_id>.<first 12 characters of base_commit>.full.bundle`. Readers try that name first, then
// the base-only name, then the legacy one. The website asks whether a copy exists and never downloads
// one; staff get a 60-second signed link to one from the review page (repoCopyAccess.ts), so the file
// never passes through the site. The exports never read the bucket.

import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { run } from "@/lib/cse115a/benchmark/validation/runRow";

export const SNAPSHOT_BUCKET = "benchmark-snapshots";
/** The bucket's file size limit (createSnapshotBucket.ts); a larger bundle stays local only. */
export const SNAPSHOT_SIZE_LIMIT = 50 * 1024 * 1024;
const CONTENT_TYPE = "application/octet-stream";

/**
 * Which object a writer means: "base", the validator's bundle of the base commit only
 * (snapshotObject), or "full", the website's complete copy with the PR's own commits (fullSnapshotObject).
 */
export type SnapshotKind = "base" | "full";

export type SnapshotStore = {
  /** Whether the copy of this kind (default "base") for this base commit is stored; that one name only. */
  has(instanceId: string, baseCommit: string, kind?: SnapshotKind): Promise<boolean>;
  /** Writes the name for this kind (default "base") and never overwrites: an object already there is "already stored". Throws on any other failure. */
  upload(instanceId: string, baseCommit: string, file: string, kind?: SnapshotKind): Promise<"uploaded" | "already stored">;
  /**
   * Writes the copy to `file`: the complete copy, else the base-only one, else the old
   * `<instance_id>.bundle`; false when there is none. The caller checks the base commit is in it
   * (findBundle). Throws on any other failure.
   */
  download(instanceId: string, baseCommit: string, file: string): Promise<boolean>;
  /** Every object name in the bucket, for answering many tasks from one listing (the Benchmark page). Throws on a failure. */
  list(): Promise<Set<string>>;
};

/** How many characters of the base commit the object name carries. */
export const OBJECT_COMMIT_CHARS = 12;

/** The object for a row at a base commit: `<instance_id>.<first 12 characters of base_commit>.bundle`. */
export function snapshotObject(instanceId: string, baseCommit: string): string {
  if (!new RegExp(`^[0-9a-f]{${OBJECT_COMMIT_CHARS},64}$`, "i").test(baseCommit)) throw new Error(`not a commit id: ${JSON.stringify(baseCommit)}`);
  return `${instanceId}.${baseCommit.slice(0, OBJECT_COMMIT_CHARS).toLowerCase()}.bundle`;
}

/** The website's complete copy for a row at a base commit: `<instance_id>.<first 12 characters of base_commit>.full.bundle`. */
export function fullSnapshotObject(instanceId: string, baseCommit: string): string {
  return snapshotObject(instanceId, baseCommit).replace(/\.bundle$/, ".full.bundle");
}

/** The object name for a kind of copy. */
export function snapshotObjectFor(instanceId: string, baseCommit: string, kind: SnapshotKind = "base"): string {
  return kind === "full" ? fullSnapshotObject(instanceId, baseCommit) : snapshotObject(instanceId, baseCommit);
}

/** Every name a reader tries for a row at a base commit, in order: complete, base-only, legacy. */
export function snapshotReadOrder(instanceId: string, baseCommit: string): string[] {
  return [fullSnapshotObject(instanceId, baseCommit), snapshotObject(instanceId, baseCommit), legacySnapshotObject(instanceId)];
}

/** The name objects had before it carried the base commit; read, never written. */
export function legacySnapshotObject(instanceId: string): string {
  return `${instanceId}.bundle`;
}

/** The parts of a storage-js error the store looks at. */
type StorageErrorLike = { message: string; status?: number; statusCode?: string; originalError?: unknown };

/**
 * The calls the store makes on `client.storage.from(SNAPSHOT_BUCKET)` (@supabase/storage-js 2.97),
 * as their `{ data, error }` answers; tests hand in a fake.
 */
export type BucketFiles = {
  exists(path: string): Promise<{ data: boolean; error: StorageErrorLike | null }>;
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ data: unknown; error: StorageErrorLike | null }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: StorageErrorLike | null }>;
  list(path: string, options: { limit: number; offset: number; sortBy: { column: string; order: string } }): Promise<{ data: Array<{ name: string }> | null; error: StorageErrorLike | null }>;
};

/**
 * How many names one `list` call asks for. storage-js 2.97's `list(path, { limit, offset, sortBy })`
 * defaults to 100; the store asks for more and pages by offset until a page comes back empty, so a
 * server that returns fewer than asked is still read to the end.
 */
export const LIST_PAGE = 1000;

/** The environment the store is configured from (process.env, or a plain object in tests). */
export type Env = Record<string, string | undefined>;

/** The service-role connection, read like fetchCandidateRows.ts reads it; null when either part is missing. */
export function storeCredentials(env: Env): { url: string; key: string } | null {
  const url = env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** The HTTP status behind a storage-js error: the API's own `statusCode`, else the response's. */
function statusOf(error: StorageErrorLike): number | undefined {
  const code = Number(error.statusCode);
  if (Number.isFinite(code) && code > 0) return code;
  if (typeof error.status === "number") return error.status;
  const original = error.originalError as { status?: unknown } | undefined;
  return typeof original?.status === "number" ? original.status : undefined;
}

/**
 * Upload with `upsert: false` onto an existing object: Storage answers HTTP 400 (409 on newer
 * servers) with `statusCode: "409"`, "The resource already exists".
 */
function isDuplicate(error: StorageErrorLike): boolean {
  return statusOf(error) === 409 || /already exists/i.test(error.message);
}

/**
 * A missing object on download: storage-js reads no JSON body there, so the error carries only the
 * response, with status 400 or 404 (the same two `exists` treats as "not there").
 */
function isMissing(error: StorageErrorLike): boolean {
  const status = statusOf(error);
  return status === 400 || status === 404;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((l) => l.trim()).find(Boolean) ?? message;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The store over a bucket's file calls. */
export function bucketSnapshotStore(files: BucketFiles): SnapshotStore {
  return {
    async has(instanceId, baseCommit, kind) {
      const { data, error } = await files.exists(snapshotObjectFor(instanceId, baseCommit, kind));
      if (error && !isMissing(error)) throw new Error(`Storage: ${error.message}`);
      return data === true;
    },
    async upload(instanceId, baseCommit, file, kind) {
      const name = snapshotObjectFor(instanceId, baseCommit, kind);
      const { size } = await stat(file);
      if (size > SNAPSHOT_SIZE_LIMIT) throw new Error(`the bundle is ${mb(size)}, over the bucket's ${mb(SNAPSHOT_SIZE_LIMIT)} limit; kept only in this folder`);
      const body = await readFile(file);
      const { error } = await files.upload(name, body, { contentType: CONTENT_TYPE, upsert: false });
      if (!error) return "uploaded";
      if (isDuplicate(error)) return "already stored";
      throw new Error(`Storage: ${error.message}`);
    },
    async download(instanceId, baseCommit, file) {
      let data: Blob | null = null;
      for (const name of snapshotReadOrder(instanceId, baseCommit)) {
        const answer = await files.download(name);
        if (answer.error) {
          if (isMissing(answer.error)) continue;
          throw new Error(`Storage: ${answer.error.message}`);
        }
        if (answer.data) {
          data = answer.data;
          break;
        }
      }
      if (!data) return false;
      // Written beside the target and renamed, so an interrupted download never leaves a partial
      // bundle where findBundle would take it for a good one.
      const part = `${file}.part`;
      try {
        await writeFile(part, Buffer.from(await data.arrayBuffer()));
        await rename(part, file);
      } catch (writeError) {
        await rm(part, { force: true });
        throw writeError;
      }
      return true;
    },
    async list() {
      const names = new Set<string>();
      for (let offset = 0; ; ) {
        const { data, error } = await files.list("", { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`Storage: ${error.message}`);
        const page = data ?? [];
        const before = names.size;
        for (const item of page) if (item?.name) names.add(item.name);
        // An empty page is the end; so is a page with nothing new (a server that ignored the offset).
        if (page.length === 0 || names.size === before) return names;
        offset += page.length;
      }
    },
  };
}

/** The Supabase store, or null when SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY is missing. */
export function supabaseSnapshotStore(env: Env = process.env): SnapshotStore | null {
  const credentials = storeCredentials(env);
  if (!credentials) return null;
  const client = createClient(credentials.url, credentials.key, { auth: { persistSession: false } });
  return bucketSnapshotStore(client.storage.from(SNAPSHOT_BUCKET));
}

type Print = (line: string) => void;

/** The commit a snapshot bundle holds: its one branch's head (bundleRepo writes refs/heads/hecate-snapshot). */
export async function bundleHead(file: string): Promise<string> {
  const heads = (await run("git", ["bundle", "list-heads", file])).trim().split("\n").filter(Boolean);
  const sha = heads.length === 1 ? heads[0]!.split(/\s+/)[0] : undefined;
  if (!sha || !/^[0-9a-f]{40,64}$/i.test(sha)) throw new Error(`${file} is not a snapshot bundle with one branch`);
  return sha;
}

export type UploadDirReport = { lines: string[]; stored: number; alreadyStored: number; wouldUpload: number; failures: number; notFound: number };

/**
 * uploadSnapshots.ts: every `<dir>/snapshots/*.bundle` (or only the `only` ids) that the store does
 * not have yet is uploaded, one line per file (`stored`, `already stored`, `upload failed: …`), then
 * a count. The local file keeps its `<instance_id>.bundle` name; the object is named for the commit
 * the bundle holds (bundleHead). With `dryRun` nothing is uploaded: each line says `would upload` or
 * `already stored`.
 */
export async function uploadSnapshotDir(options: { dir: string; store: SnapshotStore; only?: string[]; dryRun?: boolean; print?: Print }): Promise<UploadDirReport> {
  const { store } = options;
  const folder = join(options.dir, "snapshots");
  const report: UploadDirReport = { lines: [], stored: 0, alreadyStored: 0, wouldUpload: 0, failures: 0, notFound: 0 };
  const say = (line: string) => { report.lines.push(line); options.print?.(line); };
  let names: string[];
  try {
    names = (await readdir(folder)).filter((n) => n.endsWith(".bundle")).sort();
  } catch {
    throw new Error(`No snapshots folder at ${folder}`);
  }
  const present = names.map((n) => n.slice(0, -".bundle".length));
  const only = options.only ?? [];
  const ids = only.length ? present.filter((id) => only.includes(id)) : present;
  for (const id of only) {
    if (present.includes(id)) continue;
    report.notFound++;
    say(`${id}: no bundle in ${folder}`);
  }
  for (const id of ids) {
    const file = join(folder, legacySnapshotObject(id));
    try {
      // Local files keep the plain name; the object name takes the commit the bundle holds.
      const baseCommit = await bundleHead(file);
      if (await store.has(id, baseCommit)) {
        report.alreadyStored++;
        say(`${id}: already stored`);
      } else if (options.dryRun) {
        report.wouldUpload++;
        say(`${id}: would upload (${mb((await stat(file)).size)})`);
      } else if ((await store.upload(id, baseCommit, file)) === "uploaded") {
        report.stored++;
        say(`${id}: stored`);
      } else {
        report.alreadyStored++;
        say(`${id}: already stored`);
      }
    } catch (error) {
      report.failures++;
      say(`${id}: ${options.dryRun ? "check failed" : "upload failed"}: ${firstLine(error)}`);
    }
  }
  const missing = report.notFound ? `, ${report.notFound} not found` : "";
  say(options.dryRun
    ? `Dry run: ${report.wouldUpload} would be uploaded, ${report.alreadyStored} already stored, ${report.failures} check failures, of ${ids.length} bundle(s)${missing}; nothing uploaded`
    : `${report.stored} stored, ${report.alreadyStored} already stored, ${report.failures} upload failures, of ${ids.length} bundle(s)${missing}`);
  return report;
}

type BucketInfo = { id: string; public: boolean; file_size_limit?: number | null; created_at?: string };

/** The calls createSnapshotBucket.ts makes on `client.storage` (@supabase/storage-js 2.97); tests hand in a fake. */
export type BucketAdmin = {
  getBucket(id: string): Promise<{ data: BucketInfo | null; error: StorageErrorLike | null }>;
  createBucket(id: string, options: { public: boolean; fileSizeLimit: number }): Promise<{ data: unknown; error: StorageErrorLike | null }>;
};

/** `getBucket` on a bucket that does not exist: HTTP 400 (404 on newer servers) with `statusCode: "404"`, "Bucket not found". */
function isBucketMissing(error: StorageErrorLike): boolean {
  return statusOf(error) === 404 || /not found/i.test(error.message);
}

function bucketSettings(bucket: BucketInfo): string {
  const limit = bucket.file_size_limit ? `${mb(bucket.file_size_limit)} (${bucket.file_size_limit} bytes)` : "none (the project's global limit applies)";
  return `${bucket.id}: ${bucket.public ? "PUBLIC" : "private"}, file size limit ${limit}${bucket.created_at ? `, created ${bucket.created_at}` : ""}`;
}

/**
 * createSnapshotBucket.ts: creates `benchmark-snapshots` private with a 50 MB file size limit, or
 * reports the existing bucket's settings. Throws (changing nothing) when the existing bucket is
 * public. Adds no policies, so only the service-role key can read or write it.
 */
export async function ensureSnapshotBucket(admin: BucketAdmin, print: Print): Promise<"created" | "exists"> {
  const existing = await admin.getBucket(SNAPSHOT_BUCKET);
  if (existing.data) {
    if (existing.data.public) throw new Error(`The bucket ${SNAPSHOT_BUCKET} exists and is PUBLIC: anyone with an object's URL could download a private repository's code. Not continuing; make it private in the Supabase dashboard (Storage > ${SNAPSHOT_BUCKET} > Edit bucket) and run this again.`);
    print(`Already exists: ${bucketSettings(existing.data)}`);
    if (existing.data.file_size_limit !== SNAPSHOT_SIZE_LIMIT) print(`Note: the limit is not ${mb(SNAPSHOT_SIZE_LIMIT)}; left unchanged.`);
    return "exists";
  }
  if (existing.error && !isBucketMissing(existing.error)) throw new Error(`Storage: ${existing.error.message}`);
  const created = await admin.createBucket(SNAPSHOT_BUCKET, { public: false, fileSizeLimit: SNAPSHOT_SIZE_LIMIT });
  if (created.error) throw new Error(`Storage: ${created.error.message}`);
  const now = await admin.getBucket(SNAPSHOT_BUCKET);
  if (!now.data) throw new Error(`Created ${SNAPSHOT_BUCKET}, but reading it back failed: ${now.error?.message ?? "no data"}`);
  if (now.data.public) throw new Error(`Created ${SNAPSHOT_BUCKET}, but it reads back as PUBLIC; make it private in the Supabase dashboard before uploading.`);
  print(`Created: ${bucketSettings(now.data)}`);
  return "created";
}

/** The admin calls over the service-role client, or null without the variables (as supabaseSnapshotStore). */
export function supabaseBucketAdmin(env: Env = process.env): BucketAdmin | null {
  const credentials = storeCredentials(env);
  if (!credentials) return null;
  return createClient(credentials.url, credentials.key, { auth: { persistSession: false } }).storage;
}
