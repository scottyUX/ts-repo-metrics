// #452: `writebackValidation.ts --attempts` notes what the validator's last run of each task ended with, as a
// `validation_attempt:<reason>` flag, without changing any verdict. The database is a fake; results, ids and
// repositories are made up.
import { describe, expect, it } from "vitest";
import { rejectedWithoutRun } from "@/lib/cse115a/benchmark/validation/batch";
import { ATTEMPT_REASONS, attemptPlan, attemptReason, mergeAttemptFlag, NEVER_LOADED_REASON, type AttemptClient } from "@/lib/cse115a/benchmark/validation/attempts";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, ATTEMPT_FLAG_PREFIX, isManagedFlag, writebackPlan, type ColumnProbeClient, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import { parseWritebackArgs, runWriteback, type WritebackArgs } from "@/lib/cse115a/benchmark/validation/writebackCli";

const taskRow = (id: string): TaskRow => ({ instance_id: id, repo: "pond-co/duck-app", base_commit: "c", patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] });
const rejectedAs = (id: string, reason: ValidationResult["reason"]) => rejectedWithoutRun(taskRow(id), reason, "x");
const validated: ValidationResult = {
  ...rejectedAs("pond-co__duck-app-US-1-T-1", "env_error"), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["a::x"], PASS_TO_PASS: [], image: "node:24-bookworm", eval_script: "set -e\n", log_parser: "node-test-json",
};
const neverLoaded: ValidationResult = { ...rejectedAs("pond-co__duck-app-US-1-T-8", "no_fail_to_pass"), test_files_never_loaded: ["test/duck.test.ts"] };

type Row = { id: string; instance_id: string; validation_status: string; flags: string[]; updated_at?: string };

