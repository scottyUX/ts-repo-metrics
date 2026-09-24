# CSE 115A student app

The branded student app is served by the dashboard with `CSE115A_SITE=true` on
its own Railway service. Its root URL opens `/cse115a`. The existing dashboard
service keeps its normal home page.

## Student flow

1. Sign up or sign in with a verified `@ucsc.edu` Google account.
2. Enter the quarter's course code once. The code selects the course; students
   do not choose a section.
3. Connect GitHub so the app can read the team's repository and private PRs.
4. Open Assignment 1, 2, 3, and so on. Submit two merged task PR URLs. The app
   imports `docs/tasks/sprint-N/<task-id>.md` from each PR's merge commit,
   records process checks, and analyzes the PR's changed source files. Once
   both are analyzed, submit the assignment in the app.

## Backend setup

- Apply `supabase/migrations/20260924000000_cse115a_course_submissions.sql`, then
  `20260925000000_cse115a_final_submissions.sql` (submit-once, snapshots, job queue),
  then `20260926000000_cse115a_grading.sql` (draft grades, job claim function),
  then `20260927000000_cse115a_benchmark.sql` (benchmark rows, research consent),
  then `20260928000000_cse115a_instructor.sql` (staff roles, release and regrade).
- Enable Google Auth in the Supabase project and configure its Google OAuth
  client ID and secret. In Google Cloud, add
  `https://walwexxczaibfojinkfi.supabase.co/auth/v1/callback` as an authorized
  redirect URI. In Supabase Auth > URL Configuration, allow
  `http://localhost:3015/auth/callback` for the local preview. Add the Railway
  `/auth/callback` URL only when deployment is ready. The Google hosted-domain
  hint improves the chooser, while the server checks the verified Google
  identity's email.
- Enable **manual identity linking** in Supabase Auth settings. Students sign
  in with Google, then link GitHub to the same Supabase account so the existing
  encrypted GitHub token store works.
- Set `CSE115A_SITE=true` on the separate Railway service. Copy the dashboard's
  Supabase and GitHub token encryption settings to that service. Do not put
  secrets in this repository.
- Create a code for each quarter after adding that quarter to `cse_courses`:

  ```sh
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    node apps/dashboard/scripts/createCourseCode.mjs CSE115A-Fall26 2026-12-31T23:59:59Z
  ```

  The script prints the code once; the database stores only its SHA-256 hash.
  Revoke a code by setting `revoked_at` on its `cse_course_codes` row.

## Submission behavior

Each assignment has two task slots. Import requires a merged PR with exactly
one task file under the matching `docs/tasks/sprint-N/` directory. The task ID
in its front matter must match the filename. Missing tags or process evidence
are shown as checks for the student; the app does not assign a grade.

Submissions are tied to the signed-in UCSC account and course membership. A
task is marked analyzed only after its Repo Metrics result is saved and linked
to that exact PR. The student's task description comes from the committed file,
not text re-entered in the browser.

## Grading worker

Submitting queues a `grade` job. A worker claims it, grades both tasks from the
submit-time snapshot, and saves a draft in `cse_task_grades`. Students see a
grade only after an instructor releases it.

- **Tests pass** and **Process** come from recorded evidence: CI conclusions on
  the merge commit and the import checks. No finished CI, or a missing base
  tag, marks the criterion for instructor review.
- The other five criteria come from one OpenAI call per task with a strict JSON
  schema. Each must quote the submission; a quote that is missing or not found
  in the spec or diff marks it for review. The model and prompt version are
  stored with the grade.
- Failed jobs retry after 1 and 4 minutes. After the third failure the job is
  `failed` and the submission is `grading_failed`.

Environment on the service that runs the worker:

| Variable | Purpose |
|---|---|
| `CSE115A_WORKER=true` | Start the 15-second poller from `instrumentation.ts`. Run it on one service only. |
| `OPENAI_API_KEY` | Grader calls. |
| `CSE115A_GRADER_MODEL` | Optional; defaults to `gpt-4o`. |
| `CSE115A_WORKER_SECRET` | Optional; enables `POST /api/cse115a/internal/jobs/tick` with header `x-cse115a-worker-secret`, which runs queued jobs on demand (`?limit=1..10`). |

## Benchmark capture

Each submission also queues a `benchmark` job, which turns both tasks into
SWE-bench instances in `cse_benchmark_tasks` (the SWE-bench columns plus
`repo_metrics`, the task's Repo Metrics report). Every task is captured,
including superseded attempts; `cse_benchmark_task_sources` records who
submitted it, a `validation_status`, and flags such as
`base_commit_from_pr_base` or `no_test_patch`.

- `patch` and `test_patch` split the base-tag-to-merge diff by test path
  (`lib/cse115a/diff.ts`).
- `FAIL_TO_PASS` holds test IDs added in `test_patch`, found statically
  (`file::describe > it` for Jest/Vitest, `file::Class::test` for pytest).
  They are unverified. `PASS_TO_PASS`, `image`, `eval_script`, and
  `log_parser` stay empty until a Docker validation pass.
- Export (`lib/cse115a/benchmark/exportJsonl.ts`) includes an instance only
  when a student who submitted it has consented and no source is rejected.

## Instructor tools

Staff open `/cse115a/instructor` (the header shows **Instructor** only to
staff). Seed the first instructor, then add others from the Staff page:

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node apps/dashboard/scripts/addCourseStaff.mjs CSE115A-Fall26 name@ucsc.edu instructor
```

- **Submissions**: every enrolled student for an assignment, with status, agent
  and instructor totals, and a needs-review flag. Filter by status.
- **Review**: both tasks side by side with the spec, `patch`/`test_patch`
  diffs, CI results, the Repo Metrics report, and the agent's rationale and
  quotes. Staff can override points (half steps) and add notes, then
  **Release**. Release is blocked while a criterion has no points. Edits saved
  after release are visible to the student right away.
- **Regrade** requeues the grade job and keeps instructor edits. **Unlock**
  (instructors only, reason required) supersedes the attempt so the student can
  change tasks and submit again; the old attempt stays as history.
- **Benchmark**: counts by status and consent, a preview of the newest rows,
  and JSONL download.

TAs can do everything except unlock and manage staff.

## Before enabling student access

Verify the Google and GitHub OAuth round trips, review the privacy statement,
and run the migration against the intended Supabase project.
