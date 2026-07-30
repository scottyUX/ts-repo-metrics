# FINAL NUMBERS — the figures to quote

`analyzer_version` **0.2.0**, engine git `01c99a2`, generated 2026-07-30.

**These supersede everything before them**, including commit `0ff89a1` (0.1.0)
and the 0.0.0-era figures in `research/validation/findings.md`. Superseded
documents are marked in place rather than deleted, so the before/after story
stays reconstructible.

All blocking fixes have landed: D1, D3, D5, D9, D10 (0.1.0); D7 and the D4
replacement (0.2.0); Bug 1 (jscpd `node_modules` exclusion) and Bug 2
(batch-mode silent skip).

---

## ⚠ Read this before quoting anything

**Halstead volume / difficulty / effort and `maintainabilityIndexGradAi`
(raw and norm) are TypeScript/JavaScript ONLY.** 45.1% of cohort functions are
Python, which uses a deliberately different and unvalidated operand convention.
No mixed-language aggregate is published for these metrics; averaging them would
combine two incompatible measurements.

**File counts, source LOC, function counts, duplication and cyclomatic
complexity are NOT operand-dependent** and cover all six repositories, Python
included.

**Cognitive complexity should probably be scoped the same way** — see the Python
finding below. It is reported here TS/JS-scoped for that reason.

---

## 1. Cohort — all six repositories (operand-independent)

Safe to quote cohort-wide. Source: [`research/cohort_regen/cohort_table.md`](research/cohort_regen/cohort_table.md),
[`summary.csv`](research/cohort_regen/summary.csv).

| Repo | Commit analyzed | Files | Source LOC | Functions | Duplication % | Cyclomatic (mean) |
|---|---|---|---|---|---|---|
| `alexandria` | `e4d1139f0ff8` | 114 | 10,119 | 929 | 1.8 | 1.79 |
| `wayfinder` | `a8c860c746c6` | 126 | 31,257 | 1,246 | 3.1 | 2.85 |
| `SlugSync` | `dff085a999c5` | 61 | 8,194 | 772 | 1.1 | 2.20 |
| `Lens` | `d1db5e94b2dd` | 56 | 4,980 | 177 | 0.3 | 2.49 |
| `VeriFi` | `3f55467c45fc` | 56 | 5,129 | 280 | 0.8 | 2.48 |
| `CsLife` | `42227097b4c7` | 11 | 2,792 | 69 | 1.3 | 1.99 |
| **Total** | | **424** | **62,471** | **3,473** | — | — |

### Integrity, per repo

| Repo | `filesSkipped` | `analysisSkipped` | duplication |
|---|---|---|---|
| all six | **none (key absent)** | **not fired** | non-null for every repo |

No repository skipped a file, none triggered `analysisSkipped`, and no
duplication value is null — so no false zero is folded into any total.
`filesSkipped` is reported as *absent*, not as 0: the key is omitted when
nothing was skipped, and an absent key must not be read as a measured zero.
Machine-readable: [`integrity.json`](research/cohort_regen/integrity.json).

### On duplication — the expected change did not materialise, and that is correct

The prior contaminated figures (self-analysis 42.18% or an out-of-memory abort,
SlugSync 20.3%) came from jscpd walking vendored `node_modules`. **The six
cohort repositories' duplication values did not change at all** between 0.1.0
and 0.2.0 — 1.8 / 3.1 / 1.1 / 0.3 / 0.8 / 1.3 both times.

That is not a failed fix. All six were fetched as fresh clones with **no
`node_modules` on disk**, so jscpd's corpus already equalled their real source
and the old figures were accurate for them. The 20.3% SlugSync number was
measured in a deliberately constructed post-`npm install` test, not from the
cohort as fetched.

**Where it did change is the self-analysis**, which does have vendored
dependencies on disk:

| | 0.1.0 | **0.2.0** |
|---|---|---|
| self duplication | **null** — jscpd killed at 60 s | **3.3%** |
| jscpd runtime | 60.0 s (timeout) | **7.0 s** |

The fix's real effect on the cohort is therefore *robustness*, not a restatement:
these six repos are now measured correctly **whether or not** dependencies are
installed. Previously that was an artefact of how they happened to be fetched.

## 2. Self-analysis

[`research/cohort_regen/reports/self_ts-repo-metrics.json`](research/cohort_regen/reports/self_ts-repo-metrics.json),
mirrored to `report.json` and `reports/ts-repo-metrics.json`.

| | value |
|---|---|
| Files analyzed | **366** |
| Source LOC | **43,656** |
| Functions | **2,293** |
| Duplication | **3.3%** |
| `filesSkipped` | none (key absent) |
| `analysisSkipped` | not fired |

Growth against the 0.1.0 self figures (362 / 43,087 / 2,240) is the repository
itself changing between runs — tests and research documents added — not an
engine effect.

## 3. Halstead + MI — TypeScript/JavaScript subset ONLY

n = **1,907** TS/JS functions across five repositories (`alexandria` contributes
none — it is 100% Python). Source:
[`language_scope.json`](research/cohort_regen/language_scope.json).

