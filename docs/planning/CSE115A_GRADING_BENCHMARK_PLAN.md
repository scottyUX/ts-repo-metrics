# CSE 115A: grading agent and SWE-bench task capture

Status: plan, 2026-09-23. Builds on the student app in `docs/CSE115A_APP.md`.

## Decisions

| Topic | Decision |
|---|---|
| Submission | A student can replace PRs and rerun analysis until they press **Submit Assignment N**. That creates one immutable final submission. Only an instructor can unlock it. |
| Grading | An OpenAI agent grades from the rubric using a snapshot taken at submit time. It does not run code. |
| Grade release | The agent writes a draft. An instructor reviews, edits, and releases it. Students see nothing until release. |
| Job runner | A Supabase `cse_grading_jobs` queue, claimed by a poller inside the Railway app. |
| Benchmark | Every final task creates a private row in a SWE-bench-shaped table. Export includes only students who opted into research use. |
| Row validity | Rows are saved with whatever the PR yields. Docker-only fields (`image`, `eval_script`, `log_parser`, verified test lists) stay empty until a later offline validation pass. |
| Languages | TypeScript/JavaScript and Python. |
| Instructor UI | Grade review and release, unlock, benchmark export, instructor/TA roles. |

## SWE-bench mapping

`cse_benchmark_tasks` has exactly the SWE-bench columns plus `repo_metrics`.
Provenance, consent, and grading live in other tables.

| Column | Source | v1 |
|---|---|---|
| `instance_id` | `{owner}__{repo}-{task_id}`, e.g. `team-alpha__proj-US-1-T-1` | filled |
| `repo` | `owner/repo` of the PR | filled |
| `base_commit` | commit of the `{task_id}-base` tag | filled; if the tag is missing, the PR base SHA, flagged |
| `environment_setup_commit` | same as `base_commit` | filled |
| `created_at` | PR `merged_at` | filled |
| `version` | `sprint-{n}` | filled |
| `problem_statement` | committed task spec markdown | filled |
| `hints_text` | PR body and review comments | filled, may be empty |
| `patch` | `base_commit..merge_commit` diff, non-test files | filled |
| `test_patch` | same diff, test files only | filled |
| `FAIL_TO_PASS` | test IDs added in `test_patch`, parsed statically | filled but unverified |
| `PASS_TO_PASS` | needs a test run | empty |
| `eval_type` | `pass_and_fail` | filled |
| `image`, `eval_script`, `log_parser` | need Docker | empty |
| `difficulty` | bucket from `estimate_hours` (`<15 min` … `>4 hours`, SWE-bench labels) | filled |
| `repo_metrics` | Repo Metrics report for the PR (the `analyses` row) | filled |

Test file rules: TS/JS `*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`;
Python `test_*.py`, `*_test.py`, `tests/`, `conftest.py`. Static test IDs:
`file::describe > it` for Jest/Vitest, `file::test_name` / `file::Class::test_name`
for pytest.

The task spec is committed at the base tag, so `base_commit` already contains
the problem statement file. That is acceptable and matches how students work;
the exporter keeps it.

## Backend

### Migration `20260925000000_cse115a_grading_benchmark.sql`

