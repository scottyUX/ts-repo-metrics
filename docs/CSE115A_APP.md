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
   task files (see Submission behavior). Extra tasks are optional: a student may
   submit up to 6 (`MAX_TASKS_PER_SPRINT` in `lib/cse115a/taskSlots.ts`), and the
   sprint score is then the average of all of them (see Extra tasks).

## Backend setup

- Apply `supabase/migrations/20260924000000_cse115a_course_submissions.sql`, then
  `20260925000000_cse115a_final_submissions.sql` (submit-once, snapshots, job queue),
  then `20260926000000_cse115a_grading.sql` (draft grades, job claim function),
  then `20260927000000_cse115a_benchmark.sql` (benchmark rows, research consent),
  then `20260928000000_cse115a_instructor.sql` (staff roles, release and regrade),
  then `20260930000000_cse115a_sprint_page.sql` (Scrum confirmation, check facts, due dates),
  then `20261117000000_cse115a_one_task_submit.sql` (submit and release with one
  task or two; replaces `submit_cse_assignment` and
  `release_cse_assignment_submission`, and its header names the old bodies to undo it),
  then `20261118000000_cse115a_two_tasks_one_pr.sql`, then
  `20261120010000_cse115a_extra_tasks.sql` (up to 6 tasks a sprint: the three
  `task_slot` checks become `between 1 and 6` and `submit_cse_assignment` accepts
  1 to 6 tasks; safe to apply before the app change; the undo is in its header).
  The repo copies need `20261116000000_cse115a_repo_copy_jobs.sql` (the
  `repo_copy` job kind) before `CSE115A_REPO_COPIES` is set to `on`; undo is in
  a comment in that file.
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

