-- CSE 115A: one final submission per assignment, a snapshot of both task PRs,
-- and a job queue for grading and benchmark capture.

-- Final submissions keep history: an instructor unlock sets superseded_at and
-- the student's next submit creates a new attempt.
alter table public.cse_assignment_submissions
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists attempt integer not null default 1 check (attempt >= 1),
  add column if not exists status text not null default 'submitted'
    check (status in ('submitted', 'grading', 'graded', 'released', 'grading_failed')),
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists superseded_at timestamptz,
  add column if not exists unlocked_by uuid references auth.users(id),
  add column if not exists unlock_reason text;

alter table public.cse_assignment_submissions drop constraint if exists cse_assignment_submissions_pkey;
alter table public.cse_assignment_submissions add primary key (id);

create unique index if not exists cse_assignment_submissions_active_idx
  on public.cse_assignment_submissions(course_id, user_id, assignment_number)
  where superseded_at is null;
create unique index if not exists cse_assignment_submissions_attempt_idx
  on public.cse_assignment_submissions(course_id, user_id, assignment_number, attempt);

-- Task rows cannot change while their assignment has an active final submission.
create or replace function public.cse_assignment_is_locked(p_course_id uuid, p_user_id uuid, p_assignment_number integer)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.cse_assignment_submissions s
    where s.course_id = p_course_id and s.user_id = p_user_id
      and s.assignment_number = p_assignment_number and s.superseded_at is null
  );
$$;

create or replace function public.cse_reject_locked_task_change()
returns trigger
language plpgsql
as $$
begin
  -- Cascading deletes (a removed course or account) run inside another trigger.
  if pg_trigger_depth() <= 1 and (
     (tg_op <> 'INSERT' and public.cse_assignment_is_locked(old.course_id, old.user_id, old.assignment_number))
     or (tg_op <> 'DELETE' and public.cse_assignment_is_locked(new.course_id, new.user_id, new.assignment_number))) then
    raise exception 'assignment_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists cse_task_submissions_locked on public.cse_task_submissions;
create trigger cse_task_submissions_locked
  before insert or update or delete on public.cse_task_submissions
  for each row execute function public.cse_reject_locked_task_change();

create table if not exists public.cse_grading_jobs (
  id uuid primary key default gen_random_uuid(),
  assignment_submission_id uuid not null references public.cse_assignment_submissions(id) on delete cascade,
  kind text not null check (kind in ('grade', 'benchmark')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_submission_id, kind)
);

create index if not exists cse_grading_jobs_queue_idx
  on public.cse_grading_jobs(status, run_after);

alter table public.cse_grading_jobs enable row level security;
-- No client policies: only the service role reads or writes jobs.

-- Records the final submission and queues its jobs in one transaction. The
-- snapshot must describe exactly the two task rows that exist now; if a task
-- changed after the snapshot was taken, nothing is written.
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
  new_id uuid;
begin
  perform 1 from public.cse_task_submissions t
    where t.course_id = p_course_id and t.user_id = p_user_id
      and t.assignment_number = p_assignment_number
    for update;

  select count(*) into matching
  from public.cse_task_submissions t
  join jsonb_array_elements(p_snapshot -> 'tasks') snap
    on (snap ->> 'slot')::integer = t.task_slot
   and snap ->> 'prUrl' = t.pr_url
   and snap ->> 'analysisResultId' = t.analysis_result_id
  where t.course_id = p_course_id and t.user_id = p_user_id
    and t.assignment_number = p_assignment_number;
  if matching <> 2 or jsonb_array_length(p_snapshot -> 'tasks') <> 2 then
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
