-- CSE 115A: a merged PR that adds two of the student's own task files counts
-- as two tasks, one per slot, each with its own task file. So one student may
-- have the same PR in two rows, with different task files.
--
-- Replaces unique (course_id, user_id, pr_url) from
-- 20260924000000_cse115a_course_submissions.sql with
-- unique (course_id, user_id, pr_url, task_path).
-- unique (course_id, user_id, task_id) stays: two tasks still need two IDs.
--
-- That constraint was declared without a name, so Postgres named it
-- cse_task_submissions_course_id_user_id_pr_url_key. Confirm before applying:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.cse_task_submissions'::regclass and contype = 'u';
--
-- Rollout: apply this migration, then merge the app change. The app works
-- without it for PRs with one task file; until it is applied, a second task
-- from the same PR is refused by the database with a clear message.
--
-- Undo (fails if a student already has two rows for one PR; remove one first):
--   alter table public.cse_task_submissions
--     drop constraint if exists cse_task_submissions_course_user_pr_task_path_key;
--   alter table public.cse_task_submissions
--     add constraint cse_task_submissions_course_id_user_id_pr_url_key unique (course_id, user_id, pr_url);

alter table public.cse_task_submissions
  drop constraint if exists cse_task_submissions_course_id_user_id_pr_url_key;

alter table public.cse_task_submissions
  add constraint cse_task_submissions_course_user_pr_task_path_key unique (course_id, user_id, pr_url, task_path);
