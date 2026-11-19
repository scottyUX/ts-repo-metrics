import { describe, expect, it } from "vitest";
import { rejectedWithoutRun, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { applyWriteback, assertHarborEnvColumn, HARBOR_ENV_MIGRATION, HARBOR_GOLD_FAILED_FLAG, isManagedFlag, managedFlags, mergeFlags, PROOF_OUTSIDE_FLAG, UNTESTED_FILES_FLAG, writebackPlan, type ColumnProbeClient, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import type { HarborEnv, HarborGold } from "@/lib/cse115a/benchmark/validation/harbor";
import { STAFF_REBUILT_FLAG } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const row = (id: string): TaskRow => ({ instance_id: id, repo: "o/r", base_commit: "c", patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] });
const validated: ValidationResult = {
  ...rejectedWithoutRun(row("v-1"), "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["a::x"], ABSENT_TO_PASS: ["a::y"], PASS_TO_PASS: ["a::z"], image: "node:24-bookworm", image_digest: "node@sha256:1", eval_script: "set -e\n", log_parser: "node-test-json",
};
const rejected = rejectedWithoutRun(row("r-1"), "no_test_patch", "x");
const crashed = rejectedWithoutRun(row("e-1"), "env_error", "docker died");

describe("writebackPlan", () => {
  it("writes lists only for validated rows, flags for rejected ones, nothing for env_error", () => {
    const ops = writebackPlan([validated, rejected, crashed]);
    expect(ops.map((o) => o.instance_id)).toEqual(["v-1", "r-1"]);
    expect(ops[0]).toMatchObject({ validation_status: "validated", reasonFlag: null, flags: [], task: { FAIL_TO_PASS: ["a::x", "a::y"], PASS_TO_PASS: ["a::z"], image: "node@sha256:1", log_parser: "node-test-json" } });
    expect(ops[1]).toMatchObject({ validation_status: "rejected", reasonFlag: "validation_reason:no_test_patch", flags: ["validation_reason:no_test_patch"], task: null });
    expect(writebackPlan([{ ...validated, proof_outside_test_patch: ["b::q"] }])[0]!.flags).toEqual([PROOF_OUTSIDE_FLAG]);
  });
});

describe("mergeFlags", () => {
  it("replaces an old reason flag and keeps the others", () => {
    expect(mergeFlags(["no_test_patch", "validation_reason:old"], "validation_reason:new")).toEqual(["no_test_patch", "validation_reason:new"]);
    expect(mergeFlags(["validation_reason:old"], null)).toEqual([]);
  });

  it("owns the proof_outside_test_patch flag too: dropped when the result no longer has it, added when it does", () => {
    expect(mergeFlags(["no_test_patch", PROOF_OUTSIDE_FLAG, "validation_reason:old"], [])).toEqual(["no_test_patch"]);
    expect(mergeFlags(["no_test_patch"], [PROOF_OUTSIDE_FLAG])).toEqual(["no_test_patch", PROOF_OUTSIDE_FLAG]);
    expect(managedFlags({ ...validated, proof_outside_test_patch: ["b::q"] })).toEqual([PROOF_OUTSIDE_FLAG]);
    expect(managedFlags({ ...rejected, proof_outside_test_patch: ["b::q"] })).toEqual(["validation_reason:no_test_patch", PROOF_OUTSIDE_FLAG]);
    expect(managedFlags(validated)).toEqual([]);
  });
});

describe("applyWriteback", () => {
  it("issues the task update, reads flags, and updates the source row", async () => {
    const calls: Array<{ table: string; kind: string; values?: Record<string, unknown>; id: string }> = [];
    const fake: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async (_c: string, id: string) => { calls.push({ table, kind: "select", id }); return { data: [{ flags: ["no_test_patch", "validation_reason:stale"] }], error: null }; } }; },
          update(values) { return { eq: async (_c: string, id: string) => { calls.push({ table, kind: "update", values, id }); return { error: null }; } }; },
        };
      },
    };
    const lines = await applyWriteback(fake, writebackPlan([validated, rejected]), () => "2026-11-08T12:00:00Z");
    expect(calls.map((c) => `${c.table}:${c.kind}:${c.id}`)).toEqual([
      "cse_benchmark_tasks:update:v-1", "cse_benchmark_task_sources:select:v-1", "cse_benchmark_task_sources:update:v-1",
      "cse_benchmark_task_sources:select:r-1", "cse_benchmark_task_sources:update:r-1",
    ]);
    expect(calls[2].values).toEqual({ validation_status: "validated", flags: ["no_test_patch"], updated_at: "2026-11-08T12:00:00Z" });
    expect(calls[4].values).toEqual({ validation_status: "rejected", flags: ["no_test_patch", "validation_reason:no_test_patch"], updated_at: "2026-11-08T12:00:00Z" });
    expect(lines).toEqual(["v-1: validated, 2 F2P / 1 P2P written, detail: no coverage", "r-1: rejected (no_test_patch)"]);
  });

  it("stops on the first database error", async () => {
    const fake: WritebackClient = {
      from() { return { select() { return { eq: async () => ({ data: null, error: null }) }; }, update() { return { eq: async () => ({ error: { message: "permission denied" } }) }; } }; },
    };
    await expect(applyWriteback(fake, writebackPlan([validated]))).rejects.toThrow("v-1: cse_benchmark_tasks: permission denied");
  });
});