| Repo | fns | volume mean | volume median | difficulty | effort | MI_raw | MI_norm |
|---|---|---|---|---|---|---|---|
| `wayfinder` | 863 | 146.1 | 25.9 | 3.16 | 1703.0 | 125.89 | 73.63 |
| `SlugSync` | 772 | 102.6 | 27.0 | 2.92 | 864.6 | 126.29 | 73.85 |
| `Lens` | 105 | 167.2 | 23.3 | 3.46 | 2463.4 | 125.21 | 73.22 |
| `VeriFi` | 98 | 84.1 | 30.4 | 2.72 | 403.4 | 121.61 | 71.12 |
| `CsLife` | 69 | 103.8 | 56.5 | 2.89 | 509.5 | 112.77 | 65.94 |
| **TS/JS cohort** | **1,907** | **125.0** | **28.1** | **3.05** | **1295.5** | **125.32** | **73.29** |

**Prefer the median for "a typical function".** Volume is heavily right-skewed
(mean 125.0 vs median 28.1); a few large functions dominate the mean.

Python subset, **for separate reporting only, never pooled with the above**:
n = 1,566, mean volume 199.2, difficulty 1.94, MI_norm 66.14.

## 4. Cognitive complexity — TS/JS scoped

| | value |
|---|---|
| TS/JS cohort mean | **1.11** (n = 1,907) |
| agreement with SonarJS | **92.44%** exact, ρ **0.9768** |

Python mean is 2.00 (n = 1,566) but **should not be quoted** — see §6.

## 5. Metric validity vs independent baselines

[`research/validation/summary.json`](research/validation/summary.json). Corpus:
4,631 paired functions across five TypeScript repositories.

| family | baseline | n | exact agreement | Spearman ρ | mean signed diff |
|---|---|---|---|---|---|
| structural (cyclomatic) | ts-complex | 4,631 | **99.81%** | **0.9972** | 0.00 |
| cognitive | eslint-plugin-sonarjs | 4,631 | **92.44%** | **0.9768** | −0.06 |
| lexical (Halstead volume) | typhonjs-escomplex | 4,542 | **6.49%** | **0.9038** | −72.42 |

Lexical "exact" uses the harness's `VOLUME_REL_TOL = 0.01` (within 1%).

Against the 0.0.0 figures still printed in `research/validation/findings.md`:

| family | 0.0.0 | 0.1.0 | **0.2.0** |
|---|---|---|---|
| structural | 98.2% | 99.80% | **99.81%** |
| cognitive | 91.8% | 92.28% | **92.44%** |
| lexical | 5.4% | 5.38% | **6.49%** |

**The lexical rate is still only 6.49%.** D7 raised it, but the residual gap is
now dominated by *operator* conventions rather than operands (probe: our n1=2 vs
escomplex n1=4 on the same snippet), plus counting a function's own name as an
operand. Both were out of scope for D7. Rank correlation is strong (ρ = 0.904);
absolute volumes still differ systematically.

## 6. Python cognitive complexity — investigated, NOT fixed

**Finding: yes, cognitive complexity has the same Python problem as Halstead,
and additionally appears incorrect.**

Two independent grounds:

**It has never been validated.** The validation corpus contains **0 Python
functions out of 4,645**. No Python cognitive score has been checked against any
baseline, under either the old rule or the D4 replacement. `eslint-plugin-sonarjs`
is JavaScript-only, so the harness has no way to check Python at all.

**It also disagrees with Sonar's spec.** The D4 port is gated to ECMAScript, so
Python still runs the pre-D4 path, and Python's `elif_clause` is a *sibling* of
the `if` (not an `if` nested in an `else`) while also being listed in
`PYTHON_COGNITIVE_CONTROL` — so every `elif` takes a nesting increment it should
not. Measured on structurally identical snippets by
[`python_cognitive_probe.mjs`](research/validation/python_cognitive_probe.mjs):

| shape | Sonar spec | TS/JS (validated) | Python |
|---|---|---|---|
| `if / elif / else` (flat) | 3 | 3 ✓ | **4** (+1) |
| `if / elif ×3 / else` (flat) | 5 | 5 ✓ | **8** (+3) |
| chain nested 1 level inside an `if` | 5 | 5 ✓ | **7** (+2) |
| `if / else { if }` | 4 | 4 ✓ | **3** (−1) |
| bare `if / else` | 2 | 2 ✓ | 2 ✓ |

**4 of 5 shapes wrong, in both directions.** This is worse than the JS defect
ever was: it over-counts even *flat* `elif` chains, and the error grows with
chain length (+3 on a four-link chain) — the escalation behaviour D3 removed for
JS. Cohort means are consistent with inflation: Python 2.00 vs TS/JS 1.11.

**Recommendation: scope cognitive complexity to TS/JS on the same grounds as
Halstead.** No code was changed, per instruction.

## 7. Figure 3 — analysis time vs source LOC

[`figure3_analysis_time_vs_loc.svg`](research/cohort_regen/figure3_analysis_time_vs_loc.svg)
(vector; `.pdf` and `.png` alongside). Data:
[`timing_data.csv`](research/cohort_regen/timing_data.csv).

