# Regeneration under analyzer_version 0.2.0 — the numbers to quote

Generated 2026-07-30, engine git `12530fc`.

**These supersede commit `0ff89a1` (done under 0.1.0) and everything before it.**
Nothing from an earlier run should be quoted. One pass, everything regenerated
together, so no artifact is a version behind another.

## What changed since the last regeneration

| ID | change | affects |
|---|---|---|
| **D7** | Halstead operands keyed by literal value, not literal kind; doubled `string_fragment` removed | `halstead.*`, `maintainabilityIndexGradAi*` |
| **D4 → B1/B2/B3** | cognitive-complexity rule replaced (nested chains, `else` bodies) | `cognitiveComplexity` |
| **Bug 1** | jscpd `--ignore` now uses globs; failures logged distinctly | `duplication`, analysis wall clock |
| **Bug 2** | batch mode no longer requires a root `package.json`; every target accounted for in artifacts | batch coverage |

---

## 1. Cohort — Table 3 (six repositories)

Full table with provenance: [cohort_regen/cohort_table.md](cohort_regen/cohort_table.md)

| Repo | Files | Source LOC | Functions | Duplication % |
|---|---|---|---|---|
| `alexandria` | 114 | 10,119 | 929 | 1.8 |
| `wayfinder` | 126 | 31,257 | 1,246 | 3.1 |
| `SlugSync` | 61 | 8,194 | 772 | 1.1 |
| `Lens` | 56 | 4,980 | 177 | 0.3 |
| `VeriFi` | 56 | 5,129 | 280 | 0.8 |
| `CsLife` | 11 | 2,792 | 69 | 1.3 |
| **Total** | **424** | **62,471** | **3,473** | — |

Zero files skipped, `analysisSkipped` never fired, every duplication value
non-null. **Structural columns are identical to 0.1.0** — expected, since the
0.2.0 changes move per-function metrics, and the duplication fix only bites on
repositories that have `node_modules` on disk (none of these do).

Per-function means that did move, 0.1.0 → 0.2.0:

| Repo | mean cognitive | mean Halstead volume | mean MI_norm |
|---|---|---|---|
| `alexandria` | 1.47 → 1.47 | 185.4 → 185.4 | 67.53 → 67.53 |
| `wayfinder` | 1.74 → 1.74 | 176.7 → 176.3 | 70.20 → 70.28 |
| `SlugSync` | 0.96 → 0.96 | 107.7 → 102.6 | 73.75 → 73.85 |
| `Lens` | 1.55 → 1.55 | 155.3 → 153.8 | 71.74 → 71.76 |
| `VeriFi` | 2.27 → 2.27 | 160.5 → 159.5 | 66.96 → 67.01 |
| `CsLife` | 0.99 → 0.99 | 105.7 → 103.8 | 65.81 → 65.94 |

## 2. Self-analysis

[cohort_regen/reports/self_ts-repo-metrics.json](cohort_regen/reports/self_ts-repo-metrics.json),
mirrored to `report.json` and `reports/ts-repo-metrics.json`.

| | 0.1.0 | **0.2.0** |
|---|---|---|
| Files analyzed | 362 | **366** |
| Source LOC | 43,087 | **43,648** |
| Functions | 2,240 | **2,293** |
| Duplication | **null** (jscpd killed at 60 s) | **3.3%** |
| Mean cognitive | 1.96 | **1.95** |
| Mean Halstead volume | 166.6 | **161.8** |
| Mean MI_norm | 69.46 | **69.53** |

The file/LOC/function growth is the repository itself changing between runs
(tests and research docs added), not an engine effect. **The duplication cell is
the engine effect**: self-duplication was previously unmeasurable because jscpd
walked `research/validation/node_modules` and was killed by the 60 s timeout.

## 3. Figure 3 — analysis time vs source LOC

[cohort_regen/figure3_analysis_time_vs_loc.{svg,pdf,png}](cohort_regen/),
data in [cohort_regen/timing_data.csv](cohort_regen/timing_data.csv).

Fit: **t = 3.80e-04 · LOC^0.91, R² = 0.568, n = 7.**

| repo | source LOC | wall clock s | jscpd s | excl. duplication s | jscpd status |
|---|---|---|---|---|---|
| alexandria | 10,119 | 5.05 | 1.33 | 3.71 | completed |
| wayfinder | 31,257 | 3.76 | 1.28 | 2.47 | completed |
| SlugSync | 8,194 | 2.01 | 0.92 | 1.09 | completed |
| Lens | 4,980 | 3.69 | 0.51 | 3.18 | completed |
| VeriFi | 5,129 | 1.18 | 0.56 | 0.62 | completed |
| CsLife | 2,792 | 0.51 | 0.31 | 0.20 | completed |
| ts-repo-metrics (self) | 43,648 | 13.34 | 6.58 | 6.76 | completed |

**All seven points now complete.** In the 0.1.0 figure the self point was
`TIMEOUT_KILLED_60s` — its 64.24 s wall clock was dominated by a fixed timeout
rather than by work proportional to LOC, and had to be flagged. Self wall clock
is now **13.34 s** (jscpd 60.0 s → 6.58 s).

## 4. Metric validity vs independent baselines

