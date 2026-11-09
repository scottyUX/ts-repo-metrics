# CSE 115A benchmark: validation pass

Status: in progress (dry run only). Follows step 6 of
`docs/planning/CSE115A_GRADING_BENCHMARK_PLAN.md`.

The benchmark job writes each submitted task to `cse_benchmark_tasks` as a candidate row.
Its `FAIL_TO_PASS` is a static guess: the names of tests added in `test_patch`, found by
`lib/cse115a/benchmark/extractTests.ts` without running anything. `PASS_TO_PASS`, `image`,
`eval_script`, and `log_parser` are empty. The validation pass runs the tests and replaces the
guess with observed results.

## What it does

For one row, the validator checks out the student's repository at `base_commit` in a clean
container, runs the test suite in three states, and compares each test's result across states.

| State | Working tree | Why |
|---|---|---|
| R0 | repo at `base_commit` | the suite before the task; the baseline for tests that already existed |
| R1 | R0 + `test_patch` | the new tests exist, the fix does not; failures here are candidate `FAIL_TO_PASS` |
| R2 | R1 + `patch` | the fix is in; a candidate that now passes is a real `FAIL_TO_PASS` |

Most of the SWE-bench family runs two states, the test patch alone and the test patch plus the
fix: SWE-bench (arXiv:2310.06770, Appendix A.3, steps a–f), SWE-rebench (arXiv:2505.20411,
§2.3), SWE-rebench V2 (arXiv:2602.23866, §3.3), and SWE-Cycle (arXiv:2605.13139, §3.1, "buggy"
and "fixed" states). Multi-SWE-bench (arXiv:2504.02605, §3.1.4) adds the base commit as a third
state and uses it to reject PRs whose tests behave abnormally across the three. The validator
runs the base state for the same reason: a test that passed at base but produced no result once
the test patch was applied can only be judged against base (see the fallback rule below).

Each state is run three times (`RUNS_PER_STATE` in `compareRuns.ts`). A test whose result differs
between any two runs of the same state is flaky: it is excluded from every list and reported
separately. Repeat counts in the family range
from one (SWE-bench, A.1; Multi-SWE-bench, which states no repeats) to "several" (SWE-bench Pro,
arXiv:2509.16941, §4.3), "multiple" (SWE-rebench, Appendix B.5; ProgramBench, arXiv:2605.03546,
Appendix A.3.4), three (SWE-rebench V2, §3.3), and five or ten (SWE-bench Multimodal,
arXiv:2410.03859, which states both in §2.2 and Appendix B.2). Those benchmarks discard the whole
instance when runs disagree; the validator excludes the disagreeing test and keeps the row, with
the test recorded in `flaky`, because every student row is scarce and the list makes a stricter
export filter possible later. Two runs is the minimum that can detect a disagreement; raising the
count changes only the runner and the `StateRuns` type.

Each test has one of four statuses per run: `passed`, `failed`, `skipped`, or `absent` (it did
not appear in the report, because its file did not exist in that state or failed to load). The
family has no single word for the last case: Multi-SWE-bench calls it `NONE` (§3.1.4), the
SWE-bench paper says a "missing" test counts as a failure (Appendix A.4), its harness has no name
for it and grades a test that is not in the results as failed (`swebench/harness/grading.py`),
and ProgramBench's evaluator records `not_run` (`src/programbench/eval/eval.py`). `skipped` is
tracked as its own status, as Multi-SWE-bench does and the SWE-bench harness does (its
`TestStatus` has `SKIPPED` and `ERROR`; errors are folded into `failed` here).

## How tests are classified

Each test is placed in one list by its status before the fix and after it. "After" is R2.
"Before" is R1, with one fallback: when R1 has no result for a test (absent or skipped) and the
test existed at base, its R0 status stands in. The fallback is what the base state is for. A
pre-existing test whose file stops loading once the test patch is applied, and then fails with
the fix, is a regression hidden from a pure R1 → R2 comparison; this is the transition
Multi-SWE-bench names as abnormal and discards (PASSED→NONE/SKIPPED→FAILED, §3.1.4). A test that
R1 does report is judged from R1, so a pre-existing test the test patch modified still counts as
`FAIL_TO_PASS` when it fails without the fix and passes with it, as in SWE-bench.

