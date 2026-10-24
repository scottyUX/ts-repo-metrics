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
| R0 | repo at `base_commit` | the suite before the task; baseline |
| R1 | R0 + `test_patch` | the new tests exist, the fix does not; failures here are candidate `FAIL_TO_PASS` |
| R2 | R1 + `patch` | the fix is in; a candidate that now passes is a real `FAIL_TO_PASS` |

Each state is run twice. A test whose result differs between the two runs of the same state
is flaky: it is excluded from every list and reported separately.

Each test has one of four statuses per run: `passed`, `failed`, `skipped`, or `absent` (it did
not appear in the report, because its file did not exist in that state or failed to load).
`skipped` tests are listed separately and are never `FAIL_TO_PASS`. `absent` is classified by
the R1 → R2 transition: absent then passed is `FAIL_TO_PASS` (the file loads only with the
fix); present then absent or skipped is a regression (the fix broke or disabled a test). Absent
in R0 is normal for files `test_patch` adds.

## How tests are classified

Each test is placed in one list by its result in R1 versus R2.

| Result in R1 | Result in R2 | List | Meaning |
|---|---|---|---|
| failed | passed | `FAIL_TO_PASS` | the fix makes this test pass; it proves the fix |
| passed | passed | `PASS_TO_PASS` | unaffected by the fix; must keep passing |
| passed | failed | regression | the fix broke this test |
| absent | passed | `FAIL_TO_PASS` | the test file loads only with the fix |
| passed or failed | absent | regression | the fix broke a test file |
| passed | skipped | regression | the fix disabled a test |
| run a ≠ run b | | flaky | unreliable; excluded |
| skipped | any | skipped | never ran; never `FAIL_TO_PASS` |

The row is `validated` when `FAIL_TO_PASS` is non-empty and there are no regressions, and
`rejected` otherwise, with a reason.

The validator runs the whole test suite in every state, not only the test files that
`test_patch` touches. Student suites take seconds, and a fix that breaks a test anywhere in the
repository is exactly what `PASS_TO_PASS` exists to catch. Because the whole suite runs, tests
added by earlier tasks are part of every later task's `PASS_TO_PASS`: the regression check grows
with the repository over the quarter. Each row's lists are still computed from that row's own
runs; nothing is copied between rows.

This follows current practice in the SWE-bench family. Multi-SWE-bench (arXiv:2504.02605,
§3.1.4) validates each PR with the full suite in the same three states (base, base + test patch,
base + both patches) and tracks skipped tests as their own status. SWE-rebench V2
(arXiv:2602.23866, §3.3) always runs the full suite and reruns each candidate three times,
keeping only instances whose outcomes are stable. A 2025 study (arXiv:2503.15223) found that
SWE-bench's touched-files rule lets 7.8% of "resolved" patches fail the full developer-written
suite.

SWE-bench itself runs only the test files that `test_patch` touches
(`swe-bench-tasks/dockerfile_gen/__init__.py`, `_get_test_directives`: file paths from the diff
are appended to the test command), a cost trade-off for suites that take hours. The files
`test_patch` touches are recorded in the output as `test_files`.

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

The commands used become the row's `eval_script`, the container definition its `image`, and
the JSON reader its `log_parser`.

## Output

The validator prints one JSON object and writes nothing to the database:

```
{ instance_id, image, eval_script, log_parser, test_files,
  FAIL_TO_PASS, PASS_TO_PASS, regressions, flaky, skipped, unmatched_static_ids,
  validation_status, reason, timings }
```

## Running it

```sh
npx tsx apps/dashboard/scripts/validateBenchmarkTask.ts --row row.json --repo-dir path/to/repo
```

`row.json` holds one `cse_benchmark_tasks` row (`instance_id`, `repo`, `base_commit`, `patch`,
`test_patch`, `FAIL_TO_PASS`). With no `--repo-dir`, the repository is cloned using
`GITHUB_TOKEN` from the environment.

## Not yet

Jest and pnpm projects, Python projects, repository snapshots, writing results back to
`cse_benchmark_tasks` and `cse_benchmark_task_sources`, and scheduled runs after each sprint.
Each is a separate change once the dry run is trusted.