/** A fake of cse_benchmark_task_sources and cse_benchmark_tasks that records every update. */
function fakeClient(rows: Row[]) {
  const updates: Array<{ table: string; values: Record<string, unknown>; column: string; value: string }> = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          const query = {
            eq: (column: string, value: string) => Promise.resolve({ data: table === "cse_benchmark_task_sources" ? rows.filter((r) => (r as Record<string, unknown>)[column] === value).map((r) => ({ ...r })) : [], error: null }),
            limit: () => Promise.resolve({ error: null }),
          };
          void columns;
          return query;
        },
        update(values: Record<string, unknown>) {
          return {
            eq: (column: string, value: string) => {
              updates.push({ table, values, column, value });
              if (table === "cse_benchmark_task_sources") for (const r of rows) if ((r as Record<string, unknown>)[column] === value) Object.assign(r, values);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as AttemptClient & WritebackClient & ColumnProbeClient, updates, rows };
}

async function run(argv: string[], results: ValidationResult[], rows: Row[] = []) {
  const fake = fakeClient(rows);
  const out: string[] = [];
  const err: string[] = [];
  let asked = 0;
  await runWriteback(parseWritebackArgs(argv), { results, out: (l) => out.push(l), err: (l) => err.push(l), client: async () => { asked++; return fake.client; } });
  return { ...fake, out, err, asked };
}

describe("the attempt reason", () => {
  it("every reason a result can carry, env_error included; test_file_never_loaded in place of the reason when the test files never loaded", () => {
    for (const reason of ["no_fail_to_pass", "regressions", "regression_skip", "env_unsupported", "env_error", "no_source_patch", "no_test_patch"] as const) {
      expect(attemptReason(rejectedAs("t", reason))).toBe(reason);
      expect(ATTEMPT_REASONS).toContain(reason);
    }
    expect(attemptReason(neverLoaded)).toBe(NEVER_LOADED_REASON);
    expect(attemptReason({ ...neverLoaded, reason: "env_error" })).toBe("test_file_never_loaded");
    expect(attemptReason(validated)).toBeNull();
    expect(attemptReason({ ...validated, test_files_never_loaded: ["x"] })).toBeNull();
  });

  it("is a validator-owned flag, so a verdict write-back replaces it", () => {
    expect(isManagedFlag(`${ATTEMPT_FLAG_PREFIX}env_error`)).toBe(true);
  });

  it("never two attempt flags; every other flag kept", () => {
    expect(mergeAttemptFlag(["no_test_patch", "validation_attempt:env_error", "untested_files", "validation_attempt:regressions"], "validation_attempt:env_unsupported"))
      .toEqual(["no_test_patch", "untested_files", "validation_attempt:env_unsupported"]);
  });

  it("the plan skips validated results and counts them", () => {
    const plan = attemptPlan([validated, rejectedAs("b", "env_error"), neverLoaded]);
    expect(plan.skippedValidated).toBe(1);
    expect(plan.ops).toEqual([
      { instance_id: "b", reason: "env_error", flag: "validation_attempt:env_error" },
      { instance_id: "pond-co__duck-app-US-1-T-8", reason: "test_file_never_loaded", flag: "validation_attempt:test_file_never_loaded" },
    ]);
  });
});

describe("--attempts", () => {
  const results = [validated, rejectedAs("t-env", "env_error"), rejectedAs("t-reg", "regressions"), neverLoaded, rejectedAs("t-done", "no_test_patch"), rejectedAs("t-ok", "regression_skip")];
  const seedRows = (): Row[] => [
    { id: "s-env", instance_id: "t-env", validation_status: "candidate", flags: ["task_files_dropped"], updated_at: "2026-11-01T00:00:00Z" },
    { id: "s-reg", instance_id: "t-reg", validation_status: "candidate", flags: ["no_tests_found", "validation_attempt:env_error"] },
    { id: "s-never", instance_id: "pond-co__duck-app-US-1-T-8", validation_status: "candidate", flags: [] },
    { id: "s-done", instance_id: "t-done", validation_status: "rejected", flags: ["validation_reason:no_test_patch"] },
    { id: "s-ok", instance_id: "t-ok", validation_status: "validated", flags: [] },
    { id: "s-v", instance_id: validated.instance_id, validation_status: "candidate", flags: [] },
  ];

  it("sets the flag on each candidate, writes flags only, and leaves validated and rejected rows alone and reports them", async () => {
    const { rows, updates, out, err } = await run(["--batch", "b", "--attempts"], results, seedRows());
    expect(updates.every((u) => u.table === "cse_benchmark_task_sources" && u.column === "id" && Object.keys(u.values).join() === "flags")).toBe(true);
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get("s-env")).toEqual({ id: "s-env", instance_id: "t-env", validation_status: "candidate", flags: ["task_files_dropped", "validation_attempt:env_error"], updated_at: "2026-11-01T00:00:00Z" });
    // A later --attempts replaces the earlier attempt flag.
    expect(by.get("s-reg")!.flags).toEqual(["no_tests_found", "validation_attempt:regressions"]);
    expect(by.get("s-never")!.flags).toEqual(["validation_attempt:test_file_never_loaded"]);
    expect(by.get("s-done")).toEqual({ id: "s-done", instance_id: "t-done", validation_status: "rejected", flags: ["validation_reason:no_test_patch"] });
    expect(by.get("s-ok")!.flags).toEqual([]);
    // The validated result is skipped, so its candidate row is untouched.
    expect(by.get("s-v")!.flags).toEqual([]);
    expect(updates).toHaveLength(3);
    expect(out).toEqual([
      "t-env: env_error noted",
      "t-reg: regressions noted",
      "pond-co__duck-app-US-1-T-8: test_file_never_loaded noted",
      "t-done: no_test_patch skipped (already rejected)",
      "t-ok: regression_skip skipped (already validated)",
    ]);
    expect(err[0]).toBe("6 result(s), 5 attempt(s) to note (1 validated skipped: write those back without --attempts)");
    expect(err.at(-1)).toBe("3 task(s) noted; source rows skipped: 1 already validated, 1 already rejected.");
  });

  it("--only limits the run", async () => {
    const { rows, out } = await run(["--batch", "b", "--attempts", "--only", "t-env"], results, seedRows());
    expect(out).toEqual(["t-env: env_error noted"]);
    expect(rows.find((r) => r.id === "s-reg")!.flags).toEqual(["no_tests_found", "validation_attempt:env_error"]);
  });

  it("--dry-run prints one line per task and writes nothing; it never asks for a client", async () => {
    const { updates, out, asked, err } = await run(["--batch", "b", "--attempts", "--dry-run"], results, seedRows());
    expect(updates).toEqual([]);
    expect(asked).toBe(0);
    expect(out).toEqual(["t-env: env_error", "t-reg: regressions", "pond-co__duck-app-US-1-T-8: test_file_never_loaded", "t-done: no_test_patch", "t-ok: regression_skip"]);
    expect(err.at(-1)).toContain("Dry run: nothing written.");
  });

  it("one run does one or the other: --attempts never writes a verdict or a task row, and without it nothing is noted", async () => {
    const attempts = await run(["--batch", "b", "--attempts"], results, seedRows());
    expect(attempts.updates.some((u) => u.table === "cse_benchmark_tasks" || "validation_status" in u.values)).toBe(false);
    const verdicts = await run(["--batch", "b"], results, seedRows());
    expect(verdicts.updates.flatMap((u) => (u.values.flags as string[] | undefined) ?? []).some((f) => f.startsWith(ATTEMPT_FLAG_PREFIX))).toBe(false);
    expect(() => parseWritebackArgs(["--batch", "b", "--attempts", "--attempts"])).toThrow("--attempts given twice");
    expect(parseWritebackArgs(["--batch", "b"])).toEqual<WritebackArgs>({ batch: "b", only: [], dryRun: false, mode: "verdicts" });
    expect(parseWritebackArgs(["--batch", "b", "--attempts", "--dry-run", "--only", "x,y"])).toEqual<WritebackArgs>({ batch: "b", only: ["x", "y"], dryRun: true, mode: "attempts" });
  });

  it("a later validated write-back removes the attempt flag; a later rejection replaces it", async () => {
    const rows: Row[] = [
      { id: "s-1", instance_id: "t-1", validation_status: "candidate", flags: ["no_tests_found"] },
      { id: "s-2", instance_id: "t-2", validation_status: "candidate", flags: [] },
    ];
    await run(["--batch", "b", "--attempts"], [rejectedAs("t-1", "env_error"), rejectedAs("t-2", "env_unsupported")], rows);
    expect(rows.map((r) => r.flags)).toEqual([["no_tests_found", "validation_attempt:env_error"], ["validation_attempt:env_unsupported"]]);
    // The verdict write-back reads and writes by instance id, as it always has.
    const byInstance: WritebackClient = {
      from(table) {
        return {
          select: () => ({ eq: async (_c: string, id: string) => ({ data: rows.filter((r) => r.instance_id === id).map((r) => ({ flags: r.flags })), error: null }) }),
          update: (values) => ({ eq: async (_c: string, id: string) => { if (table === "cse_benchmark_task_sources") for (const r of rows) if (r.instance_id === id) Object.assign(r, values); return { error: null }; } }),
        };
      },
    };
    await applyWriteback(byInstance, writebackPlan([{ ...validated, instance_id: "t-1" }, rejectedAs("t-2", "no_fail_to_pass")]), () => "2026-11-24T00:00:00Z");
    expect(rows[0]!.flags).toEqual(["no_tests_found"]);
    expect(rows[1]!.flags).toEqual(["validation_reason:no_fail_to_pass"]);
  });

  it("without --attempts the script runs the verdict write-back as before", async () => {
    const { out, err } = await run(["--batch", "b", "--dry-run"], [validated, rejectedAs("t-reg", "regressions"), rejectedAs("t-env", "env_error")]);
    expect(err[0]).toBe("3 result(s), 2 to write (1 env_error skipped)");
    expect(out).toEqual([
      "pond-co__duck-app-US-1-T-1: validated F2P=1 P2P=0 image=node:24-bookworm, detail: no coverage",
      "t-reg: rejected (validation_reason:regressions)",
    ]);
  });
});
