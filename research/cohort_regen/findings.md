# Cohort regeneration — findings

All cohort and self-analysis numbers regenerated under the fixed build,
`analyzer_version` **0.1.0** (engine git `6041167`), 2026-07-29.

Data generation only. `packages/engine/src` was not modified.

| Deliverable | |
|---|---|
| Per-repo reports | [`reports/`](reports/) |
| Joined CSV (batch schema) | [`summary.csv`](summary.csv) |
| Table 3 | [`cohort_table.md`](cohort_table.md) |
| Self-analysis before/after | [`self_analysis_comparison.md`](self_analysis_comparison.md) |
| Cohort source audit | [`step0_cohort_sources.md`](step0_cohort_sources.md) |
| Figure 3 + data + script | [`figure3_analysis_time_vs_loc.svg`](figure3_analysis_time_vs_loc.svg), [`timing_data.csv`](timing_data.csv), [`make_figure3.py`](make_figure3.py) |

## Summary of what changed

**Cohort (six repos, same commits as the original measurement):** +10 files,
+618 functions, and **all 10 previously skipped files recovered**. Source LOC
unchanged at 62,471. Because the analyzed commits are identical to those measured
before, these deltas are attributable to the engine fixes alone.

| | Pre-fix (0.0.0) | Post-fix (0.1.0) |
|---|---|---|
| Files | 414 | **424** (+10) |
| Source LOC | 62,471 | 62,471 (unchanged) |
| Functions | 2,855 | **3,473** (+618) |
| Files skipped | 10 | **0** |

**Self-analysis:** 362 files / 43,087 LOC / 2,240 functions / 0 skipped, up from
324 / 38,793 / 1,782 / 4. But only **199 of the +458 functions are attributable
to the fixes**; the rest is a month of new code, because the pre-fix baseline
predates this work. Decomposed in
[`self_analysis_comparison.md`](self_analysis_comparison.md).

**No repository was excluded from any aggregate.** `analysisSkipped` did not fire
anywhere, no repository skipped a file, and every cohort repository produced a
non-null `duplication` value — so no zeroed or false-zero figure is folded into
any total in Table 3. The self-analysis row is the sole exception and is
quarantined (below).

## Attribution of the cohort delta

| Fix | Effect on this cohort |
|---|---|
| **D9** (32,768-char parse failure) | The whole +10 files / ~+614 functions. wayfinder +8 files/+533 fns, SlugSync +1/+74, CsLife +1/+7 |
| **D10** (`function_expression`) | 7 nodes: wayfinder 3, VeriFi 4. Explains VeriFi's +4 functions with no file change |
| **D1, D3, D4, D5** | Change cyclomatic and cognitive *values*, not counts, so invisible in Table 3. Their effect is in `perFile[].functionMetrics` |

D10 fires on **JavaScript**, not TypeScript — all 7 nodes are in `.js`/mixed
files. That is the pattern the validation pass predicted, and it means the
planned pre-2021 JS baseline cohort is where D10 will matter most.

**Source LOC is unchanged everywhere, including where file counts rose.** LOC is
counted by `collect/loc` without parsing, so it was always correct; D9 only
affected parse-dependent metrics. A useful cross-check that the recovered files
are the same files, not new ones.

## Flagged: jscpd duplication detection degrades silently

The named finding requested. **This did not affect any cohort repository** — all
six completed in under 0.75 s — but it does affect the self-analysis, and the
conditions that trigger it are ordinary.

### Reproduction

```bash
# from the repo root, replicating collect/duplication.ts's exact invocation
node_modules/jscpd/bin/jscpd "$(pwd)" \
  --format typescript,tsx,javascript,jsx,python \
  --reporters json --output "$(pwd)/.jscpd-report" \
  --ignore "node_modules,dist,build,.next,out,coverage" --silent
```

| Observation | Value |
|---|---|
| Runtime | **243–259 s** |
| Exit code | **134** (SIGABRT — Node out-of-memory; V8 stack trace in stderr) |
| Report produced | none |
| Engine kill threshold | **60 s**, `{ timeout: 60_000 }` in `collect/duplication.ts` |
| Engine-visible result | `duplication: null`, nothing logged |
| Knock-on | `phase3.srs` and `srsWeightedNumerator` become **`0`** — a false zero |