- **`cse_course_roles`**: `course_id`, `email` (lowercased), `role` (`instructor` | `ta`), `created_at`. Matched against the signed-in UCSC email, so staff can be added before their first sign-in.
- **`cse_research_consent`**: `course_id`, `user_id`, `consented` bool, `consent_version`, `updated_at`. Primary key `(course_id, user_id)`.
- **`cse_assignment_submissions`** (change): add `id uuid`, `attempt int`, `status` (`submitted` | `grading` | `graded` | `released` | `grading_failed`), `snapshot jsonb`, `superseded_at`, `unlocked_by`, `unlock_reason`. Replace the primary key with a partial unique index on `(course_id, user_id, assignment_number) where superseded_at is null`. Unlocking sets `superseded_at`, so history is kept.
- **`cse_task_submissions`** (change): a trigger rejects insert/update/delete while an active final submission exists for that assignment. The API also checks, but the trigger is the guarantee.
- **`cse_grading_jobs`**: `id`, `assignment_submission_id`, `kind` (`grade` | `benchmark`), `status` (`queued` | `running` | `succeeded` | `failed`), `attempts`, `run_after`, `locked_at`, `last_error`. Plus a `claim_cse_grading_job()` SQL function that uses `for update skip locked` and reclaims jobs locked more than 10 minutes.
- **`cse_task_grades`**: `assignment_submission_id`, `task_slot`, `rubric jsonb` (per criterion: `points`, `agent_awarded`, `rationale`, `evidence_quotes`, `needs_review`), `agent_total`, `model`, `prompt_version`, `instructor_rubric jsonb`, `instructor_total`, `instructor_notes`, `released_at`, `released_by`.
- **`cse_benchmark_tasks`**: SWE-bench columns plus `repo_metrics jsonb`. `FAIL_TO_PASS` and `PASS_TO_PASS` are `jsonb` arrays; the exporter writes them as JSON strings like the Hugging Face dataset.
- **`cse_benchmark_task_sources`**: `instance_id` FK, `course_id`, `user_id`, `assignment_submission_id`, `task_slot`, `validation_status` (`candidate` | `validated` | `rejected`), `created_at`.
- RLS: students can read their own submissions, and grades only when `released_at` is set. They get no access to jobs or benchmark tables. All writes go through the service role in API routes.

### Submit flow (`POST /api/cse115a/assignments/[n]/submit`)

1. Check as today: two analyzed, distinct PRs.
2. **Take a snapshot with the student's GitHub token now.** Grading runs later, and the token may expire or the repo may change. For each task, store:
   - spec markdown, parsed spec, and validation checks
   - `base_sha` and `merge_commit_sha`
   - the compare diff (`application/vnd.github.diff`), capped at 1 MB
   - PR body and review comments
   - check-run conclusions on the merge commit (evidence for "Tests pass")
   - `analysis_result_id`
3. Call an RPC, `submit_cse_assignment(...)`, that in one transaction inserts the final submission (a unique-index violation returns 409 "already submitted") and queues one `grade` job and one `benchmark` job.
4. Return the submission with `status: "submitted"`.

The existing `upsert` must go; it lets a student resubmit.

### Poller

`instrumentation.ts` starts a loop when `CSE115A_SITE=true` and `CSE115A_WORKER=true`. Every 15 s it claims one job, runs it, and marks it done. Failed jobs retry with backoff up to 3 times, then move to `grading_failed` and show in the instructor view. An internal route, `POST /api/cse115a/internal/jobs/tick` (shared-secret header), processes a job on demand for tests or cron.

### Grading agent (`lib/cse115a/grader/`)

- `deterministic.ts`:
  - **Process** comes from the validation checks.
  - **Tests pass** comes from check runs: all green gives 2, some failures give 1, no CI gives `needs_review` with no points.
- `llmGrader.ts`: one OpenAI call per task, returning structured JSON validated with zod. It scores **Scope, Specs, Acceptance criteria, Tests section, Test quality**. Input: the rubric text (moved out of `AssignmentResultsTab.tsx` into `lib/cse115a/rubric.ts` so the UI and grader share it), the spec markdown, `test_patch`, and a trimmed `patch`. Each criterion must quote its evidence; a missing quote sets `needs_review`.
- `prompt_version` and `model` are stored with each grade so grades can be compared across prompt changes.
- Reuse the OpenAI client setup from `app/api/doc-review/route.ts`.

### Benchmark builder (`lib/cse115a/benchmark/`)

- `splitPatch.ts`: splits a unified diff into source and test hunks by the file rules above.
- `extractTests.ts`: static test IDs for Jest/Vitest/pytest from added lines.
- `buildInstance.ts`: turns snapshot plus report into a row; upserts `cse_benchmark_tasks` and `_sources`.
- `exportJsonl.ts`: produces opt-in, non-rejected rows as SWE-bench JSONL (the export can filter to `validated` once validation exists).

