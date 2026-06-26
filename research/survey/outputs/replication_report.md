# Survey replication report (SIP-1.2)

**Cohort:** CSE115A-C, Spring 2026  
**Export:** `data/survey_CSE115A-C_Spring2026_2026-06-23.csv`  
**Export date:** 2026-06-23  
**Pipeline:** [scottyUX/aum-survey-analytics](https://github.com/scottyUX/aum-survey-analytics)  
**Paper targets:** [`sigcse_paper/main.tex`](sigcse_paper/main.tex) · [ResearchPaperBody.tsx](https://github.com/scottyUX/ts-repo-metrics/blob/main/apps/dashboard/components/research/ResearchPaperBody.tsx) (dashboard summary)

## Executive summary

We replicated the SIGCSE survey analytics pipeline on 62 cleaned CSE115A-C responses (Spring 2026). The paper's core claim **holds**: AI usage maturity (AUM) varies strongly across SDLC phases (Friedman p < .001). The overall AU–AUM link also **replicates** (r = 0.736 vs paper r = 0.690, both p < .001). Main divergences: usage frequency (AU) now shows significant stage effects where the paper found none (p = .41 → p < .001), and stage-level AU–AUM coupling shifts from Planning-heavy in the paper to Deployment/Maintenance-heavy here. All 62 retained respondents are complete-case at every phase—unlike the paper, where later stages had lower N.

## Results summary

| Test | Paper target | Spring 2026 | Verdict | Rationale |
|------|--------------|-------------|---------|-----------|
| Sample size N | 85 cleaned (~35–48 complete-case) | **62** (all stage-complete) | **Drift** | Same cleaning rules; larger complete-case N, uniform stage N |
| Cronbach's α (AUM, per stage) | α ≈ .665–.897 | 0.708–0.900 (all stages ≥ .7) | **Pass** | All acceptable; Testing/Deployment slightly above upper bound |
| Friedman (AUM across stages) | χ²(5) ≈ 66.13, p < .001 | χ²(5) = 58.48, p < .001 | **Pass** | Same conclusion; χ² ~12% lower |
| Friedman (AU across stages) | χ²(5) = 5.04, p = .41 (n.s.) | χ²(5) = 34.80, p < .001 | **Fail** | Opposite significance conclusion |
| Overall Pearson AU–AUM | r ≈ 0.690 | r = 0.736 | **Pass** | Strong positive, close magnitude |
| Stage-level AU–AUM | Table 4 / Figure 3 | All 6 sig.; Deployment/Maintenance strongest | **Drift** | Same positive direction; different stage pattern |
| Wilcoxon AUM post-hocs | Early/middle vs late cluster | 12/15 same sig.; 2 Fail, 1 Drift | **Drift** | Cluster pattern holds; Planning–Testing and Testing–Deployment flip |

_Verdict labels: **Pass** (close to paper), **Drift** (same direction, different size/pattern), **Fail** (opposite or unrelated)._

## Sample size and cleaning

**N = 62.** All downstream replication statistics (Cronbach's α, Friedman, Pearson correlations) use this cleaned sample.

Applied in order, matching the original paper:

1. Exclude Qualtrics header and import-metadata rows
2. `Finished == True`
3. `Progress == 100`
4. `120 < Duration (in seconds) ≤ 7200`
5. Dedupe by `ResponseId` (keep first occurrence)

### Attrition funnel

| Step | Rule | N |
|------|------|---|
| 1 | Exclude Qualtrics header/import rows | 97 |
| 2 | `Finished == True` | 71 |
| 3 | `Progress == 100` | 71 |
| 4 | `120 < Duration (seconds) ≤ 7200` | **62** |
| 5 | Dedupe by `ResponseId` | **62** |

Steps 2–3 overlap in this export (every finished response also reached 100% progress). Step 5 removed no additional rows (no duplicate `ResponseId` values among retained responses). The duration filter (step 4) is the only attrition step among otherwise-finished responses: **9 responses excluded**.

### Comparison to the paper

The original study ([`sigcse_paper/main.tex`](sigcse_paper/main.tex), §4.2) reported a complete-case subsample of **N = 35** (students with AU data at all six SDLC stages).

| | Paper | This cohort |
|--|-------|-------------|
| Final N | 35 | **62** |
| Delta | — | **+27 (+77%)** |

After the same cleaning rules, the paper retained roughly **N = 85** finished responses before complete-case subsampling; this cohort retains **N = 62**.

**Why N differs:**

1. **Complete-case vs. cleaned pool.** The paper's headline replication target is **N = 35** (students with data at all six stages for AU). This cohort's **N = 62** uses the same cleaning rules, but every retained row is stage-complete, so cleaned N equals complete-case N.
2. **Higher stage-completion rate.** The paper reported ~41% completed every stage (35 of ~85 cleaned responses). This cohort retains 62 finished, duration-valid responses—all complete across AU/AUM items.
3. **Single course, different drop-off pattern.** Fewer mid-survey skips among retained rows; attrition is mostly pre-finish abandonment (26 partial) and duration exclusions (9), not within-survey fatigue among completers.
4. **Uniform stage-level N.** All 62 retained responses have full AU/AUM at every phase; the paper's Table 1 had stage N as low as 49 for later phases among the broader pool.

### Duration exclusions

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

### Partial (non-finished) responses

26 raw attempts did not finish:

| Progress | Count |
|----------|-------|
| 5% | 21 |
| 15% | 1 |
| 35% | 2 |
| 50% | 1 |
| 90% | 1 |

The 5% cluster indicates most abandonments occur immediately after opening the survey.

## AUM reliability (Cronbach's α)

Three-item AUM composites at each SDLC stage. Paper values from [`sigcse_paper/main.tex`](sigcse_paper/main.tex) §5.1; Spring values from `data/aum_reliability.csv`.

| Stage | Items | Paper N | Spring N | Paper α | Spring α | Verdict | Rationale |
|-------|-------|---------|----------|---------|------------|---------|-----------|
| Planning | 3 | — | 62 | .897 | 0.781 | **Drift** | Acceptable but ~.12 lower |
| Design | 3 | — | 62 | .669 | 0.728 | **Pass** | Close |
| Implementation | 3 | — | 62 | .699 | 0.708 | **Pass** | Close |
| Testing | 3 | — | 62 | .852 | 0.900 | **Drift** | Higher than paper |
| Deployment | 3 | — | 62 | .665 | 0.898 | **Drift** | Much higher than paper |
| Maintenance | 3 | — | 62 | .870 | 0.875 | **Pass** | Close |

**Section verdict: Pass.** All six stages exceed α ≥ .60; three close matches, three drift in magnitude but remain acceptable.

## Stage-level AU and AUM descriptives

Mean (SD) by SDLC stage. Paper values from Table `tab:descriptives` in [`sigcse_paper/main.tex`](sigcse_paper/main.tex); Spring values from `data/stage_level_summary.csv` (N = 62 at every stage).

| Stage | Paper AU M (SD) | Spring AU M (SD) | Paper AUM M (SD) | Spring AUM M (SD) | Paper N | Spring N |
|-------|-----------------|------------------|------------------|-------------------|---------|----------|
| Planning | 3.19 (1.42) | **4.016 (1.166)** | 3.73 (1.13) | **4.151 (0.807)** | 85 | **62** |
| Design | 3.20 (0.66) | **4.081 (0.893)** | 3.50 (0.52) | **4.022 (0.746)** | 54 | **62** |
| Implementation | 3.39 (1.24) | **4.274 (0.853)** | 3.84 (0.97) | **4.161 (0.811)** | 85 | **62** |
| Testing | 2.98 (0.72) | **4.000 (0.992)** | 3.25 (0.68) | **3.790 (1.048)** | 49 | **62** |
| Deployment | 2.96 (0.65) | **3.419 (1.209)** | 3.15 (0.55) | **3.091 (1.203)** | 53 | **62** |
| Maintenance | 3.09 (0.68) | **3.742 (1.115)** | 3.22 (0.62) | **3.516 (1.101)** | 58 | **62** |

Spring cohort means are higher across stages; the AUM drop at Deployment (3.09 vs paper 3.15) is sharper relative to early/middle phases, supporting the early/middle vs. late cluster pattern seen in Wilcoxon post-hocs.

## Friedman and Wilcoxon post-hocs

Friedman tests and Bonferroni-corrected Wilcoxon post-hocs on stage-wise AUM and AU, compared to the SIGCSE paper (Section 5.2).

### Missing-data handling

| Stage | Script | Rule |
|-------|--------|------|
| **Item → construct** | `build_analysis_dataset.py` | Likert text/numbers converted to 1–5; invalid or blank → NaN. Per-stage AU and AUM = row-wise mean with `skipna=True`. |
| **Friedman + Wilcoxon** | `stats_inference.py` | Complete-case: drop any row missing any of the six stage columns (`dropna(how="any")`). |

In the paper, per-stage N varied (e.g., Planning N = 85, Testing N = 49); Friedman subsamples dropped to **N = 48** (AUM) and **N = 35** (AU). In Spring 2026, all **62** cleaned respondents have non-missing AU and AUM at all six stages—no one excluded for phase skipping.

### Friedman results

Exact values from `data/friedman_results.csv`.

| Construct | | Paper | Spring 2026 | Verdict |
|-----------|---|-------|-------------|---------|
| **AUM** | N (complete-case) | 48 | **62** | |
| | χ²(df) | χ²(5) = 66.13 | **χ²(5) = 58.4816** | |
| | p | < .001 | **< .001** | **Pass** |
| **AU** | N (complete-case) | 35 | **62** | |
| | χ²(df) | χ²(5) = 5.04 | **χ²(5) = 34.7988** | |
| | p | .41 (not significant) | **2.0 × 10⁻⁶** | **Fail** |

**AUM — Verdict: Pass.** Both cohorts find a highly significant stage effect (p < .001); χ² is ~12% lower but same conclusion.

**AU — Verdict: Fail.** The paper found no significant stage effect (p = .41); Spring 2026 finds p = 2.0 × 10⁻⁶ — opposite significance conclusion.

### Wilcoxon AUM post-hocs (Bonferroni)

Complete-case **N = 62**; 15 pairwise comparisons; Bonferroni-corrected α ≈ 0.0033. Paper values from Table `tab:posthoc` in [`sigcse_paper/main.tex`](sigcse_paper/main.tex); Spring values from `data/wilcoxon_aum_posthoc.csv`.

| Stage A | Stage B | Paper p_Bonf | Paper Sig. | Spring W | Spring p_raw | Spring p_Bonf | Spring Sig. | Verdict |
|---------|---------|--------------|------------|----------|--------------|---------------|-------------|---------|
| Planning | Design | .026 | * | 328.5 | .122 | 1.000 | n.s. | **Drift** |
| Planning | Implementation | 1.00 | n.s. | 375.5 | .839 | 1.000 | n.s. | **Pass** |
| Planning | Testing | .001 | ** | 239.0 | .013 | .1945 | n.s. | **Fail** |
| Planning | Deployment | < .001 | ** | 79.5 | < .001 | < .001 | ** | **Pass** |
| Planning | Maintenance | < .001 | ** | 226.5 | .0006 | .0088 | ** | **Pass** |
| Design | Implementation | .090 | n.s. | 349.5 | .201 | 1.000 | n.s. | **Pass** |
| Design | Testing | .143 | n.s. | 315.0 | .056 | .837 | n.s. | **Pass** |
| Design | Deployment | .004 | ** | 68.5 | < .001 | < .001 | ** | **Pass** |
| Design | Maintenance | .005 | ** | 200.5 | .0006 | .0083 | ** | **Pass** |
| Implementation | Testing | .002 | ** | 148.5 | .0013 | .0188 | * | **Pass** |
| Implementation | Deployment | < .001 | ** | 100.0 | < .001 | < .001 | ** | **Pass** |
| Implementation | Maintenance | < .001 | ** | 156.5 | < .001 | .0007 | ** | **Pass** |
| Testing | Deployment | 1.00 | n.s. | 225.5 | .0003 | .0050 | ** | **Fail** |
| Testing | Maintenance | 1.00 | n.s. | 383.5 | .086 | 1.000 | n.s. | **Pass** |
| Deployment | Maintenance | 1.00 | n.s. | 212.0 | .008 | .116 | n.s. | **Pass** |

#### Significant after Bonferroni correction (Spring 2026 only)

| Stage A | Stage B | Spring W | Spring p_Bonf | Sig. |
|---------|---------|----------|---------------|------|
| Planning | Deployment | 79.5 | < .001 | ** |
| Planning | Maintenance | 226.5 | .0088 | ** |
| Design | Deployment | 68.5 | < .001 | ** |
| Design | Maintenance | 200.5 | .0083 | ** |
| Implementation | Testing | 148.5 | .0188 | * |
| Implementation | Deployment | 100.0 | < .001 | ** |
| Implementation | Maintenance | 156.5 | .0007 | ** |
| Testing | Deployment | 225.5 | .0050 | ** |

**Section verdict: Drift.** The early/middle vs. late cluster pattern largely holds (12 Pass). Two pairs **Fail** (Planning–Testing, Testing–Deployment flip significance); Planning–Design **Drifts** (paper * → n.s.).

## Pearson correlations (AU vs AUM)

Correlations from `survey_phase3_analysis.py` (Phase 3). Paper targets from Section 5.2 / Table 4.

### Overall AU vs AUM

Overall AU and AUM are row-wise means of the six stage scores.

| | Paper | Spring 2026 |
|---|-------|-------------|
| Pearson r | 0.690 | **0.736** |
| p | < .001 | **< .001** |
| N | 85 | **62** |
| Δr | — | **+0.046** |
| **Verdict** | | **Pass** |

Headline number: **r = 0.736** — matches the paper's overall AU–AUM story (paper r = 0.690). **Verdict: Pass** (strong positive, close magnitude, both p < .001).

### Global construct descriptives

Row-wise means for aggregate constructs (N = 62). Source: `data/descriptive_statistics.csv`.

| Variable | Mean | SD |
|----------|------|-----|
| AU_overall | 3.922 | 0.743 |
| AUM_overall | 3.789 | 0.684 |
| AI_Literacy | 3.989 | 0.588 |
| Facilitating_Conditions | 4.097 | 0.824 |

### Stage-level AU vs AUM (Table 4 replication)

Source: `data/stage_au_aum_correlations.csv`. Paper targets from Table 4 in [`sigcse_paper/main.tex`](sigcse_paper/main.tex).

| Stage | Paper r | Paper p | Paper N | Paper Sig. | Spring r | Spring p | Spring N | Spring Sig. | Verdict | Rationale |
|-------|---------|---------|---------|------------|----------|----------|----------|-------------|---------|-----------|
| Planning | .671 | < .001 | 85 | *** | **0.340** | .0069 | 62 | ** | **Drift** | Weaker; still significant |
| Design | .268 | .063 | 49 | n.s. | **0.424** | .0006 | 62 | *** | **Drift** | Now significant |
| Implementation | .462 | < .001 | 85 | *** | **0.456** | .0002 | 62 | *** | **Pass** | Close match |
| Testing | .278 | .061 | 46 | n.s. | **0.521** | < .001 | 62 | *** | **Drift** | Now significant |
| Deployment | .443 | .001 | 49 | ** | **0.725** | < .001 | 62 | *** | **Drift** | Stronger coupling |
| Maintenance | .164 | .224 | 57 | n.s. | **0.711** | < .001 | 62 | *** | **Drift** | Was absent; now strongest late-stage |

**Section verdict: Drift.** Overall AU–AUM is **Pass**; per-stage pattern differs (Implementation **Pass**; five stages **Drift**).

### Selected correlations

Key Pearson r from `data/correlation_matrix.csv` (planning-stage TAM chain and global constructs).

| Relationship | r |
|--------------|---|
| PEOU_plan ↔ PU_plan | 0.376 |
| PU_plan ↔ BI_plan | 0.771 |
| PU_plan ↔ AU_plan | 0.782 |
| BI_plan ↔ AU_plan | 0.679 |
| AU_overall ↔ AUM_overall | 0.736 |
| AI_Literacy ↔ AU_overall | 0.250 |
| AI_Literacy ↔ AUM_overall | 0.483 |

## Verdict roll-up

| Issue #114 task | Test | Verdict |
|-----------------|------|---------|
| Cleaning + N | N = 62 vs paper 85 / 35 complete-case | **Drift** |
| Cronbach's α | 6 stages | **Pass** |
| Friedman AUM | χ²(5) = 58.4816, p < .001 | **Pass** |
| Friedman AU | χ²(5) = 34.7988, p = 2.0 × 10⁻⁶ | **Fail** |
| Pearson overall | r = 0.736 | **Pass** |
| Pearson stage-level | Table 4 | **Drift** |
| Wilcoxon post-hocs | 15 pairs | **Drift** |

## Major takeaways (compared to the paper)

### What replicates

- **AUM varies by SDLC phase.** Friedman χ²(5) = 58.4816, p < .001 (paper: χ²(5) = 66.13, p < .001). The core RQ2 claim—that AI usage maturity is not flat across the lifecycle—holds.
- **Early/middle vs. late AUM cluster.** Wilcoxon post-hocs show Planning, Design, and Implementation above Deployment on most contrasts; 12 of 15 pairwise comparisons match the paper's significance direction.
- **Overall AU–AUM link.** r = 0.736 vs paper r = 0.690, both p < .001. Students who use AI more also report more mature use.
- **AUM scale reliability.** All six stages α ≥ 0.708 (paper range .665–.897); acceptable internal consistency at every phase.

### What diverges

- **Sample composition.** N = 62 complete-case at every stage vs paper ~85 cleaned / 35–48 complete-case with uneven per-stage N; +77% larger complete-case AU subsample here with uniform stage-level N.
- **AU stage effects.** Paper: Friedman p = .41 (usage frequency flat across phases). Spring: χ²(5) = 34.7988, p = 2.0 × 10⁻⁶—opposite significance conclusion (**Fail**).
- **AU–AUM coupling pattern.** Paper strongest at Planning (r = .671); Spring strongest at Deployment (r = .725) and Maintenance (r = .711). All six stages significant here vs three in the paper.
- **Wilcoxon flips.** Planning–Testing (paper ** → Spring n.s.) and Testing–Deployment (paper n.s. → Spring **).
- **Higher reported means.** AU and AUM M roughly 0.7–1.0 points higher across stages (e.g., Planning AUM 4.15 vs 3.73)—likely cohort or context difference, not a pipeline change.

### Bottom line

The paper's main story—**maturity differs by lifecycle phase while overall usage–maturity coupling is strong**—**replicates**. Spring 2026 **extends** that story: usage frequency also varies by phase, and maturity–frequency coupling is **uniform and late-stage-heavy** rather than Planning-centric—possibly driven by fuller complete-case data (N = 62) and single-course cohort differences.

## Pipeline output reference

| Output (in aum-survey-analytics) | Description |
|------------------------------------|-------------|
| `data/descriptive_statistics.csv` | Means, SD, N for all constructs including globals |
| `data/stage_level_summary.csv` | AU and AUM M/SD by SDLC stage |
| `data/friedman_results.csv` | Friedman χ², df, p for AUM and AU |
| `data/wilcoxon_aum_posthoc.csv` | 15 pairwise Wilcoxon tests on AUM with Bonferroni p-values |
| `data/correlation_matrix.csv` | Full Pearson matrix including AU_overall ↔ AUM_overall |
| `data/stage_au_aum_correlations.csv` | Within-stage AU–AUM r, p, N for all six SDLC phases |
| `data/aum_reliability.csv` | Cronbach's α per stage |
| `assets/au_vs_aum.png` | Overall scatter plot (paper Figure 3 analogue) |
| `assets/au_aum_correlation_by_stage.png` | Stage-level correlation bar chart (paper Table 4 analogue) |

## Reproducibility

In [aum-survey-analytics](https://github.com/scottyUX/aum-survey-analytics), from a fresh clone with dependencies installed:

```bash
./run_all.sh /path/to/export.csv
```

For this cohort:

```bash
./run_all.sh ../ts-repo-metrics/research/survey/data/raw/survey_CSE115A-C_Spring2026_2026-06-23.csv
```

Regenerates cleaned data, stats CSVs, figures, and `index.html`.
