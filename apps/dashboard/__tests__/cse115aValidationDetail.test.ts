// `cse_benchmark_tasks.validation_detail`: what a validated result says beyond its test lists, copied
// from the result file by write-back, reset with harbor_env on re-capture, and never exported.

import { describe, expect, it } from "vitest";
import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { harborExport } from "@/lib/cse115a/benchmark/exportHarbor";
import { exportJsonl, toJsonlRecord } from "@/lib/cse115a/benchmark/exportJsonl";
import { rejectedWithoutRun, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import type { FixCoverage } from "@/lib/cse115a/benchmark/validation/fixCoverage";
import type { HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import {
  applyWriteback, detailNote, guardedWriteback, VALIDATION_DETAIL_MIGRATION, validationDetail, writebackPlan,
  type ColumnProbeClient, type ValidationDetail, type WritebackClient,
} from "@/lib/cse115a/benchmark/validation/writeback";
import { planBenchmarkSave, type StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { BenchmarkSave, Submission } from "@/lib/cse115a/jobs/runner";

const row = (id: string): TaskRow => ({ instance_id: id, repo: "o/r", base_commit: "c", patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] });

/** The shape of roomie US-3-T-1's coverage run: one file, 76 of 192 executable changed lines run. */
const coverage: FixCoverage = {
  status: "measured", tools: ["vitest 4.1.12 (v8)"],
  files: [{ path: "src/roomie.ts", state: "run", changed_lines: 240, executable: 192, covered: 76, uncovered: "10-40,90-160" }],
  files_changed: 1, files_run: 1, files_not_run: 0, files_not_measured: 0, files_no_code: 0, lines_executable: 192, lines_covered: 76,
};

const validated: ValidationResult = {
  ...rejectedWithoutRun(row("v-1"), "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["a::x"], ABSENT_TO_PASS: ["a::y", "a::w"], PASS_TO_PASS: ["a::z"], flaky: ["a::f"], proof_outside_test_patch: ["b::q"],
  image: "node:24-bookworm", image_digest: "node@sha256:1", eval_script: "set -e\n", log_parser: "vitest-json",
  untested_files: ["src/ui.tsx"], untested_files_source: "coverage", repo_source: "snapshot", snapshot_bundle: "snapshots/v-1.bundle",
  fix_coverage: coverage, validated_at: "2026-11-14T02:50:00.000Z", validator_commit: "d7ff752",
};
/** A result as the batch writes it today: no coverage run, no import-rule list, no time or commit. */
const plain: ValidationResult = (() => {
  const r: ValidationResult = { ...validated, repo_source: "github" };
  for (const key of ["fix_coverage", "untested_files", "untested_files_source", "validated_at", "validator_commit", "snapshot_bundle"] as const) delete r[key];
  return r;
})();
const rejected = rejectedWithoutRun(row("r-1"), "no_fail_to_pass", "x");
const crashed = rejectedWithoutRun(row("e-1"), "env_error", "docker died");

type Call = { table: string; kind: string; columns?: string; values?: Record<string, unknown>; id?: string };

/** A client recording every call; `missing` names a column whose probe fails as PostgREST does. */
function fakeClient(missing: string | null = null): { client: WritebackClient & ColumnProbeClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            limit: async () => {
              calls.push({ table, kind: "probe", columns });
              return { error: columns === missing ? { message: `column cse_benchmark_tasks.${missing} does not exist` } : null };
            },
            eq: async (_c: string, id: string) => { calls.push({ table, kind: "select", columns, id }); return { data: [{ flags: [] }], error: null }; },
          };
        },
        update(values: Record<string, unknown>) {
          return { eq: async (_c: string, id: string) => { calls.push({ table, kind: "update", values, id }); return { error: null }; } };
        },
      };
    },
  };
  return { client: client as WritebackClient & ColumnProbeClient, calls };
}

