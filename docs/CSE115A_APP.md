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

- Apply `supabase/migrations/20260924000000_cse115a_course_submissions.sql`.
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

## Before enabling student access

Verify the Google and GitHub OAuth round trips, review the privacy statement,
and run the migration against the intended Supabase project.
