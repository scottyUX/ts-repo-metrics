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
├── ai_logs_day1_notes.md    # SIP 1.7 — schema and upload notes
├── ai_logs_discovery_report.md  # SIP 1.7 — cohort audit
├── ai_logs_inventory.csv    # SIP 1.7 — per-upload flags
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

## AI usage logs (SIP 1.7)

Discovery audit of uploaded `ai_usage_trace.csv` payloads in [`data/analyses_rows.csv`](../../data/analyses_rows.csv):

- [Day 1 notes](ai_logs_day1_notes.md) — schema, upload inventory, agent mix
- [Discovery report](ai_logs_discovery_report.md) — cohort stats, gaps, computable metrics
- [Per-upload inventory](ai_logs_inventory.csv) — flags: `has_log`, `has_messages`, `has_tokens`, `event_count`, `agent`
