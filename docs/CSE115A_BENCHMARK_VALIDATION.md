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
not appear in the report, because its file did not exist in that state or was not collected). A
test file that fails to load (an import that does not resolve, a syntax error) is reported as the
pseudo-id `file::(load)`, recorded in `load_failures`, and its tests count as `failed` in that
state, subject to the base fallback below; the pseudo-id itself is never classified. The
family has no single word for the absent case: Multi-SWE-bench calls it `NONE` (§3.1.4), the
SWE-bench paper says a "missing" test counts as a failure (Appendix A.4), its harness has no name
for it and grades a test that is not in the results as failed (`swebench/harness/grading.py`),
and ProgramBench's evaluator records `not_run` (`src/programbench/eval/eval.py`). `skipped` is
tracked as its own status, as Multi-SWE-bench does and the SWE-bench harness does (its
`TestStatus` has `SKIPPED` and `ERROR`; errors are folded into `failed` here).

## How tests are classified

Each test is placed in one list by its status before the fix and after it. "After" is R2.
"Before" is worked out in this order (`compareRuns.ts`):

1. If R1 reported a result for the test, that result. (If it reported `skipped` and R0 reported a
   result, R0 stands in; see the skip rules below.)
2. Else, if R0 reported a result for the test and the test patch did not modify it, the R0
   result, and the test is listed in `judged_from_base`. This applies even when the test's file
   failed to load at R1.
3. Else, if the test's file failed to load at R1, `failed` (the load rule).
4. Else `absent`.

"Reported" means a status a run produced, not one implied by a load failure. The fallback in
step 2 is what the base state is for. A pre-existing test whose file stops loading once the test
patch is applied, and then fails with the fix, is a regression hidden from a pure R1 → R2
comparison; this is the transition Multi-SWE-bench names as abnormal and discards
(PASSED→NONE/SKIPPED→FAILED, §3.1.4). Step 2 comes before step 3 so that an untouched old test in
such a file is judged by how it really behaved at base, not counted as a failure it never had. A
test that R1 does report is judged from R1, so a pre-existing test the test patch modified still
counts as `FAIL_TO_PASS` when it fails without the fix and passes with it, as in SWE-bench.

The fallback has one condition: R0's result is evidence about the test only if the test patch
did not change that test's body. The validator compares each pre-existing test's source text at
base and at base + `test_patch` (the test files are identical in R1 and R2, since `diff.ts`
splits the two patches by path); a test whose text changed is in `modified`, and when R1 has no
result for such a test it is judged from R1 like a new test: by the load rule when its file failed
to load (failed→passed is `FAIL_TO_PASS`, failed→failed `FAIL_TO_FAIL`), otherwise as absent
(absent→passed is `ABSENT_TO_PASS`, absent→failed `FAIL_TO_FAIL`). Without this condition a
rewritten test that passed at base in its old form would be `PASS_TO_PASS` on a result that
belongs to a different body. A modified test that R1 reports as skipped still takes the
fallback: it was observed disabled, and a disabled test that passed at base is a regression whatever else changed in it. Every test whose
"before" status came from R0 is listed in `judged_from_base`, and every test in `modified` is
listed in `modified_tests`, so a reviewer can see which classifications rest on the fallback
rather than on an observed R1 result.

| Before | After (R2) | List | Meaning |
|---|---|---|---|
| failed | passed | `FAIL_TO_PASS` | failed without the fix (ran and failed, or its file could not load), passes with it; proves the fix |
| absent | passed | `ABSENT_TO_PASS` | no result before the fix although nothing failed to load (not collected, or defined only when the fix is present); proves the fix |
| passed | passed | `PASS_TO_PASS` | unaffected by the fix; must keep passing |
| passed | failed, absent, or skipped | regression | the change broke, removed, or disabled a passing test |
| failed | absent or skipped | regression | the change broke or disabled a test instead of fixing it |
| failed or absent | failed | `FAIL_TO_FAIL` | still failing with the fix; recorded, not counted |
| skipped | any | skipped | never ran before the fix; never `FAIL_TO_PASS` |
| run a ≠ run b | | flaky | unreliable; excluded |

`FAIL_TO_PASS` and `ABSENT_TO_PASS` are kept apart because they are different evidence. A test
in the first failed without the fix: either it ran and failed, or its file could not load and the
test had no base result to fall back on (a new test, or one the test patch rewrote). The second
kind is recorded in `load_failures` (`r1 <file>`), so a reader can tell a test seen failing from
one whose file never loaded; for the second kind every such test in the file flips, including
any that would pass against a stub. A test in `ABSENT_TO_PASS` had no result before the fix and
no load failure explains it: its file was not collected at R1, or the test is defined only when
the fix is present. In Vitest a file stops loading when it imports a module file the fix creates ("Cannot find
module"), or when a statement at the top level of the file calls something the fix adds. A named
import of a function that does not exist yet in an existing module does not stop the file: the
import resolves to `undefined`, the test runs, and it fails with a TypeError, which is an
observed failure and ordinary `FAIL_TO_PASS` (checked with Vitest 4.1.9, the version on the
branch: a file importing a missing module reports status `failed` with no `assertionResults`
and the error in `message`; a file importing a missing name reports every test, the one calling
it as `failed`). Python behaves differently: `from m import name` raises ImportError at import
time, so the file fails to collect (`file::(load)`), and in SWE-bench a test importing a name the
fix adds is the common collection error that Appendix A.3 discards; for Vitest the same situation
is an observed failure. Both lists count as proof of the fix for the verdict, and the
SWE-bench-format export folds them into one `FAIL_TO_PASS` column. Multi-SWE-bench keeps
FAILED→PASSED and NONE→PASSED as separate buckets (`f2p_tests`, `n2p_tests`, `report.py` lines
133–138) and either satisfies its "fix something" check; its NONE→PASSED includes tests whose file
did not load, which the validator places in `FAIL_TO_PASS` with the load failure recorded. The
SWE-bench harness folds them too (absent-before is failed-before: `grading.py` at `b4a4050`,
`test_failed`), but SWE-bench's validation discards any instance whose before-fix log shows an
ImportError or AttributeError (Appendix A.3; `has_attribute_or_import_error`, applied in
`tutorials/validation.ipynb`), and SWE-rebench's benchmark subset requires the same (Appendix
H). Their reason is that a scraped issue rarely names the new interface a test imports, so such
tests reject valid solutions. The course removes that reason: the handout requires the Specs
section to name every function, file and endpoint the tests touch, and the rubric grades it, so
a test importing a name the spec states is fair. The validator therefore keeps these rows and
keeps the distinction visible, in `load_failures`, instead of discarding them.

### Worked example: one file, three tests

An existing test file, `tests/email.test.ts`, has two old tests that pass at base, **A** and
**B**. The task is "accept partner-university emails." The student's fix creates a new source
file, `src/partner.ts`. Their test patch adds `import { isPartnerEmail } from "../src/partner"`
at the top of the file, rewrites **B** to check the new behavior, and adds a new test **C**.

| Run | What happens | A | B | C |
|---|---|---|---|---|
| R0 | file loads against the old code | passed | passed (old body) | doesn't exist |
| R1 | `src/partner.ts` doesn't exist, the import fails, the file never loads (`tests/email.test.ts::(load)`) | no result | no result | no result |
| R2 | file loads | passed | passed | passed |

R1 and R2 are identical for all three: no test in the file reported anything at R1, and the load
failure is recorded as `r1 tests/email.test.ts` in `load_failures`. What is actually known about
each without the fix:

| Test | Known without the fix | Rule | Label |
|---|---|---|---|
| **A** untouched old test | it passes: R0 ran this exact code and it passed | 2, base result; in `judged_from_base` | `PASS_TO_PASS`, a requirement, not proof |
| **B** rewritten old test | its file could not load; R0 ran a different body, so it does not count | 3, load rule | `FAIL_TO_PASS`, proof |
| **C** new test | its file could not load; it did not exist at base | 3, load rule | `FAIL_TO_PASS`, proof |