describe("harbor_env write-back", () => {
  const recipe: HarborEnv = { image: "node@sha256:1", runners: ["node-test"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }], test_steps: [], env: { CI: "true" }, services: [], node_source: "default" };
  const withRecipe = { ...validated, harbor_env: recipe };

  it("a validated result writes harbor_env; rejected and env_error results do not touch it", () => {
    const ops = writebackPlan([withRecipe, { ...rejected, harbor_env: recipe }, { ...crashed, harbor_env: recipe }]);
    expect(ops.map((o) => o.instance_id)).toEqual(["v-1", "r-1"]);
    expect(ops[0]!.task!.harbor_env).toEqual(recipe);
    expect(ops[1]!.task).toBeNull();
    // A validated result file from before the recipe existed leaves the column alone.
    expect("harbor_env" in writebackPlan([validated])[0]!.task!).toBe(false);
  });

  it("the client path sends harbor_env in the task update for validated rows only", async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const fake: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async () => ({ data: [{ flags: [] }], error: null }) }; },
          update(values) { updates.push({ table, values }); return { eq: async () => ({ error: null }) }; },
        };
      },
    };
    const lines = await applyWriteback(fake, writebackPlan([withRecipe, { ...rejected, harbor_env: recipe }]), () => "now");
    const taskUpdates = updates.filter((u) => u.table === "cse_benchmark_tasks");
    expect(taskUpdates).toHaveLength(1);
    expect(taskUpdates[0]!.values.harbor_env).toEqual(recipe);
    expect(updates.filter((u) => u.table === "cse_benchmark_task_sources").every((u) => !("harbor_env" in u.values))).toBe(true);
    expect(lines[0]).toContain("with harbor_env");
  });

  it("writeback.sql sets harbor_env for validated rows only and names the migration", () => {
    const sql = writebackSql([withRecipe, { ...rejected, harbor_env: recipe }, { ...rejectedWithoutRun(row("e-2"), "env_error", "x"), harbor_env: recipe }]);
    expect(sql.match(/harbor_env = /g)).toHaveLength(1);
    // No gold check on the result: the recipe is written and a stored harbor_env.gold is kept.
    expect(sql).toContain(`       log_parser = $hecate$node-test-json$hecate$,\n       harbor_env = $hecate$${JSON.stringify(recipe)}$hecate$::jsonb || case when harbor_env ? 'gold' then jsonb_build_object('gold', harbor_env -> 'gold') else '{}'::jsonb end,\n       validation_detail = `);
    expect(sql).toContain(HARBOR_ENV_MIGRATION);
    expect(writebackSql([validated])).not.toContain("harbor_env");
  });

  it("stops with a clear error when the harbor_env column is missing", async () => {
    const probe = (error: { message: string } | null): ColumnProbeClient => ({ from: () => ({ select: () => ({ limit: async () => ({ error }) }) }) });
    await expect(assertHarborEnvColumn(probe(null))).resolves.toBeUndefined();
    await expect(assertHarborEnvColumn(probe({ message: "column cse_benchmark_tasks.harbor_env does not exist" })))
      .rejects.toThrow(`apply migration ${HARBOR_ENV_MIGRATION} first`);
    await expect(assertHarborEnvColumn(probe({ message: "permission denied" }))).rejects.toThrow("could not check for the harbor_env column: permission denied");
  });
});