`detectDuplication` wraps the whole call in `try { … } catch { return null }`, so
a 4-minute out-of-memory crash and "jscpd is not installed" are indistinguishable
from the report. Nothing reaches stderr.

### What triggers it

The trigger is the size of the corpus jscpd walks, and that corpus is **larger
than the analyzer's own**, because `--ignore` does not exclude *nested*
`node_modules`:

| Target | Sources jscpd scanned | Result |
|---|---|---|
| Six cohort repos (fresh clones, no `node_modules`) | 10 – 111 | complete, 0.30–0.73 s |
| `packages/engine` | ~173 | complete, 0.6 s |
| `apps/dashboard` | ~260 | complete, 1.6 s |
| This repo, relative path, `.corpus` parked | **10,487** | complete, 35.2 s, **42.18 % duplication** |
| This repo, engine's absolute-path invocation | more | **abort, exit 134, 243 s** |

The 10,487 figure is the important one. The repository contains ~363 analyzable
source files, but jscpd scanned **10,487** — the surplus is
`research/validation/node_modules/**`, which the bare `node_modules` ignore
pattern fails to match at a nested path. Sample entries from that report are
`research/validation/node_modules/eslint/lib/...`.

**So the completing case is worse than the failing one.** A 35-second run
"succeeds" and reports **42.18 % duplication** for this repository — a figure
dominated by third-party dependency code, silently substituted for a measurement
of our own. A null at least announces itself as missing.

### Risk to the cohort

None in this run: the six were analyzed as **fresh clones with no `node_modules`
installed**, so jscpd's corpus equalled the real source count and the reported
percentages (0.3–3.1 %) are trustworthy.

But that is an artefact of how they were fetched, not a property of the repos.
**Analyzing any of the six after an `npm install` would inflate its jscpd corpus
by the dependency tree** and either produce an inflated percentage or trip the
60 s kill. `SlugSync` — the one repo with a root `package.json` — is the obvious
candidate. Duplication figures are therefore only comparable across repositories
that were all fetched the same way.

Out of scope to fix here. If it is fixed later, the ignore patterns need to match
nested paths (`**/node_modules/**`) and the failure needs to surface rather than
being swallowed.

## Flagged, out of scope: alexandria's gitlink disagrees with what was measured

A data-integrity issue in the `luna-777/cse15` project, not something to fix in
this repository.

`cse15`'s `repos/alexandria` gitlink pins **`28694b8ac580`**, but the commit
recorded as analyzed in `data/metrics_data/alexandria.json` — and used for this
regeneration — is **`e4d1139f0ff8`**, 16 commits earlier. Both exist upstream and
the measured commit is an ancestor of the pinned one, but the diff between them is
**60 files, +13,907 / −12 lines**.

Per the decision for this run, `e4d1139f` was used, so the alexandria row is
comparable with its pre-fix measurement and with the other five repos. The
consequence is that **`cse15`'s pinned submodule state does not reproduce its own
recorded metrics** for this repository. Also note `repos/` has no `.gitmodules`,
so the gitlinks carry SHAs but no URLs and cannot be resolved by
`git submodule update` at all.

## Flagged, out of scope: batch mode cannot analyze five of the six

`batchAnalyze` requires a root `package.json` and skips directories without one:

```
Skipping CsLife: no package.json
Skipping Lens: no package.json
Skipping VeriFi: no package.json
Skipping alexandria: no package.json
Skipping wayfinder: no package.json
CSV summary -> .../summary.csv
```

Only `SlugSync` was analyzed, and `summary.csv` was still written — a
single-row summary presented as a batch result, with the exclusions visible only
on stderr. The actual output is preserved in
[`batch_output/`](batch_output/) as evidence.

This cohort is mostly Python and plain-JavaScript projects, which is exactly the
population the gate excludes. [`summary.csv`](summary.csv) in this directory is
the complete six-row equivalent, generated from individual runs in the identical
batch schema. `framework` is `null` for the same five repos, for the same reason.

