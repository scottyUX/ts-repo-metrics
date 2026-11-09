import { describe, expect, it } from "vitest";
import { compareRuns, type RunResults, type StateRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";

const T = "tests/US-1-T-1_login_email.test.ts::US-1-T-1 university email check > ";
const SMOKE = "tests/smoke.test.ts::existing behavior > accepts a ucsc.edu email";

/** Both runs of a state identical: the normal, non-flaky case. */
const twice = (run: RunResults): StateRuns => [run, { ...run }];
const thrice = (run: RunResults): StateRuns => [run, { ...run }, { ...run }];

describe("compareRuns on the email-check fixture", () => {
  const r0: RunResults = { [SMOKE]: "passed" };
  const r1: RunResults = {
    [SMOKE]: "passed",
    [T + "US-1-T-1 rejects a non-university email"]: "failed",
    [T + "US-1-T-1 accepts a ucsc.edu email in any case"]: "passed",
    [T + "US-1-T-1 rejects a lookalike domain"]: "failed",
    [T + "US-1-T-1 rejects a string without @"]: "passed",
  };
  // R2 is R1 with the fix applied: the two failing tests now pass.
  const r2: RunResults = {
    ...r1,
    [T + "US-1-T-1 rejects a non-university email"]: "passed",
    [T + "US-1-T-1 rejects a lookalike domain"]: "passed",
  };

  it("finds two FAIL_TO_PASS and three PASS_TO_PASS, and validates the row", () => {
    const result = compareRuns({ r0: twice(r0), r1: twice(r1), r2: twice(r2) });
    expect(result.failToPass).toEqual([
      T + "US-1-T-1 rejects a lookalike domain",
      T + "US-1-T-1 rejects a non-university email",
    ]);
    expect(result.passToPass).toEqual([
      T + "US-1-T-1 accepts a ucsc.edu email in any case",
      T + "US-1-T-1 rejects a string without @",
      SMOKE,
    ]);
    expect(result.absentToPass).toEqual([]);
    expect(result.failToFail).toEqual([]);
    expect(result.regressions).toEqual([]);
    expect(result.regressionSkips).toEqual([]);
    expect(result.flaky).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.judgedFromBase).toEqual([]);
    expect(result.validationStatus).toBe("validated");
    expect(result.reason).toBeNull();
  });

  it("rejects with no_fail_to_pass when nothing flips", () => {
    const result = compareRuns({ r0: twice(r0), r1: twice(r2), r2: twice(r2) });
    expect(result.failToPass).toEqual([]);
    expect(result.validationStatus).toBe("rejected");
    expect(result.reason).toBe("no_fail_to_pass");
  });
});

