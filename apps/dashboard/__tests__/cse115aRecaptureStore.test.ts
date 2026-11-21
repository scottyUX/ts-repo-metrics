// #418: the Supabase side of the re-capture, against a recording fake client: the column check, the guard
// filters on the backup and snapshot writes, and the repo_copy job requeue. Ids are made up.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertBackupColumn, supabaseRecaptureDb } from "@/lib/cse115a/benchmark/recaptureStore";
import { requeueRepoCopyJob } from "@/lib/cse115a/jobs/supabaseStore";

type Call = { table: string; op: string; values?: unknown; filters: Array<[string, string, unknown]> };

/** Answers each query in turn from `answers` (data rows), recording table, operation and filters. */
function fakeDb(answers: Array<unknown[] | { error: string }>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const query: Record<string, unknown> = {};
      const chain = (name: string) => (...args: unknown[]) => {
        if (name === "update" || name === "upsert") { call.op = name; call.values = args[0]; }
        if (["eq", "is", "in"].includes(name)) call.filters.push([name, args[0] as string, args[1]]);
        return query;
      };
      for (const name of ["select", "update", "upsert", "eq", "is", "in", "limit", "order"]) query[name] = chain(name);
      query.maybeSingle = () => query;
      query.then = (resolve: (value: unknown) => void) => {
        const answer = answers.shift() ?? [];
        resolve(Array.isArray(answer) ? { data: answer.length === 1 && call.op === "select" && "status" in (answer[0] as object) ? answer[0] : answer, error: null } : { data: null, error: { message: answer.error } });
      };
      return query;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const GUARD = { capturedAt: "2026-10-02T00:00:00.000Z", recapturedAt: null };
const SNAPSHOT = { version: 1 as const, capturedAt: GUARD.capturedAt, tasks: [] };

describe("recapture store", () => {
  it("the column check names the migration when the column is missing", async () => {
    const { db } = fakeDb([{ error: "column cse_assignment_submissions.snapshot_before_recapture does not exist" }]);
    await expect(assertBackupColumn(db as never)).rejects.toThrow(/apply migration supabase\/migrations\/20261120000000_cse115a_snapshot_before_recapture\.sql first/);
    const ok = fakeDb([[]]);
    await expect(assertBackupColumn(ok.db as never)).resolves.toBeUndefined();
  });

  it("the backup is written only where null, not superseded, and the snapshot is the one read", async () => {
    const { db, calls } = fakeDb([[{ id: "sub-1" }]]);
    expect(await supabaseRecaptureDb(db).backupSnapshot("sub-1", SNAPSHOT, GUARD)).toBe("written");
    expect(calls[0]).toMatchObject({ table: "cse_assignment_submissions", op: "update", values: { snapshot_before_recapture: SNAPSHOT } });
    expect(calls[0]!.filters).toEqual([
      ["eq", "id", "sub-1"], ["is", "superseded_at", null], ["eq", "snapshot->>capturedAt", GUARD.capturedAt],
      ["is", "snapshot->>recapturedAt", null], ["is", "snapshot_before_recapture", null],
    ]);
  });

  it("no row updated: kept when the guard still holds, guard when it does not", async () => {
    expect(await supabaseRecaptureDb(fakeDb([[], [{ id: "sub-1" }]]).db).backupSnapshot("sub-1", SNAPSHOT, GUARD)).toBe("kept");
    expect(await supabaseRecaptureDb(fakeDb([[], []]).db).backupSnapshot("sub-1", SNAPSHOT, GUARD)).toBe("guard");
  });

  it("the snapshot write is guarded on recapturedAt when one was read", async () => {
    const { db, calls } = fakeDb([[]]);
    expect(await supabaseRecaptureDb(db).writeSnapshot("sub-1", { ...SNAPSHOT, recapturedAt: "now" }, { ...GUARD, recapturedAt: "before" })).toBe(false);
    expect(calls[0]!.filters).toContainEqual(["eq", "snapshot->>recapturedAt", "before"]);
    expect(calls[0]!.filters).toContainEqual(["is", "superseded_at", null]);
  });

  it("requeue: inserted when missing, else a failed or succeeded job reset to queued, else reported", async () => {
    expect(await requeueRepoCopyJob(fakeDb([[{ id: "j" }]]).db, "sub-1")).toBe("inserted");
    const reset = fakeDb([[], [{ id: "j" }]]);
    expect(await requeueRepoCopyJob(reset.db, "sub-1")).toBe("reset");
    expect(reset.calls[1]).toMatchObject({ op: "update", values: expect.objectContaining({ status: "queued", attempts: 0, last_error: null, locked_at: null }) });
    expect(reset.calls[1]!.filters).toContainEqual(["in", "status", ["failed", "succeeded"]]);
    expect(reset.calls[1]!.filters).toContainEqual(["eq", "kind", "repo_copy"]);
    expect(await requeueRepoCopyJob(fakeDb([[], [], [{ status: "running" }]]).db, "sub-1")).toBe("running");
    expect(await requeueRepoCopyJob(fakeDb([[], [], [{ status: "queued" }]]).db, "sub-1")).toBe("already queued");
  });
});
