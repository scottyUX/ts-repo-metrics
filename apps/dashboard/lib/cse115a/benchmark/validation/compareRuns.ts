// Classifies tests by comparing their results across the three validation states
// (R0 base, R1 base + test_patch, R2 base + test_patch + patch), each run RUNS_PER_STATE times.
// failToPass is observed (the test ran and failed without the fix); absentToPass is not (its file
// did not load without the fix). Both prove the fix; the SWE-bench export folds them into one list.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "How tests are classified".
// This module is pure: it takes already-parsed results and never touches Docker or files.

/** Result of one test in one run. A test missing from a run is "absent". */
import { LOAD_FAILURE_SUFFIX } from "@/lib/cse115a/benchmark/validation/testIds";

export type TestStatus = "passed" | "failed" | "skipped";

/** One run of the suite: test id -> status. Ids are `file::describe > test` (see extractTests.ts). */
export type RunResults = Record<string, TestStatus>;

/**
 * How many times each state is run. A test must give the same result in every run of a state to be
 * classified; one disagreement makes it flaky and excludes it. Three runs catch an intermittent test
 * that two would miss about a third of the time (a test that flips with probability p is caught with
 * probability 1-p^2-(1-p)^2 at two runs, more at three).
 */
export const RUNS_PER_STATE = 3;

/** The runs of one state, RUNS_PER_STATE of them in production; tests may pass fewer. */
export type StateRuns = RunResults[];

export type CompareInput = {
  r0: StateRuns;
  r1: StateRuns;
  r2: StateRuns;
  /**
   * Ids of pre-existing tests whose source text the test patch changed. R0 ran a different
   * body for these, so R0 never stands in for a missing R1 result; they are judged from R1
   * like new tests. Computed by the validator from the repo at base and at base + test_patch.
   */
  modified?: Set<string>;
  /**
   * Test files the test patch adds, changes or deletes, by path (renames: the new path only). A
   * base-passing test of such a file that no later state has may have been removed by the test
   * patch; see `removedByTestPatch`. Absent: no test counts as removed, the rule before #458.
   */
  testPatchFiles?: Set<string>;
  /** Test files the test patch deletes. Their tests are removed with them. */
  deletedTestFiles?: Set<string>;
};

export type Comparison = {
  failToPass: string[];
  absentToPass: string[];
  passToPass: string[];
  failToFail: string[];
  regressions: string[];
  /** Regressions whose after-status is skipped: passed or failed before, disabled by the fix (reversible policy). */
  regressionSkips: string[];
  flaky: string[];
  skipped: string[];
  /** Pre-existing tests R1 had no result for; their "before" status came from R0. */
  judgedFromBase: string[];
  /** `state file` for every test file that failed to load in a state; its tests count as failed there. */
  loadFailures: string[];
  /**
   * Tests the test patch removed or renamed: passed at base, reported by no R1 or R2 run, not in
   * `modified`, and in a file the test patch touches that loaded at R2 (or that it deleted). Not
   * regressions; kept so a reviewer can see them.
   */
  removedByTestPatch: string[];
  validationStatus: "validated" | "rejected";
  reason: "regressions" | "regression_skip" | "no_fail_to_pass" | null;
};

type MergedStatus = TestStatus | "absent";

/**
 * Merges the runs of one state. A test whose status differs between any two runs
 * (including present in one and absent from another) is flaky and is added to `flaky`.
 */
function mergeState(runs: StateRuns, flaky: Set<string>): Map<string, MergedStatus> {
  const merged = new Map<string, MergedStatus>();
  if (runs.length === 0) return merged;
  for (const id of new Set(runs.flatMap((run) => Object.keys(run)))) {
    const statuses = runs.map((run) => run[id] ?? "absent");
    if (statuses.some((status) => status !== statuses[0])) flaky.add(id);
    else merged.set(id, statuses[0]!);
  }
  return merged;
}

/**
 * Classifies every test seen in any state by its "before" and "after" status.
 * "After" is R2. "Before" is R1; when R1 has no result for a test (absent or skipped)
 * and the test existed in R0, R0 stands in, so a pre-existing test that the test patch
 * broke or disabled is still judged against how it behaved at base. The one exception:
 * a test in `modified` that is absent from R1 is judged from R1, because its R0 result
 * belongs to the old body. (A modified test R1 reports as skipped was still disabled, so
 * the fallback applies and the skip counts against a test that passed at base.)
 * Only results a run reported count for the fallback: a status implied by a load failure is
 * not one. So when a test's file fails to load at R1, an unmodified test with an R0 result is
 * still judged from R0, and only a test with none (new, rewritten, or unloadable at R0 too)
 * counts as failed at R1 by the load rule.
 */
