# Step 2 — Self-analysis: pre-fix vs post-fix

`ts-repo-metrics` analyzing itself, under the fixed build
(`analyzer_version` **0.1.0**, git `6041167`).

Report: [`reports/self_ts-repo-metrics.json`](reports/self_ts-repo-metrics.json)

## Headline comparison

| Metric | Pre-fix (cited) | Pre-fix (recorded) | **Post-fix** | Δ vs recorded |
|---|---|---|---|---|
| `analyzer_version` | 0.0.0 | 0.0.0 | **0.1.0** | bumped |
| Files analyzed | 326 | 324 | **362** | +38 |
| Source LOC | 39,053 | 38,793 | **43,087** | +4,294 |
| Functions | 1,812 | 1,782 | **2,240** | +458 |
| Files skipped | 4 | 4 | **0 (key absent)** | −4 |
| Wall-clock runtime | not recorded | not recorded | **64.2 s** | — |

Two pre-fix columns because the numbers quoted in the task
(326 / 39,053 / 1,812 / 4) do not match the only pre-fix self-analysis actually
committed in this repo, `reports/ts-repo-metrics.json` (dated 2026-06-25,
`analyzer_version` 0.0.0): **324 / 38,793 / 1,782 / 4**. The two are close and
tell the same story, but the recorded file is the one that can be re-checked, so
deltas below are computed against it.

## The 4 skipped files are gone — and they were the D9 files

`filesSkipped` is now **absent from the report entirely** (it is omitted when
zero, so absence is the healthy state — see
[`docs/SCHEMA.md`](../../docs/SCHEMA.md)). No skip reasons were logged to stderr.

All four files that D9 previously made unparseable are now present, and they
account for 197 of the recovered functions:

| File | chars | functions now counted | was in pre-fix report |
|---|---|---|---|
| `apps/dashboard/components/results/rq/DocReviewTab.tsx` | 65,174 | 76 | no |
| `apps/dashboard/components/results/rq/metricHelpContent.tsx` | 39,055 | 54 | no |
| `apps/dashboard/components/results/rq/AIMaturityTab.tsx` | 43,382 | 48 | no |
| `apps/dashboard/components/docs/DocsSections.tsx` | 44,015 | 19 | no |
| | | **197** | |

## The delta is mostly repo growth, not the fixes

**The headline Δ must not be read as the effect of the fixes.** The recorded
pre-fix baseline is from 2026-06-25; the repository has gained a month of work
since, including this project's own `research/validation/` output. Decomposing
the file and function deltas:

| Source of change | Files | Functions |
|---|---|---|
| D9 — previously unparseable files now included | +4 | +197 |
| D10 — `function_expression` now recognised | 0 | +2 |
| Repository growth since 2026-06-25 | +34 | +259 |
| **Total** | **+38** | **+458** |

So the fixes account for **199 of the 458 new functions (43%)** and **4 of the 38
new files**. The rest is new code that did not exist when the baseline was taken.

A cleaner isolation, for reference: the fixed engine run against the repository
tree at `1f250c1` (the last commit before `research/validation/` existed) reports
**353 files / 40,801 LOC / 2,146 functions / 0 skipped**. That is still not a
controlled comparison — `1f250c1` is itself a month newer than the baseline tree
— but it brackets the growth effect.

### D10 fired, but only on files added by this work

Both `function_expression` nodes in the entire self-analysis are in files added
while fixing and validating D10:

- `packages/engine/__tests__/sourceParser.test.ts` — its regression test
- `research/validation/fixtures/conventions.ts` — its isolation fixture

**D10 has no effect on the pre-existing production codebase**, matching the
validation finding of zero `function_expression` nodes across the 4,570-function
TypeScript corpus. It remains latent, and will matter for the planned pre-2021
JavaScript cohort.

## Data-quality problem in this run: `duplication` is null

`duplication` is **`null`** in the post-fix self-analysis, and `phase3.srs` is
consequently **`0`** — a false zero meaning "not measured", not "no structural
redundancy".

Cause, confirmed by running jscpd standalone with the engine's own arguments:

- jscpd runs for **243–259 s** and exits **134** (SIGABRT — Node out-of-memory),
  producing no report at all
- `collect/duplication.ts` caps it at a **60 s timeout** and returns `null` on any
  failure, so the crash surfaces as an absent metric with nothing logged

The underlying reason is that jscpd's corpus is much larger than the analyzer's:
its `--ignore node_modules,…` pattern does not match *nested* paths, so it walks
`research/validation/node_modules/**`. A relative-path invocation that does
complete scans **10,487 sources** for a repository with ~363 analyzable files, and
reports **42.18 % duplication** — a figure dominated by third-party dependency
code. The completing case is therefore worse than the failing one: it produces a
plausible number that is not a measurement of this repository. Full detail,
including the risk this poses to cohort repos analyzed after `npm install`, is in
[findings.md](findings.md).

This also explains the runtime figure. Of the 64.2 s wall clock, **~60 s is the
jscpd timeout** and only ~4 s is analysis work — the pre-fix tree at `1f250c1`,
where jscpd completes, runs the whole analysis in **6.5 s**.

Consequences:

1. `duplication` and `phase3.srs`/`srsWeightedNumerator` are unusable for this
   repository and must not be quoted from this report.
2. **The self-analysis runtime is not a valid LOC-vs-time data point** for
   Figure 3 without this caveat, because it is dominated by a fixed 60 s timeout
   rather than by work proportional to LOC. It is reported with the caveat rather
   than dropped.

This is not a regression from the fixes — the timeout and the swallowed failure
both predate them. It is a pre-existing silent-failure path, of the same class as
D9, surfaced by running the tool on a repository that has since grown past what
jscpd can handle.

## Full post-fix figures

| Field | Value |
|---|---|
| `analyzer_version` | 0.1.0 |
| `filesAnalyzed` | 362 |
| `filesSkipped` | absent (none) |
| `profile.totalLOC` | 47,272 |
| `profile.sourceLOC` | 43,087 |
| `totals.functions` | 2,240 |
| File mix (ts/tsx/js/jsx/py) | 213 / 133 / 3 / 1 / 12 |
| `duplication` | **null** — jscpd aborted, see above |
| `phase3.sfd` | 0 |
| `phase3.mcr` | 0.2426 |
| `phase3.srs` | **0** — false zero, depends on jscpd |
| `analysisSkipped` | did not fire |
| Wall-clock runtime | 64.2 s (≈60 s of it the jscpd timeout) |
