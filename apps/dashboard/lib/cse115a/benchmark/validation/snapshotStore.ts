// A copy of every snapshot bundle in a private Supabase Storage bucket, so a row whose repository
// has since been deleted or made private can still be validated when the batch folder that holds its
// bundle is gone. Object `<instance_id>.bundle` in bucket `benchmark-snapshots`; only the service-role
// key reads or writes it (no policies). A copy is never overwritten: a row's base commit never
// changes, so the first upload is the copy. The website and the exports never read the bucket.

import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const SNAPSHOT_BUCKET = "benchmark-snapshots";
/** The bucket's file size limit (createSnapshotBucket.ts); a larger bundle stays local only. */
export const SNAPSHOT_SIZE_LIMIT = 50 * 1024 * 1024;
const CONTENT_TYPE = "application/octet-stream";

export type SnapshotStore = {
  has(instanceId: string): Promise<boolean>;
  /** Never overwrites: an object already there is "already stored". Throws on any other failure. */
  upload(instanceId: string, file: string): Promise<"uploaded" | "already stored">;
  /** Writes the object to `file`; false when there is no such object. Throws on any other failure. */
  download(instanceId: string, file: string): Promise<boolean>;
};

export function snapshotObject(instanceId: string): string {
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
};

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
    async has(instanceId) {
      const { data, error } = await files.exists(snapshotObject(instanceId));
      if (error && !isMissing(error)) throw new Error(`Storage: ${error.message}`);
      return data === true;
    },
    async upload(instanceId, file) {
      const { size } = await stat(file);
      if (size > SNAPSHOT_SIZE_LIMIT) throw new Error(`the bundle is ${mb(size)}, over the bucket's ${mb(SNAPSHOT_SIZE_LIMIT)} limit; kept only in this folder`);
      const body = await readFile(file);
      const { error } = await files.upload(snapshotObject(instanceId), body, { contentType: CONTENT_TYPE, upsert: false });
      if (!error) return "uploaded";
      if (isDuplicate(error)) return "already stored";
      throw new Error(`Storage: ${error.message}`);
    },
    async download(instanceId, file) {
      const { data, error } = await files.download(snapshotObject(instanceId));
      if (error) {
        if (isMissing(error)) return false;
        throw new Error(`Storage: ${error.message}`);
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

export type UploadDirReport = { lines: string[]; stored: number; alreadyStored: number; wouldUpload: number; failures: number; notFound: number };

/**
 * uploadSnapshots.ts: every `<dir>/snapshots/*.bundle` (or only the `only` ids) that the store does
 * not have yet is uploaded, one line per file (`stored`, `already stored`, `upload failed: …`), then
 * a count. With `dryRun` nothing is uploaded: each line says `would upload` or `already stored`.
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
    const file = join(folder, snapshotObject(id));
    try {
      if (await store.has(id)) {
        report.alreadyStored++;
        say(`${id}: already stored`);
      } else if (options.dryRun) {
        report.wouldUpload++;
        say(`${id}: would upload (${mb((await stat(file)).size)})`);
      } else if ((await store.upload(id, file)) === "uploaded") {
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