C is the normal case; A and B are the two edge cases, and R0 is the only column that separates
them. A is not proof because it was passing before the task existed; counting it would let a
test patch that adds only the import line, and no tests, validate on A alone, and an agent could
resolve that row by creating an empty `src/partner.ts`. With A as `PASS_TO_PASS` that row has no
proof and is rejected with `no_fail_to_pass`. For an agent being graded nothing changes: A must
pass under either label. The fallback is per test, not per file: the new tests in the same file
have no R0 entry and take the load rule. An untouched old test that fails in R2 is
passed→failed by the fallback, a regression; judged by the load rule alone it would be
failed→failed, `FAIL_TO_FAIL`, and the break would be invisible. Likewise an untouched old test
that failed at base and passes with the fix is `FAIL_TO_PASS` from its base result. B's failing
variant (load rule failed→failed with the body changed) is `FAIL_TO_FAIL`, flagged at write-back
as task-touched, like a new test that never passes. If the file cannot load at R0 either, no test
in it has a base result, and every test takes the load rule at R1.

What the family does with this file: Multi-SWE-bench labels A, B and C all NONE→PASSED
(`n2p_tests`), counts each as fixed, and accepts a PR on `n2p` alone (`report.py` lines
107–117), so the import-only test patch becomes a valid instance there; SWE-bench and
SWE-rebench discard the instance on the import error; the two-state benchmarks that know only
"passed" (Pro, SWE-rebench V2, SWE-Cycle) fold A into fail-to-pass. The validator keeps the row,
labels B and C as failures it can account for (the load failure is on record), and labels A from
the evidence that exists. Details and the "three questions asked
of R0" are in `docs/planning/BENCHMARK_VALIDATION_SURVEY.md`, section 6.

Tests are matched by id (`file::describe > test`), so a renamed existing test appears as one
removed test and one added test: the old id is passed (R0) → absent, a regression by the fallback,
and the new id is judged from its own runs (passed→passed, `PASS_TO_PASS`, when the file loads
at R1; failed→passed by the load rule, `FAIL_TO_PASS`, when it does not). The row is rejected with the
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

For JavaScript, the runner follows the package's own `test` script, split on `&&`; segments that
are not a runner (a build, a typecheck) run as written. A row whose test files are all Python runs
pytest (below); one whose test files mix Python and JavaScript, or sit in two packages, runs one
suite per language and package (see "More than one test suite"). Four runners are supported:

| Runner | Command | `log_parser` |
|---|---|---|
| Vitest | `npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-<i>.json --passWithNoTests` | `vitest-json` |
| Jest | `npx jest --ci --json --outputFile=$REPORT_DIR/jest-<i>.json --passWithNoTests`, plus the script's own arguments after `jest` (`--config`, test paths) minus `--watch`, `--watchAll`, `--coverage` and `--silent`; leading `NAME=value` assignments are kept | `jest-json` |
| `node --test` | the script's command with `--test-reporter` set to our reporter | `node-test-json` |
| pytest | `python -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors`, with `PYTHONPATH=/patches` and `REPORT=$REPORT_DIR/pytest-0.json`; through `uv run --no-sync` or `poetry run` when that manager owns the environment | `pytest-json` |

With no runner in the script, a `vitest` dependency (else a `jest` one) runs with the default
command above. Jest's `--json` output has the same `testResults[].assertionResults[]` shape as
Vitest's, so both go through one reader; Jest's `pending`, `todo`, `skipped` and `disabled`
count as skipped and `focused` as passed. A file that fails to load (status `failed`, no
assertion results) is recorded as `file::(load)` for either runner. Any other runner is
`env_unsupported`.

**Test files outside any package.** Some repositories keep `node --test` files in a root folder
with no `package.json` above them (jjacobhw/roomie: `tests/*.test.mjs` at the root import
`node:test` and, through `tests/expense_test_helpers.mjs`, `../backend/expenses.ts`; the repository
has `backend/package.json`, with no `test` script, and `frontend/package.json`). When neither the test files' folders nor the root has a `package.json`, the
validator runs them from the root when all of these hold:

1. at least one JavaScript or TypeScript test file imports `node:test` (`from "node:test"`,
   `require("node:test")`, `import("node:test")`), so Vitest files that rely on globals are never
   pushed through Node;
2. the patched tree (tracked and untracked files, `node_modules` excluded) has exactly one
   `package.json`, or several of which the test files' imports reach exactly one; and that one is
   valid JSON.

