# Audit: Cohort 16×16 (manifest_sprint2.csv)

**Dataset**: 16 pre-AI + 16 post-AI repos from `research/datasets/manifest_sprint2.csv`
**Supabase source**: `data/analyses_rows.csv` (114 rows)

## Executive summary

| Check | Result |
|-------|--------|
| Duplicates in manifest | **0** |
| Post-AI missing Supabase analysis | **0/16** |
| Pre-AI missing local analysis report | **16/16** |
| Post-AI with AI log on manifest row | **7/16** |
| Post-AI without AI log on manifest row | **9/16** |
| Post-AI repos with multiple Supabase uploads | **11/16** |
| Post-AI metadata gap (`status=gap`) | **11/16** |

## 1. Duplicates

### In manifest

- No duplicate `repo_url` or `result_id`.
- Same owner on multiple repos: microfaults (different repos — OK).

### In Supabase (post-AI cohort repos)

Manifest uses the row recorded in `manifest_sprint2.csv` (typically latest `analyzed_at`). Repos with more than one valid upload:

#### Aicnev04/PriceYourPlaylist (3 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `Aicnev04-PriceYourPlaylist-c17a5b9a1526` | 2026-06-08 | AI log | manifest=yes |
| `Aicnev04-PriceYourPlaylist-7f81c08a9cbe` | 2026-05-31 | no AI log | manifest=no |
| `Aicnev04-PriceYourPlaylist-b2bad0698d0f` | 2026-05-18 | no AI log | manifest=no |

#### Brinqa-CRQ-2026/VulnContext-Desktop (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `Brinqa-CRQ-2026-VulnContext-Desktop-0d8922d004a2` | 2026-06-09 | no AI log | manifest=yes |
| `Brinqa-CRQ-2026-VulnContext-Desktop-3b9fe6020a85` | 2026-05-28 | no AI log | manifest=no |

#### Colin-Posat/SlugFound (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `Colin-Posat-SlugFound-c8556ef8e1d1` | 2026-06-09 | AI log | manifest=yes |
| `Colin-Posat-SlugFound-e480db2c4df9` | 2026-06-07 | AI log | manifest=no |

#### MandoBug/InterviewPal (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `MandoBug-InterviewPal-becb21a5bcb0` | 2026-05-29 | AI log | manifest=yes |
| `MandoBug-InterviewPal-82369f1d699a` | 2026-05-22 | no AI log | manifest=no |

#### MikeyZv/SlugMarket (4 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `MikeyZv-SlugMarket-966d4fc8a424` | 2026-06-08 | no AI log | manifest=yes |
| `MikeyZv-SlugMarket-18e09b522526` | 2026-06-03 | AI log | manifest=no |
| `MikeyZv-SlugMarket-09b566a7b3d0` | 2026-05-27 | no AI log | manifest=no |
| `MikeyZv-SlugMarket-dc835a6af5b4` | 2026-05-13 | no AI log | manifest=no |

#### Nxver-GitHub/Nodegent (3 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `Nxver-GitHub-Nodegent-2cbe9d9e3a3d` | 2026-06-08 | AI log | manifest=yes |
| `Nxver-GitHub-Nodegent-813d7320e155` | 2026-05-27 | no AI log | manifest=no |
| `Nxver-GitHub-Nodegent-cacc1d099c68` | 2026-05-13 | no AI log | manifest=no |

#### apagadua/shoe_shopper (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `apagadua-shoe_shopper-5c57708e54cf` | 2026-06-11 | no AI log | manifest=yes |
| `apagadua-shoe_shopper-93aa6cc83125` | 2026-06-04 | AI log | manifest=no |

#### dareumHJ/sluggym (4 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `dareumHJ-sluggym-28594b29ae3f` | 2026-06-05 | AI log | manifest=yes |
| `dareumHJ-sluggym-a3445a119d73` | 2026-06-05 | AI log | manifest=no |
| `dareumHJ-sluggym-8a9747a1c761` | 2026-06-04 | no AI log | manifest=no |
| `dareumHJ-sluggym-3397f03b83ef` | 2026-06-02 | no AI log | manifest=no |

#### ismilesen/circuit-simulation (3 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `ismilesen-circuit-simulation-cde2ea57fd9f` | 2026-06-07 | AI log | manifest=yes |
| `ismilesen-circuit-simulation-54f97c857778` | 2026-06-03 | AI log | manifest=no |
| `ismilesen-circuit-simulation-6528a62337d2` | 2026-05-28 | no AI log | manifest=no |