The fallback has one condition: R0's result is evidence about the test only if the test patch
did not change that test's body. The validator compares each pre-existing test's source text at
base and at base + `test_patch` (the test files are identical in R1 and R2, since `diff.ts`
splits the two patches by path); a test whose text changed is in `modified`, and when such a
test is absent from R1 it is judged from R1 like a new test: absent→passed is `ABSENT_TO_PASS`,
absent→failed is `FAIL_TO_FAIL`. Without this condition a rewritten test that passed at base in
its old form would be `PASS_TO_PASS` on a result that belongs to a different body. A modified
test that R1 reports as skipped still takes the fallback: it was observed disabled, and a
disabled test that passed at base is a regression whatever else changed in it. Every test whose
"before" status came from R0 is listed in `judged_from_base`, and every test in `modified` is
listed in `modified_tests`, so a reviewer can see which classifications rest on the fallback
rather than on an observed R1 result.

| Before | After (R2) | List | Meaning |
|---|---|---|---|
| failed | passed | `FAIL_TO_PASS` | ran and failed without the fix, passes with it; proves the fix |
| absent | passed | `ABSENT_TO_PASS` | its file loads only with the fix, so its failure was never observed; proves the fix |
| passed | passed | `PASS_TO_PASS` | unaffected by the fix; must keep passing |
| passed | failed, absent, or skipped | regression | the change broke, removed, or disabled a passing test |
| failed | absent or skipped | regression | the change broke or disabled a test instead of fixing it |
| failed or absent | failed | `FAIL_TO_FAIL` | still failing with the fix; recorded, not counted |
| skipped | any | skipped | never ran before the fix; never `FAIL_TO_PASS` |
| run a ≠ run b | | flaky | unreliable; excluded |

`FAIL_TO_PASS` and `ABSENT_TO_PASS` are kept apart because they are different evidence. A test
in the first ran without the fix and failed; a test in the second belongs to a file that could not
load without the fix, so every test in that file flips, including any that would pass against a
stub. In Vitest a file stops loading when it imports a module file the fix creates ("Cannot find
module"), or when a statement at the top level of the file calls something the fix adds. A named
import of a function that does not exist yet in an existing module does not stop the file: the
import resolves to `undefined`, the test runs, and it fails with a TypeError, which is an
observed failure and ordinary `FAIL_TO_PASS` (checked with Vitest 4.1.9, the version on the
branch: a file importing a missing module reports status `failed` with no `assertionResults`
and the error in `message`; a file importing a missing name reports every test, the one calling
it as `failed`). Python behaves differently: `from m import name` raises ImportError at import
time, so in SWE-bench a test importing a name the fix adds is the common collection error that
Appendix A.3 discards, while for Vitest the same situation is an observed failure. Both lists
count as proof of the fix for the verdict, and the
SWE-bench-format export folds them into one `FAIL_TO_PASS` column. This is
Multi-SWE-bench's design: FAILED→PASSED and NONE→PASSED are separate buckets (`f2p_tests`,
`n2p_tests`, `report.py` lines 133–138) and either satisfies its "fix something" check. The
SWE-bench harness folds them (absent-before is failed-before: `grading.py` at `b4a4050`,
`test_failed`), but SWE-bench's validation discards any instance whose before-fix log shows an
ImportError or AttributeError (Appendix A.3; `has_attribute_or_import_error`, applied in
`tutorials/validation.ipynb`), and SWE-rebench's benchmark subset requires the same (Appendix
H). Their reason is that a scraped issue rarely names the new interface a test imports, so such
tests reject valid solutions. The course removes that reason: the handout requires the Specs
section to name every function, file and endpoint the tests touch, and the rubric grades it, so
a test importing a name the spec states is fair. The validator therefore keeps these rows and
keeps the distinction visible instead of discarding them.

### Worked example: one file, three tests