With several, the validator reads the relative imports (`from`, `import`, `import()`, `require()`)
of the test patch's JavaScript and TypeScript files, on the tree with both patches applied. An
import that lands inside a package's folder reaches that package and ends the chain; one that lands
on a file outside every package folder (a shared helper such as `tests/expense_test_helpers.mjs`,
whether or not the patch touches it) is read and its imports followed in turn, trying the path as
written, then with `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, then as a folder's
`index`. A chain is at most 5 files long, the test file included. A repository with one
`package.json` never reads imports.

The environment is then: tests from the repository root (`package_dir` `.`), the install in that
package's folder by the usual lockfile rules, the Node version by the usual rules with that
package's `engines.node`, and one step,
`REPORT=$REPORT_DIR/node-0.json node --test --test-reporter=/patches/reporter.mjs <paths>`. Each test
file with a compound ending (`.test.mjs`, `.spec.ts`) gives the unquoted shell glob
`<folder>/*<ending>`, one per folder and ending, so the folder's older tests run as well and can be
PASS_TO_PASS; a plain-ending file (`tests/check.mjs`) gives its own path; fixtures are ignored. The
shell expands the globs, since `node --test` only reads globs itself from Node 21. The Dockerfile
provenance says `# no package.json above the test files: node --test from the repository root,
install in <dir>`, and the census signals read that package's `package.json`. A `.mjs` test that
imports a `.ts` file needs Node 22.18 or later (type stripping on by default). When the rule does
not hold, the row stays `env_unsupported`:

| Condition failed | `detail` |
|---|---|
| no test file imports `node:test` | `no package.json above the test files or at the repository root` (as before) |
| no `package.json` anywhere | `no package.json in the repository` |
| more than one, and the imports reach none | `no package.json above the test files, and N packages to choose from: a/package.json, b/package.json; the test files' imports reach none of them` |
| more than one, and the imports reach several | `…; the test files' imports reach 2: a/package.json, b/package.json` |

**Python.** The package directory is the nearest one above the test files with a
`pyproject.toml`, `requirements.txt`, `setup.py` or `setup.cfg`, else the repository root. The
image is `python:<major.minor>-bookworm`: the version comes from `.python-version`, else the lowest
minor `requires-python` allows (`">=3.10,<4"` is 3.10, raised to 3.9 when lower, since pytest 8
needs 3.9), else 3.12. The install is the first that applies: `uv.lock` → `pip install uv && uv
sync --frozen` into `/opt/venv`; `poetry.lock` → `pip install poetry && poetry install
--no-interaction --no-root` into the image's Python (no virtualenv); `requirements.txt` plus any
of `requirements-dev.txt`, `requirements-test.txt`, `dev-requirements.txt` → `pip install -r` each;
a `pyproject.toml` with `[project]` or `[build-system]`, or a `setup.py` → `pip install -e .`. Every
install ends by installing pytest. Nothing installed lands in the mounted checkout, and
`PYTHONDONTWRITEBYTECODE` keeps `.pyc` files out of it. pip, uv and Poetry downloads share the
batch's cache folder like npm's.

pytest has no JSON output of its own, so the runner writes a small plugin
(`pytestReporter.ts`, standard library only, checked on pytest 7.4 and 8.4) into `/patches` and
loads it with `-p`. It writes the same `{id: status}` map as the `node --test` reporter. Ids are the
file path relative to the repository plus the rest of pytest's node id, `file::test` or
`file::Class::test`, with parameters as pytest prints them (`test_add[1-2]`), the shape
`extractTests.ts` writes. A test is `failed` if its setup, call or teardown failed (errors count as
failures), `skipped` if any phase skipped (an `xfail` arrives as skipped), and `passed` otherwise.
A file that fails to collect (an import or syntax error) is `file::(load)`, as for the other
runners. `--continue-on-collection-errors` is required: without it pytest stops before running any
test when one file fails to import, and the whole suite would be absent from that state.

**Node version and installs from CI.** The Node major comes from `.nvmrc`, else `.node-version`,
else `engines.node`, else the `node-version` of `actions/setup-node` in the CI job that runs the
tests (a number or `24.x`; matrix and other expressions are ignored), else 22. Repository files
win over CI. That same job's install steps (`npm ci`, `npm install`, `pnpm install`, `yarn
install`, `yarn`, with flags; not a global install or one that names packages) are run in order,
each in its directory (step `working-directory`, job `defaults.run.working-directory`, a `cd dir
&&` before it, `--prefix`/`--dir`/`-C`) and each inside its own install guard, in place of the
single detected install; pnpm and yarn steps get `corepack enable` first. A CI with no install
step the validator recognises leaves the single install as it was. JoKHerre/Bookworm needs both:
its server tests import the root's `shared/` code, whose dependencies only the root install
provides, and its CI runs Node 24. The result records `install_dirs` and `node_source` (`from
.nvmrc`, `from CI`, `default`), and `eval_script` starts with the same two facts as comments.

**Databases.** Some repositories' tests are integration tests against a real Postgres (every test
file in JoKHerre/Bookworm refuses to run unless `DATABASE_URL` names its `bookworm_test`
database). Without a database every test fails to load in every state and the row is rejected
`no_fail_to_pass`. The validator starts the database the repository's own CI starts, read from
`.github/workflows/*.yml` on the patched tree (`services.ts`):

| Read from CI | Rule |
|---|---|
| The job | the one whose steps run the package's tests (`npm test`, `pnpm --dir server test`, `npx vitest`, `pytest`, `node --test`); when several do, the one aimed at the package directory (`--dir`, `-C`, `--prefix`, `cd`, `working-directory`), then one with a Postgres service |
| The service | that job's `services:` entry whose image is `postgres` or `postgres:<tag>`; its `env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`). MySQL, Redis and other images are ignored |
| `DATABASE_URL` | the test step's `env`, else the job's, else the workflow's (`${{ env.X }}` resolved); with none, or another expression, built from the service's env. Host `localhost`/`127.0.0.1` becomes the service's key (`postgres`), a mapped host port (`5433:5432`) its container port |
| The schema step | the steps before the test step whose command contains `db:push`, `migrate`, `prisma migrate deploy`, `prisma db push`, `drizzle-kit push` or `knex migrate`, kept as written; a step with its own `working-directory` runs in a subshell there |

Every run, all nine, gets its own: `docker network create hecate-<run>-<id>`, the service image on
it as `hecate-pg-<run>-<id>` with the CI env and the network alias of its CI key, and a wait of up
to 60 one-second polls for `pg_isready` over TCP (the image's first-boot server answers on its
socket and then restarts). The test container joins the network with `DATABASE_URL` set to the
rewritten URL in place of the placeholder. Inside it: install (guarded, as above), then the schema
command from the repository root in its own `bash -eo pipefail`, guarded the same way, then the
test steps, still `|| true`. A database that never answers is `env_error` "database did not
start"; a failed schema step is `env_error` "schema step failed: <first error line>". Both
containers and the network are removed after every try, including a timeout and the one retry,
and the database's log is appended to the run log when a run fails. The service (image, env,
URL, schema command) is recorded in the result's `services` and as comment lines at the top of
`eval_script`. A repository with no Postgres service in CI runs exactly as before, with the
placeholder `DATABASE_URL`.

The modification check for `.py` files reads indentation instead of running Python: a `def test*`
at the top level or inside `class Test*` (with its decorators) up to the next statement at the same
or lower indent, skipping lines inside strings and brackets. A file it cannot parse that way
(unbalanced quotes or brackets, mixed tab and space indents) has every test treated as modified, so
those tests are judged from R1 only.

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

## More than one test suite

A task's tests can live in more than one place: a FastAPI back end tested with pytest and a React
front end tested with Vitest in the same PR, or a `client/` and a `server/` each with its own
`package.json` and runner. The test patch's test files are split into **suites**, one per language
and package (`suiteGroups` in `environment.ts`). The package is what the single-package detection
finds for a file: the nearest `package.json` for JavaScript and TypeScript, the nearest Python
manifest (`pyproject.toml`, `requirements.txt`, `setup.py`, `setup.cfg`) for Python. A file with
no package above it joins its language's only package when there is one, else the repository
root. In a row with both languages, files that are neither (fixtures, snapshots) join no suite; in
a JavaScript-only row they count as before. Suites are ordered by package directory, then
language.

Each suite's environment is detected exactly as a single suite's is (image, package manager,
installs, test steps, Node version, and the CI job, install steps and database service for that
suite's package), from that suite's files only. At most 4 suites; more is `env_unsupported`
("test files form 5 suites, more than 4: …"). A suite that is itself unsupported (Mocha, Bun)
makes the row `env_unsupported` with a detail naming it ("suite javascript in frontend: …"). A
row with one suite is detected, run and recorded exactly as before.

**Runs.** In each of the nine runs (three states, three times each), every suite runs in its own
fresh container on the same checkout state, one after another, with its own installs and, when
its CI job has one, its own database sidecar; a suite whose CI has none gets none. Timeouts apply
per suite run. The suites' results for that run are merged into one map; test ids are
file-qualified, so two suites cannot report the same id unless they ran the same file, which is
`env_error` ("test id reported by two suites in r0a: …"). A failed install (or schema step, or a
database that does not start) in any suite is `env_error`, as for one suite. `compareRuns` then
runs unchanged on the merged maps: a back-end `FAIL_TO_PASS` and a front-end `PASS_TO_PASS`
validate together, and a regression in either suite rejects the row. Each suite's run log is
`logs/<instance_id>/<run>.<suite>.log` (`r0a.python-in-backend.log`).

**Recorded.** The result gains `suites`, only when there is more than one: `{ language,
package_dir, runners, image, node_source, services }` per suite, in run order (`services` by
name and image). `image`, `package_dir`, `install_dirs`, `node_source` and `services` describe the
first suite; `eval_script` holds every suite's script in order, each under a line `# ---- suite
<i> of <n>: <language> in <package> ----`; `log_parser` joins the suites' parsers with `+`
(`pytest-json+vitest-json`). `harbor_env` keeps the first suite's recipe and adds `suites`, every
suite's recipe; the batch puts the image digest in the first. The batch summary shows `2 suites`
in the reason cell of a validated multi-suite row (after `untested files: N`), and the census lists
such a repository as supported, one value per suite in each column, with the suites in the note.

**Harbor.** A Harbor task has one verifier, so a multi-suite row is not exported yet: both the
course website's zip and `scripts/exportHarbor.ts` skip it with "Harbor export for tasks with
more than one test suite is not built yet", the way database rows are skipped, and the gold check
records it as `skipped` with that reason.

`untested_files` by the import rule is unchanged: imports are resolved with the first suite's
package directory as the Python fallback root. The coverage run (see "Fix coverage") runs once per
suite that has a proving test file and merges the reports per file.

## Output

The validator prints one JSON object and writes nothing to the database:

```
{ instance_id, image, eval_script, log_parser, test_files,
  FAIL_TO_PASS, ABSENT_TO_PASS, PASS_TO_PASS, FAIL_TO_FAIL, regressions, flaky, skipped,
  judged_from_base, modified_tests, unmatched_static_ids, validation_status, reason, timings,
  install_dirs, node_source?, test_files_never_loaded?, services?, harbor_env?, untested_files?,
  repo_source?, harbor_gold?, suites?, untested_files_source?, fix_coverage? }
```

`untested_files` (validated rows only, present only when non-empty) lists the code files the
source patch adds or modifies that the proving tests do not run. When the batch ran the coverage
run (`--fix-coverage` / `--fix-coverage-only`) and it measured something, the list comes from it
(see "Fix coverage"); otherwise from the import rule below. `untested_files_source` says which:
`coverage`, `imports`, or `mixed` (coverage, plus the import rule for the files coverage could
not measure). It is present only on results the coverage run was requested for, so a result made
without it is unchanged; absent, the list is the import rule's. A row is validated when its tests fail
before the fix and pass after it, which proves the part of the fix the tests touch and nothing
else: a PR whose tests exercise a back-end route can change four front-end files no test loads,
and an agent graded on that row could leave the front end broken and still score 1.0. Such rows
are kept, since the proven part is real, but flagged so the dataset can filter them or report them
separately. The rule (`validation/untestedFiles.ts`): starting from the files of the
`FAIL_TO_PASS` and `ABSENT_TO_PASS` tests, follow import statements through files in the
repository, on the tree after the fix (base + test patch + patch); a changed code file
(`.js .jsx .mjs .cjs .ts .tsx .mts .cts .vue .svelte .py`, not `.d.ts`) that is never reached is
untested. JavaScript and TypeScript imports are `import`, `export … from`, `import("…")` with a
plain string and `require("…")`, resolved relative to the file, through `baseUrl` and `paths` of
the nearest `tsconfig.json` / `jsconfig.json` (exact keys and one trailing `*`; `extends` is not
followed), with code extensions, `index.<ext>` and `.js` → `.ts`/`.tsx`. Tests that import build
output (`await import("../dist/auth/auth.controller.js")`) would otherwise reach nothing, since the
tree has no `dist/`: a relative import that does not resolve, and lies under the `outDir` of the
nearest `tsconfig.json` / `jsconfig.json` at or above the importing file's package folder (the
nearest folder with a `package.json`), is mapped to the same path under that config's `rootDir`
(else the single top folder of its `include`, such as `src`, else the config's folder) and resolved
with the same extension rules; when that config declares no `outDir`, or there is none, `dist/` and
`build/` of the package folder map to its `src/`. Packages and anything that does not resolve to a
repository file are ignored. Python imports (`import a.b`, `from a.b import
c`, relative `from .m import x`) resolve to `a/b.py` or `a/b/__init__.py` under the importing
file's folder and each folder above it, then `package_dir`, then the repository root; the
`__init__.py` of each package on the way counts as reached, since Python runs it. Sitting in the
same folder as a test is not reaching it. This is a static over-approximation of what the tests
load, not coverage: a reached file can still be untested in practice (imported, function never
called), and dynamic loading (paths built from strings, plugin registries, Next.js file routing, a
front end tested only through HTTP) is invisible to it. It errs toward flagging: a missed import
makes a file look untested, never the reverse. Diagnostic only: it does not change the verdict,
reason or detail. The batch summary shows `untested files: N` next to the row; write-back adds
the validator-owned flag `untested_files` to `cse_benchmark_task_sources.flags` and removes it
when a later result lists none. If the post-fix tree cannot be read, `detail` gets
"untested_files not computed: …" and the field is left out.

`fix_coverage` (batch with `--fix-coverage` or `--fix-coverage-only`, validated rows only) is the
coverage run's outcome; see "Fix coverage".

`harbor_env` is the Harbor recipe for the environment the runs used (see "Harbor export"); the
batch replaces its image with the digest it resolved.

`repo_source` (batch only) is where the code came from: `github` (the batch's clone in `repos/`)
or `snapshot` (the row's bundle, because GitHub could not supply it; see "Private repositories").
`harbor_gold` (batch with `--gold-check` or `--gold-only`) is the Harbor gold check, also copied
into `harbor_env.gold` (see "Harbor export").

`test_files_never_loaded` lists test-patch files that failed to load in R2, after the fix. That
is usually the harness (a missing install, a wrong Node), not the student, so the verdict rules
are unchanged but `detail` reads "test patch file(s) never loaded after the fix: <files>; check
the run log", and the batch summary's reason column carries the same note.
`services` is present only for a row whose runs had a database container (see "Databases").
`judged_from_base` lists the tests whose "before" status was taken from R0 because R1 had no
result for them (the fallback above); `modified_tests` lists the pre-existing tests whose source
text the test patch changed. Both are diagnostic and do not affect the verdict by themselves.

**In the database: `validation_detail`.** Write-back stores the test lists, image, recipe and
gold check, and one label, the `untested_files` flag. What lies behind that label goes into
`cse_benchmark_tasks.validation_detail` (jsonb), for validated rows only, copied from the result
file and never recomputed (`validationDetail` in `validation/writeback.ts`):

| field | from the result |
|---|---|
| `fix_coverage` | the whole coverage run (see "Fix coverage"); absent when the result has none |
| `untested_files` | the list; `[]` when the result lists none |
| `untested_files_source` | `coverage`, `imports` or `mixed`; null when the coverage run was not requested |
| `repo_source` | `github` or `snapshot`; null for a result written before the field existed |
| `snapshot_bundle` | the bundle path; null when the row had none |
| `counts` | `absent_to_pass`, `flaky`, `proof_outside_test_patch`: the lengths of those lists |
| `validated_at` | the result's own `validated_at`; null when the result does not record one (no batch writes it yet) |
| `validator_commit` | only when the result records one (no batch writes it yet) |

Both `writebackValidation.ts` and `writeback.sql` write it with the row's task update; rejected and
`env_error` rows leave it alone. `writebackValidation.ts` checks the column exists before writing
anything and stops with "apply migration
`supabase/migrations/20261114000000_cse115a_benchmark_validation_detail.sql` first" if not; its
`--dry-run` line, and the line it prints for each row written, ends each validated row with
`detail: 1/1 files, 76/192 lines` (files run of files changed, changed lines covered of executable
ones) or `detail: no coverage`. Re-capturing a changed PR sets it back to null with `harbor_env`.
It is internal: not a SWE-bench field, so the JSONL export (`SWE_BENCH_FIELDS`) never contains it,
and the Harbor export does not read it. The `untested_files` flag on
`cse_benchmark_task_sources.flags` stays the quick filter; `validation_detail` is the detail behind
it. To undo the migration:

```sql
alter table public.cse_benchmark_tasks drop column if exists validation_detail; notify pgrst, 'reload schema';
```

## Fix coverage

The import rule guesses what the proving tests load, and it is wrong both ways: a test that imports
a whole Express app reaches every route the fix changed, though it calls one; a test that imports
one component through a folder's `index.ts` reaches the other component the fix changed, though it
never renders it; and a module imported by a `conftest.py` fixture, through a Vite-only `@/` alias
or a Vitest `setupFiles` entry, or a Next.js route the test calls over HTTP, reaches nothing by
imports though it runs. The coverage run measures instead, as SWT-Bench's "change coverage" (the
share of the gold patch's changed lines a test suite executes) and TDD-Bench Verified's adequacy
score do for theirs. Code: `validation/fixCoverage.ts` (pure: changed lines, parsers,
classification) and `validation/coverageRun.ts` (the steps and the run).

**What runs.** For a validated row, after its verdict is final, one more container run of R2
(base + test patch + patch) per suite that has a proving test file, with line coverage on and only
the proving test files selected: the files of the `FAIL_TO_PASS` and `ABSENT_TO_PASS` ids,
deduplicated. One run, not three. `PASS_TO_PASS` tests pass without the fix, so they cannot tell a
full fix from a partial one; they are left out. Selection is by file, so a proving file's other
tests (non-proving ones) run too and add their coverage. The run uses the suite's own plan: the
same image (the result's digest for the first suite), installs, CI install steps, database sidecar,
schema step and environment variables. Only the test steps change: each runner step gets the
proving files it runs (a `node --test` step those its own path arguments, or Node's default
patterns, match; Vitest and Jest steps the rest), a runner step with none is dropped, and so is
every step after the last one kept (PocketWatch's `pnpm build` stays when the proving test is the
`node --test` one, which imports `dist/`). The container does not work in the batch's checkout: it
mounts it read-only at `/src` and clones it (`git clone --shared`) into `/work`, so the coverage
tools it installs never reach `repos/`, later rows, the image digest on the row or the Harbor task.
Its log is `logs/<instance_id>/coverage.log`; `--timeout` applies to it.

**The tool per runner.**

| Runner | Tool | How |
|---|---|---|
| pytest | coverage.py | `pip install coverage` (with uv: `uv pip install --python /opt/venv/bin/python coverage`), as pytest is installed; `python -m coverage run -m pytest <files>` and `coverage json`, through the run prefix (`uv run --no-sync`, `poetry run`), with our own rcfile: data in `/tmp`, only files under `/work` measured, the repository's own coverage config ignored |
| Vitest | `@vitest/coverage-v8` | at exactly the repository's Vitest version, added only inside the container's clone when the repository does not have it (`npm install --no-save`, `pnpm add -D`, `yarn add -D`); `--coverage.enabled --coverage.provider=v8 --coverage.reporter=json`, `--coverage.all=false` before Vitest 4 (4 reports only loaded files by default) |
| Jest | Jest's own coverage | `--coverage --coverageReporters=json --coveragePathIgnorePatterns=/node_modules/ --runTestsByPath <files>`; `collectCoverageFrom` is not set, so only loaded files are reported |
| `node --test` | c8 10.1.3 | installed outside the checkout (`npm install --prefix /tmp/hecate-c8`) and wrapped around the `node` command, with the step's own path arguments replaced by the proving files; `--allowExternal` so files outside the package count |

c8 rather than Node's `--experimental-test-coverage`: c8 reads `NODE_V8_COVERAGE`, which every
Node from 18 to 24 has (checked on 18.20, 20.20, 22 and 24.22), writes the same Istanbul JSON as
Jest and Vitest, and maps build output back to the source through source maps (PocketWatch's
`dist/*.js` are reported as `src/*.ts`). Node's built-in `--experimental-test-coverage` has no
lcov reporter on Node 18 (18.20 exits with an error; 20.20 writes one), so it would leave Node 18
rows unmeasured. Reports are read against source files of the repository; paths are made
repo-relative from the container's `/work`.

**Which lines.** A file's changed lines are the post-fix line numbers of the patch's `+` lines
(added and modified lines). Deleted files and non-code files are left out, as for the import rule,
so the files are the same set. Of those lines, a line is **executable** when it is code and the
tool reports it: code means not blank, not a comment, not brackets or separators alone, and, for
JavaScript and TypeScript (read with the TypeScript parser), not type-only (interfaces, type
aliases, annotations, `import type`, overload signatures, `declare`); for Python, Vue and Svelte
the first three by text. That filter matters because c8 reports every line of a loaded file,
comments and closing braces included, and Node runs TypeScript with its types blanked out, so an
interface's lines read as executed. "The tool reports it": coverage.py's executed and missing
lines; for Istanbul JSON (Jest, Vitest, c8), a statement that starts on the line, else the
innermost statement or function that spans it (Istanbul's own line count credits only a
statement's first line, so a fix editing the middle of a multi-line call would have nothing
executable). A changed line that is not executable never counts for or against the row.

**Per file.** `state` is:

- `run`: the report has the file and at least one executable changed line was executed;
- `not_run`: the file is in no report (never loaded; `executable`, `covered` and `uncovered` are
  null), or it was loaded and none of its executable changed lines ran (`covered: 0`). A changed
  file in a language no suite ran (a `.py` file when only a JavaScript suite ran) is `not_run`;
- `no_code`: nothing to measure. None of its changed lines is run-time code by the same line
  filter (`codeLines`): a pure rename, deletions only, or only types, interfaces or comments
  (`shared/ratings.ts` in JoKHerre/Bookworm COL-04-T-4 gains only an interface; `backend/texting.ts`
  in jjacobhw/roomie US-3-T-2 gains one comment line). `executable` and `covered` are 0 and
  `uncovered` is "". Checked before every other state, whatever the reports say;
- `not_measured`: coverage cannot speak for the file. Exactly four cases: it is loaded but the tool
  counts none of its changed lines (the middle of a multi-line Python statement); a report of its
  language failed (that step might have run it); it is absent and a report lists build output that maps to
  it by path (`dist/`, `build/`, `out/` or `lib/` for `src/`) and was left unmapped because it has
  no source map, which is never guessed; or it is a `.vue` / `.svelte` file absent from the reports
  (not every runner instruments them).

```
fix_coverage: { status: "measured" | "partial" | "unavailable", reason?, tools: string[],
                files: Array<{ path, state, changed_lines, executable, covered, uncovered }>,
                files_changed, files_run, files_not_run, files_not_measured, files_no_code,
                lines_executable, lines_covered }
```

`no_code` files are listed in `files` but counted only in `files_no_code`: `files_changed` is the
files with at least one runnable changed line (`run` + `not_run` + `not_measured`), so "files run of
files changed" counts only those. They never make a task `partial` or `unavailable`, and are never
in `untested_files`. When every changed code file is `no_code`, the status is `measured` with
`files_changed: 0` (0/0 files, 0/0 lines), even if a report failed or there was no proving test file
to run: there was nothing to measure. A patch that changes no code file at all is unchanged
(`unavailable` "no proving test file to run" when nothing ran).

`uncovered` lists the executable changed lines never executed as sorted ranges (`12-15,40`), ""
when there are none. `lines_executable` and `lines_covered` add up the `run` files only. There is
no single percentage across files: a file never loaded has no executable-line count, so a blended
ratio would be invented. The headline is two numbers, files run of files changed and lines covered
of lines executable in the files that ran. Read the two together: a task can have every file run
and still have changed lines that never ran (two functions changed in one file, one of them
tested); that shows in lines covered and the files' `uncovered` ranges, never in `untested_files`.
When several reports cover a file (two runner steps,
two suites), a line covered in any of them is covered. `status` is `measured` when every report
was usable and no file is `not_measured` (`no_code` files do not count); `partial` when some were measured and some could not be
(`reason` names each failed report and the count of files not measured); `unavailable` when
nothing was measured. Every failure of the coverage run (the coverage tool's install, the
repository's install, a crash, a timeout, no report or an unreadable one, proving tests that did
not pass in the run, no checkout) ends as a report that is not usable, and so in `partial` or
`unavailable` with a one-line reason: never a rejection and never `env_error`. Neither status
changes the verdict, the reason, `detail` or the test lists.

**`untested_files`.** With `fix_coverage.status` `measured` or `partial`: the `not_run` files, plus
the `not_measured` files the import rule flags (`untested_files_source: "coverage"`, or `"mixed"`
when any file is `not_measured`). `no_code` files are never listed, and the import rule is not
consulted for them. With no coverage run, or `unavailable`: the import rule's list,
unchanged (`imports`). The import rule (`untestedFiles.ts`) stays as that fallback. Write-back is
unchanged: the `untested_files` flag is added when the list is non-empty and removed when it is
empty; the per-file detail stays in the result JSON.

**Batch.** `--fix-coverage` runs it after each row that validates (before the gold check, when
both are on). `--fix-coverage-only` runs only it, for the rows in `--only` whose result file
exists and is validated, and rewrites each such file with only `fix_coverage`, `untested_files` and
`untested_files_source` changed, then `summary.json`, `summary.md` and `writeback.sql`. Unlike
`--gold-only` it needs Docker and the checkout: the clone in `repos/` (cloned again when missing),
else the row's bundle (the snapshot fallback, with `--snapshots-from`); with neither, the row's
`fix_coverage` is `unavailable` with the clone error. It never runs the three states, and it
re-detects the environment on the post-fix tree, recording `unavailable` if the image or package
folder no longer match the result's. `summary.md` gets a `coverage` column (`3/5 files, 41/60
lines`, `partial: …`, `unavailable`, or empty without a run) and a headline count (`fix coverage: M
measured, P partial, U unavailable`); the funnel is unchanged. A coverage run took 8 to 55 s on
the eight validated Sprint 2 and A3 rows with a warm package cache, about 115 s with a cold pnpm
install (one install plus one run of the proving files, against nine runs for validation).

**Limits.**

- Added and modified lines only. Lines the fix deletes are not measured (SWT-Bench also measures
  removed lines, on the pre-fix code; this does not).
- Executed is not checked: a line can run without any assertion depending on it.
- Proving files can hold non-proving tests, which add their coverage too.
- A line that declares a function counts as executed when its module loads with coverage.py and
  with c8 (both report the `def` / `function` line as module code), but only when the function is
  called with Jest and Vitest 4. A file whose only covered changed line is such a declaration reads
  `run`; its `covered` / `executable` numbers show it.
- A repository coverage config that narrows Vitest's `coverage.include` or Jest's
  `collectCoverageFrom` can hide a file the tests ran, which then reads `not_run`; a pytest
  `addopts` that turns on pytest-cov can conflict with coverage.py.
- Front-end code exercised only through a browser, and every `not_measured` file, are outside what
  this can see; a fix that changes two routes in one file the tests call once reads `run` for that
  file, and only `uncovered` shows the other route.

## Running it

```sh
npx tsx apps/dashboard/scripts/validateBenchmarkTask.ts --row row.json --repo-dir path/to/repo
```

`row.json` holds one `cse_benchmark_tasks` row (`instance_id`, `repo`, `base_commit`, `patch`,
`test_patch`, `FAIL_TO_PASS`). With no `--repo-dir`, the repository is cloned from GitHub:
anonymously, or with the course App's installation token when the App variables are set (see
"Private repositories").

Where each claim above about another benchmark comes from, with section numbers, is in
`docs/planning/BENCHMARK_VALIDATION_SURVEY.md`.

## Rebuilt rows

Some captured rows have the wrong diff because of how the student tagged or stacked their work: a
`<id>-base` tag on the one commit that holds the spec and all the code makes the captured patch
empty, and a PR merged into another task's branch carries that task's history. Staff rebuild such a
row on our side; the student's repository, tags and grade are untouched.

For the PR's merge commit M (from the submission snapshot, `pr.mergeCommitSha`), `base_commit` is
M^1, the first parent: the tip of the branch the PR was merged into, so a stacked PR's diff holds
only its own change. A squash or rebase merge has one parent and M^1 is still right. The change is
`git diff M^1 M`, minus the sprint's task file (`docs/tasks/sprint-N/<id>.md`, `isTaskFilePath`;
dropped for rebuilt rows only, captured rows are as before), passed through the app's own
`buildInstance` with the submission's snapshot and the student's email, so the split, the scrubbing
of personal data and the static `FAIL_TO_PASS` match capture. `problem_statement` and the other task
fields are copied from the stored row.

```sh
npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fetchCandidateRows.ts --out rows.json --all
npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/rebuildBenchmarkRow.ts \
  --rows rows.json --only <instance_id> --pr <n> --out rebuilt.json
```

Both need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (reads only). `--pr` must match the
snapshot's PR. The rebuilt row carries `rebuild: { rebuilt_from: "merge-parent", merge_commit,
original_base_commit, original_patch_sha256, original_test_patch_sha256 }`, which the validator
copies into the result together with the rebuilt base and patches. Write-back of such a result
(any verdict except `env_error`) also sets `base_commit`, `environment_setup_commit`, `patch` and
`test_patch` in `cse_benchmark_tasks` and adds the flag `staff_rebuilt:merge-parent` to the source;
captured rows are written back exactly as before. The same write-back drops the capture flags (the
`BuildFlag`s in `buildInstance.ts`) that described the replaced diff and that the rebuilt patches
make untrue (`staleCaptureFlags` in `validation/writeback.ts`): `no_test_patch` when the rebuilt
`test_patch` is non-empty, `no_source_patch` when the rebuilt `patch` is non-empty, `diff_missing`
when either is, `diff_truncated` always (a rebuild takes the whole `git diff M^1 M`), and
`no_tests_found` when the rebuilt `test_patch` adds a test. The other capture flags stay:
`base_commit_from_pr_base` / `base_commit_from_first_commit` (how capture chose its base) and
`pii_scrubbed_from_patch` (the result does not say whether the rebuild's scrubbing changed
anything). The output line names the flags dropped (`, dropped capture flag(s): no_test_patch`);
`--dry-run` reads no database, so it lists the flags it would drop "if present". To revert, restore the student-captured values
(the original base is in the result; re-capture the patches from it and check them against the
hashes) and remove the flag.

A later Submit does not undo this: re-capture keeps an instance whose source is no longer
`candidate` when the snapshot's merge commit is unchanged (`lib/cse115a/jobs/benchmarkSave.ts`).

Rebuilt so far: `JoKHerre__Bookworm-COL-04-T-4` (PR #115, M `96798e0b`, M^1 `40b28261`, the
head of PR #114). `JoKHerre__Bookworm-COL-04-T-2` (PR #114) is not rebuilt: the PR changes no
test file, so it stays rejected.

## Harbor export

A validated row can be exported as a [Harbor](https://harborframework.com) task: `instruction.md`,
`task.toml`, `environment/Dockerfile`, `solution/solve.sh` (applies the student's patch, the
oracle) and `tests/test.sh` (applies the test patch, runs the suite the way the validator did,
and writes reward 1 only if every verified `FAIL_TO_PASS` and `PASS_TO_PASS` id passed). The
builder is `validation/harbor.ts`.

**The recipe.** Everything a task needs besides the row is in `cse_benchmark_tasks.harbor_env`
(jsonb): the image (`tag@sha256:…`), the runners, the package directory, the install steps in
order (where each runs and the command), the test steps, the container variables, the database
services by name and image, where the Node version came from, and whether the repository is
public (`repo_public`, see "Private repositories"). The validator's result carries
the same object, and write-back (`writebackValidation.ts` and `writeback.sql`) stores it for
validated rows only; rejected and `env_error` rows leave the column alone, and so does a validated
result file written before results carried a recipe. `writebackValidation.ts` checks the column
exists before writing anything and stops with "apply migration
`supabase/migrations/20261110000000_cse115a_benchmark_harbor_env.sql` first" if not. When a
student's PR changes and the row is captured again, `harbor_env` goes back to null with the other
validation fields; a re-capture of an unchanged PR keeps it. `harbor_env` is not a SWE-bench field
and the JSONL export never contains it.

**Where the repository comes from.**

- `github` — what the course website uses. The Dockerfile fetches only the base commit, by id,
  in one `RUN` (`git init`, `git fetch --depth 1 https://github.com/<repo>.git <base_commit>`,
  `git checkout FETCH_HEAD`), so no later history is ever in a layer, and fetching by id works for
  a commit no branch points at. This needs the repository to **stay public** on GitHub (and the
  commit not to be garbage-collected, e.g. after a force-push and repository cleanup); a task
  whose repository is made private or deleted no longer builds, and a row whose repository the
  batch found private (`repo_public: false`) is not exported this way. The row needs a full 40-character
  `base_commit` and an `owner/name` repo, or it is skipped. Neither source initialises git
  submodules or fetches Git LFS objects (the image has no `git-lfs`, so LFS files are pointer
  files); a repository whose tests need either fails in Harbor even though it validated, if the
  validator's host checkout had them.
- `bundle` — `scripts/exportHarbor.ts`, from a local batch run with `--snapshots` (or an earlier
  `--snapshot-only` pass into the same folder). The batch's
  snapshot bundle is copied next to the Dockerfile and cloned from there, so the task builds
  without reaching GitHub.

Either way, the next layer throws the fetched history away and re-creates `/app` as one anonymous
commit (`GIT_REINIT_LAYER`), so the agent sees the files and no commit messages, authors or branch
names; then the install steps run.

**Runners.** JavaScript tasks (Vitest, Jest, `node --test`) ship `tests/check.mjs` and, for
`node --test`, the reporter `tests/reporter.mjs`. pytest tasks ship `tests/check.py`, a
standard-library Python port of `check.mjs` with the same arguments and reward rule, and the
validator's pytest reporter plugin in `tests/pytest_plugin/`, which `test.sh` puts on
`PYTHONPATH` and loads with `-p hecate_pytest_reporter`.

**On the course website.** The instructor benchmark page has "Download Harbor tasks (.zip)" next
to the JSONL links (`GET /api/cse115a/instructor/courses/<slug>/benchmark-harbor.zip`). The zip
holds exactly the rows the JSONL export returns with `?validated=1` (same consent rule, same
code, and the same 409 while the consent wording is not approved), one folder per task, using the
`github` source. Rows it cannot express are left out and listed in `SKIPPED.txt` at the zip root
(instance id, tab, reason):

- no `harbor_env` on the row (validated before the column existed): re-run the validator on it
  and write back;
- a database service in the runs: a Harbor task is one image with no sidecar, so these wait;
- more than one test suite (see "More than one test suite"): "Harbor export for tasks with more
  than one test suite is not built yet";
- a short `base_commit` or a repo that is not `owner/name`;
- `harbor_env.repo_public` is `false`: "repository is private; the task can only be built from a
  snapshot" (see "Private repositories");
- the gold check (below) has not passed: `gold check failed: <reason>`, `gold check skipped:
  <reason>`, or, when `harbor_env.gold` is absent, `not gold-checked yet; run the batch with
  --gold-only and write back`. The reasons above take priority and keep their wording; a row is
  exported only when `harbor_env.gold.status` is `passed`.

**The gold check.** Before a task goes into the zip, Harbor itself must agree with the validator:
the oracle agent (`solution/solve.sh`, the student's fix) must score 1.0 and the nop agent (no
change) 0.0, with no exceptions. A nop score of 1.0 means the tests pass without the fix; an
oracle below 1.0 means the task as built does not reproduce the validator's result (an image that
does not build, a step that behaves differently in Harbor). `validateBenchmarkBatch.ts
--gold-check` does this after each row it validates: it builds the task with the `bundle` source
into `DIR/harbor-gold/<task>/` (the same builder as `scripts/exportHarbor.ts`,
`validation/bundleTask.ts`) and runs

```sh
harbor run -p DIR/harbor-gold/<task> -a oracle -o DIR/harbor-gold/jobs --job-name <task>__oracle__<time> -n 1 -q
harbor run -p DIR/harbor-gold/<task> -a nop    -o DIR/harbor-gold/jobs --job-name <task>__nop__<time>    -n 1 -q
```

with the working directory `DIR/harbor-gold/jobs/`, so all of Harbor's output stays in the batch
folder; each run is stopped after 20 minutes (`--gold-timeout SECONDS`). The mean reward and the
exception count come from the job's `result.json` (`stats.evals.<agent>__adhoc.metrics[0].mean`,
`n_errors`, `n_errored_trials`, `exception_stats`; the format of Harbor 0.25, of which
`__tests__/fixtures/harbor/` holds a real pair). `--gold-only` runs only the check, for the rows
in `--only` whose result file exists and is validated: no clone and no Docker validation; each such
result file is rewritten with only `harbor_gold` and `harbor_env.gold` changed, and `summary.json`,
`summary.md` and `writeback.sql` are regenerated. That is how rows validated before the check
existed get checked. The outcome:

```
harbor_gold: { status: "passed" | "failed" | "skipped", oracle: number | null, nop: number | null,
               reason: string | null, checked_at: string }
```

`failed` names what went wrong (`oracle 0.0`, `nop 1.0: tests pass without the fix`, or the agent
and the first useful line of Harbor's output for an exception, a timeout or a missing result,
token-free). `skipped` means the task cannot be checked on this machine: Harbor is not installed
(`harbor --version` fails), the row had a database service (the same reason as the export), or
there is no snapshot bundle. The check never changes `validation_status`, `reason` or the test
lists. The batch summary has a `gold` column (`passed`, `failed`, `skipped`, empty when not run)
and the headline adds `; N gold-checked: P passed, F failed` (N counts passed and failed; skipped
rows are added as `(S skipped)`).

Write-back (`writebackValidation.ts` and `writeback.sql`) copies the check into
`harbor_env.gold` for validated rows that have one; a result without one leaves the stored `gold`
as it is (the recipe is replaced, the stored `gold` kept). A failed check adds the validator-owned
flag `harbor_gold_failed`, which any later write-back without a failed check removes. The output
line (and the `--dry-run` line) ends with `, gold check passed`, `, gold check failed: <reason>`
or `, gold check skipped: <reason>`.

From a local batch, to look at a task (this export is not gated on the gold check; it is how a
failed one is investigated):

```sh
npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/exportHarbor.ts ROWS.json --batch DIR --to OUT [--only id,id]
harbor run -p OUT/<task> -a oracle   # expect 1.0
harbor run -p OUT/<task> -a nop      # expect 0.0
```

## Private repositories

Most student repositories are public, but not all (two Assignment 3 rows come from a private one),
and a public repository can be made private or deleted after Submit.

**Cloning.** With `GITHUB_APP_ID`, `GITHUB_APP_SLUG` and `GITHUB_APP_PRIVATE_KEY` set (the same
course GitHub App the site uses), `cloneRepo` gets an installation token for the repository and
clones with it, and the base-commit fetch uses it too; the token is put only in the URL handed to
git, never stored in the remote, and removed from every message. Without them the clone is
anonymous. Either way git runs with no credential helper and no prompt, so it never uses the
machine owner's own GitHub credentials. When GitHub refuses a clone or base-commit fetch, the row
is `env_error` (still `candidate`) and its `detail`, also shown in the batch summary's reason cell,
says why:

- no App variables: `clone failed: repository not found or private; set GITHUB_APP_ID,
  GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY to clone private repositories`;
- App variables set: `clone failed with the course App token: is the App installed on
  <owner>/<repo>?`

Other failures (network, a commit that is gone) keep git's own message.

**Snapshots soon after Submit.** `validateBenchmarkBatch.ts ROWS.json --out DIR --snapshot-only`
clones each row's repository (into `DIR/repos/`, the clone a normal run uses), fetches `base_commit`,
writes `DIR/snapshots/<instance_id>.bundle` exactly as `--snapshots` does, and stops: no Docker, no
results, no summary, no `writeback.sql`. A row with a bundle is skipped unless `--redo`. It prints
one line per row (`snapshot written`, `already has a snapshot`, or the clone failure's detail) and a
count, and exits 0 even when rows failed. Run it daily over the `candidate` rows, so the files are
kept long before validation: a later normal run into the same `DIR` reuses the clone in `repos/`
(no GitHub access needed once the base commit is there) and records the bundle, and
`scripts/exportHarbor.ts` builds the task from it.

```sh
npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkBatch.ts ROWS.json --out DIR --snapshot-only
```

**`repo_public`.** The batch checks each repository once with an anonymous
`git ls-remote https://github.com/<owner>/<repo>.git` (no credentials, no prompt, 20 s timeout)
and records the answer as `harbor_env.repo_public`, next to the image digest: `true` if it
succeeds, `false` if GitHub refuses. If the check fails for another reason (network), the field is
left out and the log says so; the row is never failed over it. Absent means "not checked", as on
every recipe written before the check existed. The course website's Harbor zip (`github` source)
leaves out a row with `repo_public === false` and lists it in `SKIPPED.txt` ("repository is
private; the task can only be built from a snapshot"); absent or `true` export as before. The
bundle export (`scripts/exportHarbor.ts`) is unaffected and builds such rows from the snapshot.

**Validating from the snapshot.** A normal run (not `--snapshot-only`) falls back to the row's
bundle when GitHub cannot supply the code: when cloning the repository or fetching `base_commit`
into the batch's clone fails for any reason (refused, deleted, network), and the row has a bundle
in `DIR/snapshots/` or in the folder given by `--snapshots-from DIR2`, the bundle (branch
`hecate-snapshot`) is cloned into `DIR/repos-from-snapshot/<instance_id>/` (reused on a later run;
one per row, because bundles are per row) and the row is validated from that checkout, with the
same rules and the same lists as from GitHub. A bundle found only in `--snapshots-from` is copied
into `DIR/snapshots/`, so the result records it and the Harbor export and gold check find it. The
result has `repo_source: "snapshot"` (`"github"` otherwise) and its `detail` ends with "code taken
from the snapshot because GitHub failed: <the clone or fetch failure>", token-free; the summary's
reason cell says `from snapshot`. With no bundle, the row is `env_error` exactly as before. This is
what makes a VM restored from the bucket (which leaves `repos/` out) able to validate a repository
that has since been deleted or made private. `rebuildBenchmarkRow.ts` does not fall back: it needs
the merge commit, which the bundle need not hold.

```sh
npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/validateBenchmarkBatch.ts ROWS.json --out DIR --snapshots-from DIR2
```

**The snapshot store.** A bundle in a batch folder is lost with the folder or the machine, and a
repository deleted or made private since can then never be validated again. So the bundles are
also kept in a Supabase Storage bucket in the course's own project: `benchmark-snapshots`,
private (`public: false`), 50 MB file size limit, no policies, so only the service-role key can
read or write it. Object name `<instance_id>.bundle`, content type `application/octet-stream`
(`lib/cse115a/benchmark/validation/snapshotStore.ts`). The website and the Harbor exports never
read the bucket; it exists only for the validator.

The store is on when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` are set, read as `fetchCandidateRows.ts` reads them; the batch then
logs `Snapshot store: the Supabase bucket benchmark-snapshots`. Without both, every command
behaves exactly as before. With it:

- **Never overwritten.** Uploads use `upsert: false`, and Storage's "already exists" answer means
  "already stored", not an error: a row's base commit never changes, so the first upload is the
  copy. A `--redo` rewrites the local bundle but not the stored one.
- **Upload after every new bundle.** `--snapshot-only` and `--snapshots` upload each bundle they
  write. `--snapshot-only` also uploads a bundle already in `DIR/snapshots/` that the bucket does
  not have yet (it asks first), so rerunning it over an old folder fills the bucket. The row's
  line gets a second part (`snapshot written; stored`, `already has a snapshot; already stored`,
  `snapshot written; upload failed: <first line>`) and the count line ends with
  `N stored, N upload failures`; a normal run with `--snapshots` logs the same second part. An
  upload failure is logged and never fails the row or changes a result; results gain no field.
- **50 MB.** A bundle over the limit is not sent; it stays in the folder and its line says
  `upload failed: the bundle is N MB, over the bucket's 50.0 MB limit; kept only in this folder`.
  The project's global upload limit, if lower, wins over the bucket's.
- **Restore order.** When GitHub cannot supply a row's code, the bundle is looked for in
  `DIR/snapshots/`, then `--snapshots-from`, then the bucket. The bucket's copy is downloaded
  straight into `DIR/snapshots/<instance_id>.bundle` (so the result records it and the Harbor
  export and gold check find it) and checked before use: `git bundle verify`, a fetch of the
  bundle into a throwaway repository (verify alone passes a truncated file; the fetch reads the
  whole pack), and `base_commit` present. A copy that fails is deleted and treated as missing, so
  the row is `env_error` with the original GitHub error, as before. The bucket is asked only
  where a bundle is needed today: never on a row GitHub supplies.

The bucket is created once with `createSnapshotBucket.ts`. It creates `benchmark-snapshots`
private with the 50 MB limit, or prints the existing bucket's settings and changes nothing; if a
bucket of that name exists and is public, it refuses and exits 1. No migration: the bucket is
internal and stays out of the shared schema history.

```sh
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/createSnapshotBucket.ts
```

`uploadSnapshots.ts` uploads a folder made before the store existed: every `DIR/snapshots/*.bundle`
the bucket lacks, one line per file (`stored`, `already stored`, `upload failed: …`), then a
count; it exits 1 if any upload failed. `--dry-run` lists what it would upload and uploads nothing
(it does ask the bucket which bundles it has); `--only id,id` limits it to those rows.

```sh
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/uploadSnapshots.ts --dir DIR --dry-run
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/uploadSnapshots.ts --dir DIR [--only id,id]
```

## Known limitations

- **Renames are false regressions.** A renamed old test is old name passed→absent (regression,
  row rejected) plus new name labeled from its own runs. A deleted test looks identical in the
  logs, and the rule exists to catch deletions, so the validator does not guess. Cost: a rejected
  row a reviewer resolves in seconds, with both names side by side.
- **Unobserved proof is weaker than observed proof.** Every new or rewritten test in a file that
  only loads with the fix counts as `FAIL_TO_PASS` by the load rule, including a trivial one that
  would pass against a stub; so does every test in `ABSENT_TO_PASS`. Neither was seen failing.
  The load-rule cases are visible through `load_failures` (`r1 <file>`), the others through the
  separate list. A row whose only proof is of these kinds should be flagged at write-back for
  review (does the spec name the new module, do the tests assert behavior); that flag does not
  exist yet. Same exposure as Multi-SWE-bench's `n2p`, minus A.
- **The modification check cannot see dynamic tests.** `it.each`, titles built from variables,
  tests generated in loops: no static id, no body comparison. Treated as unchanged, so the
  fallback applies and a rewritten one is under-claimed. Visible in `judged_from_base`.
- **Three runs catch loud flakiness only.** A test that fails one time in twenty usually passes
  all three runs and gets a label. The family uses one to twenty runs; the count is one constant.
- **Dependency changes live in `patch`, not `test_patch`.** `diff.ts` splits by path, so a new
  dev dependency in `package.json` (or `requirements.txt`) is part of the fix. If the tests
  import it, the file cannot load at R1: every new or rewritten test is `FAIL_TO_PASS` by the
  load rule, every untouched old one is in `judged_from_base`. The runner installs after applying
  each state's patches, so R2 has the dependency and R1 does not.
- **A load failure is a property of the file.** Imports belong to a file, so when one import
  needs the fix, every test in the file fails to load at R1, including new tests that check old
  behavior ("still accepts ucsc" next to "accepts partner"). Those would pass without the fix but
  become `FAIL_TO_PASS` by the load rule: a pass→pass test counted as proof. R0 recovers this for
  untouched tests that existed at base (test A in the worked example), not for new or rewritten
  ones. Grading an agent is unaffected, since every listed test must pass either way. Two things
  downstream are misled: the verdict, where a row whose only proof is of this kind looks proven
  when nothing checks the new behavior (the unobserved-proof review above); and the labels, where
  proof counts are inflated, which matters for the router, since it trains on them. Seen on a
  real row: a task PR moved an earlier task's test file next to a helper counted as part of the
  fix; at its new path every test has a new id with no base result, so all of the earlier task's
  tests became proof for the later task.
- **The Specs guarantee is a rubric, not a check.** Proof from a file that cannot load without the
  fix is fair only because the spec names the new module. A row with a low Specs grade and all-unobserved proof is the case
  SWE-bench discards; write-back can cross-check the grade.
- **The modification check reads source, it does not run it.** JavaScript and TypeScript tests
  are compared through the TypeScript compiler, Python tests by indentation. A Python file the
  indentation reader cannot parse (unbalanced quotes or brackets, mixed tab and space indents)
  has every test treated as modified, so none of them takes the base fallback: an untouched one
  in a file that fails to load at R1 is then `FAIL_TO_PASS` by the load rule rather than
  `PASS_TO_PASS`. Visible in `modified_tests`.
- **Without the coverage run, `untested_files` follows imports, not execution.** A file the tests
  import but never call counts as tested, and code loaded dynamically (string-built paths, framework
  file routing, a front end exercised only over HTTP) counts as untested. `--fix-coverage` /
  `--fix-coverage-only` measure it instead; their own limits are under "Fix coverage".

## Not yet

Services other than Postgres (MySQL, Redis, MongoDB), a database the tests expect without a CI
service for it, browser and end-to-end runners, Bun, Python runners other than pytest, Harbor
export for rows with a database service (a Harbor task is one image, with no sidecar) or with
more than one test suite, and scheduled runs after each sprint. Each is a separate change once the dry
run is trusted.