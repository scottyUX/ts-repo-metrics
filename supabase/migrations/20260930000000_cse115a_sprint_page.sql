-- Sprint page: student Scrum confirmation, check facts, and display-only due dates.

alter table public.cse_task_submissions
  add column if not exists scrum_board boolean not null default false,
  add column if not exists facts_json jsonb not null default '{}'::jsonb;

create table if not exists public.cse_sprints (
  course_id uuid not null references public.cse_courses(id) on delete cascade,
  number integer not null check (number between 1 and 20),
  due_at timestamptz,
  primary key (course_id, number)
);

alter table public.cse_sprints enable row level security;

drop policy if exists cse_sprints_member_select on public.cse_sprints;
create policy cse_sprints_member_select on public.cse_sprints
  for select to authenticated using (
    exists (
      select 1 from public.cse_course_memberships m
      where m.course_id = cse_sprints.course_id and m.user_id = auth.uid()
    )
  );

grant select on public.cse_sprints to authenticated;