export function compareRuns(input: CompareInput): Comparison {
  const modified = input.modified ?? new Set<string>();
  const flaky = new Set<string>();
  const states = { r0: mergeState(input.r0, flaky), r1: mergeState(input.r1, flaky), r2: mergeState(input.r2, flaky) };
  const loadFailures: string[] = [];
  const failedFiles = { r0: new Set<string>(), r1: new Set<string>(), r2: new Set<string>() };
  for (const name of ["r0", "r1", "r2"] as const) {
    for (const [id, status] of states[name]) {
      if (!id.endsWith(LOAD_FAILURE_SUFFIX)) continue;
      if (status === "failed") {
        const file = id.slice(0, -LOAD_FAILURE_SUFFIX.length);
        failedFiles[name].add(file);
        loadFailures.push(`${name} ${file}`);
      }
    }
  }
  /** A test absent from a state whose file failed to load there did fail there. */
  const statusIn = (name: keyof typeof states, id: string): MergedStatus =>
    states[name].get(id) ?? (failedFiles[name].has(id.slice(0, id.indexOf("::"))) ? "failed" : "absent");
  const { r0, r1, r2 } = states;

  const failToPass: string[] = [];
  const absentToPass: string[] = [];
  const passToPass: string[] = [];
  const failToFail: string[] = [];
  const regressions: string[] = [];
  const regressionSkips: string[] = [];
  const skipped: string[] = [];
  const judgedFromBase: string[] = [];
  const removedByTestPatch: string[] = [];

  const touched = input.testPatchFiles ?? new Set<string>();
  const deleted = input.deletedTestFiles ?? new Set<string>();
  const fileOf = (id: string) => id.slice(0, id.indexOf("::"));
  /** Every R2 run reported a test of the file and none reported it failing to load. */
  const loadedInR2 = (file: string) =>
    input.r2.length > 0 &&
    input.r2.every((run) =>
      run[file + LOAD_FAILURE_SUFFIX] !== "failed" &&
      Object.keys(run).some((id) => !id.endsWith(LOAD_FAILURE_SUFFIX) && fileOf(id) === file));
  /**
   * Passed at base and gone from every later run, in a file the test patch touched and that loaded
   * after the fix (or that the test patch deleted): the test patch removed or renamed it, so the fix
   * cannot have broken it. A test R1 reported still exists in the patched file and is judged as before.
   */
  const removedByPatch = (id: string) => {
    const file = fileOf(id);
    return states.r0.get(id) === "passed" && !modified.has(id) && touched.has(file) &&
      [...input.r1, ...input.r2].every((run) => !(id in run)) &&
      (deleted.has(file) || loadedInR2(file));
  };

  for (const id of new Set([...r0.keys(), ...r1.keys(), ...r2.keys()])) {
    if (flaky.has(id) || id.endsWith(LOAD_FAILURE_SUFFIX)) continue;
    if (removedByPatch(id)) { removedByTestPatch.push(id); continue; }
    // Real results: what a run reported. statusIn adds what a load failure implies.
    const reportedR1 = r1.get(id);
    const reportedR0 = r0.get(id);
    const fromBase = reportedR0 !== undefined && (reportedR1 === "skipped" || (reportedR1 === undefined && !modified.has(id)));
    const before = fromBase ? reportedR0 : statusIn("r1", id);
    const after = statusIn("r2", id);
    if (fromBase) judgedFromBase.push(id);

    if (before === "skipped") skipped.push(id);
    else if (after === "passed") (before === "passed" ? passToPass : before === "failed" ? failToPass : absentToPass).push(id);
    else if (before === "passed") (after === "skipped" ? regressionSkips : regressions).push(id);
    else if (after === "failed") failToFail.push(id);
    else if (before === "failed") (after === "skipped" ? regressionSkips : regressions).push(id);
    else skipped.push(id);
  }

  const sort = (xs: string[]) => [...xs].sort();
  const result = {
    failToPass: sort(failToPass),
    absentToPass: sort(absentToPass),
    passToPass: sort(passToPass),
    failToFail: sort(failToFail),
    regressions: sort(regressions),
    regressionSkips: sort(regressionSkips),
    flaky: sort([...flaky].filter((id) => !id.endsWith(LOAD_FAILURE_SUFFIX))),
    skipped: sort(skipped),
    judgedFromBase: sort(judgedFromBase),
    loadFailures: sort(loadFailures),
    removedByTestPatch: sort(removedByTestPatch),
  };
  const proven = result.failToPass.length + result.absentToPass.length > 0;
  const reason = result.regressions.length > 0 ? "regressions" : result.regressionSkips.length > 0 ? "regression_skip" : proven ? null : "no_fail_to_pass";
  return { ...result, validationStatus: reason ? "rejected" : "validated", reason };
}