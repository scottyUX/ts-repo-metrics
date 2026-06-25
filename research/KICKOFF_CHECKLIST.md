# SIP 2026 — Sprint 1 kickoff packet (instructor)

Deliver **all items below at Week 1 kickoff** before students start story tasks. Link this checklist from the pinned GitHub Discussion: **SIP 2026 — Sprint 1 Architecture & Open Questions**.

Track instructor delivery in issue **SIP-1.0** (Kickoff packet).

## 1. Qualtrics export (Objective 2)

- [ ] De-identified CSV export from latest student cohort
- [ ] Data dictionary / codebook: AU, AUM, TAM items per SDLC stage (Planning → Maintenance)
- [ ] Notes on missingness rules and expected **N** after cleaning (paper baseline **N = 85**)
- [ ] Delivery: shared drive link **or** place file at `research/survey/data/raw/` (gitignored) and notify PM in Discussion

## 2. Pre-AI repo list (Objective 3)

- [ ] CSV with ~30 repos (2021 human-only baseline)
- [ ] Columns: `owner`, `repo`, `url`, `term`, `notes`
- [ ] Template: [`research/datasets/templates/pre_ai_baseline.template.csv`](datasets/templates/pre_ai_baseline.template.csv)

## 3. Post-AI repo list (Objective 3)

- [ ] Exactly **30** instructor-selected repos from current cohort / Supabase
- [ ] Columns: `result_id`, `owner`, `repo`, `repo_url`, `course_id`, `team_name`, `commit_sha` (if known)
- [ ] Template: [`research/datasets/templates/post_ai_30.template.csv`](datasets/templates/post_ai_30.template.csv)

## 4. Cursor log sample (Objective 4)

- [ ] Sanitized Cursor JSONL sample (no PII)
- [ ] Document macOS log path(s) students should support
- [ ] Place sample at `research/fixtures/cursor/` when ready (or shared drive link for kickoff)

## 5. Access

- [ ] GitHub: invite all SIP students to `scottyUX/ts-repo-metrics` and [Project 3 — AI Driven SWE Research](https://github.com/users/scottyUX/projects/3)
- [ ] Supabase: read-only credentials or export dump for Obj 3 audit (optional if lists are pre-verified)
- [ ] Confirm students can run `npm test` and Python 3 locally

## Replication targets (Objective 2 reference)

Paper statistics to reproduce are documented in [`apps/dashboard/components/research/ResearchPaperBody.tsx`](../apps/dashboard/components/research/ResearchPaperBody.tsx):

- Cronbach's α per stage (AUM composites): α ≈ .665–.897
- Friedman on AUM across stages: χ²(5) ≈ 66.13, p < .001
- Overall Pearson AU–AUM: r ≈ 0.690
- Stage-level AU–AUM correlations (Figure 3 / Table 4 analog)
