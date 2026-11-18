-- CSE 115A: a sprint can be submitted with one task or two (#348). A missing
-- task scores 0; no grade row is written for it.
--
-- Same signatures and grants as before. A two-task submission behaves exactly
-- as it did. To undo, run the old bodies again: submit_cse_assignment from
-- 20260925000000_cse115a_final_submissions.sql and
-- release_cse_assignment_submission from 20260928000000_cse115a_instructor.sql.

-- Records the final submission and queues its jobs in one transaction. The
-- snapshot must describe exactly the one or two task rows that exist now; if a
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

  if n not in (1, 2) or matching <> n or stored <> n then
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

-- Releases only when every task in the submission's snapshot has a grade. A
-- snapshot without a task list (none exist) counts as two tasks, as before.
create or replace function public.release_cse_assignment_submission(p_submission_id uuid, p_released_by uuid)
returns void
language plpgsql
as $$
declare
  grade_count integer;
  task_count integer;
begin
  update public.cse_assignment_submissions
  set status = 'released'
  where id = p_submission_id and superseded_at is null and status in ('graded', 'released')
  returning coalesce(jsonb_array_length(snapshot -> 'tasks'), 2) into task_count;
  if not found then
    raise exception 'not_releasable' using errcode = 'P0001';
  end if;
  select count(*) into grade_count from public.cse_task_grades where assignment_submission_id = p_submission_id;
  if grade_count <> task_count then
    raise exception 'grades_missing' using errcode = 'P0001';
  end if;
  update public.cse_task_grades
  set released_at = coalesce(released_at, now()), released_by = coalesce(released_by, p_released_by)
  where assignment_submission_id = p_submission_id;
end;
$$;

revoke all on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) to service_role;
revoke all on function public.release_cse_assignment_submission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_cse_assignment_submission(uuid, uuid) to service_role;
