-- Per-user AI usage CSV table.
-- The old ai_usage_csv column on analyses is keyed only by result_id, which is
-- owner-repo-commit. Two users analysing the same repo at the same commit share
-- that row, so one user's CSV upload was visible to the other. This table keys
-- by (result_id, user_id) so every user's upload is isolated.

create table if not exists public.ai_usage_csvs (
  result_id   text        not null references public.analyses (result_id) on delete cascade,
  user_id     uuid        not null references auth.users (id)             on delete cascade,
  csv_text    text        not null,
  uploaded_at timestamptz not null default now(),
  primary key (result_id, user_id)
);

create index if not exists ai_usage_csvs_result_id_idx on public.ai_usage_csvs (result_id);

alter table public.ai_usage_csvs enable row level security;

-- Each user can only read and write their own rows.
create policy "ai_usage_csvs_own"
  on public.ai_usage_csvs
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.ai_usage_csvs to authenticated;
