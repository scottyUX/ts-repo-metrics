// Puts the validation pieces together for one benchmark row: which test files the test patch
// touches, which pre-existing tests it modified, the three-state runs, the comparison, and the
// result record the script prints. Everything that needs git or Docker is passed in, so this
// module is tested with FakeSuiteRunner and in-memory file contents.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md.

import { compareRuns, type Comparison } from "@/lib/cse115a/benchmark/validation/compareRuns";
import type { Environment, Unsupported } from "@/lib/cse115a/benchmark/validation/environment";
import { containerScript, runThreeStates, type RunPlan, type SuiteRunner, type ThreeStates } from "@/lib/cse115a/benchmark/validation/runner";
import { modifiedTests, unmatchedStaticIds } from "@/lib/cse115a/benchmark/validation/testIds";

/** The fields of a benchmark row the validator reads. */
export type TaskRow = {
  instance_id: string;
  repo: string;
  base_commit: string;
  patch: string;
  test_patch: string;
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
};

/** Files whose "after" side a unified diff writes (`+++ b/<path>`); deleted files are left out. */
export function filesInPatch(patch: string): string[] {
  const files: string[] = [];
  for (const line of patch.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const target = line.slice(4).split("\t")[0].trim();
    if (target === "/dev/null") continue;
    files.push(target.startsWith("b/") ? target.slice(2) : target);
  }
  return files;
}

/**
 * Ids of pre-existing tests whose body the test patch changed, across every file it touches.
 * A file with no base source is new, so nothing in it is "modified".
 */
export function modifiedAcrossFiles(
  files: string[], baseSources: Map<string, string | null>, patchedSources: Map<string, string | null>,
): Set<string> {
  const modified = new Set<string>();
  for (const file of files) {
    const base = baseSources.get(file);
    const patched = patchedSources.get(file);
    if (base == null || patched == null) continue;
    for (const id of modifiedTests(file, base, patched)) modified.add(id);
  }
  return modified;
}

export type ValidationResult = {
  instance_id: string;
  image: string | null;
  eval_script: string | null;
  /** Which report formats the runs produced. */
  log_parser: string | null;
  package_dir: string | null;
  test_files: string[];
  FAIL_TO_PASS: string[];
  ABSENT_TO_PASS: string[];
  PASS_TO_PASS: string[];
  FAIL_TO_FAIL: string[];
  regressions: string[];
  regression_skips: string[];
  flaky: string[];
  skipped: string[];
  judged_from_base: string[];
  /** `state file` for test files that failed to load in a state (tests of that file count as failed there). */
  load_failures: string[];
  modified_tests: string[];
  /** Ids the row's static extraction listed that no run ever reported. */
  unmatched_static_ids: string[];
  validation_status: "validated" | "rejected";
  reason: Comparison["reason"] | "env_unsupported";
  detail: string | null;
  timings: Record<string, number>;
};

/** The result for a repository the validator cannot run (bun, jest, no package.json). */
export function unsupportedResult(row: TaskRow, env: Unsupported): ValidationResult {
  return {
    instance_id: row.instance_id,
    image: null, eval_script: null, log_parser: null, package_dir: null,
    test_files: filesInPatch(row.test_patch),
    FAIL_TO_PASS: [], ABSENT_TO_PASS: [], PASS_TO_PASS: [], FAIL_TO_FAIL: [],
    regressions: [], regression_skips: [], flaky: [], skipped: [], judged_from_base: [], load_failures: [],
    modified_tests: [], unmatched_static_ids: [],
    validation_status: "rejected", reason: env.reason, detail: env.detail, timings: {},
  };
}

export type ValidateInput = {
  row: TaskRow;
  repoDir: string;
  env: Environment;
  /** Pre-existing tests the test patch modified; see `modifiedAcrossFiles`. */
  modified: Set<string>;
  runner: SuiteRunner;
  timeoutSeconds?: number;
};

/** Runs the three states and shapes the result. Writes nothing anywhere. */
export async function validateTask(input: ValidateInput): Promise<ValidationResult & { runs: ThreeStates }> {
  const { row, env } = input;
  const plan: RunPlan = {
    repoDir: input.repoDir,
    baseCommit: row.base_commit,
    patch: row.patch,
    testPatch: row.test_patch,
    installDir: env.installDir,
    installCommand: env.installCommand,
    packageDir: env.packageDir,
    testSteps: env.testSteps.map((step) => step.command),
    env: env.env,
    image: env.image,
    timeoutSeconds: input.timeoutSeconds,
  };
  const runs = await runThreeStates(plan, input.runner);
  const comparison = compareRuns({ r0: runs.r0, r1: runs.r1, r2: runs.r2, modified: input.modified });
  const allRuns = [...runs.r0, ...runs.r1, ...runs.r2];
  const staticIds = [...new Set([...row.FAIL_TO_PASS, ...row.PASS_TO_PASS])];
  return {
    instance_id: row.instance_id,
    image: env.image,
    eval_script: containerScript(plan, "r2"),
    log_parser: env.runners.map((r) => (r === "vitest" ? "vitest-json" : "node-test-json")).join("+"),
    package_dir: env.packageDir,
    test_files: filesInPatch(row.test_patch),
    FAIL_TO_PASS: comparison.failToPass,
    ABSENT_TO_PASS: comparison.absentToPass,
    PASS_TO_PASS: comparison.passToPass,
    FAIL_TO_FAIL: comparison.failToFail,
    regressions: comparison.regressions,
    regression_skips: comparison.regressionSkips,
    flaky: comparison.flaky,
    skipped: comparison.skipped,
    judged_from_base: comparison.judgedFromBase,
    load_failures: comparison.loadFailures,
    modified_tests: [...input.modified].sort(),
    unmatched_static_ids: unmatchedStaticIds(staticIds, allRuns),
    validation_status: comparison.validationStatus,
    reason: comparison.reason,
    detail: null,
    timings: runs.timings,
    runs,
  };
}
