// Classifies tests by comparing their results across the three validation states
// (R0 base, R1 base + test_patch, R2 base + test_patch + patch), each run twice.
// failToPass is observed (the test ran and failed without the fix); absentToPass is not (its file
// did not load without the fix). Both prove the fix; the SWE-bench export folds them into one list.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "How tests are classified".
// This module is pure: it takes already-parsed results and never touches Docker or files.

/** Result of one test in one run. A test missing from a run is "absent". */
import { LOAD_FAILURE_SUFFIX } from "@/lib/cse115a/benchmark/validation/testIds";

export type TestStatus = "passed" | "failed" | "skipped";

/** One run of the suite: test id -> status. Ids are `file::describe > test` (see extractTests.ts). */
export type RunResults = Record<string, TestStatus>;

/** The two runs of one state. */
export type StateRuns = [RunResults, RunResults];

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
  validationStatus: "validated" | "rejected";
  reason: "regressions" | "regression_skip" | "no_fail_to_pass" | null;
};

type MergedStatus = TestStatus | "absent";

/**
 * Merges the two runs of one state. A test whose status differs between the runs
 * (including present in one and absent from the other) is flaky and is added to `flaky`.
 */
function mergeState([a, b]: StateRuns, flaky: Set<string>): Map<string, MergedStatus> {
  const merged = new Map<string, MergedStatus>();
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const sa = a[id] ?? "absent";
    const sb = b[id] ?? "absent";
    if (sa !== sb) flaky.add(id);
    else merged.set(id, sa);
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

  for (const id of new Set([...r0.keys(), ...r1.keys(), ...r2.keys()])) {
    if (flaky.has(id) || id.endsWith(LOAD_FAILURE_SUFFIX)) continue;
    const inR1 = statusIn("r1", id);
    const inR0 = statusIn("r0", id);
    const fromBase = inR0 !== "absent" && (inR1 === "skipped" || (inR1 === "absent" && !modified.has(id)));
    const before = fromBase ? inR0 : inR1;
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
  };
  const proven = result.failToPass.length + result.absentToPass.length > 0;
  const reason = result.regressions.length > 0 ? "regressions" : result.regressionSkips.length > 0 ? "regression_skip" : proven ? null : "no_fail_to_pass";
  return { ...result, validationStatus: reason ? "rejected" : "validated", reason };
}