Each assignment has two task slots, and up to 6 with extra tasks (see Extra tasks). Import requires a merged PR that adds
exactly one task file under the matching `docs/tasks/sprint-N/` directory. Only
a task file the PR adds can be its own: one it only modifies or removes (say, a
teammate's file changed by a merge from `main`) never is. The task ID in its
front matter must match the filename. Missing process evidence is shown as
checks for the student; the app does not assign a grade.

The task card's checklist has four checks: task file committed alone, first;
opened from the student's GitHub account; task ID in the PR title and branch;
estimate at least 2 hours. Below them are the CI and test-file facts, which are
not checks. A task is Ready when all four pass. Students push no tags (#392):
the app finds the PR's first commit (GitHub's list of the PR's commits) and its
merge commit (stored on the PR) itself, and any `-base` or `-done` tags in the
repository are ignored. "Task file committed alone, first" passes when the PR's
first commit holds only task files the PR adds, this task's among them, and
the task is not paired with a separate task-file PR. When it fails it can't be
fixed on that PR. Rows saved before #392 stored it as false whenever the base
tag was missing; the card and Ready use `facts_json.firstCommitTaskOnly` when it
is recorded, so such a task shows the line as passed without a Re-check. Those
rows also still carry `baseTagPushed` and `doneTagOnMergeCommit` in
`validation_json`; nothing reads or shows them.

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
own task file, ID and grade; the captured diff is the same for both, and
the grader is told to judge each task only against its own task file. The same
applies when the student uses only one file of such a PR: the task card, the
review page and the grader say the PR adds another task file. "Task
file committed first" counts when the PR's first commit holds only task files
it adds, this task's among them. This needs
`20261118000000_cse115a_two_tasks_one_pr.sql` (unique per PR and task file
instead of per PR): apply it, then merge. Without it, PRs with one task file
work as before and a second task from the same PR is refused with a message.

### Extra tasks (#412)

A student may submit up to 6 tasks in a sprint (`MAX_TASKS_PER_SPRINT`, one
constant in `lib/cse115a/taskSlots.ts`; the migration's `between 1 and 6` is the
same number). Two tasks, or one big task, stay the normal sprint; more are
optional.

- **Scoring.** Each task is graded on its own, as before, out of 10. The sprint
  score is the average of every submitted task (`sprintScore` in
  `lib/cse115a/gradeReview.ts`): one task is the score, two are averaged, three
  to six are all averaged. Nothing drops the lowest, so an extra task can lower
  the score as well as raise it. Every place that shows a sprint score uses that
  one function: the student's released score and the sprint tab label
  (`/api/cse115a/me`), the instructor table's Sprint column, and the Review
  page's sprint score (both through `submittedSprintScore`).
- **Student page.** Task 1 and Task 2 always show. Under them, **Add another
  task** opens the next slot until the sprint has 6 slots or is submitted; an
  extra slot works like the first two (Add PR, Re-check, Change PR, choosing a
  task file, the task-file PR pairing). Every task card has **Remove** (asks
  once more) before the sprint is submitted, so a student can drop an extra task
  or leave a gap (Task 1 and Task 3 without Task 2). Next to the button, and in
  the submit dialog when there are three or more tasks, the page says: "Every
  task you submit is graded, and your sprint score is the average of all of
  them. An extra task can raise your score or lower it."
- **Submit rules** (`submitTasksError`): 1 to 6 tasks, each analyzed; every pair
  must differ in task ID; no two may use the same task file from the same PR;
  and at most two tasks may come from one PR (also checked when a task is
  added). Two tasks keep their old messages; three or more name the tasks.
- **Staff.** The instructor table keeps the Task 1 and Task 2 columns and adds a
  Task 3 to Task 6 column only when a listed submission has that slot; each
  sorts like the others. The list reads each snapshot task's slot as a JSON path
  (`SNAPSHOT_SLOT_PATHS`), never the diffs. The Review page shows every task,
  each with its rubric, notes, Get the code and repo-copy download, and for three
  or more tasks the line "N tasks: the sprint score is the average of all N."
  Release needs a grade for every submitted task, as before.
- **Jobs.** The grade, benchmark and repo-copy jobs already work per snapshot
  task. A repo-copy job starts no task after 8 minutes; with six large
  repositories it can end "not finished, will retry", and the retry skips the
  copies already stored.
- **Migration.** `20261120010000_cse115a_extra_tasks.sql`. Apply it before or
  after the app change (old code only writes slots 1 and 2). Until it is
  applied, a third task is refused by the database's slot check, and the add
  fails with "Could not save the task submission."

Only the student's own task files count in a PR that adds several: a file
whose adding commit was made from another GitHub account (say, a teammate's
branch merged in) is not offered, cannot be chosen, and with one file left is
imported without a choice. A commit with no GitHub account, or a lookup that
fails, leaves the file offered; the review page then says who committed each
file (`facts_json.prTaskFileCommitters`, no logins). An open PR is told which
files are someone else's. PRs with one task file make no such lookup.

Also a backup for PRs already merged: a merged PR that adds no task file (the
work PR) can be paired with a second merged PR that adds only the task file
(the task-file PR). Add PR answers `need_task_file_pr`, and the form asks for
the second link. Only the work PR's author can pair. The task-file PR is
checked in order: same repository, not the work PR, merged, opened by the
student, its only file an added or modified task file for this sprint, and that file passes
every task-file check at the task-file PR's merge commit. The task file, ID and
spec come from it; the PR number, first commit, CI, test count, title and
branch checks, diff and analysis come from the work PR. "Task file committed
first" fails (the work PR has none). The task-file PR is saved in
`facts_json.taskFilePr` (`url`, `number`, `mergeSha`); Re-check re-imports the
pair. Neither PR can already be another student's, and the task-file PR can't
be one of the student's other tasks. A PR that adds a wrongly named `.md` in
the sprint folder is not paired; an open PR with no task file is told to add it
before merging. The card, the review page and the snapshot say the task file
came from a separate PR.

A merged PR whose task file has format problems (the only one it adds, or the
one chosen from several) is paired the same way (#420). Add PR answers
`need_task_file_pr` with `reason: "task_file_problems"` and the `problems`, and
the second box says the task file has problems and lists them. The task-file PR
may correct that file or add a correctly named one; its file becomes the task's,
and `facts_json.taskFilePr.fixesTaskPath` records the work PR's file (Re-check
sends it as the chosen file). `prTaskFiles` lists the corrected file in place of
the malformed one. The card and review page say the task file was corrected. The
work PR's diff still holds the old file: the benchmark row drops it
(`task_files_dropped`), the grader reads it last, and the review page's Source
tab shows it in diff order. Someone else's PR, a wrongly named `.md`, and an
open PR are refused with the problems, as before.

Submissions are tied to the signed-in UCSC account and course membership. A
task is marked analyzed only after its Repo Metrics result is saved and linked
to that exact PR. The student's task description comes from the committed file,
not text re-entered in the browser.

## Grading worker

Submitting queues a `grade` job. A worker claims it, grades every task in the
submit-time snapshot (one or two), and saves a draft in `cse_task_grades`. Students see a
grade only after an instructor releases it.

- **Tests pass** and **Process** come from recorded evidence: CI conclusions on
  the merge commit and the import checks. No finished CI marks Tests pass for
  instructor review.
- **Process** has two steps, PR merged and task file first. The task file came
  first when `specCommittedFirst` is true or the snapshot's diff starts at the
  PR's first commit (`baseCommitSource` `first_commit`, which also covers a
  snapshot taken before #392 whose task file was first but untagged). A
  `merge_base` snapshot (#382) never starts at the first commit; instead the
  task file also came first when capture's own check of the PR's first commit
  says so (`taskFileFirstCommit`, saved on snapshots since #382), which covers
  a stale `specCommittedFirst` saved before #392. Both:
  full. Task file not first: none, always marked for instructor review. Not
  merged: partial. Tags play no part.
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
| `CSE115A_REPO_COPIES` | Optional; only `on` turns on the repo copies (a git bundle of each task's repository in the bucket `benchmark-snapshots`, in `repo_copy` jobs queued at Submit and from the Benchmark page). Needs the `repo_copy` migration first, `SUPABASE_SERVICE_ROLE_KEY` and the GitHub App variables. |

## Benchmark capture

Each submission also queues a `benchmark` job, which turns both tasks into
SWE-bench instances in `cse_benchmark_tasks` (the SWE-bench columns plus
`repo_metrics`, the task's Repo Metrics report). Every task is captured,
including superseded attempts; `cse_benchmark_task_sources` records who
submitted it, a `validation_status`, and flags such as
`base_commit_from_pr_base` or `no_test_patch` (and `recaptured_same_patch`, set only by the
staff re-capture below on a kept row; it does not change `task_file_first`). A task whose PR adds more than
one task file (counted at import, in `facts_json.prTaskFiles`) is flagged
`pr_holds_two_tasks`, even when the student uses only one of the files: its
`patch` also holds the other file's work, so export leaves it out (as it does
rejected rows) until a later rebuild splits the diff by task. Two tasks from
one PR still get a row each. A task whose task file came from a separate
task-file PR is flagged `task_file_from_other_pr` and still exported: its task
text and its diff are each complete, but the spec was written after the code.

The diff is the PR's own, the way GitHub's "Files changed" tab computes it
(#382): from the merge base of the PR's base and its head, to the PR's head.
Capture asks GitHub for `compare/{base.sha}...{head.sha}` (JSON), reads
`merge_base_commit.sha`, then fetches the diff of
`compare/{mergeBase}...{head.sha}`. The snapshot saves `baseCommit` (the merge
base), `baseCommitSource` `merge_base`, `headCommit` (the PR's head) and
`diffEnd` `head`; the row gets the flag `base_commit_from_merge_base`. Why:
the earlier rule ended at the merge commit, so anything a teammate merged into
`main` while the task was open was in the diff (10 of 24 merged task PRs on
Nov 14), and ending at the PR's head instead is not enough when the branch
merged `main` in part-way. The merge base keeps teammates' work out either
way, and works for stacked PRs and squash or rebase merges. The task file is
part of the diff, as on GitHub. CI checks are still read on the merge commit.
The import's test-file count (Add PR, Re-check) uses the same range.

Whether the task file came first is no longer told by where the diff starts.
Capture still reads the PR's first commit and saves its answer as
`taskFileFirstCommit` (true when that commit holds only task files the PR adds
and the task is not paired). A `merge_base` row gets the flag
`task_file_not_first` when neither `validation.specCommittedFirst` nor
`taskFileFirstCommit` is `true`, the same rule as grading. The first commit
also gives the fallback's start.

Fallback: when the JSON compare fails or has no merge base, capture uses the
rule before #382 and Submit goes on. The diff ends at the merge commit
(`diffEnd` `merge_commit`, flag `diff_from_merge_commit`) and starts after the
PR's first commit when the task file came first (that commit holds only task
files the PR adds and the task is not paired): `baseCommitSource`
`first_commit`, flag `base_commit_from_first_commit`; otherwise at the PR base
(`pr_base`, flag `base_commit_from_pr_base`). No tag is read (#392).

Saved submissions are unchanged: snapshots taken before #382 have no
`headCommit`, `diffEnd` or `taskFileFirstCommit`, end at the merge commit, and keep their
`first_commit` or `pr_base` start and flags. Snapshots taken before #392 may
say `base_tag`, for a base tag on that same task-file-only first commit; the
range was the same as `first_commit`, and those rows get neither flag.
Staff can re-capture those saved diffs on today's rule; see "Re-capturing old
diffs" under Instructor tools.

- `patch` and `test_patch` split the diff by test path
  (`lib/cse115a/diff.ts`).
- Every file under `docs/tasks/` is left out of both (#382): the task text is
  already `problem_statement`. Rows that had such files get the
  `task_files_dropped` flag. Grading still sees them, last (see above).
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
- Each JSONL line has the SWE-bench fields, unchanged and in the same order,
  then one more key, `task_file_first` (boolean). It is `false` when any
  source of the instance is flagged `base_commit_from_pr_base`,
  `task_file_not_first` (a `merge_base` row) or
  `task_file_from_other_pr`: the task file was not committed alone as the
  PR's first commit, or came from a separate PR after the code was merged,
  so the spec may have been written after the code. `false` also covers the
  rare case where the PR's first commit could not be read. Otherwise it is
  `true`. Rows are not filtered on it; readers that ignore unknown keys, as
  the SWE-bench harness does, see no change. The Harbor export writes the same
  value as `task_file_first = true|false` in each task's `task.toml`, in the
  `[metadata]` table next to `difficulty`; the instruction text does not
  mention it. Known gap: a row captured before
  the base-tag fix, from a base tag a student had put on a first commit that
  holds code, has no flag and reads `task_file_first: true`. The fix stops new
  ones; staff find the old ones with a read-only query on the saved snapshots
  for tasks whose `baseCommitSource` is `base_tag` while `specCommittedFirst`
  is false.

With `CSE115A_REPO_COPIES=on`, the `benchmark` job also queues a `repo_copy`
job, which saves a copy of each task's repository at its base commit (a git
bundle) in the private Storage bucket `benchmark-snapshots`, using the course
GitHub App's token. The copy also holds the PR's own commits (its head, its
merge commit, and a paired task's task-file PR head) and is named
`<instance_id>.<first 12 of base_commit>.full.bundle`; a ref GitHub no longer
has is left out and named in the log line. Only such a complete copy counts as
stored, so "Save missing repo copies" re-copies a task that has only an older
copy (which is kept). The validator needs the copy for a private repository,
because the App's private key stays on this site. Copies run in their own
line: a second poller loop claims only `repo_copy` jobs and the grading loop
never does, so grading never waits on a copy. Each step of a copy has 30
seconds and each task 90; a job starts no new task after 8 minutes. Every task
is copied, whatever the consent answer: consent governs export, not
validation. The instructor Benchmark page shows each task's copy as stored,
queued, running or failed and can queue the missing ones. The site never
serves a copy. Rollout: merge, apply the `repo_copy` migration, set the switch
to `on`, then run "Save missing repo copies".
See "Copies made by the website" in `docs/CSE115A_BENCHMARK_VALIDATION.md`.

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
  releases with one grade. Three or more tasks show "N tasks: the sprint score
  is the average of all N." Edits saved
  after release are visible to the student right away.
- **Get the code** (a closed section in each task on the Review page), for
  running a team's tests or checking a diff: the commands to clone the repo
  from GitHub and check out the PR's merge commit (works when the repo is
  public or the grader's GitHub account can read it), and, when the task has a
  repo copy in `benchmark-snapshots`, a **Download repo copy** link with the
  commands to open it. A complete (`.full`) copy also fetches `refs/hecate/*`
  and checks out `refs/hecate/merge` (`hecate-snapshot` is where the task
  started, `refs/hecate/pr-head` the PR's last commit); an older copy holds
  only the starting point. When the task's benchmark row has a run recipe
  (`harbor_env`), the section also shows the validator's image, installs and
  test commands. It always warns that this is student code, to be run in a
  container or a throwaway VM. The link is
  `GET /api/cse115a/instructor/submissions/<id>/repo-copy?slot=<n>`: staff of
  that course only (instructors and TAs); it answers with a redirect to a
  Storage link that lasts 60 seconds and saves as `<instance_id>.bundle` (the
  file never passes through the site), `404 No repo copy is stored for this
  task.` when there is none, and logs one line per download:
  `Repo copy download: user <staff user id> submission <id> slot <n> instance <instance_id>`
  (no link or token). Students never see the section or the route.
- **Regrade** requeues the grade job and keeps instructor edits. **Unlock**
  (instructors only, reason required) supersedes the attempt so the student can
  change tasks and submit again; the old attempt stays as history.
- **Benchmark**: counts by status and consent, one line of research consent
  totals (see Research consent below), a preview of the newest rows,
  JSONL download, and the repo copies (each task stored, queued, running or
  failed; "Save missing repo copies" and per-task "Retry" queue copy jobs when
  `CSE115A_REPO_COPIES=on`).

### Re-capturing old diffs (#418)

"Diffs saved before the PR-own-diff rule", on the Benchmark page, re-runs
today's diff capture (#382) on submissions already saved, for every task whose
snapshot has no `diffEnd` (an old-rule task), in every submission of the course
that is not superseded. It runs on the site, because private repos need the
course GitHub App; no student does anything. It reads GitHub only with what the
snapshot holds (repo, PR number, task path, `taskFilePr`, `prTaskFiles`).

- **Check all (dry run)** asks for each submission in turn and writes nothing.
  The table shows each task's old and new file lists, whether a file outside
  `docs/tasks/` changed, the benchmark row's status and what would happen to
  it, and "consider Regrade" for an unreleased submission whose code files
  changed. "Copy totals" is a line of counts only, for a status update.
- **Re-capture all** is enabled only after a dry run finished in that page
  load, asks once more ("Yes, re-capture N submissions"), and stops at the
  first failure.
- Only the diff fields of a task change (`baseCommit`, `baseCommitSource`,
  `taskFileFirstCommit`, `headCommit`, `diffEnd`, `diff`, `diffBytes`,
  `diffTruncated`, `diffError`). The spec, validation, comments, checks and PR
  details saved at Submit stay. The snapshot gets a top-level `recapturedAt`.
  A task whose PR can't be read, is no longer merged, has another merge commit
  than the saved one, or whose new diff fails to load is an error and keeps its
  saved diff; the submission's other tasks still go ahead. When the merge base
  can't be read, the task is re-captured on the old range (`diffEnd`
  `merge_commit`) and the table says so.
- The snapshot as it was is kept, whole, in
  `cse_assignment_submissions.snapshot_before_recapture`, written once (the
  first apply) and never overwritten. The write is guarded: the row must not be
  superseded and must still hold the snapshot that was read. Needs migration
  `20261120000000_cse115a_snapshot_before_recapture.sql`; the tool refuses to
  write without it.
- Benchmark rows: a candidate row (or none) is replaced. A validated or
  rejected row is kept untouched when the new `patch` and `test_patch` are
  byte-for-byte the stored ones (its source gains `recaptured_same_patch`);
  otherwise it is replaced and goes back to candidate. When a row's
  `base_commit` changes and `CSE115A_REPO_COPIES=on`, the submission's
  `repo_copy` job is set back to queued, so a copy is made under the new base's
  name; the old copy is kept.
- Apply order, stopping at the first failure: the column check; the backup,
  under the guard (also the guard check before any other write); the
  benchmark rows (source rows of instances already stored, then task rows,
  then source rows of new instances, so a validated or rejected source is
  sent back to candidate before its row is replaced); the new snapshot, under
  the guard, last; the `repo_copy` job. Until the snapshot is written the
  submission still holds its old-rule tasks and stays in the list, so after a
  failure staff run the tool again and it redoes the submission: rows already
  written are seen as candidate rows with the new patch and written the same
  again, a kept row does not gain its flag twice, and the end state is the one
  a clean apply gives. A rerun that finds the row already on the new base
  still requeues the copy job, since the failed apply never got that far.
- Grades, grade status and grading jobs are not touched; nothing is regraded.
  Staff press Regrade themselves where the dry run suggests it.

Routes: `GET /api/cse115a/instructor/courses/<slug>/recapture` (the list and
counts) and `POST` the same with `{ submissionId, apply }` (`apply` defaults to
false, the dry run). Staff of that course only.

TAs can do everything except unlock and manage staff.

## Student grade view

While an assignment is submitted but not released, the dashboard shows
**Submitted → Grading → Awaiting instructor review → Grade released** and
polls `/api/cse115a/me` every 20 seconds. After release it shows each task's
score and the sprint score, and the task's Results tab shows points, the
grader's rationale, and instructor notes per criterion. `/me` returns only
released grades of the current attempt.
Preview states: `/cse115a/preview?state=draft|ready|submitted|grading|released`
and `/cse115a/preview/results?state=released`.

### Research consent

The wording and its version live only in `apps/dashboard/lib/cse115a/consent.ts`
(`CONSENT_TEXT`, `CONSENT_VERSION`, the two choices, `CONSENT_APPROVED`). The
approved wording went in on Nov 20 as version `2026-11-20`, replacing the
placeholder, so every student is asked again. Answers are saved with the version
shown; an answer to an older version counts as no answer everywhere (course page,
consent page, staff totals, export). If the wording changes, bump
`CONSENT_VERSION`. Export stays off while `CONSENT_APPROVED` is false.

The question is one component, `components/cse115a/ResearchConsentQuestion.tsx`,
used in two places, both saving through `PUT /api/cse115a/consent` and both
reading the answer from `GET /api/cse115a/me`, so an answer given in one place
shows in the other:

- **Course page.** The card appears once setup is done (joined, GitHub linked)
  until the student answers the current version; after that a "Research use:"
  line with **Change** stays below the assignments. A **Research consent** link
  in the student bar at the top of the course page is always there.
- **`/cse115a/consent`.** Its own address, so staff can email one link. Signed
  in and enrolled: per course, the question, the current answer ("You said yes
  on …", "You said no on …", "You have not answered yet."), the two choices, and
  after saving "Your answer is saved." Signed in but in no course: a line saying
  so with a link to the course page to join. Signed out: the UCSC Google button.
  The site sends no email; staff send the link.

**Return after sign-in.** Sign-in normally lands on `/cse115a/dashboard`. The
Google button on the consent page passes `returnTo="/cse115a/consent"`;
`signInReturnPath` (`lib/cse115a/signInReturn.ts`) returns that path only when
the value equals it exactly, and the dashboard for anything else. The result is
stored in the existing `repo_metrics_oauth_next` cookie, which `/auth/callback`
reads. This return takes no URL parameter, and the UCSC Google button only ever
stores one of those two constants.

**Staff totals.** `GET /api/cse115a/instructor/courses/<slug>/consent-totals`
(course staff) returns `{ enrolled, yes, no, notAnswered }` for the current
version: counts only, no ids, emails or names. The Benchmark page shows them as
one line. No page or route shows which student answered what.

## Before enabling student access

Verify the Google and GitHub OAuth round trips, review the privacy statement,
and run the migration against the intended Supabase project.
