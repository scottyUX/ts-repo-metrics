// The database side of the staff re-capture (recapture.ts), on the service-role Supabase client. The
// benchmark rows go through the job store's write path, and the repo_copy job through its requeue.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import { requeueRepoCopyJob, supabaseJobStore, writeBenchmarkRows } from "@/lib/cse115a/jobs/supabaseStore";
import { SNAPSHOT_BACKUP_MIGRATION, type RecaptureDb, type SnapshotGuard, type StoredTaskRow } from "./recapture";

const COLUMN = "snapshot_before_recapture";
const PAGE = 100;

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

/** The slice of the client the column check uses, so a test can hand in a fake (as writeback.ts assertColumn). */
export type BackupColumnProbe = {
  from(table: string): { select(columns: string): { limit(count: number): PromiseLike<{ error: { message: string } | null }> } };
};

/** Throws a clear error naming the migration when `cse_assignment_submissions` has no snapshot_before_recapture column. */
export async function assertBackupColumn(client: BackupColumnProbe): Promise<void> {
  const { error } = await client.from("cse_assignment_submissions").select(COLUMN).limit(1);
  if (!error) return;
  if (error.message.includes(COLUMN)) throw new Error(`cse_assignment_submissions has no ${COLUMN} column: apply migration ${SNAPSHOT_BACKUP_MIGRATION} first (${error.message})`);
  throw new Error(`could not check for the ${COLUMN} column: ${error.message}`);
}

/**
 * The guard on a submission row, as filters: not superseded, and its snapshot is the one read (the same
 * `capturedAt`, and the same `recapturedAt`, or none when none was read). `capturedAt` is set once at Submit;
 * `recapturedAt` changes on every apply, so a second apply working from the same read finds no row.
 */
type Filterable = { eq(column: string, value: string): Filterable; is(column: string, value: null): Filterable };
function guarded<Q>(query: Q, id: string, guard: SnapshotGuard): Q {
  const base = (query as unknown as Filterable).eq("id", id).is("superseded_at", null).eq("snapshot->>capturedAt", guard.capturedAt);
  return (guard.recapturedAt === null ? base.is("snapshot->>recapturedAt", null) : base.eq("snapshot->>recapturedAt", guard.recapturedAt)) as unknown as Q;
}

export function supabaseRecaptureDb(db: SupabaseClient): RecaptureDb {
  const jobs = supabaseJobStore(db);
  return {
    assertBackupColumn: () => assertBackupColumn(db),
    async backupSnapshot(id, snapshot, guard) {
      const { data, error } = await guarded(db.from("cse_assignment_submissions").update({ [COLUMN]: snapshot }), id, guard)
        .is(COLUMN, null).select("id");
      check(error, `save ${COLUMN}`);
      if ((data ?? []).length > 0) return "written";
      // No row: either the backup is already there (an earlier apply) or the guard failed.
      const still = await guarded(db.from("cse_assignment_submissions").select("id"), id, guard);
      check(still.error, "read the submission");
      return (still.data ?? []).length > 0 ? "kept" : "guard";
    },
    async writeSnapshot(id, snapshot, guard) {
      const { data, error } = await guarded(db.from("cse_assignment_submissions").update({ snapshot }), id, guard).select("id");
      check(error, "save the new snapshot");
      return (data ?? []).length > 0;
    },
    writeBenchmark: (tasks, sources) => writeBenchmarkRows(db, tasks, sources),
    requeueRepoCopy: (id) => requeueRepoCopyJob(db, id),
    async loadBenchmarkState(instanceIds) {
      const sources: StoredSource[] = [];
      const storedTasks: StoredTaskRow[] = [];
      for (let index = 0; index < instanceIds.length; index += PAGE) {
        const ids = instanceIds.slice(index, index + PAGE);
        const [s, t] = await Promise.all([
          db.from("cse_benchmark_task_sources").select("instance_id,assignment_submission_id,task_slot,validation_status,flags").in("instance_id", ids),
          db.from("cse_benchmark_tasks").select("instance_id,base_commit,patch,test_patch").in("instance_id", ids),
        ]);
        check(s.error, "read stored benchmark sources");
        check(t.error, "read stored benchmark tasks");
        for (const row of (s.data ?? []) as Array<Omit<StoredSource, "merge_commit">>) sources.push({ ...row, flags: row.flags ?? [], merge_commit: null });
        storedTasks.push(...((t.data ?? []) as StoredTaskRow[]));
      }
      return { sources, storedTasks };
    },
    loadRepoMetrics: (id) => jobs.loadRepoMetrics(id),
    loadStudentEmail: (courseId, userId) => jobs.loadStudentEmail(courseId, userId),
  };
}
