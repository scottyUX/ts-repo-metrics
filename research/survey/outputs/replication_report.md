# Survey replication report — sample size

**Cohort:** CSE115A-C, Spring 2026  
**Export:** `research/survey/data/raw/survey_CSE115A-C_Spring2026_2026-06-23.csv`  
**Export date:** 2026-06-23

## Final sample size

**N = 62**

All downstream replication statistics (Cronbach's α, Friedman, Pearson correlations) use this cleaned sample.

## Cleaning rules

Applied in order, matching the original paper:

1. Exclude Qualtrics header and import-metadata rows
2. `Finished == True`
3. `Progress == 100`
4. `120 < Duration (in seconds) ≤ 7200`
5. Dedupe by `ResponseId` (keep first occurrence)

## Attrition funnel

| Step | Rule | N |
|------|------|---|
| 1 | Exclude Qualtrics header/import rows | 97 |
| 2 | `Finished == True` | 71 |
| 3 | `Progress == 100` | 71 |
| 4 | `120 < Duration (seconds) ≤ 7200` | **62** |
| 5 | Dedupe by `ResponseId` | **62** |

Steps 2–3 overlap in this export (every finished response also reached 100% progress). Step 5 removed no additional rows (no duplicate `ResponseId` values among retained responses).

The duration filter (step 4) is the only attrition step among otherwise-finished responses: **9 responses excluded**.

## Comparison to the paper

The original study ([`ResearchPaperBody.tsx`](../../apps/dashboard/components/research/ResearchPaperBody.tsx), §4.2) reported a complete-case subsample of **N = 35** (students with AU data at all six SDLC stages).

| | Paper | This cohort |
|--|-------|-------------|
| Final N | 35 | **62** |
| Delta | — | **+27 (+77%)** |

### Why N differs

1. **Complete-case vs. cleaned pool.** The paper's headline replication target is **N = 35** (students with data at all six stages for AU). This cohort's **N = 62** uses the same cleaning rules, but every retained row is stage-complete, so cleaned N equals complete-case N.

2. **Higher stage-completion rate.** The paper reported ~41% completed every stage (35 of ~85 cleaned responses). This cohort retains 62 finished, duration-valid responses—all complete across AU/AUM items.

3. **Single course, different drop-off pattern.** Fewer mid-survey skips among retained rows; attrition is mostly pre-finish abandonment (26 partial) and duration exclusions (9), not within-survey fatigue among completers.

4. **Uniform stage-level N.** All 62 retained responses have full AU/AUM at every phase; the paper's Table 1 had stage N as low as 49 for later phases among the broader pool.

## Duration exclusions

Nine responses removed at step 4:

| ResponseId | Duration | Reason |
|------------|----------|--------|
| R_3frYdC1UMPQTLkt | 82 s (~1.4 min) | Too fast (< 120 s) |
| R_5kNVsxpVqZvKYrY | 101 s (~1.7 min) | Too fast (< 120 s) |
| R_33CEa0iZQBpCmv1 | 13,125 s (~3.6 h) | Too slow (> 7200 s) |
| R_1oC3lboNdtuSplM | 37,174 s (~10.3 h) | Too slow (> 7200 s) |
| R_1nUgpBjYbJPprnW | 79,780 s (~22.2 h) | Too slow (> 7200 s) |
| R_72DzHaWTVMLH44N | 125,171 s (~1.4 days) | Too slow (> 7200 s) |
| R_1j08NCHAR9lxXSd | 194,917 s (~2.3 days) | Too slow (> 7200 s) |
| R_1ruBIRkcnVcOAkJ | 206,408 s (~2.4 days) | Too slow (> 7200 s) |
| R_7eyrImxZNvuhNdG | 497,564 s (~5.8 days) | Too slow (> 7200 s) |

## Partial (non-finished) responses

26 raw attempts did not finish:

| Progress | Count |
|----------|-------|
| 5% | 21 |
| 15% | 1 |
| 35% | 2 |
| 50% | 1 |
| 90% | 1 |

The 5% cluster indicates most abandonments occur immediately after opening the survey.

## Implications for replication

- Target statistics from the paper (α ≈ .665–.897, Friedman χ²(5) ≈ 66.13, overall Pearson r ≈ 0.690) were computed at complete-case **N = 35**.
- This cohort's **N = 62** is 77% larger than the paper's complete-case baseline (+27 respondents), which may improve precision for repeated-measures analyses.
- Point estimates may still diverge from paper targets due to cohort and course context; interpret numeric comparisons with that caveat in mind.
- Because all 62 retained responses are complete across stages, stage-level N for AU/AUM will be uniform at 62—unlike the paper, where later stages had lower effective N among the broader pool.

## AUM reliability (Cronbach's α)

Three-item AUM composites at each SDLC stage (N = 62). Paper benchmark: α ≈ .665–.897.

- **Planning:** α = 0.781 — similar to paper (within the .665–.897 range).
- **Design:** α = 0.728 — similar to paper (within range).
- **Implementation:** α = 0.708 — similar to paper (within range).
- **Testing:** α = 0.900 — higher than paper (above .897 upper bound).
- **Deployment:** α = 0.898 — higher than paper (above .897 upper bound).
- **Maintenance:** α = 0.875 — similar to paper (within range, high end).

All six stages meet or exceed the paper's acceptable exploratory threshold; four fall within the reported range, and Testing/Deployment sit slightly above the paper's upper bound.