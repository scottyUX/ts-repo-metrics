# Cohort comparison summary (SIP Sprint 2 — Part B)

Pre-AI vs Post-AI comparison across all 32 repos in `research/datasets/manifest_sprint2.csv`
(n=16 per cohort). All 32 were analyzed locally via `npm run dev -- analyze <repo_url>` against
the current default-branch tip (no Supabase data used) — see
`research/datasets/extract_cohort_metrics.py` and `research/datasets/outputs/cohort_metrics_flat.csv`.

## Per-metric N / mean / median

### Pre-AI

| Metric                        |  N | Mean     | Median  |
| ------------------------------ | -: | -------: | ------: |
| complexity.average              | 16 |    2.138 |   1.700 |
| maintainability.score           | 16 |   71.138 |  72.000 |
| smells.longFunctions            | 16 |   46.812 |   9.000 |
| profile.sourceLOC                | 16 | 72,082.4 | 2,420.5 |
| testCoverageProxy.ratio          | 16 |    0.040 |   0.000 |
| phase3.sfd                       | 16 |    0.000 |   0.000 |
| phase3.srs                       | 16 |    0.000 |   0.000 |
| distributions.p90_complexity     | 16 |    4.438 |   3.000 |

### Post-AI

| Metric                        |  N | Mean     | Median  |
| ------------------------------ | -: | -------: | ------: |
| complexity.average              | 16 |    2.375 |   2.250 |
| maintainability.score           | 16 |   71.319 |  69.050 |
| smells.longFunctions            | 16 |   48.125 |  37.500 |
| profile.sourceLOC                | 16 | 11,385.8 | 10,241.5|
| testCoverageProxy.ratio          | 16 |    0.188 |   0.145 |
| phase3.sfd                       | 16 |    0.070 |   0.000 |
| phase3.srs                       | 16 |    0.000 |   0.000 |
| distributions.p90_complexity     | 16 |    4.812 |   5.000 |

## What looks similar

- **maintainability.score**: near-identical means (71.1 vs 71.3); post-AI's lower median (69.1 vs
  72.0) is pulled down slightly relative to its mean by a high outlier (max 95.0), not a systematic gap.
- **distributions.p90_complexity**: means are close (4.4 vs 4.8); tail complexity risk looks
  comparable across cohorts.
- **phase3.srs**: exactly 0 for every repo in both cohorts — no signal either way.

## What looks different

- **testCoverageProxy.ratio**: post-AI median (0.145) is far above pre-AI's (0.000) — most pre-AI
  repos have no detectable test code by this proxy, while post-AI repos consistently show some.
- **smells.longFunctions**: means are similar (46.8 vs 48.1) but medians diverge sharply (9 vs
  37.5) — pre-AI's mean is dragged up by one outlier (`alrivero/MAT3D`, 622 long functions), while
  post-AI repos more consistently carry a moderate-to-high count of long functions.
- **profile.sourceLOC**: pre-AI has one extreme outlier (`alrivero/MAT3D`, ~1.08M LOC, likely a
  vendored/generated asset directory) pulling its mean far above its own median; post-AI repos
  cluster much more tightly (max ~25K LOC) with mean and median close together.

## Inconclusive

- **complexity.average**: post-AI's median (2.25) is meaningfully higher than pre-AI's (1.70), but
  means are closer (2.38 vs 2.14) and both cohorts span similar ranges — not enough separation at
  n=16 to call this a clear cohort effect vs. project-mix noise.
- **phase3.sfd**: pre-AI is 0 across all 16 repos; post-AI is mostly 0 with a couple of nonzero
  outliers (max 0.65). Too sparse a signal in either cohort to draw a conclusion.

## Limitations

- **n=16 per cohort** — small sample size; all comparisons above are descriptive, not inferential.
- **Mixed language stacks**: repos range from JS-only to Python-heavy to mixed JS/TS/Python, which
  confounds metrics like `profile.sourceLOC` and `smells.longFunctions` — cohort differences may
  partly reflect stack mix rather than pre/post-AI authorship.
- **Fresh local clones vs. pinned commits**: all 32 repos were analyzed against their current
  default-branch tip, not the `commit_sha`/`analyzed_at` values recorded in `manifest_sprint2.csv`
  for the post-AI rows (originally captured via Supabase) — repos with commits since that capture
  date may show drift from what would have been recorded there.
- **Outlier sensitivity**: several headline numbers (pre-AI's `profile.sourceLOC` and
  `smells.longFunctions` means) are dominated by a single repo (`alrivero/MAT3D`); medians are a
  more robust read for this sample size but are still based on only 16 points per cohort.
- **Duplicate/re-uploaded submissions**: the original post-AI pool (`post_ai_30.csv`) may include
  more than one analysis run for the same repo over time; this comparison uses one fresh analysis
  per manifest row, so any such duplication in the source pool doesn't affect these 32 rows
  directly, but is worth keeping in mind if the manifest is regenerated later.