An existing test file, `tests/email.test.ts`, has two old tests that pass at base, **A** and
**B**. The task is "accept partner-university emails." The student's fix creates a new source
file, `src/partner.ts`. Their test patch adds `import { isPartnerEmail } from "../src/partner"`
at the top of the file, rewrites **B** to check the new behavior, and adds a new test **C**.

| Run | What happens | A | B | C |
|---|---|---|---|---|
| R0 | file loads against the old code | passed | passed (old body) | doesn't exist |
| R1 | `src/partner.ts` doesn't exist, the import fails, the file never loads | absent | absent | absent |
| R2 | file loads | passed | passed | passed |

R1 and R2 are identical for all three. What is actually known about each without the fix:

| Test | Known without the fix | Label |
|---|---|---|
| **A** untouched old test | it passes: R0 ran this exact code and it passed | `PASS_TO_PASS`, a requirement, not proof |
| **B** rewritten old test | nothing: R0 ran a different body; the new body never ran without the fix | `ABSENT_TO_PASS`, proof |
| **C** new test | nothing: it did not exist without the fix | `ABSENT_TO_PASS`, proof |

C is the normal case; A and B are the two edge cases, and R0 is the only column that separates
them. A is not proof because it was passing before the task existed; counting it would let a
test patch that adds only the import line, and no tests, validate on A alone, and an agent could
resolve that row by creating an empty `src/partner.ts`. With A as `PASS_TO_PASS` that row has no
proof and is rejected with `no_fail_to_pass`. For an agent being graded nothing changes: A must
pass under either label. The fallback is per test, not per file: the new tests in the same file
have no R0 entry and are judged from R1. An untouched old test that fails in R2 is
passed→failed by the fallback, a regression; judged from R1 alone it would be absent→failed,
`FAIL_TO_FAIL`, and the break would be invisible. B's failing variant (absent→failed with the
body changed) is `FAIL_TO_FAIL`, flagged at write-back as task-touched, like a new test that
never passes.

What the family does with this file: Multi-SWE-bench labels A, B and C all NONE→PASSED
(`n2p_tests`), counts each as fixed, and accepts a PR on `n2p` alone (`report.py` lines
107–117), so the import-only test patch becomes a valid instance there; SWE-bench and
SWE-rebench discard the instance on the import error; the two-state benchmarks that know only
"passed" (Pro, SWE-rebench V2, SWE-Cycle) fold A into fail-to-pass. The validator keeps the row
and labels the old tests from the evidence that exists. Details and the "three questions asked
of R0" are in `docs/planning/BENCHMARK_VALIDATION_SURVEY.md`, section 6.

Tests are matched by id (`file::describe > test`), so a renamed existing test appears as one
removed test and one added test: the old id is passed (R0) → absent, a regression by the fallback,
and the new id is judged from its own runs (passed→passed, `PASS_TO_PASS`, when the file loads
at R1; absent→passed, `ABSENT_TO_PASS`, when it does not). The row is rejected with the
regression visible for review rather than guessed to be a rename, because a deleted passing test
looks the same in the logs and is what the rule exists to catch. Every benchmark in the family
matches by name, but none compares against base and none flags a vanished test, so a rename
costs them nothing: the old name silently leaves every list and the new name is labeled from
its own run. The false regression is a cost of this validator's base comparison, accepted so
that a deleted test is never silent. If renames prove common on real rows, the parser that
computes `modified` can recognize one (identical body under a new name); that is a separate
decision.

The row is `validated` when `FAIL_TO_PASS` or `ABSENT_TO_PASS` is non-empty and there are no
regressions, and `rejected` otherwise, with the reason. Both conditions are the family's: SWE-bench discards
candidates with no fail-to-pass test (Appendix A.3), Multi-SWE-bench discards PRs with any
PASSED→FAILED transition and PRs without a FAILED→PASSED one (§3.1.4), SWE-rebench invalidates a
task when a test-patch test that passed before the fix fails after it (§2.3), and SWE-rebench V2
keeps only instances with at least one fail-to-pass test (§3.3).

