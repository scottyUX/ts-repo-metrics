# Sample analyses (SIP Sprint 2 — pipeline validation)

8 of the 32 `manifest_sprint2.csv` repos (4 `pre_ai` + 4 `post_ai`), used to validate that the
report-generation pipeline produces the fields needed for the Pre-AI vs Post-AI comparison,
ahead of running the full 32-repo comparison.

## Data source

All 8 samples were generated locally against the live GitHub repo — no Supabase data was used:

```
npm run dev -- analyze <repo_url> --output research/datasets/samples/<cohort>/<owner>-<repo>.json
```

## Samples

| # | Cohort | Repo | File | Data source |
|--:|--------|------|------|--------------|
| 1 | pre_ai | raeeka98/MarinePlastics-MobileApp | `pre_ai/raeeka98-MarinePlastics-MobileApp.json` | local_run |
| 2 | pre_ai | nkalscheuer/mavericks | `pre_ai/nkalscheuer-mavericks.json` | local_run |
| 3 | pre_ai | alrivero/MAT3D | `pre_ai/alrivero-MAT3D.json` | local_run |
| 4 | pre_ai | MissValeska/CSE-115A-GeneSearcher | `pre_ai/MissValeska-CSE-115A-GeneSearcher.json` | local_run |
| 5 | post_ai | Alaurosa/vision-studio | `post_ai/Alaurosa-vision-studio.json` | local_run |
| 6 | post_ai | Brinqa-CRQ-2026/VulnContext-Desktop | `post_ai/Brinqa-CRQ-2026-VulnContext-Desktop.json` | local_run |
| 7 | post_ai | Colin-Posat/SlugFound | `post_ai/Colin-Posat-SlugFound.json` | local_run |
| 8 | post_ai | MikeyZv/SlugMarket | `post_ai/MikeyZv-SlugMarket.json` | local_run |

## Parse status

All 8 samples parse all 7 required `report_json` fields.

| # | complexity.average | maintainability.score | smells.longFunctions | profile.sourceLOC | testCoverageProxy.ratio | phase3.sfd | phase3.srs |
| --: | --: | --: | --: | --: | --: | --: | --: |
| 1 | 1.3 | 73.4 | 2 | 1,505 | 0 | 0 | 0 |
| 2 | 1.5 | 73.8 | 0 | 469 | 0.02 | 0 | 0 |
| 3 | 2.6 | 67.5 | 622 | 1,084,782 | 0.01 | 0 | 0 |
| 4 | 1.6 | 77.4 | 1 | 810 | 0.35 | 0 | 0 |
| 5 | 2.8 | 69.5 | 110 | 25,199 | 0.16 | 0.03968 | 0 |
| 6 | 1.9 | 68.1 | 144 | 22,166 | 0.44 | 0 | 0 |
| 7 | 2.2 | 68.4 | 36 | 7,452 | 0.1 | 0 | 0 |
| 8 | 1.5 | 74.0 | 46 | 4,195 | 0.66 | 0.23838 | 0 |

`#` matches the row number in the Samples table above.

`phase3.sfd` / `phase3.srs` are present (non-null) in all 8 samples — most repos show `0` for both,
which reflects no detected silent-failure/error-swallowing patterns rather than a missing field.

## Notes

- `alrivero/MAT3D` includes a large vendored/generated asset directory, which explains its outlier
  `profile.sourceLOC` (~1.08M) and `smells.longFunctions` (622) relative to the other 7 samples.
- These 8 repos are a subset of the 32-repo cohort in `../manifest_sprint2.csv`; the remaining
  24 repos (12 pre_ai + 12 post_ai) are covered by a separate, deferred full-comparison task.
