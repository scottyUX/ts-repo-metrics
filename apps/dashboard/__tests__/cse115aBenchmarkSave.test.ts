import { describe, expect, it } from "vitest";
import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";
import { planBenchmarkSave, snapshotMergeCommit, type StoredSource } from "@/lib/cse115a/jobs/benchmarkSave";
import type { BenchmarkSave, Submission } from "@/lib/cse115a/jobs/runner";

const NOW = "2026-11-10T00:00:00.000Z";
const M = "96798e0b3120839e06aeee9b6a5b99021aa8bb80";
const ID = "JoKHerre__Bookworm-COL-04-T-4";

const submission = { id: "sub-2", course_id: "course", user_id: "user", assignment_number: 2, status: "submitted", snapshot: { version: 1, capturedAt: NOW, tasks: [] }, superseded_at: null } as Submission;
const instance = { instance_id: ID, base_commit: "d33ab4d", patch: "", test_patch: "" } as BenchmarkInstance;
const save = (mergeCommit: string): BenchmarkSave => ({ slot: 2, instance, flags: ["no_test_patch"], mergeCommit });
const stored = (over: Partial<StoredSource>): StoredSource => ({
  instance_id: ID, assignment_submission_id: "sub-1", task_slot: 2, validation_status: "validated", flags: [], merge_commit: M, ...over,
});

describe("planBenchmarkSave", () => {
  it("keeps a validated instance when the PR's merge commit is unchanged, carrying its status to the new source", () => {
    const plan = planBenchmarkSave(submission, [save(M)], [stored({ flags: ["proof_outside_test_patch"] })], NOW);
    expect(plan.tasks).toEqual([]);
    expect(plan.kept).toEqual([ID]);
    expect(plan.sources).toEqual([{
      instance_id: ID, course_id: "course", user_id: "user", assignment_submission_id: "sub-2", task_slot: 2,
      flags: ["no_test_patch", "proof_outside_test_patch"], updated_at: NOW, validation_status: "validated",
    }]);
  });

  it("keeps a staff-rebuilt instance (and its staff flag) when the merge commit is unchanged", () => {
    const rebuilt = stored({ validation_status: "rejected", flags: ["no_test_patch", "staff_rebuilt:merge-parent", "validation_reason:no_fail_to_pass"] });
    const plan = planBenchmarkSave(submission, [save(M)], [stored({ validation_status: "candidate", assignment_submission_id: "sub-0" }), rebuilt], NOW);
    expect(plan.tasks).toEqual([]);
    expect(plan.sources[0]).toMatchObject({ validation_status: "rejected", flags: ["no_test_patch", "staff_rebuilt:merge-parent", "validation_reason:no_fail_to_pass"] });
  });

  it("captures again and sends the row back to candidate when the merge commit differs (or is unknown)", () => {
    for (const previous of ["0000000000000000000000000000000000000000", null]) {
      const plan = planBenchmarkSave(submission, [save(M)], [stored({ merge_commit: previous, flags: ["staff_rebuilt:merge-parent"] })], NOW);
      expect(plan.tasks).toEqual([{ ...instance, harbor_env: null, validation_detail: null }]);
      expect(plan.kept).toEqual([]);
      expect(plan.sources).toEqual([{
        instance_id: ID, course_id: "course", user_id: "user", assignment_submission_id: "sub-2", task_slot: 2,
        flags: ["no_test_patch"], updated_at: NOW, validation_status: "candidate",
      }]);
    }
  });

  it("writes a brand-new row (or one still a candidate) as today: instance upserted, no status set", () => {
    for (const existing of [[], [stored({ validation_status: "candidate" })]]) {
      const plan = planBenchmarkSave(submission, [save(M)], existing, NOW);
      expect(plan.tasks).toEqual([{ ...instance, harbor_env: null, validation_detail: null }]);
      expect(plan.sources).toEqual([{
        instance_id: ID, course_id: "course", user_id: "user", assignment_submission_id: "sub-2", task_slot: 2, flags: ["no_test_patch"], updated_at: NOW,
      }]);
      expect("validation_status" in plan.sources[0]!).toBe(false);
    }
  });
});

describe("planBenchmarkSave and harbor_env", () => {
  const recipe: HarborEnv = { image: "node:24-bookworm@sha256:1", runners: ["vitest"], package_dir: "", install_steps: [], test_steps: [], env: {}, services: [], node_source: null };
  const withRecipe = (mergeCommit: string): BenchmarkSave => ({ ...save(mergeCommit), instance: { ...instance, harbor_env: recipe } });

  it("an overwrite (changed or new merge commit) sets harbor_env to null with the other validation fields", () => {
    for (const existing of [[stored({ merge_commit: "0000000000000000000000000000000000000000" })], [], [stored({ validation_status: "candidate" })]]) {
      const plan = planBenchmarkSave(submission, [withRecipe(M)], existing, NOW);
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0]!.harbor_env).toBeNull();
      expect("harbor_env" in plan.tasks[0]!).toBe(true);
    }
  });

  it("a guarded row (unchanged merge commit) is not upserted, so its stored harbor_env stays", () => {
    const plan = planBenchmarkSave(submission, [withRecipe(M)], [stored({})], NOW);
    expect(plan.tasks).toEqual([]);
    expect(plan.kept).toEqual([ID]);
  });
});

describe("snapshotMergeCommit", () => {
  it("reads the task's merge commit from a stored snapshot, null when missing", () => {
    expect(snapshotMergeCommit({ tasks: [{ slot: 1, pr: { mergeCommitSha: "a" } }, { slot: 2, pr: { mergeCommitSha: M } }] }, 2)).toBe(M);
    expect(snapshotMergeCommit({ tasks: [] }, 2)).toBeNull();
    expect(snapshotMergeCommit(null, 2)).toBeNull();
  });
});
