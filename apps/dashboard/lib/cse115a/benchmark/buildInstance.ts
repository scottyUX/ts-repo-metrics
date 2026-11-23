import { isAiToolPath, parseDiffFiles, splitPatch } from "@/lib/cse115a/diff";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { extractAddedTests } from "./extractTests";
import type { HarborEnv } from "./validation/harbor";
import type { ValidationDetail } from "./validation/writeback";
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
  /**
   * The Harbor recipe the validator's write-back stores (validation/harbor.ts). Not a SWE-bench field:
   * it is not in SWE_BENCH_FIELDS, so the JSONL export never carries it. A capture leaves it null.
   */
  harbor_env?: HarborEnv | null;
  /**
   * What the validator's result says beyond its lists (validation/writeback.ts, validationDetail),
   * stored by write-back on validated rows. Internal, like harbor_env: not in SWE_BENCH_FIELDS, not in
   * the Harbor export. A capture leaves it null.
   */
  validation_detail?: ValidationDetail | null;
};

/** The SWE-bench fields, in export order. */
export const SWE_BENCH_FIELDS = [
  "instance_id", "repo", "base_commit", "environment_setup_commit", "created_at", "version",
  "problem_statement", "hints_text", "patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS",
  "eval_type", "image", "eval_script", "log_parser", "difficulty", "repo_metrics",
] as const satisfies readonly (keyof BenchmarkInstance)[];

export type BuildFlag = "base_commit_from_pr_base" | "base_commit_from_first_commit" | "base_commit_from_merge_base" | "diff_from_merge_commit" | "task_file_not_first" | "task_files_dropped" | "diff_missing" | "diff_truncated" | "no_test_patch" | "no_source_patch" | "no_tests_found" | "pii_scrubbed_from_patch" | "ai_tool_files_dropped" | "pr_holds_two_tasks" | "task_file_from_other_pr"
  /**
   * Never set by buildInstance: the staff re-capture of an old-rule diff (benchmark/recapture.ts) adds it to a validated
   * or rejected source whose new `patch` and `test_patch` are byte-for-byte the stored ones, so the row was kept.
   */
  | "recaptured_same_patch"
  /** Staff chose the PR that holds this task's code (#431): the row is built like a paired task's from that PR. */
  | "work_pr_chosen_by_staff"
  /**
   * Staff added extra PRs for this task's code (#437). The row is still built from the main PR only; the extra PRs
   * are recorded in the source's submission snapshot (snapshotExtraCodePrs in jobs/benchmarkSave.ts).
   */
  | "extra_code_prs";

/** SWE-bench Verified difficulty labels, from the student's estimate. */
export function difficultyFor(estimateHours: number | undefined): string | null {
  if (typeof estimateHours !== "number" || !Number.isFinite(estimateHours) || estimateHours <= 0) return null;
  if (estimateHours < 0.25) return "<15 min fix";
  if (estimateHours <= 1) return "15 min - 1 hour";
  if (estimateHours <= 4) return "1-4 hours";
  return ">4 hours";
}

/** Task files (`docs/tasks/...`): the task text is already the problem statement, so rows leave them out (#382). */
export function isTaskFolderPath(path: string): boolean {
  return /^docs\/tasks\//.test(path);
}

export function instanceId(repoFullName: string, taskId: string): string {
  return `${repoFullName.replace("/", "__")}-${taskId}`;
}

function hintsText(task: TaskSnapshot): string {
  const parts = [task.pr.body.trim(), ...task.comments.map((comment) => comment.body.trim())];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * `studentEmail` is the submitting student's address, used to find and remove their identifiers.
 * `prHoldsTwoTasks`: this task's PR adds more than one task file, so `patch` also holds another task file's work.
 */
export function buildInstance(
  task: TaskSnapshot, assignmentNumber: number, repoMetrics: unknown, studentEmail: string | null = null,
  options: { prHoldsTwoTasks?: boolean } = {},
): { instance: BenchmarkInstance; flags: BuildFlag[] } {
  const ids = identifiersFor(task, studentEmail);
  // AI-tool folders are not the task's work, so the row leaves them out (#384), and nor are task files under
  // docs/tasks/, whose text is already the problem statement (#382). Graders are not affected: they read
  // task.diff, not this row. A diff without such files is split exactly as before.
  const files = parseDiffFiles(task.diff);
  const aiToolFilesDropped = files.some((file) => isAiToolPath(file.path));
  const taskFilesDropped = files.some((file) => isTaskFolderPath(file.path));
  const kept = files.filter((file) => !isAiToolPath(file.path) && !isTaskFolderPath(file.path));
  const split = splitPatch(kept.length < files.length ? kept.map((file) => file.text).join("") : task.diff);
  const patch = scrubPatch(split.patch, ids);
  const testPatch = scrubPatch(split.testPatch, ids);
  const failToPass = extractAddedTests(testPatch.patch);
  const flags: BuildFlag[] = [];
  if (task.baseCommitSource === "pr_base") flags.push("base_commit_from_pr_base");
  if (task.baseCommitSource === "first_commit") flags.push("base_commit_from_first_commit");
  if (task.baseCommitSource === "merge_base") flags.push("base_commit_from_merge_base");
  // A capture after #382 that could not read the merge base: the range before #382, ending at the merge commit.
  if (task.diffEnd === "merge_commit") flags.push("diff_from_merge_commit");
  // A merge-base capture no longer says through its base whether the task file came first, so export reads this
  // flag instead (TASK_FILE_NOT_FIRST_FLAGS): set when neither import's answer nor capture's own says it did, the
  // same rule as gradeProcess. Snapshots on the older rule keep their base flags.
  if (task.baseCommitSource === "merge_base" && task.validation.specCommittedFirst !== true && task.taskFileFirstCommit !== true) {
    flags.push("task_file_not_first");
  }
  if (task.diffError || !task.diff) flags.push("diff_missing");
  if (task.diffTruncated) flags.push("diff_truncated");
  if (!split.testPatch) flags.push("no_test_patch");
  if (!split.patch) flags.push("no_source_patch");
  if (split.testPatch && failToPass.length === 0) flags.push("no_tests_found");
  // Scrubbing added lines can change what a test checks, so validation should look at these rows.
  if (patch.changed || testPatch.changed) flags.push("pii_scrubbed_from_patch");
  if (aiToolFilesDropped) flags.push("ai_tool_files_dropped");
  if (taskFilesDropped) flags.push("task_files_dropped");
  // A shared diff is not one task's work. Export leaves the row out; a later rebuild splits the diff by task.
  if (options.prHoldsTwoTasks) flags.push("pr_holds_two_tasks");
  // The task file came from a separate PR merged after the work. The row is still exportable: the task text
  // and the diff are each complete; the flag says the spec was written or added after the code.
  if (task.taskFilePr) flags.push("task_file_from_other_pr");
  // Staff chose the PR the code comes from (#431); the student submitted another PR, which holds the task file.
  if (task.workPrChoice) flags.push("work_pr_chosen_by_staff");
  // Staff added extra PRs for the code (#437); patch and test_patch are still the main PR's.
  if (task.extraCodePrs?.length) flags.push("extra_code_prs");
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
