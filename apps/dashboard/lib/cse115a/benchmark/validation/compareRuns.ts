// Classifies tests by comparing their results across the three validation states
// (R0 base, R1 base + test_patch, R2 base + test_patch + patch), each run twice.
// failToPass is observed (the test ran and failed without the fix); absentToPass is not (its file
// did not load without the fix). Both prove the fix; the SWE-bench export folds them into one list.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "How tests are classified".
// This module is pure: it takes already-parsed results and never touches Docker or files.

/** Result of one test in one run. A test missing from a run is "absent". */
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
  const r0 = mergeState(input.r0, flaky);
  const r1 = mergeState(input.r1, flaky);
  const r2 = mergeState(input.r2, flaky);

  const failToPass: string[] = [];
  const absentToPass: string[] = [];
  const passToPass: string[] = [];
  const failToFail: string[] = [];
  const regressions: string[] = [];
  const regressionSkips: string[] = [];
  const skipped: string[] = [];
  const judgedFromBase: string[] = [];

  for (const id of new Set([...r0.keys(), ...r1.keys(), ...r2.keys()])) {
    if (flaky.has(id)) continue;
    const inR1 = r1.get(id) ?? "absent";
    const fromBase = r0.has(id) && (inR1 === "skipped" || (inR1 === "absent" && !modified.has(id)));
    const before = fromBase ? r0.get(id)! : inR1;
    const after = r2.get(id) ?? "absent";
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
    flaky: sort([...flaky]),
    skipped: sort(skipped),
    judgedFromBase: sort(judgedFromBase),
  };
  const proven = result.failToPass.length + result.absentToPass.length > 0;
  const reason = result.regressions.length > 0 ? "regressions" : result.regressionSkips.length > 0 ? "regression_skip" : proven ? null : "no_fail_to_pass";
  return { ...result, validationStatus: reason ? "rejected" : "validated", reason };
}