#### microfaults/manteion-ui (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `microfaults-manteion-ui-4c71d6c27ea3` | 2026-06-11 | no AI log | manifest=yes |
| `microfaults-manteion-ui-6981932ef4ef` | 2026-05-28 | no AI log | manifest=no |

#### sbelambe/UCSC-Financial-Purchase-Prediction (2 uploads)

| result_id | analyzed_at | ai_usage_csv | in manifest |
|-----------|-------------|--------------|-------------|
| `sbelambe-UCSC-Financial-Purchase-Prediction-4d30585a3921` | 2026-06-04 | no AI log | manifest=yes |
| `sbelambe-UCSC-Financial-Purchase-Prediction-ea5bc165f2ae` | 2026-05-28 | no AI log | manifest=no |

## 2. Missing analyses

### Post-AI (16)

- All 16 post-AI repos have a valid Supabase analysis matching the manifest `result_id` (`report_json` + `commit_sha`).

### Pre-AI (16)

- Expected `analysis_source=local_run` with no Supabase fields. Structural comparison requires local re-analysis on the dev engine.

Repos without a local JSON report under `research/cohort/reports/pre_ai/`:

- raeeka98/MarinePlastics-MobileApp
- nkalscheuer/mavericks
- alrivero/MAT3D
- MissValeska/CSE-115A-GeneSearcher
- nhak03/115proj
- CSE115aStock/StockCSE115A
- blukat29/cmps115
- divark/tsrassistant
- moelattma/Clubster
- Strict-Evaluation/editthis
- kmirijan/PickUp
- matt-ngo/CSE-115A
- dcalta/CMPS115Winter2018---Job-Application-Organizer
- Ragneroke/cmps115Project
- Cstew12/cse115A
- cnoda1397/CSE115-Slug-Pantry

### Local post-AI reports

- Local post-AI reports present for all 16 repos.

## 3. AI usage logs

AI log presence is determined by non-empty `ai_usage_csv` on the manifest `result_id` row in `data/analyses_rows.csv`.

- **With AI log**: 7/16
- **Without AI log**: 9/16

### With AI log (manifest row)

- Aicnev04/PriceYourPlaylist
- Colin-Posat/SlugFound
- MandoBug/InterviewPal — flagged CORRUPT in SIP 1.7 discovery report
- Nxver-GitHub/Nodegent
- dareumHJ/sluggym
- ismilesen/circuit-simulation
- microfaults/manteion-go

### Without AI log (manifest row)

- Alaurosa/vision-studio (`status=ok`)
- Brinqa-CRQ-2026/VulnContext-Desktop (`status=gap`)
- Medulus/Medulus.github.io (`status=gap`)
- MikeyZv/SlugMarket (`status=gap`)
- apagadua/shoe_shopper (`status=ok`)
- dvdthr5/ArrowBerry (`status=gap`)
- microfaults/manteion-ui (`status=ok`)
- nryee2005/routematch (`status=gap`)
- sbelambe/UCSC-Financial-Purchase-Prediction (`status=ok`)

### Log on a different upload (manifest row misses it)

Latest analysis was chosen for the manifest, but an older upload has the AI log:

- **MikeyZv/SlugMarket**
  - `MikeyZv-SlugMarket-18e09b522526` (2026-06-03)
- **apagadua/shoe_shopper**
  - `apagadua-shoe_shopper-93aa6cc83125` (2026-06-04)

## 4. Manifest status summary

| status | count | meaning |
|--------|------:|---------|
| ok | 21 | pre-AI public repo, or post-AI with full metadata |
| gap | 11 | post-AI analysis exists but missing course_id and/or team_name |
| exclude | 0 | missing result_id/commit_sha or instructor repo |

## 5. Recommendations

1. **Pre-AI**: Run local structural analysis for all 16 baseline repos before comparing to post-AI Supabase reports.
2. **Duplicate uploads**: For AI-behavior research, consider choosing the upload with the best AI log (non-empty `ai_usage_csv`, completeness) rather than latest `analyzed_at` only — especially `apagadua/shoe_shopper` and `MikeyZv/SlugMarket`.
3. **No AI log (9 repos)**: Structural metrics are still available from `report_json`; AI usage metrics require a new log upload or switching to an alternate analysis row where one exists.
4. **InterviewPal**: Treat as QA/corrupt bucket unless a cleaner upload is obtained (see `ai_logs_discovery_report.md`).
5. **Metadata gaps**: 11 post-AI rows lack course/team tags in Supabase; analysis data is usable but cohort grouping is incomplete.