Two rows of the table are stricter than the family, and deliberately so. A test that disappears
or is skipped after the fix is a regression here; the SWE-bench harness places such a test in no
list (its conversion only iterates tests present after the fix), and Multi-SWE-bench does not flag
it. Student fixes break test files in exactly this way (an import that no longer resolves), and
the course handout forbids weakening a test to make it pass, so the validator treats a vanished
or disabled test as a break and rejects the row with the reason visible rather than dropping the
test silently. Tests that fail both before and after the fix are recorded as `FAIL_TO_FAIL`, the
SWE-bench name for them (Appendix A.3), and do not affect the verdict (SWE-bench, Appendix A.5:
not considered). A row with `FAIL_TO_FAIL` tests is still a well-defined task: a candidate patch
is judged only on `FAIL_TO_PASS` and `PASS_TO_PASS`, and a test in neither list is never
consulted. In open-source repositories the family tolerates such tests because real test files
contain tests that fail in a clean environment for reasons unrelated to the PR (network, optional
dependencies, platform); discarding every instance with one would discard most instances.
SWE-rebench is stricter and invalidates the task when such a test came from the test patch
(§2.3, condition 2). In a student repository a new test that never passes is a stronger signal
than in a large project, so the write-back step will flag a `FAIL_TO_FAIL` test that the task
itself added (absent in R0) separately from a pre-existing failing test; the course's "Tests
pass" criterion already penalizes the student, and the row stays a sound task as long as some
test proves the fix.

Skipped tests get the same treatment as absent ones, with one difference: a skip is never
proof. A skip is a decision written in the test (`it.skip`, `skipIf(...)`), not an observation
about the code, and because the test files are identical in R1 and R2 a test can only be skipped
in one and passing in the other through a runtime condition, exactly the case where nobody can
say what it would have done. Every skipped test is listed in the output under `skipped`.

| R0 | R1 | R2 | What happened | Label here | SWE-bench | Multi-SWE-bench |
|---|---|---|---|---|---|---|
| passed | skipped | skipped | a passing test was turned into `it.skip(` | regression, row rejected; applies even if the body was also rewritten (a disabled test is disabled) | no list | no list, no rule |
| any | skipped | passed | runtime-conditional skip the fix satisfies | `skipped`, never proof; if it was the only proof the row is rejected `no_fail_to_pass` | no list | `s2p`, counted as fixed |
| any | skipped | failed or skipped | already disabled, stays disabled | `skipped`, not counted either way | no list | no list, no rule |
| any | passed | skipped | runtime-conditional skip the fix triggers | regression | no list | no list, no rule |

SWE-bench's list builder has branches only for after-status PASSED and FAILED, so a SKIPPED test
lands in no list (`swebench/metrics/conversion.py`, `convert_log_to_ground_truth`);
Multi-SWE-bench's buckets need `fix == PASS` and its checks need `fix == FAIL`, so SKIP→SKIP
triggers nothing.

The validator runs the whole test suite in every state, not only the test files that
`test_patch` touches. Student suites take seconds, and a fix that breaks a test anywhere in the
repository is exactly what `PASS_TO_PASS` exists to catch. Because the whole suite runs, tests
added by earlier tasks are part of every later task's `PASS_TO_PASS`: the regression check grows
with the repository over the quarter. Each row's lists are still computed from that row's own
runs; nothing is copied between rows.

This follows current practice in the SWE-bench family. Multi-SWE-bench (§3.1.4) runs "the full
test suit[e]" in the three states and says so in contrast to SWE-bench. SWE-rebench V2 (§3.3)
always runs the full project test suite rather than task-specific subsets, and requires a test
command with no file- or target-specific selectors (Appendix A.3.2). A 2025 study
(arXiv:2503.15223, §4.1, Table 1) re-ran every developer test file against patches that three
tools had "resolved" on SWE-bench Verified and found 7.2–8.4% of them, 7.8% pooled, fail the full
suite, an absolute drop of 3.8–5.2 points in resolution rate; its recommendation (§5.1) is to use
all developer tests by default. The other consequence of selecting test files is visible in
SWE-bench Pro v2: 313 of its 642 tasks have an empty `pass_to_pass` list
(`scaleapi/SWE-bench_Pro-os`, `v2/tasks/*/tests/config.json`), so half the benchmark has no
regression check at all.

