-- Keep every uploaded AI usage CSV instead of overwriting it.
-- Before this migration, (result_id, user_id) was the primary key, so
-- re-uploading a CSV for the same analysis silently replaced the previous
-- one. This adds a `version` column (auto-incrementing per result_id+user_id)
-- so the API can INSERT a new row per upload; reads take the highest version
-- as "current".

create table if not exists public.ai_usage_csvs (
  result_id   text        not null references public.analyses (result_id) on delete cascade,
  user_id     uuid        not null references auth.users (id)             on delete cascade,
  csv_text    text        not null,
  uploaded_at timestamptz not null default now()
);

alter table public.ai_usage_csvs
  add column if not exists version integer;

update public.ai_usage_csvs set version = 1 where version is null;

alter table public.ai_usage_csvs
  alter column version set not null;

alter table public.ai_usage_csvs
  drop constraint if exists ai_usage_csvs_pkey;

alter table public.ai_usage_csvs
  add constraint ai_usage_csvs_pkey primary key (result_id, user_id, version);

create index if not exists ai_usage_csvs_result_id_idx on public.ai_usage_csvs (result_id);

create index if not exists ai_usage_csvs_latest_idx
  on public.ai_usage_csvs (result_id, user_id, version desc);

alter table public.ai_usage_csvs enable row level security;

drop policy if exists "ai_usage_csvs_own" on public.ai_usage_csvs;
create policy "ai_usage_csvs_own"
  on public.ai_usage_csvs
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Assign the next version automatically so the API only ever INSERTs
-- (result_id, user_id, csv_text) and never has to compute or race on version.
create or replace function public.ai_usage_csvs_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    perform pg_advisory_xact_lock(
      hashtextextended(new.result_id || ':' || new.user_id::text, 0)
    );
    select coalesce(max(version), 0) + 1
      into new.version
      from public.ai_usage_csvs
      where result_id = new.result_id
        and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_usage_csvs_set_version_trigger on public.ai_usage_csvs;
create trigger ai_usage_csvs_set_version_trigger
  before insert on public.ai_usage_csvs
  for each row execute function public.ai_usage_csvs_set_version();

-- Uploads are now inserts, not updates; tighten the grant accordingly.
revoke update on public.ai_usage_csvs from authenticated;
grant select, insert on public.ai_usage_csvs to authenticated;