describe("compareRuns transitions (R1 -> R2)", () => {
  /** One test `t` under study, plus `keep`, which always flips so a rejection is caused by `t`. */
  const base = (id: string, before: RunResults[string] | undefined, after: RunResults[string] | undefined) =>
    compareRuns({
      r0: twice({}),
      r1: twice(before ? { [id]: before, keep: "failed" } : { keep: "failed" }),
      r2: twice(after ? { [id]: after, keep: "passed" } : { keep: "passed" }),
    });

  it("lists absent -> passed as ABSENT_TO_PASS, apart from observed FAIL_TO_PASS", () => {
    const result = base("t", undefined, "passed");
    expect(result.absentToPass).toEqual(["t"]);
    expect(result.failToPass).toEqual(["keep"]);
  });

  it("validates a row whose only proof is ABSENT_TO_PASS (a new file that loads only with the fix)", () => {
    const result = compareRuns({ r0: twice({}), r1: twice({}), r2: twice({ t: "passed" }) });
    expect(result.absentToPass).toEqual(["t"]);
    expect(result.failToPass).toEqual([]);
    expect(result.validationStatus).toBe("validated");
    expect(result.reason).toBeNull();
  });

  it("counts passed -> failed as a regression and rejects the row", () => {
    const result = base("t", "passed", "failed");
    expect(result.regressions).toEqual(["t"]);
    expect(result.validationStatus).toBe("rejected");
    expect(result.reason).toBe("regressions");
  });

  it("counts passed -> absent as a regression and passed -> skipped as a regression_skip", () => {
    expect(base("t", "passed", undefined).regressions).toEqual(["t"]);
    const skip = base("t", "passed", "skipped");
    expect(skip.regressionSkips).toEqual(["t"]);
    expect(skip.regressions).toEqual([]);
    expect(skip.validationStatus).toBe("rejected");
    expect(skip.reason).toBe("regression_skip");
  });

  it("counts failed -> absent as a regression and failed -> skipped as a regression_skip (the fix broke or disabled a test)", () => {
    expect(base("t", "failed", undefined).regressions).toEqual(["t"]);
    expect(base("t", "failed", "skipped").regressionSkips).toEqual(["t"]);
  });

  it("records failed -> failed and absent -> failed as FAIL_TO_FAIL without affecting the verdict", () => {
    for (const before of ["failed", undefined] as const) {
      const result = base("t", before, "failed");
      expect(result.failToFail).toEqual(["t"]);
      expect(result.validationStatus).toBe("validated");
    }
  });

  it("keeps a test that was skipped before the fix in the skipped list, whatever it does after", () => {
    for (const after of ["skipped", "passed", "failed", undefined] as const) {
      const result = base("t", "skipped", after);
      expect(result.skipped).toEqual(["t"]);
      expect(result.failToPass).toEqual(["keep"]);
      expect(result.regressions).toEqual([]);
    }
  });

  it("reports regressions as the reason even when nothing flipped either", () => {
    const result = compareRuns({
      r0: twice({}),
      r1: twice({ t: "passed", u: "failed" }),
      r2: twice({ t: "failed", u: "failed" }),
    });
    expect(result.failToPass).toEqual([]);
    expect(result.regressions).toEqual(["t"]);
    expect(result.reason).toBe("regressions");
  });
});

describe("compareRuns uses R0 when R1 has no result for a pre-existing test", () => {
  it("passed at base, absent with the tests, failed with the fix: a regression hidden by R1", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ keep: "failed" }),
      r2: twice({ t: "failed", keep: "passed" }),
    });
    expect(result.regressions).toEqual(["t"]);
    expect(result.validationStatus).toBe("rejected");
  });

  it("passed at base, absent with the tests, passed with the fix: PASS_TO_PASS, not FAIL_TO_PASS", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ keep: "failed" }),
      r2: twice({ t: "passed", keep: "passed" }),
    });
    expect(result.passToPass).toEqual(["t"]);
    expect(result.failToPass).toEqual(["keep"]);
    expect(result.absentToPass).toEqual([]);
    expect(result.judgedFromBase).toEqual(["t"]);
  });

  it("passed at base, gone in both later states: the change removed a passing test", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ keep: "failed" }),
      r2: twice({ keep: "passed" }),
    });
    expect(result.regressions).toEqual(["t"]);
  });

  it("does not use R0 when R1 has a result: a test modified by the test patch is FAIL_TO_PASS", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ t: "failed" }),
      r2: twice({ t: "passed" }),
    });
    expect(result.failToPass).toEqual(["t"]);
    expect(result.judgedFromBase).toEqual([]);
  });
});

describe("compareRuns does not use R0 for a test the test patch modified", () => {
  it("modified, absent with the tests, passed with the fix: ABSENT_TO_PASS, not PASS_TO_PASS", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ keep: "failed" }),
      r2: twice({ t: "passed", keep: "passed" }),
      modified: new Set(["t"]),
    });
    expect(result.absentToPass).toEqual(["t"]);
    expect(result.passToPass).toEqual([]);
    expect(result.judgedFromBase).toEqual([]);
  });

  it("modified, absent with the tests, failed with the fix: FAIL_TO_FAIL, not a regression", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ keep: "failed" }),
      r2: twice({ t: "failed", keep: "passed" }),
      modified: new Set(["t"]),
    });
    expect(result.failToFail).toEqual(["t"]);
    expect(result.regressions).toEqual([]);
    expect(result.validationStatus).toBe("validated");
  });

  it("modified and skipped with the tests: still a regression_skip against base", () => {
    const result = compareRuns({
      r0: twice({ t: "passed" }),
      r1: twice({ t: "skipped", keep: "failed" }),
      r2: twice({ t: "skipped", keep: "passed" }),
      modified: new Set(["t"]),
    });
    expect(result.regressionSkips).toEqual(["t"]);
    expect(result.judgedFromBase).toEqual(["t"]);
    expect(result.reason).toBe("regression_skip");
  });
});

