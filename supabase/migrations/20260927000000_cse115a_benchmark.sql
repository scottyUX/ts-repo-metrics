-- CSE 115A: SWE-bench-shaped task capture and research consent.

-- Current research consent per student. Export reads the current value.
create table if not exists public.cse_research_consent (
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consented boolean not null,
  consent_version text not null,
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

alter table public.cse_research_consent enable row level security;
create policy cse_research_consent_own_select on public.cse_research_consent
  for select to authenticated using (user_id = auth.uid());
grant select on public.cse_research_consent to authenticated;

-- Exactly the SWE-bench instance fields plus repo_metrics. Provenance and
-- consent live in cse_benchmark_task_sources and cse_research_consent.
create table if not exists public.cse_benchmark_tasks (
  instance_id text primary key,
  repo text not null,
  base_commit text not null,
  environment_setup_commit text not null,
  created_at timestamptz,
  version text not null,
  problem_statement text not null,
  hints_text text not null default '',
  patch text not null,
  test_patch text not null,
  "FAIL_TO_PASS" jsonb not null default '[]'::jsonb,
  "PASS_TO_PASS" jsonb not null default '[]'::jsonb,
  eval_type text not null default 'pass_and_fail',
  image text,
  eval_script text,
  log_parser text,
  difficulty text,
  repo_metrics jsonb
);

create table if not exists public.cse_benchmark_task_sources (
  id uuid primary key default gen_random_uuid(),
  instance_id text not null references public.cse_benchmark_tasks(instance_id) on delete cascade,
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_submission_id uuid not null references public.cse_assignment_submissions(id) on delete cascade,
  task_slot integer not null check (task_slot in (1, 2)),
  validation_status text not null default 'candidate' check (validation_status in ('candidate', 'validated', 'rejected')),
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_submission_id, task_slot)
);

create index if not exists cse_benchmark_task_sources_course_idx
  on public.cse_benchmark_task_sources(course_id, instance_id);

-- No client policies: only the service role reads or writes benchmark rows.
alter table public.cse_benchmark_tasks enable row level security;
alter table public.cse_benchmark_task_sources enable row level security;