describe("validation_detail write-back", () => {
  it("1. a validated result with coverage: the planned write holds every field, equal to the result's", async () => {
    const [op] = writebackPlan([validated]);
    const expected: ValidationDetail = {
      fix_coverage: validated.fix_coverage,
      untested_files: ["src/ui.tsx"],
      untested_files_source: "coverage",
      repo_source: "snapshot",
      snapshot_bundle: "snapshots/v-1.bundle",
      counts: { absent_to_pass: 2, flaky: 1, proof_outside_test_patch: 1 },
      validated_at: "2026-11-14T02:50:00.000Z",
      validator_commit: "d7ff752",
    };
    expect(op!.task!.validation_detail).toEqual(expected);
    // Copied, not recomputed: the same coverage object, field for field.
    expect(op!.task!.validation_detail.fix_coverage).toStrictEqual(coverage);
    expect(detailNote(op!.task!.validation_detail)).toBe("detail: 1/1 files, 76/192 lines");

    // The client sends it with the row's task update, and says so in the output line.
    const { client, calls } = fakeClient();
    const lines = await applyWriteback(client, [op!], () => "now");
    const taskUpdate = calls.find((c) => c.table === "cse_benchmark_tasks" && c.kind === "update")!;
    expect(taskUpdate.values!.validation_detail).toEqual(expected);
    expect(calls.filter((c) => c.table === "cse_benchmark_task_sources").every((c) => !c.values || !("validation_detail" in c.values))).toBe(true);
    expect(lines[0]).toContain(", detail: 1/1 files, 76/192 lines");

    // writeback.sql writes the same object and names the migration.
    const sql = writebackSql([validated]);
    expect(sql).toContain(`       validation_detail = $hecate$${JSON.stringify(expected)}$hecate$::jsonb\n where instance_id = $hecate$v-1$hecate$;`);
    expect(sql).toContain(`-- Writes validation_detail: apply ${VALIDATION_DETAIL_MIGRATION} first.`);
  });

  it("2. a validated result without coverage: fix_coverage absent, the rest present", () => {
    const detail = writebackPlan([plain])[0]!.task!.validation_detail;
    expect("fix_coverage" in detail).toBe(false);
    expect("validator_commit" in detail).toBe(false);
    expect(detail).toEqual({
      untested_files: [], untested_files_source: null, repo_source: "github", snapshot_bundle: null,
      counts: { absent_to_pass: 2, flaky: 1, proof_outside_test_patch: 1 }, validated_at: null,
    });
    expect(detailNote(detail)).toBe("detail: no coverage");
  });

  it("3. rejected and env_error rows carry no validation_detail", async () => {
    // Even a rejected result that somehow has a coverage run writes none.
    const results = [{ ...rejected, fix_coverage: coverage }, crashed];
    expect(results.map(validationDetail)).toEqual([null, null]);
    const ops = writebackPlan(results);
    expect(ops.map((o) => o.instance_id)).toEqual(["r-1"]);
    expect(ops[0]!.task).toBeNull();
    const { client, calls } = fakeClient();
    const lines = await applyWriteback(client, ops, () => "now");
    expect(calls.some((c) => c.values && "validation_detail" in c.values)).toBe(false);
    expect(lines[0]).not.toContain("detail:");
    const sql = writebackSql(results);
    expect(sql).not.toContain("validation_detail");
  });

  it("4. a missing column stops the write-back before any write, naming the migration", async () => {
    const { client, calls } = fakeClient("validation_detail");
    await expect(guardedWriteback(client, writebackPlan([validated, rejected]), () => "now"))
      .rejects.toThrow(`cse_benchmark_tasks has no validation_detail column: apply migration ${VALIDATION_DETAIL_MIGRATION} first`);
    expect(calls.map((c) => `${c.kind}:${c.columns}`)).toEqual(["probe:harbor_env", "probe:validation_detail"]);
    expect(calls.some((c) => c.kind === "update")).toBe(false);

    // With the column there, the same call writes.
    const ok = fakeClient();
    await guardedWriteback(ok.client, writebackPlan([validated]), () => "now");
    expect(ok.calls.filter((c) => c.kind === "update")).toHaveLength(2);
  });
});

