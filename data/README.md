# Analysis data export

Supabase `public.analyses` table export for SIP dataset work (SIP-1.3).

| File | Description |
|------|-------------|
| `analyses_rows.csv` | Row-level analysis records: `result_id`, `repo_url`, `commit_sha`, `course_id`, `team_name`, `github_login`, `report_json`, `ai_usage_csv`, etc. |

**Source:** Exported from Supabase and placed here for student cohort auditing without requiring live database credentials.

**Privacy:** Contains pseudonymous user IDs and GitHub logins. Do not share outside the research team. Consider moving to a private repo or Git LFS if the public repo policy changes.

**Usage:** See [research/datasets/README.md](../research/datasets/README.md) for manifest and Post-AI audit tasks.

## Samples (sanitized, safe to share)

| Path | Description |
|------|-------------|
| [samples/cursor/](samples/cursor/) | Synthetic Cursor agent JSONL for SIP-1.4 parser development |
