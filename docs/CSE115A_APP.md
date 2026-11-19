# CSE 115A student app

The branded student app is served by the dashboard with `CSE115A_SITE=true` on
its own Railway service. Its root URL opens `/cse115a`. The existing dashboard
service keeps its normal home page.

## Student flow

1. Sign up or sign in with a verified `@ucsc.edu` Google account.
2. Enter the quarter's course code once. The code selects the course; students
   do not choose a section.
3. Connect GitHub so the site knows their username. One teammate installs the course
   GitHub App on the team repository. That install is what lets the site read the
   repository. See [CSE115A_GITHUB_APP.md](CSE115A_GITHUB_APP.md).
4. Open Assignment 1, 2, 3, and so on. Submit two merged task PR URLs, or one big task. The app
   imports `docs/tasks/sprint-N/<task-id>.md` from each PR's merge commit,
   records process checks, and analyzes the PR's changed source files. Once
   every added task is analyzed, submit the assignment in the app. A sprint is
   two tasks or one big task (estimate 4 hours or more). One big task is scored
   out of 10 on its own; two tasks are averaged. A big task under 4 hours shows
   a warning but can still be submitted; graders decide. With two tasks, their
   task IDs must differ, and so must their PRs, unless one merged PR adds both
   task files (see Submission behavior).

## Backend setup

- Apply `supabase/migrations/20260924000000_cse115a_course_submissions.sql`, then
  `20260925000000_cse115a_final_submissions.sql` (submit-once, snapshots, job queue),
  then `20260926000000_cse115a_grading.sql` (draft grades, job claim function),
  then `20260927000000_cse115a_benchmark.sql` (benchmark rows, research consent),
  then `20260928000000_cse115a_instructor.sql` (staff roles, release and regrade),
  then `20260930000000_cse115a_sprint_page.sql` (Scrum confirmation, check facts, due dates),
  then `20261117000000_cse115a_one_task_submit.sql` (submit and release with one
  task or two; replaces `submit_cse_assignment` and
  `release_cse_assignment_submission`, and its header names the old bodies to undo it).
- Enable Google Auth in the Supabase project and configure its Google OAuth
  client ID and secret. In Google Cloud, add
  `https://walwexxczaibfojinkfi.supabase.co/auth/v1/callback` as an authorized
  redirect URI. In Supabase Auth > URL Configuration, allow
  `http://localhost:3015/auth/callback` for the local preview. Add the Railway
  `/auth/callback` URL only when deployment is ready. The Google hosted-domain
  hint improves the chooser, while the server checks the verified Google
  identity's email.
- Enable **manual identity linking** in Supabase Auth settings. Students sign
  in with Google, then link GitHub to the same Supabase account so the site
  knows their GitHub username. Repository reads use the course GitHub App, not
  a stored user token. See [CSE115A_GITHUB_APP.md](CSE115A_GITHUB_APP.md).
- Set `CSE115A_SITE=true` on the separate Railway service, plus `GITHUB_APP_ID`,
  `GITHUB_APP_SLUG`, and `GITHUB_APP_PRIVATE_KEY`. Copy the dashboard's Supabase
  settings. Do not put secrets in this repository. With `CSE115A_SITE=true` the
  service ignores `user_github_tokens`, so those rows can stay when this
  Supabase project also serves the main dashboard.
- Create a code for each quarter after adding that quarter to `cse_courses`:

  ```sh
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    node apps/dashboard/scripts/createCourseCode.mjs CSE115A-Fall26 2026-12-31T23:59:59Z
  ```

  The script prints the code once; the database stores only its SHA-256 hash.
  Revoke a code by setting `revoked_at` on its `cse_course_codes` row.

## Submission behavior

Each assignment has two task slots. Import requires a merged PR that adds
exactly one task file under the matching `docs/tasks/sprint-N/` directory. Only
a task file the PR adds can be its own: one it only modifies or removes (say, a
teammate's file changed by a merge from `main`) never is. The task ID in its
front matter must match the filename. Missing tags or process evidence
are shown as checks for the student; the app does not assign a grade.

A PR that is still open is not imported, but its task file is checked at the
PR's head commit and the student is told every problem at once, so the file can
be fixed before the merge. If the PR has no file named after a task ID but adds
exactly one other `.md` file in the sprint folder, that file is checked and the
message names what is wrong with it (for example, its name against its ID).
An open PR that adds several task files is refused and told to move each one
to its own PR before merging.

As a backup for PRs already merged, a merged PR that adds two of the student's
own task files counts as two tasks. Add PR answers `choose_task_file` with the
files it adds; the student picks one per slot (a file used in the other slot is
shown as taken), and the server re-checks the choice against the PR's added
task files. Only the PR's author can do this, each file must pass every check
on its own, and at most two of its task files can be used. Each slot keeps its
own task file, ID, tags and grade; the captured diff is the same for both, and
the grader is told to judge each task only against its own task file. The same
applies when the student uses only one file of such a PR: the task card, the
review page and the grader say the PR adds another task file. "Task
file committed first" counts when the PR's first commit holds only task files
it adds, this task's among them. This needs
`20261118000000_cse115a_two_tasks_one_pr.sql` (unique per PR and task file
instead of per PR): apply it, then merge. Without it, PRs with one task file
work as before and a second task from the same PR is refused with a message.

Only the student's own task files count in a PR that adds several: a file
whose adding commit was made from another GitHub account (say, a teammate's
branch merged in) is not offered, cannot be chosen, and with one file left is
imported without a choice. A commit with no GitHub account, or a lookup that
fails, leaves the file offered; the review page then says who committed each
file (`facts_json.prTaskFileCommitters`, no logins). An open PR is told which
files are someone else's. PRs with one task file make no such lookup.

Submissions are tied to the signed-in UCSC account and course membership. A
task is marked analyzed only after its Repo Metrics result is saved and linked
to that exact PR. The student's task description comes from the committed file,
not text re-entered in the browser.

## Grading worker

Submitting queues a `grade` job. A worker claims it, grades every task in the
submit-time snapshot (one or two), and saves a draft in `cse_task_grades`. Students see a
grade only after an instructor releases it.

- **Tests pass** and **Process** come from recorded evidence: CI conclusions on
  the merge commit and the import checks. No finished CI, or a missing base
  tag, marks the criterion for instructor review.
- The other five criteria come from one OpenAI call per task with a strict JSON
  schema. Each must quote the submission; a quote that is missing or not found
  in the spec or diff marks it for review. The model and prompt version are
  stored with the grade. The grader reads test and source files that the task
  file names first, then the rest; images, lockfiles and `docs/tasks/` files
  come last. Nothing is dropped, and the benchmark row keeps the diff's order.
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
`base_commit_from_pr_base` or `no_test_patch`. A task whose PR adds more than
one task file (counted at import, in `facts_json.prTaskFiles`) is flagged
`pr_holds_two_tasks`, even when the student uses only one of the files: its
`patch` also holds the other file's work, so export leaves it out (as it does
rejected rows) until a later rebuild splits the diff by task. Two tasks from
one PR still get a row each.