describe("8. gold check write-back", () => {
  const recipe: HarborEnv = { image: "node@sha256:1", runners: ["node-test"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }], test_steps: [], env: { CI: "true" }, services: [], node_source: "default" };
  const passed: HarborGold = { status: "passed", oracle: 1, nop: 0, reason: null, checked_at: "2026-11-11T10:00:00.000Z" };
  const failed: HarborGold = { status: "failed", oracle: 0, nop: 0, reason: "oracle 0.0", checked_at: "2026-11-11T11:00:00.000Z" };
  const skipped: HarborGold = { status: "skipped", oracle: null, nop: null, reason: "Harbor export for rows with a database service is not built yet", checked_at: "2026-11-11T12:00:00.000Z" };
  /** A validated, staff-rebuilt row whose patch has untested files: the other flags it carries must survive. */
  const rebuilt: ValidationResult = {
    ...validated, harbor_env: recipe, untested_files: ["src/x.ts"],
    rebuild: { rebuilt_from: "merge-parent", merge_commit: "m", original_base_commit: "o", original_patch_sha256: "a", original_test_patch_sha256: "b", base_commit: "b2", patch: "p", test_patch: "t" },
  };
  const withGoldCheck = (r: ValidationResult, gold: HarborGold): ValidationResult => ({ ...r, harbor_gold: gold, harbor_env: { ...r.harbor_env!, gold } });
  /** A capture flag the rebuild keeps (not validator-owned, not made untrue by the rebuild). */
  const CAPTURE = "base_commit_from_pr_base";

  /** An in-memory database: one task row and one source row. */
  function database(flags: string[], harborEnv: HarborEnv | null) {
    const db = { tasks: { harbor_env: harborEnv } as Record<string, unknown>, flags: [...flags] };
    const client: WritebackClient = {
      from(table) {
        return {
          select(columns) {
            return { eq: async () => ({ data: [table === "cse_benchmark_tasks" && columns === "harbor_env" ? { harbor_env: db.tasks.harbor_env as HarborEnv | null } : { flags: db.flags }], error: null }) };
          },
          update(values) {
            return { eq: async () => { if (table === "cse_benchmark_tasks") Object.assign(db.tasks, values); else db.flags = values.flags as string[]; return { error: null }; } };
          },
        };
      },
    };
    return { db, client };
  }

  it("writes harbor_env.gold, adds harbor_gold_failed on a failure and removes it on a later pass, leaving the other flags alone", async () => {
    const { db, client } = database([CAPTURE, UNTESTED_FILES_FLAG, STAFF_REBUILT_FLAG], recipe);
    const failLines = await applyWriteback(client, writebackPlan([withGoldCheck(rebuilt, failed)]), () => "now");
    expect(db.tasks.harbor_env).toEqual({ ...recipe, gold: failed });
    expect(db.flags).toEqual([CAPTURE, STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG, HARBOR_GOLD_FAILED_FLAG]);
    expect(failLines[0]).toMatch(/, gold check failed: oracle 0\.0$/);

    const passLines = await applyWriteback(client, writebackPlan([withGoldCheck(rebuilt, passed)]), () => "now");
    expect(db.tasks.harbor_env).toEqual({ ...recipe, gold: passed });
    expect(db.flags).toEqual([CAPTURE, STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG]);
    expect(passLines[0]).toMatch(/, gold check passed$/);

    const skipLines = await applyWriteback(client, writebackPlan([withGoldCheck(rebuilt, skipped)]), () => "now");
    expect(db.flags).toEqual([CAPTURE, STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG]);
    expect(skipLines[0]).toMatch(/, gold check skipped: Harbor export for rows with a database service is not built yet$/);
  });

  it("a result without a gold check keeps the stored gold (and drops the failed flag); one with a check but no recipe adds it to the stored recipe", async () => {
    const { db, client } = database([HARBOR_GOLD_FAILED_FLAG], { ...recipe, gold: failed });
    const newer = { ...recipe, image: "node@sha256:2" };
    const lines = await applyWriteback(client, writebackPlan([{ ...validated, harbor_env: newer }]), () => "now");
    expect(db.tasks.harbor_env).toEqual({ ...newer, gold: failed });
    expect(db.flags).toEqual([]);
    expect(lines[0]).not.toContain("gold check");

    const noRecipe = database([], recipe);
    await applyWriteback(noRecipe.client, writebackPlan([{ ...validated, harbor_gold: passed }]), () => "now");
    expect(noRecipe.db.tasks.harbor_env).toEqual({ ...recipe, gold: passed });
    const nothingStored = database([], null);
    await applyWriteback(nothingStored.client, writebackPlan([{ ...validated, harbor_gold: passed }]), () => "now");
    expect(nothingStored.db.tasks.harbor_env).toBeNull();
  });

  it("SQL and client agree: the same harbor_env, the same flags", async () => {
    const r = withGoldCheck(rebuilt, failed);
    const { db, client } = database([], recipe);
    await applyWriteback(client, writebackPlan([r]), () => "now");
    const sql = writebackSql([r]);
    expect(sql).toContain(`       harbor_env = $hecate$${JSON.stringify(db.tasks.harbor_env)}$hecate$::jsonb,\n`);
    expect(sql).toContain(`and f <> '${HARBOR_GOLD_FAILED_FLAG}'`);
    expect(sql).toContain(`|| array[$hecate$${UNTESTED_FILES_FLAG}$hecate$, $hecate$${HARBOR_GOLD_FAILED_FLAG}$hecate$, $hecate$${STAFF_REBUILT_FLAG}$hecate$]`);
    expect(db.flags).toEqual([UNTESTED_FILES_FLAG, HARBOR_GOLD_FAILED_FLAG, STAFF_REBUILT_FLAG]);
    expect(isManagedFlag(HARBOR_GOLD_FAILED_FLAG)).toBe(true);
    // A passed check: no flag added, and the filter still removes an old one.
    const passSql = writebackSql([withGoldCheck(rebuilt, passed)]);
    expect(passSql).not.toContain(`$hecate$${HARBOR_GOLD_FAILED_FLAG}$hecate$`);
    expect(passSql).toContain(`and f <> '${HARBOR_GOLD_FAILED_FLAG}'`);
    // A check without a recipe on the result: added to the stored recipe; a null column stays null.
    expect(writebackSql([{ ...validated, harbor_gold: passed }])).toContain(
      `       harbor_env = case when harbor_env is null then null else harbor_env || jsonb_build_object('gold', $hecate$${JSON.stringify(passed)}$hecate$::jsonb) end,\n`);
    // A rejected row never writes gold.
    const rejectedSql = writebackSql([{ ...rejected, harbor_gold: failed }]);
    expect(rejectedSql).not.toContain("harbor_env");
    expect(rejectedSql).not.toContain(`$hecate$${HARBOR_GOLD_FAILED_FLAG}$hecate$`);
  });
});
