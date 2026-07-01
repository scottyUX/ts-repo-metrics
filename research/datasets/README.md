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