describe("compareRuns flakiness", () => {
  it("classifies from three agreeing runs exactly as from two", () => {
    const r0: RunResults = { "a::old": "passed" };
    const r1: RunResults = { "a::old": "passed", "a::new": "failed" };
    const r2: RunResults = { "a::old": "passed", "a::new": "passed" };
    expect(compareRuns({ r0: thrice(r0), r1: thrice(r1), r2: thrice(r2) })).toEqual(compareRuns({ r0: twice(r0), r1: twice(r1), r2: twice(r2) }));
  });

  it("excludes a test when one of three runs disagrees, even if the other two agree", () => {
    const steady: RunResults = { "a::new": "passed", "a::old": "passed" };
    const result = compareRuns({
      r0: thrice({ "a::old": "passed" }),
      r1: thrice({ "a::old": "passed", "a::new": "failed" }),
      r2: [steady, steady, { "a::new": "failed", "a::old": "passed" }],
    });
    expect(result.flaky).toEqual(["a::new"]);
    expect(result.failToPass).toEqual([]);
    expect(result.passToPass).toEqual(["a::old"]);
    expect(result.reason).toBe("no_fail_to_pass");
  });

  it("excludes a test whose two runs of the same state disagree, in any state", () => {
    const result = compareRuns({
      r0: [{ a: "passed" }, { a: "failed" }],
      r1: [{ a: "failed", b: "failed", c: "passed" }, { a: "failed", b: "failed" }],
      r2: [{ a: "passed", b: "passed", c: "passed" }, { a: "passed", b: "passed", c: "passed" }],
    });
    expect(result.flaky).toEqual(["a", "c"]);
    expect(result.failToPass).toEqual(["b"]);
    expect(result.passToPass).toEqual([]);
  });
});

describe("compareRuns: a test file that failed to load", () => {
  it("counts the file's tests as failed in that state and never classifies the load pseudo-id", () => {
    const r0: StateRuns = [{}, {}];
    const r1: StateRuns = [{ "tests/x.test.mjs::(load)": "failed" }, { "tests/x.test.mjs::(load)": "failed" }];
    const r2: StateRuns = [{ "tests/x.test.mjs::a": "passed", "tests/x.test.mjs::b": "passed" }, { "tests/x.test.mjs::a": "passed", "tests/x.test.mjs::b": "passed" }];
    const result = compareRuns({ r0, r1, r2 });
    expect(result.failToPass).toEqual(["tests/x.test.mjs::a", "tests/x.test.mjs::b"]);
    expect(result.absentToPass).toEqual([]);
    expect(result.regressions).toEqual([]);
    expect(result.loadFailures).toEqual(["r1 tests/x.test.mjs"]);
    expect(result.validationStatus).toBe("validated");
  });

  it("treats a file that loads before and fails to load after as a regression of its tests", () => {
    const ok = { "tests/y.test.ts::a": "passed" as const };
    const r1: StateRuns = [ok, ok];
    const r2: StateRuns = [{ "tests/y.test.ts::(load)": "failed" }, { "tests/y.test.ts::(load)": "failed" }];
    const result = compareRuns({ r0: [ok, ok], r1, r2 });
    expect(result.regressions).toEqual(["tests/y.test.ts::a"]);
    expect(result.loadFailures).toEqual(["r2 tests/y.test.ts"]);
    expect(result.reason).toBe("regressions");
  });
});
