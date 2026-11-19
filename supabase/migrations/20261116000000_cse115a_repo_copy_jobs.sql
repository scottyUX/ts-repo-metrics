-- #298: a job kind for the website's repo copies. A repo_copy job copies every benchmark task of its
-- submission into the private Storage bucket benchmark-snapshots, on its own poller line, so grading
-- never waits on a clone. Additive: the kind CHECK constraint is widened to allow 'repo_copy'; no
-- row, column, index or function changes. The site only inserts repo_copy jobs when
-- CSE115A_REPO_COPIES=on, so it runs as before on a database without this migration.
--
-- The constraint was created inline on the column (20260925000000_cse115a_final_submissions.sql), so
-- Postgres named it cse_grading_jobs_kind_check.
--
-- Undo (remove the repo_copy jobs first, or the narrower check fails):
--   delete from public.cse_grading_jobs where kind = 'repo_copy';
--   alter table public.cse_grading_jobs drop constraint if exists cse_grading_jobs_kind_check;
--   alter table public.cse_grading_jobs add constraint cse_grading_jobs_kind_check check (kind in ('grade', 'benchmark'));

alter table public.cse_grading_jobs drop constraint if exists cse_grading_jobs_kind_check;
alter table public.cse_grading_jobs
  add constraint cse_grading_jobs_kind_check check (kind in ('grade', 'benchmark', 'repo_copy'));
