# How the SWE-bench family validates task instances, and where this validator differs

Status date: 2026-10-11; revised 2026-11-03 against the v2 addendum
(`BENCHMARK_VALIDATION_SURVEY_v2_addendum_2026-11-02.md`: nine further benchmarks, two harness
checks). Revisions are marked `[v2]` and are AI-read, pending verification; the original 2026-10-11
text is Jacob's. The addendum is a separate file and is not reproduced here.

Companion to `docs/CSE115A_BENCHMARK_VALIDATION.md`. Every claim below carries the section where it can be checked. Sources were read in full (arXiv PDF and
HTML, official harness code, project sites); where a paper and its code disagree, both are
reported. Quotes are at most a few words; everything else is paraphrase.

Reading tip: the arXiv HTML renderings of several of these papers drop the appendices
(SWE-bench, SWE-bench Multimodal, both SWE-rebench papers). Where a citation says "Appendix",
open the PDF.

## 1. What was checked

For each benchmark, seven questions about how a task instance is proven sound before it enters
the dataset:

| Dimension | Question |
|---|---|
| States | In which repository states are the tests run to derive `FAIL_TO_PASS` / `PASS_TO_PASS`? (base alone; base + test patch; base + test patch + fix) |
| Repeats | Are tests run more than once per state to catch flaky tests? How many times? What is discarded, the test or the whole instance? |
| Scope | The full test suite, or only the test files the test patch touches? |
| No-result term | What is a test that produced no result in a run called? Any status beyond passed/failed? |
| Abnormal transitions | What happens when a test disappears after the fix, or goes passed→failed, or passed→skipped? |
| Failed both times | How is a test that fails before and after the fix treated? |
| Definitions | How are `FAIL_TO_PASS` and `PASS_TO_PASS` defined, in the source's own words? |

## 2. Hecate's validator's rules, for reference

Three states (R0 base, R1 + `test_patch`, R2 + `patch`), each run twice; whole suite; four
statuses (`passed`, `failed`, `skipped`, `absent`); classification by before/after status where
"before" is R1 with R0 as the fallback when R1 has no result; a disagreeing test is excluded as
flaky and the row kept; `FAIL_TO_FAIL` recorded but not counted; `validated` iff
`FAIL_TO_PASS` or `ABSENT_TO_PASS` is non-empty and there are no regressions. Full statement in
`docs/CSE115A_BENCHMARK_VALIDATION.md`.

## 3. Source by source

### 3.1 SWE-bench (arXiv:2310.06770, ICLR 2024) and its harness

The origin of the `FAIL_TO_PASS` / `PASS_TO_PASS` vocabulary and of the harness the Hecate
router uses. Two kinds of source: the paper, and the harness repository at commit
`b4a40501b4d604dea28ad03418671cc597570bb9` (2024-06-25). That commit is cited because SWE-bench's
own `docs/assets/collection.md` (line 16) names it as the latest public version of the validation
code; the validation engine was removed from later versions. The commit's own diff page shows
only the one file that commit changed; the files below are in the repository tree at that commit
(`https://github.com/SWE-bench/SWE-bench/tree/b4a40501b4d604dea28ad03418671cc597570bb9`).

- **States: two.** Appendix A.3 ("Validation Engine", p. 19) lists the steps: check out the base
  commit, install, apply the test patch, run the tests (log before), apply the solution patch, run
  again (log after). There is no run of the base commit without the test patch. The harness does
  the same in `engine_validation.py` (apply test patch → run → apply patch → run).
- **Repeats: one per state.** Appendix A.1 (p. 16): the tests are run once before and once after
  the solution is applied. The paper does not mention flaky tests; the harness has no repeat logic.
- **Scope: only the test files the PR's test patch modified, not the repository's suite.**
  Appendix A.1: the test set is all tests from the files the test patch edits. Appendix A.3: those paths are appended to the test command. The harness
  function is `get_test_directives` (regex over `diff --git` headers of `test_patch`); the
  generated `eval.sh` runs, for example, `pytest -rA astropy/modeling/tests/test_separable.py`.
  §2.3 reports a median of 51 extra tests per instance, all from the touched files.
