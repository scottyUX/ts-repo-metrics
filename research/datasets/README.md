# Research datasets (SIP Sprint 1 — Objective 3)

Build a **cohort manifest** linking Pre-AI (2021 baseline) and Post-AI (2026) repositories for downstream structural comparison.

## Layout

```
research/datasets/
├── README.md
├── templates/               # CSV templates for instructor lists
├── post_ai_30.csv           # instructor-provided (kickoff)
├── pre_ai_baseline.csv      # instructor-provided (kickoff)
├── manifest_sprint1.csv     # student output — cohort tags
├── audit_post_ai.md         # student output — gap analysis
├── samples/                 # optional — subset of report JSON refs
└── tag_cohort.py            # student script (Sprint 1)
```

## Cohort labels

| `cohort` value | Meaning |
|----------------|---------|
| `pre_ai` | 2021 human-only baseline repo |
| `post_ai` | 2026 Post-AI experimental repo (instructor-selected) |

## Supabase reference

Post-AI rows should align with `public.analyses` fields: `result_id`, `repo_url`, `commit_sha`, `course_id`, `team_name`, `report_json`.

See [`apps/dashboard/app/api/analyze/route.ts`](../../apps/dashboard/app/api/analyze/route.ts) for course allow-list slugs.

## Selection criteria

**Post-AI (2026):** The instructor locked the list of 30 repositories before any analysis was run. Students did not choose which repos to include — the cohort was determined by course enrollment in CSE 115A, Spring 2026. This prevents cherry-picking repos that would make the results look favorable.

**Pre-AI (2021):** The baseline list comes from the same course (CSE 115A) taught in 2021, before AI coding assistants were widely available. These repos represent the human-only development baseline for structural comparison.

## Fairness and reproducibility

- Repo selection was independent of analysis results — no repo was added or removed based on its metrics.
- The manifest (`manifest_sprint1.csv`) records every repo in both cohorts with its source (`supabase` or `local_run`), making it possible to reproduce the full dataset.
- Exclusions (private repos, deleted repos, non-functional links) are documented in `audit_post_ai.md` with reasons.

## Research question

This manifest supports the central summer research question "Did project structure change after AI tools became common?" by comparing structural metrics (complexity, function length, duplication, test coverage proxies) between the Pre-AI (2021) and Post-AI (2026) cohorts from the same course, we can measure whether the introduction of AI coding assistants correlates with observable differences in how students organize and write code.
