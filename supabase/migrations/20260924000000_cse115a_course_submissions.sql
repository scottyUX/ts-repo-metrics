-- CSE 115A enrollment and sprint task submissions. Codes and submissions are
-- written by server routes with the service role; students can read only their own records.
create table if not exists public.cse_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  term text not null,
  assignment_count integer not null default 5 check (assignment_count between 1 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cse_course_codes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cse_course_memberships (
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ucsc_email text not null,
  joined_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.cse_task_submissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_number integer not null check (assignment_number between 1 and 20),
  task_slot integer not null check (task_slot in (1, 2)),
  task_id text not null,
  pr_url text not null,
  repo_full_name text not null,
  pr_number integer not null,
  task_path text not null,
  task_spec_markdown text not null,
  task_spec_json jsonb not null,
  validation_json jsonb not null default '{}'::jsonb,
  analysis_result_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id, assignment_number, task_slot),
  unique (course_id, user_id, task_id),
  unique (course_id, user_id, pr_url)
);

create index if not exists cse_task_submissions_user_course_idx
  on public.cse_task_submissions(user_id, course_id, assignment_number);

create table if not exists public.cse_assignment_submissions (
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_number integer not null check (assignment_number between 1 and 20),
  submitted_at timestamptz not null default now(),
  primary key (course_id, user_id, assignment_number)
);

alter table public.cse_courses enable row level security;
alter table public.cse_course_codes enable row level security;
alter table public.cse_course_memberships enable row level security;
alter table public.cse_task_submissions enable row level security;
alter table public.cse_assignment_submissions enable row level security;

create policy cse_courses_member_select on public.cse_courses
  for select to authenticated using (
    exists (select 1 from public.cse_course_memberships m
      where m.course_id = id and m.user_id = auth.uid())
  );
create policy cse_memberships_own_select on public.cse_course_memberships
  for select to authenticated using (user_id = auth.uid());
create policy cse_submissions_own_select on public.cse_task_submissions
  for select to authenticated using (user_id = auth.uid());
create policy cse_assignment_submissions_own_select on public.cse_assignment_submissions
  for select to authenticated using (user_id = auth.uid());

grant select on public.cse_courses, public.cse_course_memberships,
  public.cse_task_submissions, public.cse_assignment_submissions to authenticated;
-- No client grants or policies for join codes and no client write policies.

insert into public.cse_courses (slug, title, term, assignment_count)
values ('CSE115A-Fall26', 'CSE 115A', 'Fall 2026', 5)
on conflict (slug) do nothing;