The diff starts at the base tag only when the tag is on the PR's first
commit; otherwise it starts at the PR's first commit when that commit is the
task file alone (`base_commit_from_first_commit`), or at the PR base.

- `patch` and `test_patch` split the base-tag-to-merge diff by test path
  (`lib/cse115a/diff.ts`).
- Files that AI coding tools keep in a repo are left out of both: anything
  under `.agents/`, `.claude/`, `.cursor/` or `.windsurf/`, and
  `skills-lock.json`, in any folder (`isAiToolPath`). Rows that had such
  files get the `ai_tool_files_dropped` flag. Grading still sees them,
  because the graders read the submission's own diff, not the benchmark row.
- `FAIL_TO_PASS` holds test IDs added in `test_patch`, found statically
  (`file::describe > it` for Jest/Vitest, `file::Class::test` for pytest).
  They are unverified. `PASS_TO_PASS`, `image`, `eval_script`, and
  `log_parser` stay empty until a Docker validation pass.
- Personal information is removed before a row is stored
  (`lib/cse115a/benchmark/scrubPii.ts`). The spec's `assignee`, the PR and
  comment authors, and the student's email are collected for each task. They
  are replaced in `problem_statement`, `hints_text`, and `repo_metrics`, along
  with any email address or @mention. Per-author data is dropped from
  `repo_metrics`. In `patch` and `test_patch` only added lines are changed,
  so the patch still applies. Known names become `student`, logins become
  `anon`, and UCSC or known emails become `student@example.com`. Rows changed
  this way get the `pii_scrubbed_from_patch` flag, because a test's meaning
  may have changed. `repo` and `instance_id` still name the team's
  repository.
- Export (`lib/cse115a/benchmark/exportJsonl.ts`) includes an instance only
  when a student who submitted it said yes to the current, approved consent
  wording and no source is rejected.

## Instructor tools

Staff open `/cse115a/instructor` (the header shows **Instructor** only to
staff). Seed the first instructor, then add others from the Staff page:

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node apps/dashboard/scripts/addCourseStaff.mjs CSE115A-Fall26 staff@example.edu instructor
```

- **Submissions**: every enrolled student for an assignment, with status, agent
  and instructor totals, and a needs-review flag. Filter by status.
- **Review**: the submitted tasks side by side with the spec, `patch`/`test_patch`
  diffs, CI results, the Repo Metrics report, and the agent's rationale and
  quotes. Staff can override points (half steps) and add notes, then
  **Release**. Release is blocked while a submitted task has no grade or a
  criterion has no points. A one-task submission shows "One-task sprint: this
  task is the sprint score" with its estimate (amber when under 4 hours) and
  releases with one grade. Edits saved
  after release are visible to the student right away.
- **Regrade** requeues the grade job and keeps instructor edits. **Unlock**
  (instructors only, reason required) supersedes the attempt so the student can
  change tasks and submit again; the old attempt stays as history.
- **Benchmark**: counts by status and consent, a preview of the newest rows,
  and JSONL download.

TAs can do everything except unlock and manage staff.

## Student grade view

While an assignment is submitted but not released, the dashboard shows
**Submitted → Grading → Awaiting instructor review → Grade released** and
polls `/api/cse115a/me` every 20 seconds. After release it shows each task's
score and the sprint score, and the task's Results tab shows points, the
grader's rationale, and instructor notes per criterion. `/me` returns only
released grades of the current attempt.

A research consent card appears until the student answers (`PUT
/api/cse115a/consent`), and a **Change** link stays below the assignments.
The wording lives in `lib/cse115a/consent.ts` and is a placeholder for now.
To go live, paste the IRB-approved text, set `CONSENT_VERSION` to its
identifier, and set `CONSENT_APPROVED = true`. Until then JSONL export is
off. Answers to older wording don't count, so students are asked again when
the version changes.
Preview states: `/cse115a/preview?state=draft|ready|submitted|grading|released`
and `/cse115a/preview/results?state=released`.

## Before enabling student access

Verify the Google and GitHub OAuth round trips, review the privacy statement,
and run the migration against the intended Supabase project.
