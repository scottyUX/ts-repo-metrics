# Validation survey — v2 addendum (2026-11-02)

Companion to `BENCHMARK_VALIDATION_SURVEY.md` (status date 2026-10-11). This file adds the nine
"Set A" papers (the Stage-2 candidates all three reviewers nominated that the survey had not read),
two quick checks on sources the survey already cites, and the recount of the base-commit question.
Nothing here replaces the survey's §1–§8; it extends them. Sections are numbered to slot in:
§3.16–§3.24 after §3.15; §4a after §4; §6a–§6b after §6; §7a after §7; §8a after §8.

**Provenance and status.** Every Set A entry below was read by Claude (Fable 5.1) on 2026-11-02
from the copy named in each entry (arXiv HTML, a proceedings PDF, or harness code at `main`), one
paper per reading pass, with the same seven questions as §1. Nothing has been checked by a person
yet: every claim is `[AI-read; unverified]` until Jacob (first) and a second reviewer verify it
against the cited section or line — the companion CSV `setA_verification_packet.csv` lists each
claim with its source and URL for that purpose. Quotations are at most a sentence. Where a paper is
silent the entry says "not stated"; nothing is inferred from silence.

**Reading limits that apply to every Set A entry.** arXiv PDFs could not be fetched directly, so the
arXiv HTML rendering was used wherever it exists; several HTML renderings lack appendices (the
survey's reading tip applies). Where a proceedings PDF was used instead it is named. Harness code
was read only for SWE-bench Goes Live! (two files at `main`); for the other eight, "harness not
read" means the public repository exists but no file was opened — the survey's harness-level
claims (e.g. Multi-SWE-bench's `report.py` lines) have no counterpart here yet.

**Headline changes to the survey's conclusions.**
1. §6's "the base commit, R0, is run by exactly one benchmark in the set" → three now (Multi-SWE-bench,
   SWE-Sharp-Bench, SWE-Bench++), for three different purposes; none uses it as the validator does (§6a).
2. The "fold" of absent→passed into fail-to-pass, which §6 attributes to Pro, V2 and SWE-Cycle by
   inference, is visible in code in SWE-bench Goes Live! (`F2P = post_pass − pre_pass`) and in
   SWE-Bench++'s stated Scenario B rule (§3.16, §3.20, §6b).
3. SWE-bench's current `main` harness no longer leaves a skipped test "in no list": a skipped F2P
   test grades as failed, a skipped P2P test as maintained (check 1). The survey's §3.1 and Table 5
   statements hold at commit `b4a40501` only.
4. SWE-rebench V2's three reruns are of the whole candidate task, with the instance as the unit of
   discard — confirmed from the ICML PDF (check 2); the arXiv HTML v1 lacks the sentence.


---

# Two quick checks before handoff — 2026-11-02

Read by Claude from the fetched sources named below; tagged `[AI-read; unverified]` until Jacob checks each quote.

## Check 1 — Has SWE-bench's current `main` harness changed the absent-test rule since the 2024 validation commit?

**Yes, in three ways that matter to the validator.** Sources: `swebench/harness/grading.py` and `swebench/harness/constants/__init__.py` at `main` (fetched 2026-11-02 from raw.githubusercontent.com), compared with `grading.py` at `b4a40501` (2024-06-25).

| Rule | `b4a40501` (2024) | `main` (2026-11-02) |
|---|---|---|
| A test absent from the parsed results | `test_failed`: `case not in sm or status in {FAILED, ERROR}` (lines 47–50) — absent = failed | Same rule survives: `test_failed` returns true when `_resolve_case` finds no key (lines 101–109) |
| XFAIL (pytest "expected failure") | not in `TestStatus` | `TestStatus` has `XFAIL`; `test_passed` counts PASSED **or XFAIL** as a pass (lines 85–90) |
| A **skipped** test | neither passed nor failed: landed in no list (the survey's "SKIPPED matches neither branch") | **For F2P:** `test_failed` now includes `SKIPPED` with the comment "a skipped F2P test is not a resolution; without this, a patch that makes every F2P test skip lands in neither list and scores RESOLVED_FULL" (lines 101–109). **For P2P:** new `test_maintained` — "P2P semantics: a skipped test is not a regression, unlike for F2P" — a skipped P2P test counts as maintained (lines 93–99). |
| Truncated Verified ids | exact match only | `_resolve_case` prefix-matches the 676 truncated ids (issue #290), as the survey already records (lines 61–83) |
| Fail-only repositories | — | `FAIL_ONLY_REPOS` = Chart.js, p5.js, marked, bpmn-js, openlayers, eslint; graded by `check_fail_only`: a test counts as success unless it is present **and** FAILED, so an absent test is a success (constants lines 72–82; grading lines 220–227) |

Consequences for the validator spec (`CSE115A_BENCHMARK_VALIDATION.md`) and the survey:

1. The survey's statement that in SWE-bench a SKIPPED test "matches neither branch" (§3.1, §6 Table "skipped → passed", Table 5 in the audit) is true **at the 2024 validation commit** and **no longer true at `main` for evaluation**: at `main`, a listed F2P test that is skipped under a candidate patch counts as failed, and a listed P2P test that is skipped counts as maintained. Validation (building the lists) was removed from the harness after 2024, so the *list-building* rule is unchanged; the *grading* rule changed. Both the survey and the audit's Table 5 should say "at commit b4a40501; `main` as of 2026-11 grades a skipped F2P as failed and a skipped P2P as maintained."
2. The lab's validator says "a skip is never proof" and treats a passing test that becomes skipped after the fix as a regression. `main` now agrees on the first half (skipped F2P ≠ resolved) and **disagrees on the second**: at `main` a P2P test that skips under the candidate is *maintained*, not a regression. The validator is stricter than current SWE-bench on exactly this point; the spec should cite `test_maintained` as the contrast, not the 2024 "no list" behaviour.
3. XFAIL-as-pass is new and relevant if the course ever runs Python suites; for Vitest there is no XFAIL. Note it in the spec's status table.
4. The router runs on the current harness, so any SWE-bench-format export from the validator is graded by the `main` rules above, not the 2024 ones.

## Check 2 — Are SWE-rebench V2's "three runs" per state or per candidate task?

**Per candidate task, whole procedure, and the survey's reading is confirmed.** Source: the ICML 2026 camera-ready PDF (PMLR v306, pp. 4820–4843; https://raw.githubusercontent.com/mlresearch/v306/main/assets/badertdinov26a/badertdinov26a.pdf; fetched 2026-11-02), §3.3 and Table 1.

Verbatim (§3.3): "We then apply the test patch and run the full test suite. Next, we additionally apply the solution patch and rerun the full test suite. This produces paired execution traces before and after the fix for each candidate instance. We always run the full project test suite, rather than selecting task-specific subsets. … We retain only instances with at least one fail-to-pass test … To reduce noise from flaky or nondeterministic tests, we rerun each candidate task three times and retain only instances whose structured test outcomes remain unchanged across runs."

Table 1 (text layer): "Successful tasks w/ F2P 41,349 / 4,006; Issue text based filtering 33,049 / 3,701; Stable across 3 validation runs 32,079 / 3,617."

Reading: the unit of repetition is the *candidate task* (the before/after pair as a whole), the unit of discard is the *instance*, and the criterion is that the structured outcomes (the per-test status maps) are identical across the three runs. This is what the survey's §3.14 says. Two corrections to the survey's text: (a) the Table 1 row is labelled "Stable across 3 validation runs" and the preceding row (33,049) is the issue-text filter, so the drop 33,049 → 32,079 is the stability filter — correct as the survey has it, but the label should be quoted; (b) the arXiv HTML v1 lacks the three-runs sentence entirely (its §3.3 ends at the F2P retention), so the claim must be cited to the PDF v2 / ICML version, never the HTML.

Status vocabulary (§3.2): "a normalized schema (pass, fail, error, and test identifiers)"; the appendix parser prompts emit `TestStatus.PASSED` / `SKIPPED` (and the prompt text requires the test command to have "no file-/target-specific selection"). The survey's §7 inconsistency note stands.

Consequence for the validator: V2 repeats the whole pair three times and discards the instance; the validator runs each state twice and discards the test. These are different designs, not a different count of the same design, and the spec's sentence "The count is one constant" should also say "and the unit — test, not instance — is the deliberate difference."

---

## 3. Source by source — Set A (continued from §3.15)

### 3.16 SWE-bench Goes Live! (arXiv:2505.23419, Microsoft, 2025) and its harness `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-bench Goes Live!", Zhang, He, Zhang, Kang, Li, Xie, Wang, Wang, Huang, Fu, Nallipogu, Lin, Dang, Rajmohan, Zhang (Microsoft). arXiv:2505.23419 v2 (1 Jun 2025); the appendix carries a NeurIPS checklist and the project README cites it as "the NIPS paper version". Harness: github.com/microsoft/SWE-bench-Live (`main`, fetched 2026-11-02: `Development.md`, `evaluation/validation.py`); environments built by RepoLaunch (github.com/microsoft/RepoLaunch; second paper arXiv:2603.05026). Dataset: 1,319 instances, 93 repositories, Python only (paper Appendix F); later MultiLang (1,077 instances, 8 languages, Aug 2026) and Windows sets on the same pipeline.

Paper (§3.3) and harness read together; where the paper is silent the harness decides.

- **States: two, both with the test patch applied** — paper: validation "is based on analyzing changes in the test suite results before and after applying the PR's patch" (§3.3; whether the test patch is applied before is not stated). Harness `validation.py`, `validate_instance`: `container.apply_patch(test_patch)` → rebuild → `test_cmd` → parse = `pre_patch_status`; then in a fresh container `apply_patch(test_patch)`, `apply_patch(solution_patch)` → rebuild → `test_cmd` → parse = `post_patch_status`. No run of the base commit alone.
- **Repeats: asymmetric — the before state once, the after state three times.** Paper: "the validation process is repeated multiple times… Only instances with consistent results across all runs are retained" (§3.3; count not stated). Harness: the pre-patch run happens once; the post-patch run is `for check in range(3)` ("3 validation for stable states"), and the three after-logs are **merged per test, not compared**: a test is `fail` if any of the three runs failed, else `skip` if any skipped, else `pass`; a test missing from a run is read as `skip` (`.get(test, "skip")`). So a flaky after-test becomes `fail` (and drops out of `FAIL_TO_PASS`); nothing is discarded as an instance at this step. `Development.md` then says a second gold-patch evaluation (`evaluation.evaluation --patch_dir gold`) "filters out these indeterminate instances" whose test names or values differ per run — the instance-level discard happens there, not in `validation.py`: `evaluation.py` re-runs the gold patch once more and keeps only instances it marks `resolved` (every listed F2P test passes, no listed P2P test fails, no listed F2P test fails; lines 188–193, 331–335), so an instance is dropped when a fourth run disagrees with the merged three. At grading, a listed test with no result is in neither `suc` nor `fail` and so counts neither as a success nor a failure: a P2P test that vanishes under a candidate patch does not block `resolved`; a vanished F2P test does, through the subset check (lines 188–189). XFAIL is read as pass (`default_pytest_parser`, lines 63–64).
- **Scope:** the repository's test command as identified by RepoLaunch's verify agent (`test_cmd`; paper Table 6); whether that is the full suite or a selection is a property of the extracted command, not stated as policy. Agents must "pass all test cases in the repository's test suite" (§3.2).
- **No-result term; statuses:** harness statuses are `pass`, `fail`, `skip` only (`Literal['pass','fail','skip']`, asserted); the paper names FAILED, ERROR, PASSED (§3.3). A test absent from the after-run is treated as `skip` when merging the three runs; a test absent from the before-run has no status and is simply not in `pre_pass`.
- **Abnormal transitions:** not stated in the paper. Harness: `PASS_TO_PASS = pre_pass ∩ post_pass`; `FAIL_TO_PASS = post_pass − pre_pass`. Consequences: (i) absent-before → pass-after and skip-before → pass-after are both `FAIL_TO_PASS` (the "fold" of the two-state designs); (ii) a test that passes before and fails, skips, or vanishes after is in neither list and triggers no rule — a regression from the fix is invisible; (iii) pass→skip after the fix is likewise in neither list.
- **Failed both times:** not stated; harness places it in neither list (not in `post_pass`).
- **Definitions (§3.3):** `FAIL_TO_PASS` — "Tests that were initially failing (FAILED or ERROR) and later passing (PASSED)"; `PASS_TO_PASS` — "Tests that were both passing before and after the patch is applied." Harness definition is set arithmetic on `pass` only, so "initially failing" in practice means "not passing before" (failed, skipped, or absent).
- **Retention:** `FAIL_TO_PASS` non-empty (`validation.py` line 179 filters instances with zero F2P); no regression rule.
- **Also:** containers per instance (RepoLaunch images); no ImportError/collection screen stated; no human verification of test lists stated; repository selection 8,577 → 3,316 → 2,609 (§3.1); monthly refresh, Lite = 300 instances sampled 50 per month Oct 2024–Mar 2025.

**Base commit without the test patch executed as a separate state: no** (harness).

**Why it matters for the survey.** This is the first benchmark in the set whose *harness* defines fail-to-pass as "passes after and did not pass before" with absent and skipped folded in explicitly — the fold the survey attributes to Pro, V2 and SWE-Cycle by inference is here visible in nine lines of code. It is also the only one with asymmetric repeats (1 before, 3 after) and merge-by-worst-status rather than compare-and-discard; a test that is flaky after the fix silently leaves `FAIL_TO_PASS` and can leave an instance with no proof, which the `len(F2P) > 0` filter then drops without saying why.

### 3.17 SWE-bench-java (arXiv:2408.14354, 2024) `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-bench-java: A GitHub Issue Resolving Benchmark for Java", Zan, Huang, Yu, Lin, Shi, Liu, Chen, Qi, Yu, Yu, Ran, Zeng, Shen, Bian, Liang, Guan, Huang, Xie, Wang, Wang. arXiv:2408.14354 v1 (26 Aug 2024; only version); venue not stated. Project page multi-swe-bench.github.io; evaluation environment github.com/multi-swe-bench/multi-swe-bench-env. The HTML's §2 heading reads "Multi-SWE-bench" and the dataset is called "SWE-bench-java-verified" — this is the precursor of Multi-SWE-bench (§3.10), same first authors. Read from arxiv.org/html/2408.14354v1 (no appendices).

- **States: two** — "comparing test results before and after applying the ground-truth patch"; "two different containers … based on the code repository that has been patched with the fix and the code that hasn't" (§2.1.1 item 4). Whether the test patch is applied in the "hasn't" container: not stated.
- **Repeats:** not stated.
- **Scope:** "run the tests mentioned in the crawled test patch" (§2.1.1 item 4); test commands "tailored to each project's unique setup" (§2.1.2).
- **No-result term; statuses:** not stated ("we parse the output test log to obtain the results of related tests").
- **Abnormal transitions:** one instance-level rule — "We only keep the issue instances which have at least one fail-to-pass test and no pass-to-fail test" (§2.1.1 item 4). Disappearing or skipped tests: not stated.
- **Failed both times:** not stated.
- **Definitions:** "fail-to-pass test … tests that fail before the issue fix but pass after it" (§2.1.1 item 4); "pass-to-fail" used in the retention rule but not defined; **pass-to-pass is never used**. Grading (§3.1.1): "An issue is considered resolved only if all given test cases pass."
- **Also:** Java only; Docker containers; compile screen ("filter out issues where the associated repository fails to be compiled", item 3); counts 19 repositories → 11,979 issues → 308 compile → 137 after the fail-to-pass/no-pass-to-fail filter → 91 after manual screening by 10 developers (Q1 issue clarity, Q2 test coverage, Q3), 6 repositories. Whether annotators examined the fail-to-pass lists: not stated.
- **Harness:** multi-swe-bench-env; no file names in the paper; harness not read.

**Base commit without the test patch as a separate state: not stated.**

### 3.18 SWE-Sharp-Bench (arXiv:2511.02352, Microsoft, 2025) `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-Sharp-Bench: A Reproducible Benchmark for C# Software Engineering Tasks", Mhatre, Bajpai, Gulwani, Murphy-Hill, Soares. arXiv:2511.02352 (v1 4 Nov 2025; v2 5 Nov; v3 18 Nov); venue per the Microsoft Research page: AIware 2025 (IEEE/ACM). Dataset huggingface.co/datasets/microsoft/SWE-Sharp-Bench; curation code github.com/microsoft/prose/tree/main/misc/SWE-Sharp-Bench. Read from arxiv.org/html/2511.02352v2 (v3 HTML not fetchable).

- **States: three, including the base commit alone.** §III-A item 4: "For each PR, we run tests at (1) base, (2) base + test patch and (3) base + test + fix, retaining only cases with pass → fail → pass; all others are treated as flaky and omitted." Appendix A-B item 4: "all test pass at the base commit, at least one test fails after applying the test patch and again all tests pass when we apply both fix and test patch."
- **Repeats:** not stated (the word "flaky" is used for the *pattern* failure, not for repeated runs). Unit of discard: the PR.
- **Scope:** not stated ("all tests"); test files identified by "test"/"testing" in the path (App. A-B item 2); NUnit/XUnit/MSTest outputs normalized to "a common evaluation harness" (item 4).
- **No-result term; statuses:** pass/fail only; no other status named.
- **Abnormal transitions:** no test-level rules; the PR-level pattern rule rejects everything that is not pass→fail→pass. Consequences: a pre-existing failing test at base ("all test pass at the base commit") rejects the PR, as does any pass→fail; a test that vanishes is not discussed.
- **Failed both times:** not stated at test level; excluded by the PR-level "all tests pass" at state 3.
- **Definitions:** never defined in prose; F2P/P2P appear only as table headers ("#Avg. F2P", "#Avg. P2P", Table III/IV). Grading (§IV): "resolved when the agent's generated patch passes all the required tests".
- **Also:** 150 instances, 17 repositories, C# only; per-PR Dockerfiles auto-generated and build-validated (§III-A item 3); build failures manually analyzed then discarded; manual annotation by the first two authors on Verified-style criteria (underspecified statements; overly specific or unrelated tests) — whether the lists themselves were examined: not stated. Inconsistency: issue-type split Bug-Fixes 91 / Feature 47 / Others 12 (§III-B1) vs Bug-Fix 97 / Feature 41 / Refactors 12 (App. A-C).
- **Harness:** repository exists; no file names in the paper; harness not read.

**Base commit without the test patch as a separate state: yes.** Second benchmark in the set to do so, after Multi-SWE-bench, and with a different use: the base run is a *gate* (everything must pass) rather than a third observation per test.

### 3.19 OmniGIRL (arXiv:2505.04606, ISSTA 2025) `[AI-read 2026-11-02; unverified]`

**Identity.** "OmniGIRL: A Multilingual and Multimodal Benchmark for GitHub Issue Resolution", Guo, Tao, Jiang, Wang, Chen, Liu, Ma, Mao, Zhang, Zheng. arXiv:2505.04606 v1 (7 May 2025); ISSTA 2025, DOI 10.1145/3728871. Code and data github.com/DeepSoftwareAnalytics/OmniGIRL. Read from arxiv.org/html/2505.04606v1.

- **States: before/after around the gold patch.** §3.4.3: "Following the approach of SWE-bench, we first run the relevant tests before and after applying the gold patch to observe whether there exist FAIL2PASS test cases." §3.4.2 (environment verification) applies the test patch first, then the gold patch. Whether the "before" run of §3.4.3 includes the test patch: not stated; base alone: not stated.
- **Repeats:** not stated (the "three times" in §5.3 is the LLM evaluation, not validation).
- **Scope:** "run relevant tests" — undefined; §3.4.2 aims at "all tests in the test patch".
- **No-result term; statuses:** fail/pass only.
- **Abnormal transitions:** only "We only retain task instances that contain at least one FAIL2PASS test case" (§3.4.3); environment is "successfully verified only if all test cases pass" (§3.4.2). Vanished, passed→failed, passed→skipped: not stated.
- **Failed both times:** not stated.
- **Definitions (§3.3):** FAIL2PASS — "tests or test cases that are changed from 'fail' status to 'pass' status after applying the gold patch"; PASS2PASS — "tests or test cases that maintain a 'pass' status both before and after applying the gold patch". Resolution (§2.1): "resolved if all related test cases pass successfully".
- **Also:** 959 instances, 15 repositories, Python 374 / JavaScript 270 / TypeScript 210 / Java 105; Docker per instance from README/CONTRIBUTING-derived setup; **human check of the list itself**: "we manually check whether the FAIL2PASS test cases match the tests added or modified in the test patch" (§3.4.3) — action on mismatch not stated; multimodal subset 39 → 19 instances after image filtering. No collection-error screen stated.
- **Harness:** repository exists; no file names in the paper; harness not read.

**Base commit without the test patch as a separate state: not stated.**

### 3.20 SWE-Bench++ (arXiv:2512.17419, Turing, 2025) `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-Bench++: A Framework for the Scalable Generation of Software Engineering Benchmarks from Open-Source Repositories", Wang, Ramalho, Celestino, Pham, Liu, Sinha, Portillo, Osunwa, Maduekwe (Turing R&D). arXiv:2512.17419 v1 (19 Dec 2025, only version); venue not stated. No code or dataset repository stated — only a project page (research.turing.com/swebench, not fetchable here). Distinct from SWE-Bench+ (Aleithan et al., arXiv:2410.06992), which it cites. Read from arxiv.org/html/2512.17419v1, which includes Appendices A–H.

- **States: three, including the base commit alone.** §3.3.1 "Three Repository States": "base (parent commit of the PR), before (base plus test-file changes only), and after (full PR, including implementation changes). The pipeline runs all tests under these three states—Base, Before, and After—producing three distinct execution logs." **What the Base log is used for: not stated** — the classification in §3.3.2 reads only Before and After.
- **Repeats:** not in the oracle-extraction stage. In Stage 4: environments are built and instantiated three times (Layer 1); the golden solution is executed "three times in independent containers" and instances are retained "only … where the test results (Pass/Fail) are identical across all three runs" (Layer 2). Repetition is of the After state only; re-running Before or Base is not stated. Unit of discard: the instance, as worded.
- **Scope:** in tension — "runs all tests under these three states" (§3.3.1) vs "If the Before state builds successfully, we execute the modified tests" (§3.3.2 Scenario A). Where P2P comes from: not stated.
- **No-result term; statuses:** PASS/FAIL in the oracle (§3.3.3, §3.4); FAIL/SKIP/XFAIL appear only in the Stage-2 environment-validator prompt (Appendix A.3). A test with no result: not stated.
- **Abnormal transitions:** not stated; the only discard rule is the Layer-2 determinism rule.
- **Failed both times:** not stated.
- **Definitions (§3.3.2 "State-Differential Classification Logic").** Scenario A (regression / bug fix): "F2P: Tests that fail in Before and pass in After"; "P2P: Tests that pass in both." **Scenario B (feature request): "If the Before state fails to build (due to missing symbols/dependencies introduced in the PR): F2P: We identify newly added tests in the PR that pass in the After state. The build failure in Before serves as the confirmation that the feature was absent."** "We broaden the definition of F2P to encompass both scenarios." P2P under Scenario B: not stated.
- **Also:** 11 languages; counts 137,048 sourced → 28,513 after environment synthesis and log parsing → 11,133 after quality assurance, 3,971 repositories; 1,782-instance evaluation subset; Docker throughout; an ImportError/ModuleNotFound screen exists at the *environment* stage (Appendix A.3: such failures mean "a broken environment that requires rebuilding"), not as a per-instance validation rule; Layer 3 is an LLM judge of statement/oracle alignment; Layer 4 keeps instances SOTA models fail; a Verified-style human subset by 82 annotators — whether they examine the lists: not stated.
- **Harness:** none named; harness not read.

**Base commit without the test patch as a separate state: yes** (three logs produced; the Base log's use is not stated).

**Why it matters for the survey.** Scenario B is the family's first explicit rule for the case the validator calls `ABSENT_TO_PASS`: when the test file cannot load without the fix, the added tests that pass after are counted as proof, and the Before build failure is taken as the evidence of absence. It is the inverse of SWE-bench's ImportError discard. Unlike the validator, it does not separate these from observed fail-to-pass tests ("we broaden the definition of F2P"), does not say what happens to pre-existing tests in the unloadable file (the validator's case A), and does not say what the Base log is for even though it is produced.

### 3.21 OmniCode (arXiv:2602.02262, Findings of ACL 2026) `[AI-read 2026-11-02; unverified]`

**Identity.** "OmniCode: A Benchmark for Evaluating Software Engineering Agents" (arXiv v2 title; v1 HTML and the ACL camera-ready read "…Software Development Agents"), Sonwane, Tu, Lu, Beger, Larsen, Dhar, Alford, Chen, Pattanayak, Dang, Chen, Geng, Ellis, Dutta. arXiv:2602.02262 (v1 2 Feb 2026; v2 6 Feb 2026); Findings of ACL 2026, pp. 40634–40661, DOI 10.18653/v1/2026.findings-acl.2020. Code github.com/seal-research/OmniCode. Read from the ACL Anthology PDF (the arXiv v1 HTML is cut off before Appendix F); section numbers are the ACL copy's. Discrepancy: v1 HTML §1 says 27 repositories, ACL §1/§3.1 say 28.

Four task types; only the bug-fixing task constructs lists in the SWE-bench sense.

- **States (bug fixing, §3.2.1):** tests "distinguish between the pre- and post-fix repository states"; a patch is "evaluated against tests that transitioned from failing to passing due to the ground truth fix, as well as against previously passing tests". Whether "pre-fix" includes the test patch: not stated; base alone: not stated. Environment check (§3.1): "we execute the test suite of the repository to check if the tests can be run without errors" at the PR-time state.
- **Repeats:** Appendix F: "we also filter out flaky and non-functional instances where dependencies could not be installed properly or where pre-existing tests would not pass consistently." Count: not stated. Unit: the instance.
- **Scope:** "the test suite of the repository" for the environment check and the style task; for the bug-fixing lists: not stated.
- **No-result term; statuses:** pass/fail wording only.
- **Abnormal transitions; failed both times:** not stated.
- **Definitions (§3.2.1):** "tests that transitioned from failing to passing due to the ground truth fix" and "previously passing tests to ensure no regressions are introduced"; the names FAIL_TO_PASS/PASS_TO_PASS are not used. Test generation (§3.2.2): generated tests count "if they pass on the ground truth patch but fail on all bad patches". Style (§3.2.4): score 0 unless all tests pass.
- **Also:** 494 base instances (273 Python, 112 C++, 109 Java) across 28 repositories, 1,794 tasks in total; **instances are sourced from SWE-Bench-Verified and Multi-SWE-Bench plus newly collected PRs** (§3.1) — whether inherited instances' lists were re-derived: not stated; containerized environments (Docker not named); dependencies determined manually; manual inspection keeps instances whose PR changes are within the issue's scope (App. F); no collection-error screen stated; human evaluation (App. H) covers synthetic reviews and bad patches, not test lists.
- **Harness:** repository exists; no file names in the paper; harness not read.

**Base commit without the test patch as a separate state: not stated.**

### 3.22 SWE-PolyBench (arXiv:2504.08703, Amazon, 2025) `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-PolyBench: A multi-language benchmark for repository level evaluation of coding agents", Rashid, Bock, Zhuang, Buchholz, Esler, Valentin, Franceschi, Wistuba, Sivaprasad, Kim, Deoras, Zappella, Callot (Amazon). arXiv:2504.08703 (v1 11 Apr 2025; v2 14 Apr; v3 23 Apr, "corrected author name spelling"); venue not stated. Harness github.com/amazon-science/SWE-PolyBench; dataset huggingface.co/datasets/AmazonScience/SWE-PolyBench. Read from arxiv.org/html/2504.08703v3 (Abstract–§3) and v1 (§5.2, §6, §7, Appendix A); §3 wording identical in both.

- **States: two** — "we ran the test suite both before and after applying the code patch" (§3.2), where "the code patch is the git diff containing changes in the PR that do not relate to the tests" and "the test patch is the git diff containing only changes relating to test updates". Whether the test patch is applied in the "before" run: not stated; base alone: not stated.
- **Repeats:** not stated.
- **Scope:** "the test suite" — full vs touched files: not stated.
- **No-result term; statuses:** 'failed' and 'passed' only.
- **Abnormal transitions:** not stated. One distinctive exclusion (§3.2): "we deem PRs untestable and exclude them if the code patch introduces new files whose contents are tested in the code patch [sic] … because created tests cannot reliably evaluate LLM-generated code if functionally correct code was created in unexpected file or function names."
- **Failed both times:** not stated.
- **Definitions (§3.2):** "those that transitioned from a 'failed' state to a 'passed' state (which we refer to as F2P or fail-to-pass), and those that passed both before and after the application of the code patch (which we call P2P or pass-to-pass)"; "For a PR to be included in the dataset it must contain at least one F2P test." Grading (§5.2): solved iff the conjunction of P2P and F2P tests succeeds.
- **Also:** 2,110 instances, 21 repositories — Java 165, JavaScript 1,017, TypeScript 729, Python 199 (abstract; Table 9 gives JavaScript 1,078, inconsistent); 1,572 bug reports, 463 feature requests, 62 refactoring; Docker files manually configured per repository/base commit and published; **no human verification** ("the lack of human verification … is an important limitation", §6); no collection-error screen stated. Inconsistencies: PRs collected 377,300 (§3.1) vs 417,250 (Table 9 sum).
- **Harness:** repository exists; no file names in the paper; harness not read.

**Base commit without the test patch as a separate state: not stated.**

**Why it matters for the survey.** The new-file exclusion is the family's third distinct policy for tests that depend on files the fix creates: SWE-bench discards on the ImportError it causes; SWE-Bench++ keeps the instance and counts the new tests as F2P (Scenario B); PolyBench discards on the diff alone, before running anything, on the grounds that a correct solution might name the file differently. The validator's `ABSENT_TO_PASS` is a fourth: keep, and label separately.

### 3.23 SWE-MERA (arXiv:2507.11059, EMNLP 2025 Demos) `[AI-read 2026-11-02; unverified]`

**Identity.** "SWE-MERA: A Dynamic Benchmark for Agenticly Evaluating Large Language Models on Software Engineering Tasks", Adamenko, Ivanov, Valeev, Levichev, Zadorozhny, Lopatin, Babaev, Fenogenova, Malykh. arXiv:2507.11059 (v1 15 Jul 2025; v2 17 Jul 2025; v3 11 Jul 2026); EMNLP 2025 System Demonstrations, pp. 440–452, DOI 10.18653/v1/2025.emnlp-demos.30. Dataset huggingface.co/datasets/MERA-evaluation/SWE-MERA; pipeline as PyPI `repositorytest` (source github.com/MERA-Evaluation/repotest, hyperlinked not printed); evaluation via pinned forks of Aider and Aider-SWE-bench. Read from arXiv HTML v2 (300-task version) and the EMNLP camera-ready PDF (728-task version); validation wording identical apart from one phrase.

- **States: one described** — "after reverting the repository to the specified state and incorporating these future test cases, tests categorized as PASS_TO_PASS are expected to succeed, while those labeled FAIL_TO_PASS are expected to fail" (§3). A run with the gold patch applied: not stated (the gold patch appears only as an example in Appendix E). Appendix A's build validation (`pytest --json-report`, success iff "more than 0 passed tests") runs with no test patch, as a repository sanity check, not as a per-test state.
- **Repeats:** not stated.
- **Scope:** not stated (pytest with no path argument in Appendix A).
- **No-result term; statuses:** "passed", "succeed"/"fail"; nothing else.
- **Abnormal transitions; failed both times:** not stated (no post-fix run is described).
- **Definitions (§3):** "tests were identified that are introduced in subsequent development but do not yet pass in the current version"; the lists are stated as expectations, and how they are computed is not stated.
- **Also:** Python only; Docker per task (Step 5–6); funnel (EMNLP Table 1) 8.4K/55K one-to-one issue–PR pairs → 6.7K/30K after patch extraction → 1.6K/9K after build validation → 668/1.6K end-to-end → 279/528 after LLM filtering (528 ≠ the abstract's 728 in the same version); PR must modify both source and test files and fewer than 15 source files; **LLM validation** (Step 7, Appendix D): Qwen3-32B scores task correctness, test correctness ("Do the tests cover the problem from the task description?"), test completeness and complexity, and the bottom quartile on any of the first three is dropped — the prompt does not ask whether tests fail before and pass after; no human verification stated.
- **Harness:** `repotest` package and the Aider forks named; no file names; harness not read.

**Base commit without the test patch as a separate state: not stated.**

**Why it matters for the survey.** The only benchmark in the set whose paper describes no execution of the gold patch during construction; the test lists' correctness rests on an LLM judgment of the PR text, and resolution at evaluation time is delegated to the Aider-SWE-bench harness. Whether `repotest` executes a before/after pair is a question for its code `[TBD: read github.com/MERA-Evaluation/repotest]`.

### 3.24 "A Real-World Benchmark for Evaluating Fine-Grained Issue Solving Capabilities of Large Language Models" — FAUN-Eval (arXiv:2411.18019, 2024) `[AI-read 2026-11-02; unverified]`

**Identity.** Hu, Peng, Ren, Jiang, Meng, Wu, Gao, Wang, Gao (ByteDance / Harbin Institute of Technology per the affiliation line). arXiv:2411.18019 v1 (27 Nov 2024, only version); venue not stated. Data at anonymous.4open.science/status/FAUN-Eval. Read from the export.arxiv.org PDF mirror (the HTML was rate-limited); no appendix.

**Not an execution-based benchmark.** No tests are run in any repository state. Three tasks — QA, fault localization, code editing — are graded by text similarity and matching: BLEU/ROUGE/Edit Similarity for QA, exact match of file paths for fault localization, CodeBLEU for code editing (§4.4). The base commit is checked out only to build a pruned folder tree as the fault-localization input (§3.4.2). Construction filters are metadata rules (§3.3.1–3.3.2: merged PR, one-to-one issue–PR, single file changed, no file path containing "test", no comment-only or string-only changes via tree-sitter), then a GPT-4o problem–solution check reviewed by two researchers (§3.3.3). 300 entries, 30 repositories, five languages in the text (Python, Java, JavaScript, TypeScript, Go); Table 1 says 4 languages / 17 repositories for the fix subset.

All seven dimensions: not applicable. **Base commit as a separate state: not applicable.**

**Why it matters.** Relevant to Stage 2 rather than to the validator: whether a similarity-graded benchmark satisfies IC3 ("reproducible evaluation task with defined success metric") is the reviewers' call; for the survey it joins DesignBench as a contrast case — a benchmark that cannot produce FAIL_TO_PASS lists at all, here because it executes nothing.

---

## 4a. Side by side — Set A rows (added 2026-11-02; `[AI-read; unverified]` unless marked)

Same columns as §4. "Set A" = the nine candidate papers all three Stage-1 reviewers nominated that were not already in §3; Multi-SWE-bench, SWE-bench Pro and SWE-rebench V2 are the other three members and are in §4 already. Rows marked "(harness)" rest on code read at the named commit; all others rest on the paper text alone.

| Source | States | Repeats | Scope | No-result term; extra statuses | Vanished / disabled after fix | Failed both times |
|---|---|---|---|---|---|---|
| SWE-bench Goes Live! (harness `main`, 2026-11-02) | 2, both with test patch (`validation.py`) | before ×1, after ×3, merged by worst status; instance dropped later if a gold re-run disagrees (`evaluation.py`) | repo test command from RepoLaunch; policy not stated | `pass`/`fail`/`skip`; absent-after read as `skip` | neither list, no rule (F2P = post_pass − pre_pass) | neither list |
| SWE-bench-java | 2 (with / without fix, §2.1.1); test patch placement not stated | not stated | tests "mentioned in the crawled test patch" | not stated | passed→failed discards the instance; vanished/skipped not stated | not stated |
| SWE-Sharp-Bench | **3, base alone included** (§III-A.4; App. A-B.4) | not stated; PR discarded on any non pass→fail→pass pattern | not stated ("all tests") | pass/fail | not stated at test level; PR-level pattern rule | excluded by the "all pass at state 3" gate |
| OmniGIRL | before/after the gold patch, "following SWE-bench" (§3.4.3) | not stated | "relevant tests" (undefined) | fail/pass | not stated; ≥1 FAIL2PASS required | not stated |
| SWE-Bench++ | **3, base alone included** (§3.3.1); Base log's use not stated | After ×3 in Stage 4 Layer 2, instance dropped if Pass/Fail differ | "all tests" vs "the modified tests" (§3.3.1 vs §3.3.2) | PASS/FAIL; FAIL/SKIP/XFAIL only in the env-validator prompt | not stated | not stated |
| OmniCode | pre-/post-fix (§3.2.1); test patch placement not stated | "pre-existing tests would not pass consistently" → instance filtered (App. F); count not stated | repo suite for env check; lists not stated | pass/fail | not stated | not stated |
| SWE-PolyBench | 2 (before/after the code patch, §3.2) | not stated | "the test suite" | 'failed'/'passed' | not stated; PRs whose code patch creates files the tests exercise are excluded on the diff | not stated |
| SWE-MERA | 1 described (reverted state + future tests, §3); gold-patch run not stated | not stated | not stated | passed; succeed/fail | not stated | not stated |
| Fine-Grained Issue Solving (FAUN-Eval) | no execution (similarity-graded, §4.4) | — | — | — | — | — |

## 6a. The base-commit question, recounted (added 2026-11-02)

§6 says the base commit, R0, "is run by exactly one benchmark in the set" — true of the 13 seeds and two comparison sources. Across the 24 sources now read (13 seeds + SWE-rebench V2 + Solved-Issues + the 9 Set A papers):

- **Run the base commit alone as a separate state: three** — Multi-SWE-bench (§3.1.4; uses it in one discard rule), SWE-Sharp-Bench (§III-A.4; uses it as a gate: everything must pass at base), SWE-Bench++ (§3.3.1; produces the Base log; what it is used for is not stated).
- **Two states, test patch applied in both (stated or shown in code):** SWE-bench, SWE-rebench, SWE-rebench V2, SWE-bench Goes Live! (harness).
- **Two states or a before/after pair, test-patch placement not stated:** SWE-bench Pro (paper), SWE-bench-java, OmniGIRL, OmniCode, SWE-PolyBench, SWE-bench Multimodal, SWE-Cycle.
- **Other designs:** Senior SWE-bench (no-op vs oracle), ProgramBench (gold vs dummy binary), SWE Atlas (base vs after change, for refactoring), DesignBench, Web-Bench and FAUN-Eval (no list construction), SWE-MERA (one state described; gold run not stated), Solved-Issues (two states, full suite, as an audit).

Three uses of the base state, none the same: a per-test third observation feeding one discard rule (Multi-SWE-bench); a whole-suite gate (Sharp-Bench); a log whose consumer is unstated (SWE-Bench++). None uses it as a fallback "before" status for a test that has no result at R1, which is the validator's use (§2, §5 item 2). So the §5 claim "Only Multi-SWE-bench runs the base commit" becomes "three benchmarks run it, for three different purposes; none uses it the way the validator does."

## 6b. Four policies for the file that cannot load without the fix (added 2026-11-02)

The case §6 calls A/B/C (a test file whose import needs the fix, so every test in it is absent at R1) now has four distinct published answers:

| Policy | Who | What happens to the instance | What happens to the pre-existing passing test A |
|---|---|---|---|
| Discard on the before-log error | SWE-bench (A.3; `has_attribute_or_import_error`), SWE-rebench (App. H) | discarded | — |
| Discard on the diff, before running | SWE-PolyBench (§3.2: code patch creates files the tests exercise → "untestable") | discarded | — |
| Keep; count the new tests as F2P, the build failure as evidence of absence | SWE-Bench++ (§3.3.2 Scenario B); in code, SWE-bench Goes Live! (`F2P = post_pass − pre_pass`) and Multi-SWE-bench (`n2p`) | kept | folded into F2P (Goes Live!, SWE-Bench++ by its definition); `n2p`, counted as fixed (Multi-SWE-bench) |
| Keep; label separately; use R0 to recover A | this validator (`ABSENT_TO_PASS`; R0 fallback) | kept | `PASS_TO_PASS` by the R0 fallback |

## 7a. Inconsistencies found in the Set A sources (added 2026-11-02)

- SWE-bench Goes Live!: the paper's status vocabulary is FAILED/ERROR/PASSED (§3.3); the harness's is `pass`/`fail`/`skip` with no error status; the paper says the validation is "repeated multiple times", the code repeats only the after-state, three times, and merges rather than compares.
- SWE-Bench++: "runs all tests under these three states" (§3.3.1) vs "we execute the modified tests" (§3.3.2); three execution logs are produced but the classification reads two.
- SWE-PolyBench: JavaScript instance count 1,017 (abstract) vs 1,078 (Table 9); PRs collected 377,300 (§3.1) vs 417,250 (Table 9 sum).
- SWE-Sharp-Bench: issue-type split 91/47/12 (§III-B1) vs 97/41/12 (App. A-C); the paper's word "flaky" means "does not fit the pass→fail→pass pattern", not "varies across runs".
- SWE-MERA: abstract says 728 samples, Table 1's last row says 528, in the same version; the v2 abs page served the 728 abstract over a 300-task body.
- OmniCode: 27 repositories (arXiv v1 §1) vs 28 (ACL §1, §3.1); title differs between arXiv v2 ("Software Engineering Agents") and the ACL camera-ready ("Software Development Agents").
- SWE-bench-java: the HTML's §2 heading reads "Multi-SWE-bench" and the dataset is called "SWE-bench-java-verified"; "pass-to-fail" is used as a filter but never defined, and "pass-to-pass" never appears.

## 8a. Sources added 2026-11-02

- SWE-bench Goes Live!: https://arxiv.org/abs/2505.23419 (v2, 1 Jun 2025; HTML read); harness https://github.com/microsoft/SWE-bench-Live at `main` on 2026-11-02 — `Development.md` ("Validation"), `evaluation/validation.py` (`compare`, `validate_instance`, lines 14–106, 179), `evaluation/evaluation.py` (`run_instance` lines 162–200; gold filter lines 314–335; `default_pytest_parser` lines 59–71); RepoLaunch paper https://arxiv.org/abs/2603.05026 (not read).
- SWE-bench-java: https://arxiv.org/abs/2408.14354 (v1; HTML read, no appendices); https://github.com/multi-swe-bench/multi-swe-bench-env (not read).
- SWE-Sharp-Bench: https://arxiv.org/abs/2511.02352 (v2 HTML read; v3 exists); https://github.com/microsoft/prose/tree/main/misc/SWE-Sharp-Bench (not read).
- OmniGIRL: https://arxiv.org/abs/2505.04606 (v1 HTML read); ISSTA 2025, DOI 10.1145/3728871; https://github.com/DeepSoftwareAnalytics/OmniGIRL (not read).
- SWE-Bench++: https://arxiv.org/abs/2512.17419 (v1 HTML read, with appendices); no code repository stated.
- OmniCode: https://arxiv.org/abs/2602.02262 (v2); ACL Anthology PDF https://aclanthology.org/2026.findings-acl.2020.pdf (read); https://github.com/seal-research/OmniCode (not read).
- SWE-PolyBench: https://arxiv.org/abs/2504.08703 (v3 HTML read to §5.2; v1 HTML for the rest); https://github.com/amazon-science/SWE-PolyBench (not read).
- FAUN-Eval: https://arxiv.org/abs/2411.18019 (v1; export.arxiv.org PDF read); data https://anonymous.4open.science/status/FAUN-Eval (not read).
- SWE-MERA: https://arxiv.org/abs/2507.11059 (v2 HTML read); EMNLP 2025 Demos PDF via the ACL Anthology (read); https://github.com/MERA-Evaluation/repotest (not read).
- SWE-bench harness at `main` (2026-11-02): https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/swebench/harness/grading.py (`test_passed` 85–90, `test_maintained` 93–99, `test_failed` 101–109, `get_eval_tests_report` 179–260); `swebench/harness/constants/__init__.py` (`TestStatus` 12–17, `FAIL_ONLY_REPOS` 72–82).
- SWE-rebench V2 camera-ready: PMLR v306 pp. 4820–4843, https://raw.githubusercontent.com/mlresearch/v306/main/assets/badertdinov26a/badertdinov26a.pdf (read: §3.3; Table 1).
