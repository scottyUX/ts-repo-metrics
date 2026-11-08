import { describe, expect, it } from "vitest";
import { rejectedWithoutRun } from "@/lib/cse115a/benchmark/validation/batch";
import { applyWriteback, mergeFlags, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
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
    expect(ops[0]).toMatchObject({ validation_status: "validated", reasonFlag: null, task: { FAIL_TO_PASS: ["a::x", "a::y"], PASS_TO_PASS: ["a::z"], image: "node@sha256:1", log_parser: "node-test-json" } });
    expect(ops[1]).toMatchObject({ validation_status: "rejected", reasonFlag: "validation_reason:no_test_patch", task: null });
  });
});

describe("mergeFlags", () => {
  it("replaces an old reason flag and keeps the others", () => {
    expect(mergeFlags(["no_test_patch", "validation_reason:old"], "validation_reason:new")).toEqual(["no_test_patch", "validation_reason:new"]);
    expect(mergeFlags(["validation_reason:old"], null)).toEqual([]);
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
    expect(lines).toEqual(["v-1: validated, 2 F2P / 1 P2P written", "r-1: rejected (no_test_patch)"]);
  });

  it("stops on the first database error", async () => {
    const fake: WritebackClient = {
      from() { return { select() { return { eq: async () => ({ data: null, error: null }) }; }, update() { return { eq: async () => ({ error: { message: "permission denied" } }) }; } }; },
    };
    await expect(applyWriteback(fake, writebackPlan([validated]))).rejects.toThrow("v-1: cse_benchmark_tasks: permission denied");
  });
});
