# Sprint 1 — Project 3 board setup (PM)

Manual steps for [Project 3 — AI Driven SWE Research](https://github.com/users/scottyUX/projects/3). The GitHub CLI in this environment lacks `project` scope; PM completes this at kickoff.

## Add issues to the board

Add these issues from `scottyUX/ts-repo-metrics`:

| Issue | Story |
|-------|-------|
| [#112](https://github.com/scottyUX/ts-repo-metrics/issues/112) | SIP-1.0 Instructor kickoff (instructor-owned) |
| [#113](https://github.com/scottyUX/ts-repo-metrics/issues/113) | SIP-1.1 Tooling & CLI |
| [#114](https://github.com/scottyUX/ts-repo-metrics/issues/114) | SIP-1.2 Survey replication |
| [#115](https://github.com/scottyUX/ts-repo-metrics/issues/115) | SIP-1.3 Dataset cohorts |
| [#116](https://github.com/scottyUX/ts-repo-metrics/issues/116) | SIP-1.4 Cursor telemetry |
| [#117](https://github.com/scottyUX/ts-repo-metrics/issues/117) | SIP-1.5 PM / Scrum |

**How:** Project 3 → **Add item** → search issue number or title.

## Column mapping (Week 1)

| Column | Use |
|--------|-----|
| Sprint 1 Backlog | Not started |
| In Progress | Active work |
| Review | PR open |
| Done | Merged or Discussion evidence |
| Blocked | Waiting on instructor (#112) |

Create columns if missing (Project settings → **Manage fields** / board layout).

## Mark legacy work Done

These issues are already **closed** — move any lingering cards to **Done** or remove from active views:

- #53–#57 (pre-SIP backlog)
- #103 (cache bug — fixed via #106)

## Assign owners at kickoff

Fill GitHub assignees on each issue:

| Issue | Role | GitHub assignee |
|-------|------|-----------------|
| #112 | Instructor | `@scottyUX` |
| #113 | Student A — Tooling | _TBD_ |
| #114 | Student B — Survey | _TBD_ |
| #115 | Student C — Dataset | _TBD_ |
| #116 | Student D — Cursor | _TBD_ |
| #117 | Student E — PM | _TBD_ |

PM (#117) also supports #113 baseline verification.

## Pin Discussion

Pin [Discussion #111 — Sprint 1 Architecture](https://github.com/scottyUX/ts-repo-metrics/discussions/111) on the Discussions tab.

## CLI (optional, after `gh auth refresh -s project`)

```bash
gh auth refresh -s project
gh project item-add 3 --owner scottyUX --url https://github.com/scottyUX/ts-repo-metrics/issues/113
# repeat for 112–117
```
