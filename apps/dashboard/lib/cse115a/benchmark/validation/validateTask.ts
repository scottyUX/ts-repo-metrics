// Puts the validation pieces together for one benchmark row: which test files the test patch
// touches, which pre-existing tests it modified, the three-state runs, the comparison, and the
// result record the script prints. Everything that needs git or Docker is passed in, so this
// module is tested with FakeSuiteRunner and in-memory file contents.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md.

import { compareRuns, type Comparison } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { installPlan, type Environment, type Unsupported } from "@/lib/cse115a/benchmark/validation/environment";
import { containerScript, InstallError, runThreeStates, type RunPlan, type SuiteRunner, type ThreeStates } from "@/lib/cse115a/benchmark/validation/runner";
import { harborEnvFrom, type HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";
import type { RebuildProvenance } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import { modifiedTests, unmatchedStaticIds } from "@/lib/cse115a/benchmark/validation/testIds";
import { untestedFiles, type ReadFile } from "@/lib/cse115a/benchmark/validation/untestedFiles";

/** The fields of a benchmark row the validator reads. */
export type TaskRow = {
  instance_id: string;
  repo: string;
  base_commit: string;
  patch: string;
  test_patch: string;
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
  /** Set on a row staff rebuilt from its PR's merge commit (rebuildRow.ts); absent on captured rows. */
  rebuild?: RebuildProvenance;
};

/**
 * What a rebuilt row's result carries for write-back: the provenance plus the rebuilt base and
 * patches, since write-back reads only results. The student-captured originals are identified by
 * `original_base_commit` and the two hashes.
 */
export type RebuildRecord = RebuildProvenance & { base_commit: string; patch: string; test_patch: string };

/** The result with the row's rebuild record attached, or unchanged for a captured row. */
export function withRebuild<T extends { rebuild?: RebuildRecord }>(result: T, row: TaskRow): T {
  if (!row.rebuild) return result;
  return { ...result, rebuild: { ...row.rebuild, base_commit: row.base_commit, patch: row.patch, test_patch: row.test_patch } };
}

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
 * Files the patch adds or modifies, by their new path; deletions are left out. `filesInPatch` reads
 * the `+++` lines, which a pure rename (no content change) does not have, so such a block's
 * `rename to` path is added here.
 */
export function changedFilesInPatch(patch: string): string[] {
  const files: string[] = [];
  for (const block of patch.split(/^(?=diff --git )/m)) {
    const written = filesInPatch(block);
    if (written.length) files.push(...written);
    else if (!/^deleted file mode /m.test(block)) {
      const renamed = /^rename to (.+)$/m.exec(block);
      if (renamed) files.push(renamed[1].trim());
    }
  }
  return [...new Set(files)];
}

/** The file part of a test id (`file::describe > test` → `file`). */
export function fileOfTestId(id: string): string {
  const at = id.indexOf("::");
  return at < 0 ? id : id.slice(0, at);
}

/** Proving ids (F2P + A2P) whose file is not one the test patch writes. */
export function proofOutsideTestPatch(proving: string[], testFiles: string[]): string[] {
  const touched = new Set(testFiles);
  return proving.filter((id) => !touched.has(fileOfTestId(id))).sort();
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

/** Every reason a row can be rejected. The first three come from the runs, the rest from before them. */
export type ValidationReason =
  | Comparison["reason"]
  | "env_unsupported"
  /** The row has an empty `patch`: nothing to validate. */
  | "no_source_patch"
  /** The row has an empty `test_patch`: nothing can prove the fix. */
  | "no_test_patch"
  /** A container run or the git plumbing failed; the environment, not the student. */
  | "env_error";

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
  /**
   * FAIL_TO_PASS and ABSENT_TO_PASS ids whose file the test patch did not touch: the fix also made a
   * pre-existing failing test pass. Diagnostic, not a rejection; the write-back carries it as the
   * `proof_outside_test_patch` flag so a reviewer can check the task is not proven only by accident.
   */
  proof_outside_test_patch: string[];
  validation_status: "validated" | "rejected";
  reason: ValidationReason;
  detail: string | null;
  timings: Record<string, number>;
  /** Set by the batch: the exact image bytes (`node:24-bookworm@sha256:…`) and the snapshot bundle path. */
  image_digest?: string | null;
  snapshot_bundle?: string | null;
  /** What the repository's tests seem to need beyond Node (from the census rules); informational. */
  signals?: { database: string[]; browser: string[]; otherRunners: string[] };
  /** Directories dependencies were installed in, in order ("" is the root). Also in `eval_script`. */
  install_dirs?: string[];
  /** Where the Node version came from (`from .nvmrc`, `from CI`, `default`); absent for Python. Also in `eval_script`. */
  node_source?: string;
  /**
   * Test-patch files that failed to load in R2, after the fix: a harness problem (a missing
   * install, a wrong Node) more often than a student one. Does not change the verdict; the
   * detail says so and the batch summary shows it next to the reason.
   */
  test_files_never_loaded?: string[];
  /** Present when the row was rebuilt by staff: write-back replaces base_commit, patch and test_patch with these. */
  rebuild?: RebuildRecord;
  /** Database containers each run had, from the repository's CI; absent when none. Also in `eval_script`. */
  services?: Array<{ name: string; image: string; env: Record<string, string>; database_url: string; schema_command: string | null }>;
  /**
   * The Harbor recipe for this environment (harbor.ts), absent when no environment was detected. The
   * batch puts the image digest in it; write-back stores it on validated rows as `harbor_env`.
   */
  harbor_env?: HarborEnv;
  /**
   * Where the batch got the code: `github` (the clone in `repos/`) or `snapshot` (the row's bundle,
   * because cloning or fetching base_commit failed; `detail` then carries that failure). Absent for a
   * row that never reached the repository (preflight, a clone failure with no bundle) and for results
   * written before the field existed.
   */
  repo_source?: "github" | "snapshot";
  /**
   * Validated rows only, present only when non-empty: code files the source patch changes that no
   * proving test file reaches through imports (untestedFiles.ts). Diagnostic, not a rejection; the
   * write-back carries it as the `untested_files` flag.
   */
  untested_files?: string[];
};

/** The result for a repository the validator cannot run (bun, mocha, no package.json). */
export function unsupportedResult(row: TaskRow, env: Unsupported): ValidationResult {
  return {
    instance_id: row.instance_id,
    image: null, eval_script: null, log_parser: null, package_dir: null,
    test_files: filesInPatch(row.test_patch),
    FAIL_TO_PASS: [], ABSENT_TO_PASS: [], PASS_TO_PASS: [], FAIL_TO_FAIL: [],
    regressions: [], regression_skips: [], flaky: [], skipped: [], judged_from_base: [], load_failures: [],
    modified_tests: [], unmatched_static_ids: [], proof_outside_test_patch: [],
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
  /**
   * Runs `fn` with a reader on the post-fix tree (base + test_patch + patch), for `untested_files`;
   * called only for a validated result. Absent (as in most tests): the field is not computed.
   */
  withPostFixTree?: <T>(fn: (read: ReadFile) => Promise<T>) => Promise<T>;
};

/** Which report formats the environment's runners produce, e.g. `vitest-json` or `pytest-json`. */
function logParser(env: Environment): string {
  return env.runners.map((r) => ({ vitest: "vitest-json", jest: "jest-json", "node-test": "node-test-json", pytest: "pytest-json" })[r]).join("+");
}

/** `.nvmrc` → `from .nvmrc`, `CI` → `from CI`, `default` → `default`. */
function nodeSourceLabel(env: Environment): string | null {
  if (!env.nodeSource) return null;
  return env.nodeSource === "default" ? "default" : `from ${env.nodeSource}`;
}

/** The detail for a row whose test-patch files never loaded after the fix. */
export function neverLoadedDetail(files: string[]): string {
  return `test patch file(s) never loaded after the fix: ${files.join(", ")}; check the run log`;
}

/** Runs the three states and shapes the result. Writes nothing anywhere. A failed install is `env_error`. */
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
    installSteps: env.installSteps?.length ? installPlan(env).map((step) => ({ dir: step.cwd, command: step.command })) : [],
    env: env.env,
    image: env.image,
    timeoutSeconds: input.timeoutSeconds,
    services: env.services ?? [],
  };
  const installs = installPlan(env);
  const nodeSource = nodeSourceLabel(env);
  plan.notes = [
    ...(nodeSource ? [`node: ${env.image} (${nodeSource})`] : []),
    `install in: ${installs.map((s) => s.dir || ".").join(", ")}${env.installSteps?.length ? " (from CI)" : ""}`,
  ];
  const provenance = { install_dirs: installs.map((s) => s.dir), ...(nodeSource ? { node_source: nodeSource } : {}), harbor_env: harborEnvFrom(env) };
  const services = env.services?.length
    ? { services: env.services.map((s) => ({ name: s.name, image: s.image, env: s.env, database_url: s.containerDatabaseUrl, schema_command: s.schemaCommand })) }
    : {};
  let runs: ThreeStates;
  try {
    runs = await runThreeStates(plan, input.runner);
  } catch (error) {
    // A failed install is the environment's failure, not a verdict: env_error keeps the row a candidate.
    if (!(error instanceof InstallError)) throw error;
    const empty: ThreeStates = { r0: [], r1: [], r2: [], timings: {} };
    return {
      ...unsupportedResult(row, { supported: false, reason: "env_unsupported", detail: "" }),
      image: env.image,
      eval_script: containerScript(plan, "r2"),
      log_parser: logParser(env),
      package_dir: env.packageDir,
      reason: "env_error",
      detail: error.message,
      ...provenance,
      ...services,
      runs: empty,
    };
  }
  const comparison = compareRuns({ r0: runs.r0, r1: runs.r1, r2: runs.r2, modified: input.modified });
  const allRuns = [...runs.r0, ...runs.r1, ...runs.r2];
  const staticIds = [...new Set([...row.FAIL_TO_PASS, ...row.PASS_TO_PASS])];
  const testFiles = filesInPatch(row.test_patch);
  const neverLoaded = comparison.loadFailures
    .filter((entry) => entry.startsWith("r2 "))
    .map((entry) => entry.slice(3))
    .filter((file) => testFiles.includes(file));
  let detail = neverLoaded.length ? neverLoadedDetail(neverLoaded) : null;
  let untested: string[] = [];
  if (comparison.validationStatus === "validated" && input.withPostFixTree) {
    try {
      const provingTestFiles = [...new Set([...comparison.failToPass, ...comparison.absentToPass].map(fileOfTestId))];
      untested = await input.withPostFixTree((read) =>
        untestedFiles({ changedFiles: changedFilesInPatch(row.patch), provingTestFiles, read, packageDir: env.packageDir }));
    } catch (error) {
      // Diagnostic only: a failed read never changes or rejects the verdict.
      const note = `untested_files not computed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
      detail = detail ? `${detail}; ${note}` : note;
    }
  }
  return {
    instance_id: row.instance_id,
    image: env.image,
    eval_script: containerScript(plan, "r2"),
    log_parser: logParser(env),
    package_dir: env.packageDir,
    test_files: testFiles,
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
    proof_outside_test_patch: proofOutsideTestPatch([...comparison.failToPass, ...comparison.absentToPass], testFiles),
    validation_status: comparison.validationStatus,
    reason: comparison.reason,
    detail,
    timings: runs.timings,
    ...provenance,
    ...(neverLoaded.length ? { test_files_never_loaded: neverLoaded } : {}),
    ...(untested.length ? { untested_files: untested } : {}),
    ...services,
    runs,
  };
}