Fit: **t = 2.70e-04 · LOC^0.96, R² = 0.568, n = 7.**

| repo | source LOC | wall clock s | jscpd s | y-value (excl. duplication) s | jscpd status |
|---|---|---|---|---|---|
| alexandria | 10,119 | 5.47 | 1.47 | 4.00 | completed |
| wayfinder | 31,257 | 3.94 | 1.33 | 2.61 | completed |
| SlugSync | 8,194 | 2.36 | 1.10 | 1.26 | completed |
| Lens | 4,980 | 4.38 | 0.56 | 3.82 | completed |
| VeriFi | 5,129 | 1.26 | 0.68 | 0.58 | completed |
| CsLife | 2,792 | 0.53 | 0.32 | 0.22 | completed |
| ts-repo-metrics (self) | 43,656 | 16.17 | 7.02 | 9.15 | completed |

**The axis, stated on the figure itself:** y is `analyzeRepo()` wall clock minus
the separately measured jscpd runtime — duplication excluded for every point,
uniformly. It excludes clone/fetch time; all repositories were already on disk.

**The "timeout-killed" annotation no longer applies, and this was verified
rather than assumed.** All seven points now report `jscpd_status: completed`. The
marker is driven by that CSV column, not hard-coded, so it would reappear
automatically if the condition returned. In the 0.1.0 figure the self point was
`TIMEOUT_KILLED_60s` and its 64.24 s wall clock was dominated by a fixed timeout;
self wall clock is now 16.17 s.

## 8. Batch mode

[`research/cohort_regen/batch_output/`](research/cohort_regen/batch_output/) —
`batch_manifest.json` plus `summary.csv` with `status` and `reason` columns.

**7 targets found, 7 analyzed, 0 skipped, 0 failed, `complete: true`.**
Previously 1 of 7: five repositories have no root `package.json` and were
silently dropped.

## 9. Pre/post-AI dataset samples

[`research/datasets/samples/`](research/datasets/samples/), regenerated from each
report's own recorded URL and commit, so only the analyzer changed. All were at
0.0.0.

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

**MAT3D now returns a zero report, and its old number was wrong.** It
regenerates to `filesAnalyzed: 0` with `analysisSkipped: {"id": "web2py"}` — the
unsupported-framework guard working. The 0.0.0 report claimed 1,709 files /
9,526 functions / **1,084,782 source LOC**; a million LOC is not a student
project, and the repository vendors web2py at its top level, so that run was
measuring the framework. **Do not quote that row from any version.** The pre-AI
sample set is effectively 3 repositories, not 4.

---

## Not regenerated

**`data/analyses_rows.csv` (85 MB)** — a Supabase export of stored analysis rows,
not a local engine artefact. It still holds 0.0.0/0.1.0-era
`maintainabilityIndexGradAi` values and **is stale**. Regenerating it requires
re-running analyses through the dashboard/Supabase pipeline and re-exporting;
out of scope for a local pass.

## Superseded documents (marked in place, not deleted)

| file | state |
|---|---|
| `research/validation/findings.md` | ⚠ banner added; 0.0.0 prose kept as the record of the ten divergence patterns |
| `research/validation/POST_FIX_COMPARISON.md` | ⚠ banner added; 0.1.0-round record |
| `research/cohort_regen/findings.md` | ⚠ banner added; the record of how Bug 1 and Bug 2 were found |
| `research/cohort_regen/self_analysis_comparison.md` | ⚠ banner added; 0.1.0 self figures |
| `research/validation/regeneration_gate.md` | ✅ banner added; gate now satisfied |
| `research/validation/pre_fix_baseline/`, `post_fix/` | frozen output snapshots, correctly historical, left as-is |
| `README.md` | example `analyzer_version` updated 0.0.0 → 0.2.0 |

**False positive from the stale-number sweep:**
`research/related_work_comparison/{setup.md,evidence_table.md}` match `0.1.0`,
but that is `typhonjs-escomplex@0.1.0`, a third-party tool version — not
`analyzer_version`. Correctly left alone.

## Still open

1. **Python Halstead and cognitive are both unvalidated** — §3 and §6. Scoping
   both to TS/JS is applied for Halstead and recommended for cognitive.
2. **Lexical agreement 6.49%** — residual gap is operator conventions, not
   operands.
3. **Logical-operator divergence** — 2 of 24 cognitive fixtures still disagree
   with SonarJS. Known, separate, deliberately untouched.
4. **D2, D6, D8** remain open from the original ten.

## Reproducing

```bash
node research/cohort_regen/regenerate.mjs                   # cohort + self + integrity.json
node research/cohort_regen/language_scope.mjs               # TS/JS vs Python scoping
python3 research/cohort_regen/make_figure3.py               # Figure 3 (svg/pdf/png)
npx tsx src/cli.ts batch <repos> --output <dir> --csv       # batch evidence
research/validation/run_validation.sh                       # validity vs 3 baselines
node research/validation/python_cognitive_probe.mjs         # Python cognitive finding
node research/datasets/samples/regenerate_samples.mjs <tmp> # pre/post-AI samples
```