## The pattern: three subsystems, one failure mode

The jscpd behaviour above is the **third** independent instance of the same
shape, and it is worth naming as a pattern rather than three unrelated bugs:

| # | Subsystem | Trigger | What the report says | What is actually true |
|---|---|---|---|---|
| **D9** | Tree-sitter parser (`parsing/sourceParser`) | source ≥ 32,768 chars | metrics computed over the remaining files; `filesSkipped` incremented | 9.3 % of this repo's functions absent from every metric |
| **`analysisSkipped`** | Python framework detection | web2py / Django layout | structurally complete report, `complexity.average: 0` | analysis never ran |
| **jscpd** | Duplication (`collect/duplication`) | corpus too large, or polluted by nested `node_modules` | `duplication: null`, `phase3.srs: 0` — or a plausible 42.18 % | not measured, or measured on the wrong corpus |

The common shape, in all three: **a subsystem fails or is skipped; the report
remains structurally valid; the affected metric takes a value that is
indistinguishable from a real measurement (`0`, `null`, or a plausible
percentage); and nothing in the JSON records that anything went wrong.** The
signal, where it exists at all, is on stderr — which is discarded by every
consumer that reads the JSON.

These are three separate subsystems written at different times: a native parser
binding, a framework heuristic, and an external CLI wrapper. That they converge
on the same failure mode suggests the cause is not any one of them but the
report contract — nullable and zero-valued fields carry no provenance, so
"absent", "failed" and "genuinely zero" are the same value. The D9 fix addressed
one instance; naming the reason a skip happened
(`file_too_large_for_parser`) addressed its visibility. The other two are
untouched.

If this is written up, the useful claim is probably not "we found three bugs" but
**"static-analysis pipelines degrade silently by default, and we can demonstrate
it three times over in independent subsystems of the same tool"** — with the
corollary that a validity study which only checks whether numbers *agree* will
not catch any of them, because all three produce numbers that look fine. That is
what makes them different from D1/D3/D4/D5, which were wrong *values* a baseline
comparison could detect.

## Figure 3 — timing

[`timing_data.csv`](timing_data.csv), plotted by
[`make_figure3.py`](make_figure3.py) to SVG, PDF and PNG.

The y axis is **analysis time excluding the duplication step**, so it measures
the same quantity for every repository. jscpd's contribution is subtracted using
its separately measured per-repo runtime; for the self-analysis, where jscpd was
killed rather than completing, the subtracted amount is the 60 s timeout and the
point is **marked on the plot** rather than presented as comparable.

| Repo | Source LOC | Wall clock | jscpd | Analysis excl. duplication | jscpd status |
|---|---|---|---|---|---|
| `CsLife` | 2,792 | 0.76 s | 0.39 s | 0.37 s | completed |
| `Lens` | 4,980 | 0.90 s | 0.30 s | 0.60 s | completed |
| `VeriFi` | 5,129 | 1.04 s | 0.33 s | 0.71 s | completed |
| `SlugSync` | 8,194 | 1.42 s | 0.53 s | 0.89 s | completed |
| `alexandria` | 10,119 | 2.19 s | 0.73 s | 1.46 s | completed |
| `wayfinder` | 31,257 | 2.56 s | 0.71 s | 1.85 s | completed |
| `ts-repo-metrics` (self) | 43,087 | 64.24 s | 60.00 s | 4.24 s | **timeout, killed at 60 s** |

Fit over all seven points: **t = 8.22 × 10⁻⁴ · LOC^0.78**, R² = 0.930.

The exponent below 1 should not be read as sublinear scaling — with seven points
spanning one order of magnitude, and a fixed per-run startup cost (tsx compile,
git history walk) dominating the small repos, the fit is descriptive only. The
honest reading is that analysis time is on the order of seconds for repositories
of this size, and that **the duplication step, not parsing, is what makes runtime
unpredictable**: it accounts for 28–51 % of wall clock on the cohort and 93 % on
the self-analysis.