- **No-result term: "missing".** Appendix A.4 (p. 21): a test that is missing or has a non-pass
  status is treated as failed. Harness `TestStatus` is `FAILED`, `PASSED`, `SKIPPED`, `ERROR`
  (current `main` adds `XFAIL`); a test not in the parsed map counts as failed. `[v2]` At `main`
  (2026-11-02) grading has changed in three ways that do not touch list construction: `test_passed`
  counts `XFAIL` as a pass (`grading.py` 85–90); `test_failed` counts a skipped `FAIL_TO_PASS` test
  as failed (101–109, with the comment "a skipped F2P test is not a resolution; without this, a
  patch that makes every F2P test skip lands in neither list and scores RESOLVED_FULL"); a new
  `test_maintained` counts a skipped `PASS_TO_PASS` test as maintained (93–99). Six JavaScript
  repositories are graded fail-only, where an absent test is a success
  (`constants/__init__.py`, `FAIL_ONLY_REPOS`, 72–82). The statements elsewhere in this survey that
  a SKIPPED test "matches neither branch" or "lands in no list" describe commit `b4a40501`.
- **Abnormal transitions.** Validation produces four keys: `FAIL_TO_FAIL`, `FAIL_TO_PASS`,
  `PASS_TO_FAIL`, `PASS_TO_PASS` (Appendix A.3, p. 20). `PASS_TO_FAIL` and `FAIL_TO_FAIL` are
  "not considered" during evaluation (Appendix A.5, p. 21); the instance is kept. The harness
  conversion (`swebench/metrics/conversion.py` at that commit, `convert_log_to_ground_truth`,
  loop `for test, status in sm_after.items()`) iterates only the tests present *after* the gold
  patch, so a test that disappears after the fix lands in no list. `test_failed` there is "not in
  the map, or FAILED, or ERROR" (`swebench/harness/grading.py` at that commit, lines 47–50), which
  is why absent-before counts as failed-before. An instance is
  discarded only when a pipeline step fails or there is no fail-to-pass test (A.3), or when the
  before-log shows `ImportError` / `AttributeError` (A.3; `has_attribute_or_import_error` in
  `swebench/harness/utils.py` at the commit above, applied in `tutorials/validation.ipynb` with
  the comment "Do not consider tasks where the log before the patch has an attribute/import
  error"). That screen removes exactly the instances whose test files import a symbol the gold
  patch introduces, because every test in such a file flips and because a scraped issue rarely
  names the new symbol.
- **Failed both times: `FAIL_TO_FAIL`, not considered** (Appendix A.5).
- **Definitions.** Table 9 (Appendix A.2, p. 18): `FAIL_TO_PASS` is the list of tests whose
  status changes from fail to pass; `PASS_TO_PASS` from pass to pass. Resolution (A.4): the task is
  solved if every test in both lists passes.
- **Also:** 93,139 PRs → 2,294 instances after validation (Table 10); conda environments in the
  paper, Docker since harness 2.0.0 (June 2024).

**Difference from Hecate's validator:** no base-only state; one run; touched files only; a vanished
test is dropped silently where our validator records a regression. The harness's absent-before-is-failed-before
rule is the validator's too, but the validator keeps absent→passed as its own list
(`ABSENT_TO_PASS`) rather than folding it into `FAIL_TO_PASS`, and keeps the instances SWE-bench
discards for import errors, because the course spec is required to name the interfaces its tests
import.

### 3.2 SWE-bench Lite (swebench.com/lite.html)

A 300-instance subset of SWE-bench. Its lists are inherited unchanged. The selection criteria
(page heading "Selection Criteria"; code in `swebench/collect/make_lite/`) are about the problem
statement and patch shape: no images or external links, at least 40 words, one file edited, at
most three hunks, no file creation or removal, no tests that check error messages. **Nothing about
validation states, repeats, scope, or statuses is specified.** Appendix A.7 of the SWE-bench paper
is a one-sentence stub.

### 3.3 SWE-bench Verified (OpenAI, Aug 2024)

Human annotation of 1,699 SWE-bench samples by 93 developers; 500 kept. Two criteria
("Our Approach"): whether the issue is underspecified, and whether the `FAIL_TO_PASS` tests
"filter out valid solutions"; 61.1% of samples were flagged for tests that may unfairly reject
valid solutions, 68.3% removed overall ("Annotation Results"). **No re-execution of tests, no
repeat runs, no statuses, no abnormal-transition rules are specified**; "flaky" does not appear.
The definitions ("Background on SWE-bench"): `FAIL_TO_PASS` tests fail before the PR's solution
and pass after; `PASS_TO_PASS` tests pass both before and after and check nothing unrelated
broke; both sets must pass; tests are not shown to the agent. Verified is a dataset (500 rows),
not a repository; it has no validation code of its own and is evaluated by the SWE-bench harness,
so its test scope is the harness's: only the test files the PR's test patch modified. Concrete
check: for the Verified instance `astropy__astropy-12907`, the generated `eval.sh` in the
SWE-bench task repository (`swe-bench-tasks/tasks/astropy__astropy-12907/eval.sh`, line 55) runs
`pytest -rA astropy/modeling/tests/test_separable.py`, the one file its test patch touches
(lines 14–16 of the same script). A data defect worth knowing: the SWE-bench harness's
`swebench/harness/grading.py`, `_resolve_case` (lines 61–73), documents that 676 expected test
ids in SWE-bench_Verified are truncated mid-parameter (issue #290), 47 of them ambiguous.

### 3.4 SWE-bench Pro (arXiv:2509.16941, Scale AI, 2025)

- **States: not specified.** §4.1 defines the base and instance commits, the test patch (diff of
  test-related files) and the gold patch (the rest). §4.3 says gold tests must pass; a before-fix
  run is never described.
- **Repeats: yes, count unspecified.** §4.3 "Environment verification": gold tests are run
  "several times" and must pass consistently; problems that do not are dropped. Unit of discard:
  the problem.
- **Scope: not specified.** Only "the test suite".
- **Terms:** `fail2pass` and `pass2pass` (§3.2); no other statuses.
- **Abnormal transitions / failed both times: not specified.** The only test-level drop is human:
  tests irrelevant to the task or too broad are removed (§4.3 "Test verification").
- **Definitions:** fail2pass tests verify the issue is resolved; pass2pass tests ensure existing
  functionality remains intact (§3.2).
- **Also:** environments built by hand by engineers (§4.3), human-written requirements and
  interface specs (§3.2), every problem edits ≥10 lines across multiple files (§1, §3.1),
  copyleft and private repositories for contamination (§3.1, §3.3). Languages Python, JS/TS, Go.
- **From the public repository** (`scaleapi/SWE-bench_Pro-os`, v2.0.0, commit `66f9276`,
  2026-09-22), which answers what the paper leaves unspecified:
  - *States: two.* The v2 release gate (`v2/GATE.md`) ran every task with the reference patch
    (642/642 resolved) and with an empty patch (642/642 unresolved, "0 spurious passes"). Test
    patch + gold, and test patch + nothing: the SWE-bench shape, run with the published evaluator.
  - *Scope: selected files.* Every task's `tests/config.json` carries
    `selected_test_files_to_run`, which `tests/test.sh` passes to `run_script.sh`; no task runs
    the whole suite.
  - *Regression coverage:* across all 642 v2 `tests/config.json` files, **313 have an empty
    `pass_to_pass` list**; median `pass_to_pass` is 1, median `fail_to_pass` is 4.
  - *Statuses:* the per-instance parsers emit `PASSED`, `FAILED`, `SKIPPED`, `ERROR`, `XFAIL`
    (`run_scripts/*/parser.py`); the evaluator counts only `status == "PASSED"` and resolves iff
    F2P ∪ P2P ⊆ passed (`swe_bench_pro_eval.py`, lines 556–558).
  - *Revisions:* v2 regenerated test lists against repaired parsers and revised 214 test patches
    and 38 gold patches (`v2/README.md`, "What changed from v1").

### 3.5 SWE-rebench (arXiv:2505.20411, Nebius, 2025)

- **States: two**, both with the test patch applied (§2.3): at least one test-patch test must
  fail before the solution patch; all initially failing test-patch tests must pass after; all
  initially passing test-patch tests must keep passing. No base-only run is described.
- **Repeats: yes, count unspecified** (Appendix B.5): tests are run multiple times and instances
  that fail in at least one run are excluded. Unit of discard: the instance.
- **Scope: test-patch tests only** (§2.3; Appendix G generates test directives from the test
  patch).
- **Terms:** pass/fail only. Before-logs with `AttributeError` / `ImportError` are a filter
  (Appendix G/H).
- **Abnormal transitions:** a test-patch test going passed→failed invalidates the task
  (condition 3). Disappearing or skipped tests: not specified.
- **Failed both times:** condition 2 requires every initially failing test-patch test to pass
  afterwards, so one that still fails invalidates the task (implied, not stated).
- **Definitions:** Appendix K, Table 5: `FAIL_TO_PASS` = test identifiers that failed before and
  passed after the solution patch; `PASS_TO_PASS` = passed both before and after.
- **Also:** Python only; LLM-generated install recipes (§2.2); 21,336 instances, median 2
  fail-to-pass and 22 pass-to-pass tests (Appendix M, Table 7); no per-instance human check.

### 3.6 Senior SWE-bench (senior-swe-bench.snorkel.ai, 2026)

Not a test-patch benchmark. Tasks are graded by expert-written verifiers, an agent-written
validation stage, an LLM rubric judge and a taste judge (blog "How Senior SWE-Bench works").
Validation runs each task with a no-op solution and an oracle solution; checks are classed as
pass-to-pass (pass for both) or fail-to-pass (fail with no-op, pass with oracle). The validation
agent is run three times on the oracle and three times on the no-op; a task is rejected if
pass^3 < 1 on the oracle or > 0 on the no-op ("Ensuring validation agent reliability"). Test
scope, no-result terms, abnormal transitions and failed-both-times are not specified; the public
harness records `error`, `no_tests`, `pass`, `fail` per run (`tests/ssb_lib/runners/base.py`).
No paper exists; cite the blog and the dataset repository.

### 3.7 DesignBench (arXiv:2506.06251, 2025)

Not a test-based benchmark: 900 front-end generation, edit and repair samples graded by
compilation success, CLIP and SSIM similarity, code-modification similarity, and GPT-4o as judge
(§4.1, §5.4). Instances are validated by five PhD students rating instruction clarity and
modification quality by majority vote (§4.2); reference solutions are not executed in a harness.
Repeats, scope, statuses, transitions: not applicable. Its relevance here is as a contrast: a
benchmark can be rigorous without any execution-based test validation, but then it cannot
produce `FAIL_TO_PASS` lists at all.

### 3.8 Web-Bench (arXiv:2505.07473, ByteDance, 2025)

50 projects × 20 sequential tasks with author-written Playwright end-to-end tests (3–5 per task)
(§2.1, Table 1). Pre-release validation is a calibration loop (§2.2.3, Appendix D.1): the human
reference solution must pass every test, and claude-3-5-sonnet must be able to pass task 20,
with test cases revised when they are too strict or too loose. Task n's evaluation runs the tests
of tasks 1..n, so earlier tasks act as regression tests (`libraries/test-util/test.sh`). No
repeats for flakiness are specified; statuses are passed/failed; a task that fails both attempts
ends the project (§3.2, §3.4). Not PR-derived, so no `FAIL_TO_PASS` construction.

### 3.9 ProgramBench (arXiv:2605.03546, 2026)

200 tasks where an agent rebuilds a program from an execute-only gold binary; tests are
agent-generated plus harvested, median 770 per task (§2.1–2.3). Validation runs every test
against the gold binary and a dummy binary: tests that fail the gold binary are flagged, revised,
and discarded if still failing; tests that pass the dummy are discarded (§2.2, Appendix A.3.4).
Repeats: tests are run against the gold binary "multiple times" and must pass consistently;
count not stated (A.3.4). Scope: the whole generated suite. The evaluator records `not_run` for a
test expected but missing from the JUnit output (`eval.py`, `missing_from_junit_xml`). Not
PR-derived. Appendices B.1 (after its first lines), B.2 and C were unreadable in every arXiv
rendering; they concern experimental setup, not validation.

### 3.10 Multi-SWE-bench (arXiv:2504.02605, ByteDance, 2025) and its harness

The closest design to Hecate's validator's.

- **States: three.** §3.1.4 "Phase 4: Pull Request Filtering": `run.log` on the base commit;
  `test.log` with `test.patch` applied; `fix.log` with `test.patch` and `fix.patch` applied. Each
  test is summarized by its transition across the three (e.g. PASSED→FAILED→PASSED).
- **Repeats: none stated.** No mention of repeated runs; the harness has no repeat logic. §6.5
  notes Java and C tests can be unstable under heavy parallelism, mitigated by reducing
  parallelism.
- **Scope: full suite.** §3.1.4 runs the full test suite, explicitly in contrast to SWE-bench
  running only relevant tests.
- **Terms: `PASSED`, `FAILED`, `SKIPPED`, `NONE`.** §3.1.4: because tests may be conditionally
  disabled or omitted after a patch, `NONE` and `SKIPPED` are tracked in addition to the two
  SWE-bench statuses. Harness (`multi-swe-bench/multi-swe-bench`, commit `24f493f`): `NONE` is
  assigned to any test name absent from a log (`multi_swe_bench/harness/report.py`, lines 65–67);
  `PASSED` and `XFAIL` map to pass, `FAILED` and `ERROR` to fail, `SKIPPED` to skip
  (`multi_swe_bench/harness/test_result.py`, lines 131–134). The paper never mentions XFAIL
  (pytest's "expected failure": a test marked as known-broken that fails as predicted).
- **Abnormal transitions:** a transition is written run.log→test.log→fix.log, and "ANY" means
  the run.log (base) status is not looked at. Three PR-level discard rules (§3.1.4, quoted at
  ≤12 words): "PRs with any ANY→PASSED→FAILED transitions are discarded" (a regression from the
  fix); "PRs without at least one ANY→FAILED→PASSED transition are discarded" (nothing fixed);
  "PRs exhibiting abnormal transitions such as PASSED→NONE/SKIPPED→FAILED are discarded". A test
  that disappears after the fix (…→NONE) or goes PASSED→SKIPPED is not a stated discard trigger;
  it simply falls outside the retained set. Paper/code discrepancy: the harness's "fix something"
  check (`report.py`, lines 107–117) is `test.test != PASS and test.fix == PASS`, so a PR whose
  only fixed test went SKIP→PASS or NONE→PASS is accepted, where the paper's sentence requires
  FAILED→PASSED. The other rules match the code exactly: rule 2 is lines 100–105
  (`test.test == PASS and test.fix == FAIL`), the anomalous triple is lines 119–128
  (`test.test in {NONE, SKIP} and test.fix == FAIL and test.run == PASS`), the four buckets are
  lines 130–138, and a fix log with zero captured tests is invalid (lines 94–98).
- **What "counted as fixed" means in code.** Two places. (1) A PR becomes an instance only if
  some test satisfies `test.test != PASS and test.fix == PASS` (`Report.check()`, the
  `fix_something` flag); NONE→PASS and SKIP→PASS satisfy it. (2) Each instance stores
  `p2p_tests`, `f2p_tests`, `s2p_tests`, `n2p_tests`; a candidate patch resolves the instance only
  if every test in each stored list lands in the same list when the candidate replaces the fix
  (`multi_swe_bench/harness/gen_report.py`, `gen_eval_reports`:
  `for n2p in dataset.n2p_tests: if n2p not in report.n2p_tests:` → invalid). So an `n2p` test
  is a must-pass requirement with the same weight as an observed `f2p` test. The base run never
  enters either place: `n2p` is "Any → None → Passed", and the only condition in `Report.check()`
  that reads `test.run` is the anomalous triple. The validity check also never requires a `p2p`
  test to exist after the fix, only that it did not fail (`fix == FAIL`); a passing test that
  vanishes (`fix == NONE`) is unflagged.
- **Failed both times:** not specified; the harness neither flags nor buckets FAIL→FAIL.
- **Definitions:** the paper never uses `FAIL_TO_PASS` / `PASS_TO_PASS`; retained tests are those
  with transitions Any→FAILED/PASSED/SKIPPED/NONE→PASSED (end of §3.1.4); Table 1 reports
  #A2P2P, #A2F2P, #A2N2P. Buckets are keyed on test.log→fix.log; run.log is "Any". NONE→PASSED is
  its own bucket (`n2p_tests`), kept apart from FAILED→PASSED (`f2p_tests`); the validator's
  `ABSENT_TO_PASS` / `FAIL_TO_PASS` split is this design.
- **Also:** 7 languages, 2,456 instances before annotation; 68 annotators, two per instance,
  with 14-person reference labelling (§3.1.5) → 1,632 final.

**Difference from the validator:** no repeats; no regression flag for a test that vanishes after
the fix; the base state feeds one discard rule. The validator generalizes that rule (R0 stands in
whenever R1 has no result) and treats vanished or disabled tests as regressions.

### 3.11 SWE-bench Multimodal (arXiv:2410.03859, 2024)

- **States:** before/after the solution, reusing SWE-bench's pipeline (§2.1, §2.2 step 3); not
  stated more precisely.
- **Repeats: yes, with a contradiction.** §2.2 step 4 says validation is run 10 times per
  instance and inconsistent tests removed; Appendix B.2 says five consecutive runs, and the
  instance is filtered if the set of tests or the pass/fail sets differ. Table 13: 36 instances
  dropped at this stage (679 → 643).
- **Scope: mixed.** Appendix A.3: the entire suite for some repositories (highlight.js, p5.js,
  quarto-cli), only test-patch files for most, where pass-to-pass tests are few or none. No
  policy reason is given: the appendix says the counts are an outcome of how the per-repository
  testing specifications and log parsing were manually specified, and that log granularity
  differs (per file for some codebases, per test for others). A property of hand-written specs,
  not a design choice.
- **Terms:** pass/fail only in the paper; the JS log parsers emit `SKIPPED`, and six repositories
  are graded "fail only", where an absent test counts as success (`constants/__init__.py`).
- **Abnormal transitions:** only across repeated runs (B.2). Pre→post disappearance: not
  specified.
- **Definitions:** §2.1: F2P tests fail before the solution and pass after; P2P tests verify
  existing functionality; resolved when all pass.
- **Also:** 24 instances removed as impossible by manual inspection; Multimodal v2
  (swebench.com/multimodal.html, Sept 2026) retains 480 tasks with known flaky tests removed.

### 3.12 SWE-Cycle (arXiv:2605.13139, 2026)

489 instances re-filtered from SWE-bench Verified, Pro and Multilingual. §3.1 "Test Reliability
Filtering": the gold tests are executed in a "buggy state" and a "fixed state"; `FAIL_TO_PASS`
tests must fail and `PASS_TO_PASS` tests must pass in the buggy state, and both must pass in the
fixed state; 34 instances with corrupted test behaviour removed. Two states; how the fixed state
is built is not described; no repeats, scope, statuses or transition rules beyond that check are
specified. The lists themselves come from the source benchmarks. Contamination detection by
prompting an LLM without the issue text (§3.1, Appendix A.1).

### 3.13 SWE Atlas (arXiv:2605.08366, Scale AI, 2026)

Not an issue-resolution benchmark: 284 expert-authored Codebase Q&A, Test Writing and
Refactoring tasks. The closest analogues: Refactoring runs the project's test suite at the base
commit and again after the agent's change plus hidden tests, and fails if any relevant existing
test goes from pass to fail (§2.1.3); Test Writing runs the agent's tests once on the original
code and once on mutated code, and they must fail or error on the mutant (§2.1.2). No
`FAIL_TO_PASS` construction, no repeats for validation (the only flakiness study is of the rubric
judge, Appendix H), statuses pass/fail/"error out".

### 3.14 Also cited: SWE-rebench V2 (arXiv:2602.23866, Nebius, 2026)

Not in the seed set, cited for the full-suite and three-runs decisions. §3.3 "Execution-based
Validation": apply the test patch and run the full test suite; apply the solution patch and run
it again; always the full suite rather than task-specific subsets, because full-suite execution
detects unintended side effects; retain only instances with at least one fail-to-pass test; rerun
each candidate three times and retain only instances whose structured outcomes are unchanged
(Table 1: 33,049 → 32,079). Two states; the instance is the unit of discard. `[v2]` Confirmed from
the ICML 2026 camera-ready (PMLR v306, §3.3: "we rerun each candidate task three times and retain
only instances whose structured test outcomes remain unchanged across runs"; Table 1 row "Stable
across 3 validation runs 32,079"): the repetition is of the whole before/after pair, the unit of
discard the instance. The arXiv HTML v1 lacks this sentence; cite the PDF. Statuses: §3.2 says
pass, fail, error; Appendix A.3.3 says PASSED, FAILED, SKIPPED (the paper is inconsistent).
Appendix A.3.2 requires the test command to have no file- or target-specific selectors. 20
languages; no per-instance human verification.

### 3.15 Also cited: "Are 'Solved Issues' in SWE-bench Really Solved Correctly?" (arXiv:2503.15223, 2025)

§1 and §2.1: SWE-bench and Verified run only the developer-written test files modified in the
PR. §4.1 (RQ1): the authors collected every test file in each repository and ran them all, with
the test patch applied, under the generated patch and under the oracle patch; a patch is
incorrect if at least one test passes with the oracle and fails with the generated patch;
inconsistent tests were re-run 20 times with the oracle to filter flaky ones. Table 1: of the
patches three tools had resolved on SWE-bench Verified, 8.4% (CodeStory), 7.6% (LearnByInteract)
and 7.2% (OpenHands) fail the full suite. Table 1 gives each tool's resolved count out of 500
(311, 301, 265) and incorrect count (26, 23, 19); summed, 68 of 877 = 7.75%, the paper's "on
average 7.8% of plausible patches" (§1, §4.1). "Plausible" is the paper's word (§1) for patches
that passed SWE-bench's own check, i.e. resolved; the ~623 attempts that failed that check were
never examined. Recommendation (§5.1): use all developer tests by default.

## 4. Side by side

| Source | States | Repeats | Scope | No-result term; extra statuses | Vanished / disabled after fix | Failed both times |
|---|---|---|---|---|---|---|
| **This validator** | 3 (R0 base, R1, R2); R0 is the fallback when R1 has no result | 2 per state; flaky **test** excluded, row kept | full suite | `absent`; `skipped` tracked; absent→passed kept apart as `ABSENT_TO_PASS` | regression, row rejected with reason | `FAIL_TO_FAIL`, recorded, not counted |
| SWE-bench | 2 (A.3) | 1 (A.1) | touched files (A.1, A.3) | "missing" = failed (A.4); harness SKIPPED/ERROR | no list (harness iterates after-tests only) | `FAIL_TO_FAIL`, not considered (A.5) |
| SWE-bench Lite | inherits | inherits | inherits | — | — | — |
| SWE-bench Verified | human annotation only | not specified | inherits | pass/fail | not specified | not specified |
| SWE-bench Pro | paper: not specified; repo: 2 (gold vs empty patch, `v2/GATE.md`) | "several", instance dropped (§4.3) | selected files per task (`tests/config.json`); 313/642 tasks have no P2P | PASSED/FAILED/SKIPPED/ERROR/XFAIL (parsers); fail2pass/pass2pass | not specified | not specified |
| SWE-rebench | 2 (§2.3) | "multiple", instance dropped (B.5) | test-patch tests (§2.3) | pass/fail | passed→failed invalidates (§2.3) | invalidates if from the test patch (§2.3, implied) |
| Senior SWE-bench | no-op vs oracle | 3× each, task rejected | task verifiers | error/no_tests/pass/fail (harness) | not specified | not specified |
| DesignBench | no execution | — | — | — | — | — |
| Web-Bench | reference must pass all tests | not specified | author E2E tests, cumulative | passed/failed | task ends project | — |
| ProgramBench | gold vs dummy binary | "multiple", test dropped (A.3.4) | whole generated suite | `not_run` (evaluator) | — | gold-failing tests discarded |
| Multi-SWE-bench | 3 (§3.1.4) | none stated | full suite (§3.1.4) | `NONE`, `SKIPPED` (§3.1.4) | not flagged; excluded from retained set | not bucketed (harness) |
| SWE-bench Multimodal | before/after (§2.1) | 10 (§2.2) or 5 (B.2); instance dropped | mixed per repo (A.3) | pass/fail; parsers emit SKIPPED | not specified | not specified |
| SWE-Cycle | 2 (§3.1) | not specified | not specified | pass/fail | instance removed if check fails | not specified |
| SWE Atlas | base vs after change | not specified | project suite + hidden | pass/fail/"error out" | pass→fail fails the task (§2.1.3) | not specified |
| SWE-rebench V2 | 2 (§3.3) | 3, instance dropped (§3.3) | full suite (§3.3) | pass/fail/error (§3.2); PASSED/FAILED/SKIPPED (A.3.3) | not specified | not specified |
| Solved-Issues study | 2 (§4.1) | 20 for suspected flaky tests (§4.1) | full suite (§4.1) | not specified | — | — |

`[v2]` Nine further rows (SWE-bench Goes Live!, SWE-bench-java, SWE-Sharp-Bench, OmniGIRL,
SWE-Bench++, OmniCode, SWE-PolyBench, SWE-MERA, FAUN-Eval) are in the addendum, §4a.

## 5. Where the validator differs, and why

1. **Full suite.** With Multi-SWE-bench and SWE-rebench V2, against SWE-bench, Lite, Verified
   and SWE-rebench v1. The Solved-Issues study measured the cost of the touched-files rule (7.8%
   of resolved patches fail the full suite), and SWE-bench Pro v2 shows its other consequence:
   313 of its 642 tasks have no pass-to-pass tests at all. Student suites are small, so the cost
   of running everything is seconds.
2. **A base-only state, used as a fallback.** Of the 13 seeds only Multi-SWE-bench runs the base
   commit, and uses it for one discard rule (PASSED→NONE/SKIPPED→FAILED). `[v2]` Two of the nine
   further benchmarks also run it: SWE-Sharp-Bench as a gate (all tests must pass at base,
   §III-A item 4) and SWE-Bench++ as a third log whose use is not stated (§3.3.1). None of the
   three uses it as a fallback "before" status. The validator generalizes it: R0 is
   the "before" status whenever R1 has no result for a pre-existing test, which is what makes
   that hidden regression visible and keeps a pre-existing test from being mis-counted as
   `FAIL_TO_PASS` when the test patch temporarily broke its file.
3. **Two runs per state, excluding the test rather than the instance.** Counts in the family
   range from one to twenty; most discard the instance on disagreement. Student rows are scarce,
   so the validator keeps the row and records the flaky test; a stricter export filter can be
   applied from the recorded list. The count is one constant.
4. **Vanished or disabled tests are regressions.** No benchmark in the set flags a test that
   disappears or becomes skipped after the fix; SWE-bench's harness drops it from every list.
   `[v2]` SWE-bench Goes Live!'s harness is the clearest case: with `PASS_TO_PASS = pre_pass ∩
   post_pass` and `FAIL_TO_PASS = post_pass − pre_pass`, a test that passed before and vanished,
   failed or skipped after is in neither list (`evaluation/validation.py`, `compare`). One caveat
   on the "disabled" half: SWE-bench's grading at `main` now treats a skipped `PASS_TO_PASS` test
   as maintained (`test_maintained`), so on that point this validator is stricter than the harness
   that grades its export, by decision rather than by family practice.
   The validator rejects the row with the reason, because this is how student fixes break test
   files (an import that stops resolving) and because the course handout forbids weakening a test
   to make it pass. The failure is visible for review rather than silent.
5. **`FAIL_TO_FAIL` is recorded.** SWE-bench names the category and does not count it; the
   validator does the same but writes the list out, so a student test that never passes is visible.
   SWE-rebench would invalidate the task when such a test came from the test patch; here the
   course's "Tests pass" criterion already covers the student, and the row stays a sound task
   while some test proves the fix.
6. **Verdict rules are the family's.** At least one fail-to-pass test (SWE-bench A.3,
   Multi-SWE-bench §3.1.4, SWE-rebench V2 §3.3) and no passed→failed regression (Multi-SWE-bench
   §3.1.4, SWE-rebench §2.3).
7. **Import-dependent tests are kept, apart.** SWE-bench and SWE-rebench discard instances
   whose before-fix log shows an ImportError or AttributeError, because a scraped issue rarely
   names the interface a new test imports. `[v2]` Two further published policies exist for the same
   case: SWE-PolyBench discards the PR on the diff, before running, when the code patch creates
   files the tests exercise (§3.2); SWE-Bench++ keeps it and counts the new tests that pass after
   as F2P, with the Before build failure as the evidence of absence (§3.3.2 Scenario B) — the same
   decision as this validator's, without the separate label or the base-state recovery. The four
   policies are tabulated in the addendum, §6b. The course handout requires the Specs section to name
   every function, file and endpoint the tests touch, and the rubric grades it, so the validator
   keeps such rows. It records their tests as `ABSENT_TO_PASS`, separate from observed
   `FAIL_TO_PASS`, which is Multi-SWE-bench's `n2p` / `f2p` split; the SWE-bench-format export
   folds the two.

## 6. What two states cannot see, and what each benchmark does about it

Ten of the thirteen seed benchmarks run two states: R1 (base + test patch, SWE-bench's "before")
and R2 (base + test patch + fix, "after"), or an equivalent pair. SWE-bench (A.3), Lite and
Verified (inherit), SWE-bench Pro (gold vs empty patch, `v2/GATE.md`), SWE-rebench (§2.3),
Senior SWE-bench (no-op vs oracle), ProgramBench (gold vs dummy binary), SWE-bench Multimodal
(§2.1), SWE-Cycle (§3.1), SWE Atlas (base vs after change); SWE-rebench V2 (§3.3) too. One runs
three, Multi-SWE-bench (§3.1.4), and two do not execute tests this way (DesignBench, Web-Bench).
The base commit, R0, is run by exactly one benchmark in the set of thirteen. `[v2]` Across the
24 sources now read it is run by three (Multi-SWE-bench, SWE-Sharp-Bench, SWE-Bench++), for
three different purposes; the recount is in the addendum, §6a.

With R1 and R2 only, every test has two observations, and that is enough as long as every test
runs in R1. The moment a test file cannot load in R1 (in Vitest: it imports a module file that
only exists with the fix, a top-level statement calls something the fix adds, or a syntax
error; a named import of a missing function from an existing module does *not* stop the file,
the test runs and fails with a TypeError), every test in that file has no result in R1 and two
observations collapse to one. Three things become invisible:

1. **No R1 result, passes in R2.** An old test that passed before the task existed, an old test
   the author rewrote, and a brand-new test are all "nothing, then pass." SWE-bench and
   SWE-rebench discard the instance when the before-log shows an ImportError (A.3; Appendix H).
   Pro, SWE-rebench V2, SWE-Cycle and the other two-state designs know only "passed" or not, so
   the test counts as fail-to-pass, proof of a fix it may have nothing to do with. Multi-SWE-bench
   has R0 and does not consult it here: all three are `n2p`, counted as fixed. Stakes: an old test
   that was already passing becomes evidence for the fix, and a test patch with no real tests
   validates on it (accepted by Multi-SWE-bench's code, lines 107–117; the paper's text requires an
   observed FAILED→PASSED).
2. **No R1 result, fails in R2.** An old test the test patch broke and the fix never restored,
   and a new test that never worked, are both "nothing, then fail," which every two-state design
   files as failed-both-times and ignores. Stakes: the row is validated with a reference solution
   that broke existing behavior, and the broken test is in no list, so candidate patches can
   break it unpenalized. Rejecting every row with an R2 failure is not a fix, because real suites
   contain tests that were broken before the change; only R0 separates "already broken" (failed
   at R0 too) from "broken by this fix" (passed at R0). This is the one case Multi-SWE-bench uses
   R0 for: PASSED→NONE/SKIPPED→FAILED discards the PR (`report.py` 119–128).
3. **Missing from R2.** A deleted or disabled test is in no list and no rule fires: SWE-bench's
   list builder iterates `sm_after` only, so a test absent after the fix is never visited and a
   SKIPPED one matches neither branch (`conversion.py`, `convert_log_to_ground_truth`);
   Multi-SWE-bench's regression check needs `fix == FAIL` and its buckets need `fix == PASS`, so
   PASSED→NONE→NONE and PASSED→NONE→SKIPPED trigger nothing. Stakes: the oldest way to make a
   failing test pass is to delete it or skip it; without R0 that submission validates cleanly,
   because R0 is the only record that the test existed and passed.

The human review steps do not close these. Verified's annotators judge the issue and the
`FAIL_TO_PASS` tests for fairness; Pro's engineers prune the listed tests for relevance (§4.3);
Multi-SWE-bench's annotators rate the issue and PR for clarity (§3.1.5). All three review the
tests that made it *into* the lists; none looks for tests that fell out, and a test that fails
with the fix or vanishes is in no list, so no reviewer sees it. In a merged open-source PR the
cost is tolerable (the PR is ground truth; deleting a test is the author's business). In a
student pipeline all three are the ordinary failure modes, and the instructor review reads the
diff against a rubric and never runs tests at base, so it has the same limit.

Multi-SWE-bench's one R0 rule shares the name-identity assumption and never notices: a rewritten
old test that fails with the fix, PASSED (old body)→NONE→FAILED, trips the discard as "the fix
broke an old test" when it is a new body that never passed. The outcome is a discarded PR, so
it costs a row, not a label. That is the pattern across the family: wherever matching by name
misleads them the consequence is discard, which is never a validity problem, so nobody built a
check. The validator asks R0 three questions instead of one (the hidden regression; did it pass
before the task existed; is it gone or disabled now), and because R0 holds the old test files
it checks that a test's body is unchanged before borrowing its R0 result (`modified`).

**What each benchmark does with A**, the untouched old test in a file that cannot load without
the fix (PASS at base, no result with the test patch, PASS with the fix):

| | What they see | What A becomes |
|---|---|---|
| SWE-bench, SWE-rebench | ABSENT → PASS, with an ImportError in the before-log | instance discarded (A.3 / Appendix H) |
| SWE-bench Pro, SWE-rebench V2, SWE-Cycle, other two-state | ABSENT → PASS; "passed" vs not | fail-to-pass, folded in with real proof; Pro's human test review might catch it |
| Multi-SWE-bench | PASS → NONE → PASS, but `n2p` reads only the last two | `n2p`, counted as fixed; not `p2p`, not discarded |
| SWE-Bench++ `[v2]` | Before fails to build; Base log produced but its use not stated (§3.3.1–3.3.2) | Scenario B: "newly added tests in the PR that pass in the After state" are F2P; A is not a newly added test, so its label is not stated |
| SWE-bench Goes Live! `[v2]` | absent → pass (`validation.py`) | `FAIL_TO_PASS` (= post_pass − pre_pass) |
| SWE-PolyBench `[v2]` | not run: the diff shows a new file the tests exercise | instance excluded as "untestable" (§3.2) |
| This validator | PASS → absent → PASS, body unchanged | `PASS_TO_PASS`; row rejected only if A was the only proof |

**The two transitions with no observed failure, across the set:**

| | absent → passed | skipped → passed |
|---|---|---|
| SWE-bench | mostly discarded (ImportError, A.3); otherwise missing = failed (A.4), folds into `FAIL_TO_PASS` | no list at `b4a40501`: `grading.py` treats SKIPPED as neither passed nor failed; `[v2]` at `main` a skipped F2P test grades as failed, a skipped P2P as maintained |
| SWE-rebench | discarded (Appendix H) | pass/fail statuses only; not addressed |
| Multi-SWE-bench | `n2p`, counted as fixed, must-pass | `s2p`, counted as fixed, must-pass; either alone validates the PR by the code |
| Pro, SWE-rebench V2, SWE-Cycle, others | folds into fail-to-pass; no separate name | same fold |
| This validator | `ABSENT_TO_PASS`: proof, listed separately, folded into `FAIL_TO_PASS` at export | not proof; `skipped` list whatever it does after |

## 7. Inconsistencies found in the sources (so they are not repeated as facts)

- SWE-bench Multimodal states validation was run 10 times (§2.2) and five times (Appendix B.2),
  and describes removing tests in one place and instances in the other.
- SWE-rebench V2 lists statuses pass/fail/error in §3.2 and PASSED/FAILED/SKIPPED in Appendix
  A.3.3.
- Multi-SWE-bench's harness accepts a PR whose only fixed test went SKIPPED→PASSED or
  NONE→PASSED; the paper requires FAILED→PASSED.
- The Solved-Issues study: the arXiv listing's abstract (the abs-page text) says 6.2 points of
  inflation and "of all patches"; the v2 PDF's abstract says 6.4, and §1, §4.1 and §4.4 say "7.8%
  of plausible patches" and 6.4. Cite the PDF; the listing text was not updated with the paper.
- SWE Atlas says 18 repositories in §1 and lists 15 in Figure 9a.
- DesignBench §7 says the repair ground truth was written by "developers"; §4.2 says the five
  PhD students, who have three years of front-end development experience, did the repairs
  (about five hours each). Same people described by role; a wording difference, not a
  contradiction.
- The SWE-bench paper's Appendix A.7 (Lite) is a one-sentence stub; Lite's criteria exist only
  on the website and in `make_lite`.
- `[v2]` Inconsistencies in the nine further sources are listed in the addendum, §7a.

## 8. Sources

- SWE-bench: https://arxiv.org/pdf/2310.06770v3 (appendices are absent from the HTML);
  harness https://github.com/SWE-bench/SWE-bench (current `main`: `swebench/harness/grading.py`,
  `swebench/harness/constants/__init__.py`, `docs/assets/collection.md`); validation-era code at
  https://github.com/SWE-bench/SWE-bench/tree/b4a40501b4d604dea28ad03418671cc597570bb9
  (`swebench/harness/engine_validation.py`, `swebench/metrics/conversion.py`,
  `swebench/harness/utils.py::get_test_directives`, `swebench/harness/grading.py`); task
  generator https://github.com/SWE-bench/swe-bench-tasks (`dockerfile_gen/__init__.py`,
  `tasks/astropy__astropy-12907/eval.sh`).
- SWE-bench Lite: https://www.swebench.com/lite.html; `swebench/collect/make_lite/`.
- SWE-bench Verified: https://openai.com/index/introducing-swe-bench-verified/;
  https://www.swebench.com/verified.html.
- SWE-bench Pro: https://arxiv.org/pdf/2509.16941 (v2); https://github.com/scaleapi/SWE-bench_Pro-os (commit `66f9276`: `v2/GATE.md`, `v2/README.md`, `v2/tasks/*/tests/config.json`, `swe_bench_pro_eval.py`, `run_scripts/*/parser.py`).
- SWE-rebench: https://arxiv.org/pdf/2505.20411 (v2; appendices absent from the HTML).
- SWE-rebench V2: https://arxiv.org/pdf/2602.23866 (v2; appendices absent from the HTML).
- Senior SWE-bench: https://senior-swe-bench.snorkel.ai/ and its "How it works" post;
  https://github.com/snorkel-ai/senior-swe-bench-v2026.06.
- DesignBench: https://arxiv.org/html/2506.06251 (v3); https://github.com/WebPAI/DesignBench.
- Web-Bench: https://arxiv.org/pdf/2505.07473; https://github.com/bytedance/web-bench.
- ProgramBench: https://arxiv.org/html/2605.03546; https://github.com/facebookresearch/ProgramBench.
- Multi-SWE-bench: https://arxiv.org/html/2504.02605 (v1); harness
  https://github.com/multi-swe-bench/multi-swe-bench at commit `24f493f` (2025-12-18):
  `multi_swe_bench/harness/report.py` (lines 65–67, 90–142), `test_result.py` (lines 22–32,
  131–134), `constant.py`.
- SWE-bench Multimodal: https://arxiv.org/pdf/2410.03859 (appendices absent from the HTML);
  https://www.swebench.com/multimodal.html.
- SWE-Cycle: https://arxiv.org/pdf/2605.13139.
- SWE Atlas: https://arxiv.org/pdf/2605.08366.
- Solved-Issues study: https://arxiv.org/pdf/2503.15223 (v2).
- `[v2]` Sources for the nine further benchmarks, the SWE-bench `main` harness and the SWE-rebench
  V2 camera-ready are in the addendum, §8a.
