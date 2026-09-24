-- CSE 115A: agent grades per task and a job claim function for the worker.

create table if not exists public.cse_task_grades (
  id uuid primary key default gen_random_uuid(),
  assignment_submission_id uuid not null references public.cse_assignment_submissions(id) on delete cascade,
  task_slot integer not null check (task_slot in (1, 2)),
  rubric jsonb not null,
  agent_total numeric(5, 2) not null,
  needs_review boolean not null default false,
  model text not null,
  prompt_version text not null,
  graded_at timestamptz not null default now(),
  instructor_rubric jsonb,
  instructor_total numeric(5, 2),
  instructor_notes text,
  updated_by uuid references auth.users(id),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  unique (assignment_submission_id, task_slot)
);

alter table public.cse_task_grades enable row level security;

-- Students read their own grades only after an instructor releases them.
create policy cse_task_grades_own_released_select on public.cse_task_grades
  for select to authenticated using (
    released_at is not null and exists (
      select 1 from public.cse_assignment_submissions s
      where s.id = assignment_submission_id and s.user_id = auth.uid()
    )
  );
grant select on public.cse_task_grades to authenticated;

-- Claims the next runnable job of the given kinds. A job left running for
-- more than 10 minutes (a crashed worker) can be claimed again.
create or replace function public.claim_cse_grading_job(p_kinds text[])
returns setof public.cse_grading_jobs
language sql
as $$
  update public.cse_grading_jobs j
  set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
  where j.id = (
    select c.id from public.cse_grading_jobs c
    where c.kind = any(p_kinds)
      and ((c.status = 'queued' and c.run_after <= now())
        or (c.status = 'running' and c.locked_at < now() - interval '10 minutes'))
    order by c.run_after
    limit 1
    for update skip locked
  )
  returning j.*;
$$;

revoke all on function public.claim_cse_grading_job(text[]) from public, anon, authenticated;
grant execute on function public.claim_cse_grading_job(text[]) to service_role;
