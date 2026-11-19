import "server-only";
// The staff side of a task's stored repo copy (#298) on the review page: which copy a submission's
// task has, and a short-lived signed link to download it. The link comes from Storage and the file
// never passes through the site. The bucket is private with no policies, so only the service-role
// client reaches it. Used by the instructor submission routes only.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NO_COPY, runRecipeFrom, type RepoCopyInfo, type TaskCode } from "@/lib/cse115a/getTheCode";
import { fullSnapshotObject, SNAPSHOT_BUCKET, snapshotReadOrder, storeCredentials, type Env } from "@/lib/cse115a/benchmark/validation/snapshotStore";

/** How long a download link lasts. */
export const DOWNLOAD_LINK_SECONDS = 60;

type StorageErrorLike = { message: string; status?: number; statusCode?: string; originalError?: unknown };

/** The calls made on `client.storage.from(SNAPSHOT_BUCKET)` (@supabase/storage-js 2.97); tests hand in a fake. */
export type CopyFiles = {
  exists(path: string): Promise<{ data: boolean; error: StorageErrorLike | null }>;
  createSignedUrl(path: string, expiresIn: number, options: { download: string }): Promise<{ data: { signedUrl: string } | null; error: StorageErrorLike | null }>;
};

/** The bucket's file calls over the service-role client, or null when the site has no service-role key. */
export function supabaseCopyFiles(env: Env = process.env): CopyFiles | null {
  const credentials = storeCredentials(env);
  if (!credentials) return null;
  return createClient(credentials.url, credentials.key, { auth: { persistSession: false } }).storage.from(SNAPSHOT_BUCKET);
}

function statusOf(error: StorageErrorLike): number | undefined {
  const code = Number(error.statusCode);
  if (Number.isFinite(code) && code > 0) return code;
  if (typeof error.status === "number") return error.status;
  const original = error.originalError as { status?: unknown } | undefined;
  return typeof original?.status === "number" ? original.status : undefined;
}

/**
 * The first object in the reader order (complete `.full`, base-only, legacy) that exists. `exists`
 * answers 400 or 404 for a missing object, as snapshotStore's `has` reads it; any other error throws.
 */
export async function findRepoCopy(files: CopyFiles, instanceId: string, baseCommit: string): Promise<RepoCopyInfo> {
  const full = fullSnapshotObject(instanceId, baseCommit);
  for (const object of snapshotReadOrder(instanceId, baseCommit)) {
    const { data, error } = await files.exists(object);
    if (error && statusOf(error) !== 400 && statusOf(error) !== 404) throw new Error(`Storage: ${error.message}`);
    if (data === true) return { stored: true, object, complete: object === full };
  }
  return NO_COPY;
}

/** A submission slot's benchmark row, found as loadSubmissionCopyTasks finds it (jobs/supabaseStore.ts). */
export type SlotBenchmark = { slot: number; instance_id: string; base_commit: string; harbor_env: unknown };

/** Each slot's benchmark row: the source row for (submission, slot), then the task row for its instance. */
export async function loadSlotBenchmarks(db: SupabaseClient, submissionId: string): Promise<SlotBenchmark[]> {
  const { data: sources, error: sourceError } = await db.from("cse_benchmark_task_sources")
    .select("instance_id,task_slot").eq("assignment_submission_id", submissionId).order("task_slot");
  if (sourceError) throw new Error(`Could not read the submission's benchmark sources: ${sourceError.message}`);
  const slots = (sources ?? []) as Array<{ instance_id: string; task_slot: number }>;
  if (slots.length === 0) return [];
  const { data, error } = await db.from("cse_benchmark_tasks").select("instance_id,base_commit,harbor_env").in("instance_id", slots.map((row) => row.instance_id));
  if (error) throw new Error(`Could not read stored benchmark tasks: ${error.message}`);
  const tasks = (data ?? []) as Array<{ instance_id: string; base_commit: string; harbor_env: unknown }>;
  return slots.flatMap(({ instance_id: id, task_slot: slot }) => tasks
    .filter((task) => task.instance_id === id)
    .map((task) => ({ slot, instance_id: id, base_commit: task.base_commit, harbor_env: task.harbor_env ?? null })));
}

type Log = (line: string) => void;

/**
 * The "Get the code" entry of each slot. A slot with no benchmark row, or whose copy could not be
 * looked up (Storage or database error, no service-role key), is `stored: false`; the error is logged
 * and never fails the page.
 */
export async function taskCodes(db: SupabaseClient, submissionId: string, slots: number[], files: CopyFiles | null, log: Log = console.error): Promise<TaskCode[]> {
  let rows: SlotBenchmark[] = [];
  try {
    rows = await loadSlotBenchmarks(db, submissionId);
  } catch (error) {
    log(`Get the code: submission ${submissionId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Promise.all(slots.map(async (slot): Promise<TaskCode> => {
    const row = rows.find((item) => item.slot === slot);
    if (!row) return { slot, instanceId: null, repoCopy: NO_COPY, runRecipe: null };
    let repoCopy = NO_COPY;
    if (files) {
      try {
        repoCopy = await findRepoCopy(files, row.instance_id, row.base_commit);
      } catch (error) {
        log(`Get the code: submission ${submissionId} slot ${slot}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { slot, instanceId: row.instance_id, repoCopy, runRecipe: runRecipeFrom(row.harbor_env) };
  }));
}
