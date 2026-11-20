-- CSE 115A: a student may submit up to 6 tasks in a sprint (#412). Every
-- submitted task is graded on its own, as before, and the sprint score is the
-- average of all of them (the app computes it; nothing here scores).
--
-- Changes:
--   1. Each task_slot check goes from in (1, 2) to between 1 and 6, on
--        public.cse_task_submissions        cse_task_submissions_task_slot_check
--        public.cse_task_grades             cse_task_grades_task_slot_check
--        public.cse_benchmark_task_sources  cse_benchmark_task_sources_task_slot_check
--      Each check was declared inline on its column without a name
--      (20260924000000, 20260926000000, 20260927000000), so Postgres named it
--      <table>_task_slot_check. The drops below have no "if exists": a wrong
--      name stops the migration instead of leaving the old check in place.
--      Confirm before applying:
--        select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--        where contype = 'c' and conrelid in ('public.cse_task_submissions'::regclass,
--          'public.cse_task_grades'::regclass, 'public.cse_benchmark_task_sources'::regclass)
--          and pg_get_constraintdef(oid) like '%task_slot%';
--   2. submit_cse_assignment accepts 1 to 6 tasks. Only that line changes;
--      the body is otherwise the one from 20261117000000_cse115a_one_task_submit.sql.
--      Same signature and grants.
--
-- Not changed, checked: release_cse_assignment_submission already compares the
-- grade count with the snapshot's task count (1 to 6 alike);
-- cse_assignment_is_locked and the cse_task_submissions_locked trigger lock all
-- of a sprint's rows whatever their slot; claim_cse_grading_job and
-- requeue_cse_grading_job work per job, not per slot; the select policies match
-- on user and release, not on slot. No view mentions a slot.
--
-- Rollout: safe to apply before the app change. Old code only ever writes
-- slots 1 and 2 and submits one or two tasks, and both are still accepted.
--
-- Undo (fails if any row in the three tables has a slot above 2; remove those
-- rows first, and unlock a submitted sprint before removing its task rows):
--   alter table public.cse_task_submissions drop constraint cse_task_submissions_task_slot_check;
--   alter table public.cse_task_submissions add constraint cse_task_submissions_task_slot_check check (task_slot in (1, 2));
--   alter table public.cse_task_grades drop constraint cse_task_grades_task_slot_check;
--   alter table public.cse_task_grades add constraint cse_task_grades_task_slot_check check (task_slot in (1, 2));
--   alter table public.cse_benchmark_task_sources drop constraint cse_benchmark_task_sources_task_slot_check;
--   alter table public.cse_benchmark_task_sources add constraint cse_benchmark_task_sources_task_slot_check check (task_slot in (1, 2));
-- and run the create or replace function public.submit_cse_assignment(...)
-- statement from 20261117000000_cse115a_one_task_submit.sql again (its lines
-- 12 to 75), then its revoke and grant for submit_cse_assignment (lines 104 and 105).

alter table public.cse_task_submissions drop constraint cse_task_submissions_task_slot_check;
alter table public.cse_task_submissions
  add constraint cse_task_submissions_task_slot_check check (task_slot between 1 and 6);

alter table public.cse_task_grades drop constraint cse_task_grades_task_slot_check;
alter table public.cse_task_grades
  add constraint cse_task_grades_task_slot_check check (task_slot between 1 and 6);

alter table public.cse_benchmark_task_sources drop constraint cse_benchmark_task_sources_task_slot_check;
alter table public.cse_benchmark_task_sources
  add constraint cse_benchmark_task_sources_task_slot_check check (task_slot between 1 and 6);

-- Records the final submission and queues its jobs in one transaction. The
-- snapshot must describe exactly the 1 to 6 task rows that exist now; if a
-- task changed or was added after the snapshot was taken, nothing is written.
create or replace function public.submit_cse_assignment(
  p_course_id uuid,
  p_user_id uuid,
  p_assignment_number integer,
  p_snapshot jsonb
)
returns table (id uuid, course_id uuid, assignment_number integer, attempt integer, status text, submitted_at timestamptz)
language plpgsql
as $$
#variable_conflict use_column
declare
  next_attempt integer;
  matching integer;
  stored integer;
  n integer;
  new_id uuid;
begin
  perform 1 from public.cse_task_submissions t
    where t.course_id = p_course_id and t.user_id = p_user_id
      and t.assignment_number = p_assignment_number
    for update;

  n := coalesce(jsonb_array_length(p_snapshot -> 'tasks'), 0);

  select count(*) into matching
  from public.cse_task_submissions t
  join jsonb_array_elements(p_snapshot -> 'tasks') snap
    on (snap ->> 'slot')::integer = t.task_slot
   and snap ->> 'prUrl' = t.pr_url
   and snap ->> 'analysisResultId' = t.analysis_result_id
  where t.course_id = p_course_id and t.user_id = p_user_id
    and t.assignment_number = p_assignment_number;

  select count(*) into stored
  from public.cse_task_submissions t
  where t.course_id = p_course_id and t.user_id = p_user_id
    and t.assignment_number = p_assignment_number;

  if n not between 1 and 6 or matching <> n or stored <> n then
    raise exception 'tasks_changed' using errcode = 'P0001';
  end if;

  select coalesce(max(s.attempt), 0) + 1 into next_attempt
  from public.cse_assignment_submissions s
  where s.course_id = p_course_id and s.user_id = p_user_id
    and s.assignment_number = p_assignment_number;

  begin
    insert into public.cse_assignment_submissions
      (course_id, user_id, assignment_number, attempt, status, snapshot, submitted_at)
    values (p_course_id, p_user_id, p_assignment_number, next_attempt, 'submitted', p_snapshot, now())
    returning cse_assignment_submissions.id into new_id;
  exception when unique_violation then
    raise exception 'already_submitted' using errcode = 'P0001';
  end;

  insert into public.cse_grading_jobs (assignment_submission_id, kind)
  values (new_id, 'grade'), (new_id, 'benchmark');

  return query
    select s.id, s.course_id, s.assignment_number, s.attempt, s.status, s.submitted_at
    from public.cse_assignment_submissions s where s.id = new_id;
end;
$$;

revoke all on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) to service_role;
