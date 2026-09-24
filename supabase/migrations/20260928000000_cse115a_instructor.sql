-- CSE 115A: instructor and TA roles, grade release, and regrade.

-- Staff are matched by their signed-in UCSC email, so they can be added before
-- their first sign-in.
create table if not exists public.cse_course_roles (
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('instructor', 'ta')),
  created_at timestamptz not null default now(),
  primary key (course_id, email)
);

alter table public.cse_course_roles enable row level security;
-- No client policies: staff checks run in API routes with the service role.

-- Releases both task grades of an active, graded submission in one transaction.
create or replace function public.release_cse_assignment_submission(p_submission_id uuid, p_released_by uuid)
returns void
language plpgsql
as $$
declare
  grade_count integer;
begin
  update public.cse_assignment_submissions
  set status = 'released'
  where id = p_submission_id and superseded_at is null and status in ('graded', 'released');
  if not found then
    raise exception 'not_releasable' using errcode = 'P0001';
  end if;
  select count(*) into grade_count from public.cse_task_grades where assignment_submission_id = p_submission_id;
  if grade_count <> 2 then
    raise exception 'grades_missing' using errcode = 'P0001';
  end if;
  update public.cse_task_grades
  set released_at = coalesce(released_at, now()), released_by = coalesce(released_by, p_released_by)
  where assignment_submission_id = p_submission_id;
end;
$$;

-- Queues the grade job again. Instructor edits are kept; the agent fields are
-- overwritten when the job finishes.
create or replace function public.requeue_cse_grading_job(p_submission_id uuid)
returns void
language plpgsql
as $$
begin
  perform 1 from public.cse_assignment_submissions
  where id = p_submission_id and superseded_at is null;
  if not found then
    raise exception 'not_active' using errcode = 'P0001';
  end if;
  update public.cse_grading_jobs
  set status = 'queued', attempts = 0, run_after = now(), locked_at = null, last_error = null, updated_at = now()
  where assignment_submission_id = p_submission_id and kind = 'grade' and status <> 'running';
  if not found then
    raise exception 'job_running' using errcode = 'P0001';
  end if;
  update public.cse_assignment_submissions
  set status = 'submitted'
  where id = p_submission_id and status <> 'released';
end;
$$;

revoke all on function public.release_cse_assignment_submission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.requeue_cse_grading_job(uuid) from public, anon, authenticated;
grant execute on function public.release_cse_assignment_submission(uuid, uuid) to service_role;
grant execute on function public.requeue_cse_grading_job(uuid) to service_role;
