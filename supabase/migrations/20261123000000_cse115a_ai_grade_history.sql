-- CSE 115A: keep every AI grade, and record when staff saved (#429).
--
-- Changes:
--   1. public.cse_task_ai_grades: one row per AI grade of a task, written by the grade job next to its
--      overwrite of cse_task_grades' AI columns, with the same graded_at. A Regrade adds a row; nothing
--      updates or deletes one (only the submission's cascade). Unique on (submission, slot, graded_at),
--      so writing the same grade twice keeps one row.
--   2. Backfill: one row per existing cse_task_grades row, from its current AI columns, so today's grades
--      are the first history entries. "on conflict do nothing": running it again adds only grades not
--      yet copied (for example ones saved by older code after this was applied) and changes no row.
--   3. cse_task_grades.instructor_saved_at (when staff last saved points) and
--      cse_task_grades.instructor_saw_graded_at (the graded_at of the AI grade on the task at that save).
--      Both nullable, no backfill: null on every staff save made before this, which means "not recorded".
--      "Use agent grade" sets both back to null.
--
-- Who can read the new table: row level security is on and there is no policy, as on cse_course_roles,
-- and the anon and authenticated roles get no privilege on it, so a signed-in student reading it through
-- the REST API gets a permission error (no grant) and would get no rows if granted (no policy). Staff
-- read it through API routes with the service role, which bypasses both.
-- The two new cse_task_grades columns are readable like the rest of that row: cse_task_grades has a
-- table-wide select grant to authenticated and the own-released-row policy, so a student can read the
-- two times on their own released grades through the REST API, as they can read updated_by today. No
-- student page or route selects them.
--
-- Rollout: safe to apply before the app change. Old code writes cse_task_grades by named columns and
-- never touches the new table or columns; the new columns are nullable with no default to fill. Grades
-- old code saves between this migration and the deploy have no history row; run the backfill insert
-- below again after the deploy to add them.
--
-- Undo (revert the app change first: new code writes the table and the columns):
--   drop table if exists public.cse_task_ai_grades;
--   alter table public.cse_task_grades drop column if exists instructor_saved_at, drop column if exists instructor_saw_graded_at;
--   notify pgrst, 'reload schema';

create table if not exists public.cse_task_ai_grades (
  id uuid primary key default gen_random_uuid(),
  assignment_submission_id uuid not null references public.cse_assignment_submissions(id) on delete cascade,
  task_slot integer not null check (task_slot between 1 and 6),
  rubric jsonb not null,
  agent_total numeric(5, 2) not null,
  needs_review boolean not null default false,
  model text not null,
  prompt_version text not null,
  graded_at timestamptz not null,
  unique (assignment_submission_id, task_slot, graded_at)
);

alter table public.cse_task_ai_grades enable row level security;
-- No client policies: staff read it in API routes with the service role.
revoke all on public.cse_task_ai_grades from anon, authenticated;

insert into public.cse_task_ai_grades
  (assignment_submission_id, task_slot, rubric, agent_total, needs_review, model, prompt_version, graded_at)
select assignment_submission_id, task_slot, rubric, agent_total, needs_review, model, prompt_version, graded_at
from public.cse_task_grades
on conflict (assignment_submission_id, task_slot, graded_at) do nothing;

alter table public.cse_task_grades
  add column if not exists instructor_saved_at timestamptz,
  add column if not exists instructor_saw_graded_at timestamptz;

notify pgrst, 'reload schema';