SWE-bench itself runs only the test files the PR's test patch modified, not the repository's
suite: the paper defines the test set as all tests from files edited in the test patch (Appendix
A.1) and appends their paths to the test command (A.3), and the harness implements this as
`get_test_directives` (also in `swe-bench-tasks/dockerfile_gen/__init__.py`). SWE-bench Lite and
Verified inherit it; SWE-bench Pro runs a selected file list per task (`tests/config.json`);
SWE-rebench (v1) runs the test-patch tests only (§2.3); SWE-bench Multimodal runs the full suite
for some repositories and the touched files for others (Appendix A.3). The touched-files rule is a
cost trade-off for suites that take hours. The files `test_patch` touches are recorded in the
output as `test_files`.

Example from the fixture repo (`email-check-fixture`): the task adds four tests. The static
guess lists all four as `FAIL_TO_PASS`. Execution shows two of them already pass against the
old code, so the verified `FAIL_TO_PASS` has two entries. `PASS_TO_PASS` has three: the two
new tests that pass without the fix, plus one pre-existing test in another file (which
SWE-bench's touched-files rule would not have run).

## Environment

Tests run in a `node:22-bookworm` container with the repository mounted. Dependencies are
installed with `npm ci`; the suite runs with `vitest run --reporter=json`, whose output file
gives each test's `ancestorTitles`, `title`, and `status`. Test IDs are built as
`file::describe > nested > test name`, the same shape `extractTests.ts` produces, with the
container mount prefix removed, so observed results can be matched against the row's static
IDs. Static IDs that match no observed test are reported as `unmatched_static_ids`, never
dropped silently.

The runner follows the package's own `test` script, split on `&&`; segments that are not a
runner (a build, a typecheck) run as written. Three runners are supported:

| Runner | Command | `log_parser` |
|---|---|---|
| Vitest | `npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-<i>.json --passWithNoTests` | `vitest-json` |
| Jest | `npx jest --ci --json --outputFile=$REPORT_DIR/jest-<i>.json --passWithNoTests`, plus the script's own arguments after `jest` (`--config`, test paths) minus `--watch`, `--watchAll`, `--coverage` and `--silent`; leading `NAME=value` assignments are kept | `jest-json` |
| `node --test` | the script's command with `--test-reporter` set to our reporter | `node-test-json` |

With no runner in the script, a `vitest` dependency (else a `jest` one) runs with the default
command above. Jest's `--json` output has the same `testResults[].assertionResults[]` shape as
Vitest's, so both go through one reader; Jest's `pending`, `todo`, `skipped` and `disabled`
count as skipped and `focused` as passed. A file that fails to load (status `failed`, no
assertion results) is recorded as `file::(load)` for either runner. Any other runner is
`env_unsupported`.

The commands used become the row's `eval_script`, the container definition its `image`, and
the JSON reader its `log_parser`. Those three column names and meanings are SWE-bench's, from
its task format (`task.yaml` with `image` and `log_parser`, plus the generated `eval.sh`); the
course app's schema adopted them (`docs/planning/CSE115A_GRADING_BENCHMARK_PLAN.md`). Running
each task in a container is family practice (SWE-bench harness 2.0.0 onward; Multi-SWE-bench
§3.1.3; SWE-rebench V2 §3.3; SWE-bench Pro §3.2). Reading structured test output instead of
parsing console text follows SWE-rebench V2 (§3.2, JUnit XML where the runner supports it) and
SWE-bench Pro (a per-task `parser.py` emitting JSON). The image, install command, test runner,
ID format and mount-prefix rule are this validator's own choices, fixed by the fixture run in
the spike; the ID format matches `extractTests.ts` because the row's static ids are in it.

## Output

The validator prints one JSON object and writes nothing to the database:

```
{ instance_id, image, eval_script, log_parser, test_files,
  FAIL_TO_PASS, ABSENT_TO_PASS, PASS_TO_PASS, FAIL_TO_FAIL, regressions, flaky, skipped,
  judged_from_base, modified_tests, unmatched_static_ids, validation_status, reason, timings }
```

`judged_from_base` lists the tests whose "before" status was taken from R0 because R1 had no
result for them (the fallback above); `modified_tests` lists the pre-existing tests whose source
text the test patch changed. Both are diagnostic and do not affect the verdict by themselves.

## Running it

```sh
npx tsx apps/dashboard/scripts/validateBenchmarkTask.ts --row row.json --repo-dir path/to/repo
```

`row.json` holds one `cse_benchmark_tasks` row (`instance_id`, `repo`, `base_commit`, `patch`,
`test_patch`, `FAIL_TO_PASS`). With no `--repo-dir`, the repository is cloned using
`GITHUB_TOKEN` from the environment.

Where each claim above about another benchmark comes from, with section numbers, is in
`docs/planning/BENCHMARK_VALIDATION_SURVEY.md`.

## Known limitations

- **Renames are false regressions.** A renamed old test is old name passed→absent (regression,
  row rejected) plus new name labeled from its own runs. A deleted test looks identical in the
  logs, and the rule exists to catch deletions, so the validator does not guess. Cost: a rejected
  row a reviewer resolves in seconds, with both names side by side.
- **Unobserved proof is weaker than observed proof.** Every test in a file that only loads with
  the fix counts as `ABSENT_TO_PASS`, including a trivial one that would pass against a stub.
  That is why the two lists stay separate. A row whose only proof is `ABSENT_TO_PASS` has never
  had a test seen failing; write-back should flag it for review (does the spec name the new
  module, do the tests assert behavior). Same exposure as Multi-SWE-bench's `n2p`, minus A.
- **The modification check cannot see dynamic tests.** `it.each`, titles built from variables,
  tests generated in loops: no static id, no body comparison. Treated as unchanged, so the
  fallback applies and a rewritten one is under-claimed. Visible in `judged_from_base`.
- **Two runs catch loud flakiness only.** A test that fails one time in twenty passes both runs
  and gets a label. The family uses one to twenty runs; the count is one constant.
- **Dependency changes live in `patch`, not `test_patch`.** `diff.ts` splits by path, so a new
  dev dependency in `package.json` is part of the fix. If the tests import it, the file cannot
  load at R1: every new test is `ABSENT_TO_PASS`, every old one is in `judged_from_base`. The
  lists show it; whether the Docker runner re-installs per state is a step-3 decision.
- **"Absent" is a property of the file.** Imports belong to a file, so when one import needs the
  fix, every test in the file is absent at R1, including new tests that check old behavior
  ("still accepts ucsc" next to "accepts partner"). Those would pass without the fix but become
  `ABSENT_TO_PASS`: a pass→pass test counted as proof. R0 recovers this for tests that existed at
  base (test A in the worked example), not for new ones. Grading an agent is unaffected, since
  every listed test must pass either way. Two things downstream are misled: the verdict, where a
  row whose only `ABSENT_TO_PASS` tests are of this kind looks proven when nothing checks the new
  behavior (caught by the unobserved-proof flag at write-back); and the labels, where proof counts
  are inflated, which matters for the router, since it trains on them. Seen on a real row: a task
  PR moved an earlier task's test file next to a helper counted as part of the fix, so all of the
  earlier task's tests became `ABSENT_TO_PASS` for the later task.
- **The Specs guarantee is a rubric, not a check.** `ABSENT_TO_PASS` is fair only because the
  spec names the new module. A row with a low Specs grade and all-unobserved proof is the case
  SWE-bench discards; write-back can cross-check the grade.
- **Until the modification check lands**, `modified` is empty and every old test takes the
  fallback: a rewritten old test in an unloadable file is under-claimed as `PASS_TO_PASS`, and
  the row is rejected only if that test was its sole proof. Never a row validated on borrowed
  evidence.

## Not yet

pnpm projects, Python projects, repository snapshots, writing results back to
`cse_benchmark_tasks` and `cse_benchmark_task_sources`, and scheduled runs after each sprint.
Each is a separate change once the dry run is trusted.