### API routes

| Route | Who | Purpose |
|---|---|---|
| `POST /assignments/[n]/submit` | student | final submit (above) |
| `GET /me` | student | add submission status and released grades |
| `PUT /consent` | student | set research consent |
| `GET /instructor/courses/[slug]/submissions?assignment=n` | staff | table of submissions |
| `GET /instructor/submissions/[id]` | staff | snapshot, agent grade, history |
| `PUT /instructor/submissions/[id]/grade` | staff | save instructor rubric edits |
| `POST /instructor/submissions/[id]/release` | staff | release to student |
| `POST /instructor/submissions/[id]/unlock` | staff | supersede and reopen, with reason |
| `POST /instructor/submissions/[id]/regrade` | staff | requeue the grade job |
| `GET /instructor/courses/[slug]/benchmark` | staff | counts and row previews |
| `GET /instructor/courses/[slug]/benchmark.jsonl` | staff | export |
| `GET/POST/DELETE /instructor/courses/[slug]/roles` | instructor | manage staff |

`lib/cse115a/server.ts` gets `requireCourseStaff(identity, slug)`. A script, `scripts/addCourseStaff.mjs`, seeds the first instructor, like `createCourseCode.mjs`.

## Frontend

### Student (`CourseDashboard.tsx`, `AssignmentResultsTab.tsx`)

- The Submit button opens a confirmation dialog: "You can submit Assignment N once. After that your task PRs are locked." It lists both tasks.
- After submitting, PR inputs and Replace/Submit task buttons are disabled. A status banner shows **Submitted → Grading → Awaiting instructor review → Grade released**. The dashboard polls `/me` every 20 s while not released.
- Results tab: once released, show awarded points per criterion, rationale, instructor notes, and the total in place of "— / 10". Before release, show "Awaiting review".
- A research consent card appears on first course entry and in a settings menu. It can be changed at any time; export reads the current value.
- The preview route gets states for submitted, grading, and released, so the UI can be checked without auth.

### Instructor (`/cse115a/instructor/...`, hidden unless staff)

- **Submissions**: a course and assignment picker, then a table (student email, submitted at, status, agent total, instructor total, needs-review flag). Filter by status.
- **Review**: both tasks side by side. Each task shows the spec, diff viewer (`patch` / `test_patch` tabs), check-run results, and the Repo Metrics link. The rubric table shows agent points and rationale with editable instructor points and notes. Actions: Save, Release, Regrade, Unlock (requires a reason).
- **Benchmark**: counts by status and consent, a row preview with SWE-bench fields, and a Download JSONL button.
- **Staff**: add or remove instructor/TA emails.
- The header links to Instructor for staff only.

## Build order

1. **Schema and submit-once**: migration, submit RPC, snapshot capture, lock trigger, student confirmation and locked UI. Test that resubmit returns 409 and task edits are rejected after submit.
2. **Queue and grader**: jobs table, claim function, poller, deterministic and LLM grading, draft grades. Test with a recorded snapshot fixture and a mocked OpenAI client.
3. **Benchmark builder**: patch split, static test extraction, row builder, JSONL export. Test with TS and Python diff fixtures and a golden JSONL row checked against the SWE-bench field list.
4. **Instructor**: roles, submissions table, review and release, unlock, benchmark page.
5. **Student grade view and consent**, and preview states.
6. **Later**: an offline Docker validation pass fills `image`, `eval_script`, `log_parser`, verified `FAIL_TO_PASS`/`PASS_TO_PASS`, and sets `validated`.

## Open questions

- **Private repos.** `base_commit` is only reproducible if the benchmark user can clone the repo. For export outside the course, we need to either mirror opted-in repos to an org we control or ship a repo snapshot with each row.
- **Hecate discussions.** The earlier plan referred to Hecate discussions that could not be found. Link them here if they carry extra requirements.
- **Grade scale.** Each task is 10 points and a sprint score is the average of the two best tasks (from the current UI). Confirm this is the scale the grader should produce.