[validation/summary.json](validation/summary.json), full write-up in
[validation/findings.md](validation/findings.md).

| family | baseline | n | exact agreement | Spearman ρ | mean signed diff (ours − baseline) |
|---|---|---|---|---|---|
| structural (cyclomatic) | ts-complex | 4,631 | **99.81%** | **0.9972** | 0.00 |
| cognitive | eslint-plugin-sonarjs | 4,631 | **92.44%** | **0.9768** | −0.06 |
| lexical (Halstead volume) | typhonjs-escomplex | 4,542 | **6.49%** | **0.9038** | −72.42 |

Change from the published 0.1.0-era figures:

| family | exact agreement | Spearman ρ |
|---|---|---|
| structural | 99.80% → 99.81% | 0.9972 → 0.9972 |
| cognitive | 92.28% → **92.44%** (+0.16 pp) | 0.9770 → 0.9768 |
| lexical | 5.38% → **6.49%** (+1.12 pp) | 0.8998 → **0.9038** |

Exact agreement for lexical uses the harness's `VOLUME_REL_TOL = 0.01` (within
1%). `n` grew because the self repository grew between runs.

## 5. Batch mode

[cohort_regen/batch_output/](cohort_regen/batch_output/) — `batch_manifest.json`
plus a `summary.csv` carrying `status` and `reason` columns.

**7 targets found, 7 analyzed, 0 skipped, 0 failed, `complete: true`.**
Previously 1 of 7: five repositories have no root `package.json` and were
silently dropped, and StudyPet-Plus/SlugSync were the only survivors.

## 6. Pre/post-AI dataset samples

[datasets/samples/](datasets/samples/) — regenerated from each report's own
recorded URL and commit, so only the analyzer changed. All were at **0.0.0**,
two generations stale.

| sample | files | functions | duplication |
|---|---|---|---|
| post_ai/Alaurosa-vision-studio | 189 | 2,215 | 1.5% |
| post_ai/Brinqa-CRQ-2026-VulnContext-Desktop | 269 | 1,586 | 4.5% |
| post_ai/Colin-Posat-SlugFound | 92 | 423 | 1.4% |
| post_ai/MikeyZv-SlugMarket | 69 | 793 | 7.2% |
| pre_ai/MissValeska-CSE-115A-GeneSearcher | 16 | 85 | 4.1% |
| pre_ai/nkalscheuer-mavericks | 16 | 15 | 0% |
| pre_ai/raeeka98-MarinePlastics-MobileApp | 25 | 64 | 12.3% |
| **pre_ai/alrivero-MAT3D** | **0** | **0** | **null** |

### ⚠ MAT3D now returns a zero report — and the old number was wrong

`alrivero-MAT3D` regenerates to `filesAnalyzed: 0` with
`analysisSkipped: {"id": "web2py", ...}`. This is the engine's
unsupported-framework guard working, not a regression.

The 0.0.0 report claimed **1,709 files / 9,526 functions / 1,084,782 source
LOC**. A million source LOC is not a student project — the repository vendors
web2py at its top level, and the pre-guard run was measuring the framework.
**That row should not be quoted from any prior version either.** The pre-AI
sample set is effectively 3 repositories, not 4.

---

## Still open — read before quoting Halstead or MI

**1. 45.1% of cohort functions are Python, where the D7 fix does not apply.**
1,566 of 3,473 cohort functions are Python; the Python operand path still
collapses string and numeric literals by kind. It was left that way deliberately
— escomplex is JS-only, so a Python change has no baseline. A single cohort-wide
Halstead or MI aggregate therefore mixes two operand conventions. Per-language or
JS/TS-only framings avoid this. **This needs a decision.**

**2. Cognitive complexity barely moved at cohort level.** The D4 replacement is
correct per spec and fixes four fixture classes outright, but its defects were
rare in this corpus and cancelled in aggregate (+0.16 pp against SonarJS). If a
claim rests on cohort-mean cognitive complexity, that number did not
meaningfully change.

**3. Lexical agreement is still 6.49%.** Better than 5.38%, but the residual gap
is now dominated by *operator* conventions rather than operands (probe: our
n1=2 vs escomplex n1=4 on the same snippet), plus counting a function's own name
as an operand. Both were out of scope for D7.

**4. The logical-operator divergence is unfixed.** Known, separate, deliberately
untouched: 2 of 24 cognitive fixtures still disagree with SonarJS.

## Not regenerated

**`data/analyses_rows.csv` (85 MB).** A Supabase export of stored analysis rows,
not a local engine artifact — regenerating it means re-running analyses through
the dashboard/Supabase pipeline and re-exporting. It still contains 0.0.0/0.1.0-era
`maintainabilityIndexGradAi` values and is **stale**. Out of scope for a local
pass; needs a separate pipeline run.

## Reproducing

```bash
node research/cohort_regen/regenerate.mjs                  # cohort + self
python3 research/cohort_regen/make_figure3.py              # Figure 3
npx tsx src/cli.ts batch <repos> --output <dir> --csv      # batch evidence
research/validation/run_validation.sh                      # validity vs 3 baselines
node research/datasets/samples/regenerate_samples.mjs <tmp> # pre/post-AI samples
```
