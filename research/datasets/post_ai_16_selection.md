# Post-AI 16 Selection

Selected 16 **public** repos from the top-30 post-AI pool to approximate the pre-AI code-type distribution.

## Distribution comparison

| Bucket | Pre-AI target | Post-AI selected | Achieved |
|--------|--------------:|-----------------:|----------|
| JavaScript only (`js`) | 12 (75%) | 12 (75%) | ✓ |
| Python + JavaScript (`py+js`) | 3 (19%) | 3 (19%) | ✓ |
| Python only (`python`) | 1 (6%) | 1 (6%) | ✓ |

### Raw categories in selection

| Category | Count |
|----------|------:|
| py+js+ts | 7 |
| py+js | 3 |
| js+ts | 2 |
| ts | 2 |
| js | 1 |
| python | 1 |

## Pool availability (public repos in top 30)

| Target bucket | Strict matches | Including fallbacks |
|---------------|---------------:|--------------------:|
| js | 1 | 3 |
| py+js | 5 | 14 |
| python | 3 | 3 |

Public repos in pool: **26 / 30**

| Category (all public) | Count |
|-----------------------|------:|
| py+js+ts | 9 |
| py+js | 5 |
| other | 3 |
| python | 3 |
| js+ts | 2 |
| ts | 2 |
| js | 1 |
| py+ts | 1 |

## Selected repos

| # | Repo | Category | Assigned bucket | .py | .js/.jsx | .ts/.tsx | course_id |
|--:|------|----------|-----------------|----:|---------:|---------:|-----------|
| 1 | microfaults/manteion-go | python | python | 1 | 0 | 0 | — |
| 2 | microfaults/manteion-ui | js+ts | js | 0 | 1 | 86 | CSE115C-Spring26 |
| 3 | apagadua/shoe_shopper | py+js | py+js | 50 | 36 | 0 | CSE115A-Spring26 |
| 4 | Brinqa-CRQ-2026/VulnContext-Desktop | py+js+ts | js | 96 | 2 | 171 | — |
| 5 | Colin-Posat/SlugFound | ts | js | 0 | 0 | 92 | — |
| 6 | Aicnev04/PriceYourPlaylist | py+js | py+js | 2 | 9 | 0 | — |
| 7 | MikeyZv/SlugMarket | ts | js | 0 | 0 | 69 | — |
| 8 | Alaurosa/vision-studio | py+js+ts | js | 4 | 165 | 20 | CSE115A-Spring26 |
| 9 | Nxver-GitHub/Nodegent | js+ts | js | 0 | 4 | 159 | — |
| 10 | ismilesen/circuit-simulation | py+js | py+js | 1 | 4 | 0 | — |
| 11 | dareumHJ/sluggym | py+js+ts | js | 3 | 4 | 90 | — |
| 12 | sbelambe/UCSC-Financial-Purchase-Prediction | py+js+ts | js | 48 | 1 | 95 | CSE115A-Spring26 |
| 13 | Medulus/Medulus.github.io | js | js | 0 | 18 | 0 | — |
| 14 | dvdthr5/ArrowBerry | py+js+ts | js | 6 | 17 | 18 | — |
| 15 | MandoBug/InterviewPal | py+js+ts | js | 37 | 3 | 15 | CSE115A-Spring26 |
| 16 | nryee2005/routematch | py+js+ts | js | 66 | 1 | 36 | — |

## Kept from previous post_ai_16.csv

- Aicnev04/PriceYourPlaylist
- Alaurosa/vision-studio
- Brinqa-CRQ-2026/VulnContext-Desktop
- Colin-Posat/SlugFound
- MandoBug/InterviewPal
- MikeyZv/SlugMarket
- apagadua/shoe_shopper
- microfaults/manteion-go
- microfaults/manteion-ui
- sbelambe/UCSC-Financial-Purchase-Prediction

## Replaced from previous post_ai_16.csv

- **DAWLab-cse115/DAWLab-FrontEnd** — not_found, category=private/unavailable
- **MasonD-007/ks_MCPS** — not_found, category=private/unavailable
- **PoolCloser/HabiMatch** — public, category=py+ts
- **nisergdesai/Planly_Organizer** — public, category=py+js+ts
- **royshadmon/EADS** — not_found, category=private/unavailable
- **s-achawro/CWTCG** — not_found, category=private/unavailable

## Newly added

- Medulus/Medulus.github.io
- Nxver-GitHub/Nodegent
- dareumHJ/sluggym
- dvdthr5/ArrowBerry
- ismilesen/circuit-simulation
- nryee2005/routematch

## Fallback notes

- Used 2 js+ts repos for js bucket
- Used 2 ts-only (JS ecosystem fallback) repos for js bucket
- Used 7 py+js+ts (JS-heavy fallback) repos for js bucket

## Private / unavailable in pool

- DAWLab-cse115/DAWLab-FrontEnd — not_found
- MasonD-007/ks_MCPS — not_found
- s-achawro/CWTCG — not_found
- royshadmon/EADS — not_found

## Method

- **Pool**: exclude `scottyUX` owner; dedupe by `repo_url` (latest `analyzed_at`); require valid `report_json` + `commit_sha`; top 30 by `analyzed_at`.
- **Code type**: shallow-clone default branch; count `.py`, `.js`, `.jsx`, `.ts`, `.tsx` (excluding `node_modules`, `venv`, etc.) — same extension rules as pre-AI audit.
- **Public check**: `git ls-remote` HEAD (clone without auth).
- **Selection**: fill buckets 12 js / 3 py+js / 1 python; prefer `course_id`, then most recent `analyzed_at`; allow `js+ts` → js and `py+js+ts` → py+js fallbacks.
