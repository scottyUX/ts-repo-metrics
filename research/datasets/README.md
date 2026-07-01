# Research datasets (SIP Sprint 1 — Objective 3)

Build a **cohort manifest** linking Pre-AI (2021 baseline) and Post-AI (2026) repositories for downstream structural comparison.

## Layout

```
research/datasets/
├── README.md
├── templates/               # CSV templates for instructor lists
├── post_ai_30.csv           # instructor-provided (kickoff, 30 repos)
├── pre_ai_baseline.csv      # instructor-provided (kickoff, 16 pre-AI repos)
├── post_ai_16.csv           # SIP 2.1 — selected 16 post-AI repos
├── post_ai_16_selection.md  # SIP 2.1 — selection rationale and code-type match
├── select_post_ai_16.py     # SIP 2.1 — regenerate post_ai_16.csv
├── manifest_sprint1.csv     # Sprint 1 — cohort tags (~30 post-AI)
├── manifest_sprint2.csv     # Sprint 2 — 16+16 manifest with status audit
├── audit_post_ai.md         # Sprint 1 — post-AI 30 gap analysis
├── audit_cohort_16x16.md    # Sprint 2 — duplicates, missing analyses, AI log gaps
├── ai_logs_day1_notes.md    # SIP 1.7 — schema and upload notes
├── ai_logs_discovery_report.md  # SIP 1.7 — cohort audit
├── ai_logs_inventory.csv    # SIP 1.7 — per-upload flags
├── samples/                 # optional — subset of report JSON refs
└── tag_cohort.py            # student script (Sprint 1)
```

## AI usage logs (SIP 1.7)

Discovery audit of uploaded `ai_usage_trace.csv` payloads in [`data/analyses_rows.csv`](../../data/analyses_rows.csv):

- [Day 1 notes](ai_logs_day1_notes.md) — schema, upload inventory, agent mix
- [Discovery report](ai_logs_discovery_report.md) — cohort stats, gaps, computable metrics
- [Per-upload inventory](ai_logs_inventory.csv) — flags: `has_log`, `has_messages`, `has_tokens`, `event_count`, `agent`

## Sprint 2 — 16×16 cohort

| File | Role |
|------|------|
| `pre_ai_baseline.csv` | 16 pre-AI (2021) repos |
| `post_ai_16.csv` | 16 post-AI repos (public, distribution-matched) |
| `manifest_sprint2.csv` | Unified manifest: 32 rows, Supabase + local metadata |
| `audit_cohort_16x16.md` | Audit of duplicates, missing analyses, repos without AI logs |

### `manifest_sprint2.csv` status values

| status | Meaning |
|--------|---------|
| `ok` | Pre-AI repo is public, or post-AI row has full Supabase metadata (`result_id`, `commit_sha`, `course_id`, `team_name`) |
| `gap` | Post-AI analysis exists but missing `course_id` and/or `team_name` |
| `exclude` | Missing critical fields or instructor/test repo (none in current cohort) |

## Cohort labels

| `cohort` value | Meaning |
|----------------|---------|
| `pre_ai` | 2021 human-only baseline repo |
| `post_ai` | 2026 Post-AI experimental repo (instructor-selected) |

## Supabase reference

Post-AI rows should align with `public.analyses` fields: `result_id`, `repo_url`, `commit_sha`, `course_id`, `team_name`, `report_json`.

See [`apps/dashboard/app/api/analyze/route.ts`](../../apps/dashboard/app/api/analyze/route.ts) for course allow-list slugs.
