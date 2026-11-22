-- The submission snapshot as it was before the staff re-capture of diffs saved before the PR-own-diff
-- rule (#382, #418), kept whole. Written once, by the first re-capture apply, only where it is null;
-- later applies leave it. Null on every submission never re-captured. Staff tool only; nothing reads it
-- to grade, and grades, grade status and grading jobs are not touched by a re-capture.
-- Readable like the rest of the row: cse_assignment_submissions has a table-wide select grant to
-- authenticated and the own-row policy cse_assignment_submissions_own_select, so a signed-in student can
-- read this column on their own submissions through the REST API, as they can read `snapshot` today.
-- Undo: alter table public.cse_assignment_submissions drop column if exists snapshot_before_recapture; notify pgrst, 'reload schema';
alter table public.cse_assignment_submissions add column if not exists snapshot_before_recapture jsonb;

notify pgrst, 'reload schema';
