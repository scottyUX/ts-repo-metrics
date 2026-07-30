# Table 3 — CSE 115A cohort, regenerated

Six repositories analyzed under the fixed build, `analyzer_version` **0.1.0**
(engine git `6041167`). Generated 2026-07-29.

Every commit SHA analyzed is recorded in full below, so the exact input to each
row is verifiable without reference to any other document.

## Table 3

| Repo | Commit analyzed | Files | Source LOC | Functions | Files skipped | `analysisSkipped` | Duplication % | `analyzer_version` |
|---|---|---|---|---|---|---|---|---|
| `alexandria` | `e4d1139f0ff8d39e1d0e759854350109e8199509` | 114 | 10,119 | 929 | none (key absent) | not fired | 1.8 | 0.1.0 |
| `wayfinder` | `a8c860c746c62d389ceb4acf4d21315a8bade572` | 126 | 31,257 | 1246 | none (key absent) | not fired | 3.1 | 0.1.0 |
| `SlugSync` | `dff085a999c5bec3253579b8093eb7820f42243f` | 61 | 8,194 | 772 | none (key absent) | not fired | 1.1 | 0.1.0 |
| `Lens` | `d1db5e94b2ddddd94904c3661b25caa623287389` | 56 | 4,980 | 177 | none (key absent) | not fired | 0.3 | 0.1.0 |
| `VeriFi` | `3f55467c45fca19a21a160532cd0879d84216673` | 56 | 5,129 | 280 | none (key absent) | not fired | 0.8 | 0.1.0 |
| `CsLife` | `42227097b4c79473bc0b06565efcf9e715c30358` | 11 | 2,792 | 69 | none (key absent) | not fired | 1.3 | 0.1.0 |
| **Total** | | **424** | **62,471** | **3,473** | **0** | — | — | |

**Every row is a real measurement.** No repository triggered `analysisSkipped`,
no repository skipped a file, and every repository produced a non-null
`duplication` value — so no zeroed or false-zero figure is folded into the
totals. The two conditions that would have required exclusion did not occur.

## Source provenance

| Repo | Canonical URL | Why this commit |
|---|---|---|
| `alexandria` | https://github.com/ucsc-cse115a-alexandria/alexandria | `source.commit` from the prior `metrics_data/alexandria.json`. **Deliberately not** the commit `cse115`'s `repos/` gitlink pins — see the flagged item in [findings.md](findings.md) |
| `wayfinder` | https://github.com/juansant-cmyk/wayfinder | gitlink and prior measurement agree |
| `SlugSync` | https://github.com/Richie59943/SlugSync | gitlink and prior measurement agree |
| `Lens` | https://github.com/jacobluanjohnston/Lens | gitlink and prior measurement agree |
| `VeriFi` | https://github.com/Kurisuo/VeriFi | gitlink and prior measurement agree |
| `CsLife` | https://github.com/Chr0no9/CsLife | gitlink and prior measurement agree |

Cohort membership and URL recovery are documented in
[step0_cohort_sources.md](step0_cohort_sources.md). **StudyPet-Plus is not
included**: it has no gitlink, no prior metrics run and no recorded URL anywhere
in `cse115`, so there is no source to analyze.

## Change from the pre-fix run

Pre-fix figures are from `luna-777/cse15` `data/metrics_data/*.json`, all
recorded under `analyzer_version` 0.0.0.

| Repo | Files | Source LOC | Functions | Files skipped |
|---|---|---|---|---|
| `alexandria` | 114 → 114 | 10,119 → 10,119 | 929 → 929 | 0 → 0 |
| `wayfinder` | 118 → **126** (+8) | 31,257 → 31,257 | 713 → **1,246** (+533) | **8 → 0** |
| `SlugSync` | 60 → **61** (+1) | 8,194 → 8,194 | 698 → **772** (+74) | **1 → 0** |
| `Lens` | 56 → 56 | 4,980 → 4,980 | 177 → 177 | 0 → 0 |
| `VeriFi` | 56 → 56 | 5,129 → 5,129 | 276 → **280** (+4) | 0 → 0 |
| `CsLife` | 10 → **11** (+1) | 2,792 → 2,792 | 62 → **69** (+7) | **1 → 0** |
| **Total** | 414 → **424** (+10) | 62,471 → 62,471 | 2,855 → **3,473** (+618) | **10 → 0** |

Because the commits analyzed are identical to those measured before, **these
deltas are attributable to the engine fixes alone** — unlike the self-analysis,
where the repository itself had also changed.

Three things are worth reading off this table:

**All 10 previously skipped files are recovered** (+8 wayfinder, +1 SlugSync,
+1 CsLife), and they bring 614 functions with them. That is D9: those files were
at or above 32,768 characters and previously failed to parse.

**Source LOC is unchanged for every repo, including where file counts rose.**
LOC is counted by `collect/loc` over discovered files without parsing them, so
it was always correct; only parse-dependent metrics were affected by D9. This is
a useful cross-check that the recovered files are the same files, not new ones.

**D10 fires on real student code here**, unlike in the self-analysis: 7
`function_expression` nodes across the cohort — 4 in VeriFi (which explains its
+4 functions with no file change) and 3 in wayfinder. Small in absolute terms,
but this is the construct that was previously invisible *and* had its body folded
into the enclosing function's complexity.

## Per-repo file discovery detail

| Repo | .ts | .tsx | .js | .jsx | .py | `framework` | `function_expression` |
|---|---|---|---|---|---|---|---|
| `alexandria` | 0 | 0 | 0 | 0 | 114 | `null` | 0 |
| `wayfinder` | 0 | 0 | 43 | 0 | 83 | `null` | 3 |
| `SlugSync` | 3 | 0 | 30 | 28 | 0 | React | 0 |
| `Lens` | 10 | 10 | 0 | 0 | 36 | `null` | 0 |
| `VeriFi` | 11 | 15 | 1 | 0 | 29 | `null` | 4 |
| `CsLife` | 0 | 0 | 11 | 0 | 0 | `null` | 0 |

Three things this makes clear:

**The cohort is far less TypeScript than its name suggests.** Only 24 `.ts` and
25 `.tsx` files across all six repositories, against 85 `.js`, 28 `.jsx` and 262
`.py`. `alexandria` and `CsLife` contain no TypeScript at all. Any claim phrased
as being about TypeScript repositories should be checked against this mix.

**`framework` is `null` for five of six.** `collect/frameworkDetection` reads a
root `package.json`, and only `SlugSync` has one — the same condition that makes
batch mode unusable here. This is correct per the schema (`null` = not detected),
but it means the framework column carries no information for this cohort.

**D10 fires on JavaScript, not TypeScript.** All 7 `function_expression` nodes are
in `wayfinder` (3, in `.js`) and `VeriFi` (4). This is the pattern the validation
pass predicted: `const x = function () {}` is a JavaScript-era idiom, absent from
the modern TSX corpus but present in mixed JS codebases — and the planned pre-2021
JS baseline cohort is where it will matter most.

## Reproducing

Per-repo reports are in [`reports/`](reports/). The joined CSV in the batch
schema is [`summary.csv`](summary.csv).

```bash
# clone each repo at the SHA in Table 3, then per repo:
npm run dev -- analyze <path> --output research/cohort_regen/reports/<name>.json
```

Batch mode was **not** usable for five of the six repositories — see the flagged
item in [findings.md](findings.md). Its actual output on this cohort is preserved
in [`batch_output/`](batch_output/) as evidence.
