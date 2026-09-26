import { splitPatch } from "@/lib/cse115a/diff";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { extractAddedTests } from "./extractTests";
import { identifiersFor, redactPersonalData, scrubPatch, scrubSpec, scrubText } from "./scrubPii";

// Turns one submitted task into a SWE-bench instance. Rows are saved with
// whatever the PR yields; Docker-only fields stay null until validation.
// Personal information is removed here, before the row is stored.

export type BenchmarkInstance = {
  instance_id: string;
  repo: string;
  base_commit: string;
  environment_setup_commit: string;
  created_at: string | null;
  version: string;
  problem_statement: string;
  hints_text: string;
  patch: string;
  test_patch: string;
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
  eval_type: "pass_and_fail";
  image: string | null;
  eval_script: string | null;
  log_parser: string | null;
  difficulty: string | null;
  repo_metrics: unknown;
};

/** The SWE-bench fields, in export order. */
export const SWE_BENCH_FIELDS = [
  "instance_id", "repo", "base_commit", "environment_setup_commit", "created_at", "version",
  "problem_statement", "hints_text", "patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS",
  "eval_type", "image", "eval_script", "log_parser", "difficulty", "repo_metrics",
] as const satisfies readonly (keyof BenchmarkInstance)[];

export type BuildFlag = "base_commit_from_pr_base" | "diff_missing" | "diff_truncated" | "no_test_patch" | "no_source_patch" | "no_tests_found" | "pii_scrubbed_from_patch";

/** SWE-bench Verified difficulty labels, from the student's estimate. */
export function difficultyFor(estimateHours: number | undefined): string | null {
  if (typeof estimateHours !== "number" || !Number.isFinite(estimateHours) || estimateHours <= 0) return null;
  if (estimateHours < 0.25) return "<15 min fix";
  if (estimateHours <= 1) return "15 min - 1 hour";
  if (estimateHours <= 4) return "1-4 hours";
  return ">4 hours";
}

export function instanceId(repoFullName: string, taskId: string): string {
  return `${repoFullName.replace("/", "__")}-${taskId}`;
}

function hintsText(task: TaskSnapshot): string {
  const parts = [task.pr.body.trim(), ...task.comments.map((comment) => comment.body.trim())];
  return parts.filter(Boolean).join("\n\n");
}

/** `studentEmail` is the submitting student's address, used to find and remove their identifiers. */
export function buildInstance(task: TaskSnapshot, assignmentNumber: number, repoMetrics: unknown, studentEmail: string | null = null): { instance: BenchmarkInstance; flags: BuildFlag[] } {
  const ids = identifiersFor(task, studentEmail);
  const split = splitPatch(task.diff);
  const patch = scrubPatch(split.patch, ids);
  const testPatch = scrubPatch(split.testPatch, ids);
  const failToPass = extractAddedTests(testPatch.patch);
  const flags: BuildFlag[] = [];
  if (task.baseCommitSource !== "base_tag") flags.push("base_commit_from_pr_base");
  if (task.diffError || !task.diff) flags.push("diff_missing");
  if (task.diffTruncated) flags.push("diff_truncated");
  if (!split.testPatch) flags.push("no_test_patch");
  if (!split.patch) flags.push("no_source_patch");
  if (split.testPatch && failToPass.length === 0) flags.push("no_tests_found");
  // Scrubbing added lines can change what a test checks, so validation should look at these rows.
  if (patch.changed || testPatch.changed) flags.push("pii_scrubbed_from_patch");
  return {
    instance: {
      instance_id: instanceId(task.repoFullName, task.taskId),
      repo: task.repoFullName,
      base_commit: task.baseCommit,
      environment_setup_commit: task.baseCommit,
      created_at: task.pr.mergedAt,
      version: `sprint-${assignmentNumber}`,
      problem_statement: scrubSpec(task.specMarkdown, ids),
      hints_text: scrubText(hintsText(task), ids),
      patch: patch.patch,
      test_patch: testPatch.patch,
      FAIL_TO_PASS: failToPass,
      PASS_TO_PASS: [],
      eval_type: "pass_and_fail",
      image: null,
      eval_script: null,
      log_parser: null,
      difficulty: difficultyFor(task.spec.estimateHours),
      repo_metrics: redactPersonalData(repoMetrics ?? null, ids),
    },
    flags,
  };
}