describe("5. re-capture resets validation_detail with harbor_env", () => {
  const ID = "JoKHerre__Bookworm-COL-04-T-4";
  const M = "96798e0b3120839e06aeee9b6a5b99021aa8bb80";
  const NOW = "2026-11-14T00:00:00.000Z";
  const submission = { id: "sub-2", course_id: "course", user_id: "user", assignment_number: 2, status: "submitted", snapshot: { version: 1, capturedAt: NOW, tasks: [] }, superseded_at: null } as Submission;
  const recipe: HarborEnv = { image: "node@sha256:1", runners: ["vitest"], package_dir: "", install_steps: [], test_steps: [], env: {}, services: [], node_source: null };
  const instance = { instance_id: ID, base_commit: "d33ab4d", patch: "", test_patch: "", harbor_env: recipe, validation_detail: validationDetail(validated) } as BenchmarkInstance;
  const save: BenchmarkSave = { slot: 2, instance, flags: [], mergeCommit: M };
  const stored = (over: Partial<StoredSource>): StoredSource => ({ instance_id: ID, assignment_submission_id: "sub-1", task_slot: 2, validation_status: "validated", flags: [], merge_commit: M, ...over });

  it("a changed PR (or a new row) sets both columns to null; an unchanged PR keeps the row", () => {
    for (const existing of [[stored({ merge_commit: "0000000000000000000000000000000000000000" })], [], [stored({ validation_status: "candidate" })]]) {
      const plan = planBenchmarkSave(submission, [save], existing, NOW);
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0]).toMatchObject({ harbor_env: null, validation_detail: null });
      expect("validation_detail" in plan.tasks[0]!).toBe(true);
    }
    const kept = planBenchmarkSave(submission, [save], [stored({})], NOW);
    expect(kept.tasks).toEqual([]);
    expect(kept.kept).toEqual([ID]);
  });
});

describe("6. exports do not carry validation_detail", () => {
  const SHA = "28e92a1c0ffee0000000000000000000000000ab";
  const recipe: HarborEnv = {
    image: "node:24-bookworm@sha256:8fa9", runners: ["vitest"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }],
    test_steps: [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }],
    env: { CI: "true" }, services: [], node_source: "default",
    gold: { status: "passed", oracle: 1, nop: 0, reason: null, checked_at: "2026-11-11T00:00:00.000Z" },
  };
  const instance: BenchmarkInstance = {
    instance_id: "team__app-ok-1", repo: "team/app", base_commit: SHA, environment_setup_commit: SHA, created_at: "2026-10-01T00:00:00Z", version: "sprint-2",
    problem_statement: "# ok", hints_text: "", patch: "diff --git a/src/a.ts b/src/a.ts\n", test_patch: "diff --git a/src/a.test.ts b/src/a.test.ts\n",
    FAIL_TO_PASS: ["src/a.test.ts::adds"], PASS_TO_PASS: [], eval_type: "pass_and_fail", image: recipe.image, eval_script: "", log_parser: "vitest-json",
    difficulty: null, repo_metrics: null, harbor_env: recipe,
  };
  const withDetail: BenchmarkInstance = { ...instance, validation_detail: validationDetail(validated) };
  const sources = [{ consented: true, validationStatus: "validated" as const }];

  it("JSONL: the same SWE-bench keys and byte-identical lines", () => {
    expect(Object.keys(toJsonlRecord(withDetail))).toEqual(Object.keys(toJsonlRecord(instance)));
    expect(Object.keys(toJsonlRecord(withDetail))).not.toContain("validation_detail");
    const plain = exportJsonl([{ instance, sources }]);
    expect(plain).not.toBe("");
    expect(exportJsonl([{ instance: withDetail, sources }])).toBe(plain);
  });

  it("Harbor: the same files with byte-identical contents, none mentioning validation_detail", () => {
    const plain = harborExport([{ instance, sources }]);
    const detailed = harborExport([{ instance: withDetail, sources }]);
    expect(plain.exported).toEqual(["team__app-ok-1"]);
    expect([...detailed.files.keys()]).toEqual([...plain.files.keys()]);
    for (const [path, contents] of plain.files) expect(detailed.files.get(path)).toBe(contents);
    for (const contents of detailed.files.values()) {
      expect(contents).not.toContain("validation_detail");
      expect(contents).not.toContain("src/ui.tsx");
    }
  });
});
