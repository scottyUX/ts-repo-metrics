-- Run in Supabase → SQL Editor (whole file), then retry Analyze.
-- Fixes: PGRST204 "Could not find the 'user_id' column of 'analyses' in the schema cache"

-- Baseline table (no-op if already present)
create table if not exists public.analyses (
  result_id text primary key,
  repo_url text not null,
  commit_sha text,
  report_json jsonb not null,
  analyzed_at timestamptz not null default now()
);

create index if not exists analyses_analyzed_at_idx on public.analyses (analyzed_at desc);

-- GitHub OAuth token storage
create table if not exists public.user_github_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  encrypted_access_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_github_tokens enable row level security;

alter table public.analyses
  add column if not exists user_id uuid references auth.users (id);

create index if not exists analyses_user_id_idx on public.analyses (user_id);

alter table public.analyses enable row level security;

drop policy if exists "analyses_select_public_or_own" on public.analyses;
create policy "analyses_select_public_or_own"
  on public.analyses
  for select
  to anon, authenticated
  using (user_id is null or auth.uid() = user_id);

grant select on public.analyses to anon, authenticated;

-- Course / research tagging (nullable; aligns with migrations/20260522000000_analyses_course_metadata.sql)
alter table public.analyses
  add column if not exists course_id    text,
  add column if not exists team_name    text,
  add column if not exists github_login text;

create index if not exists analyses_course_id_idx
  on public.analyses (course_id)
  where course_id is not null;

-- Doc review agent output (nullable; aligns with migrations/20260522010000_analyses_doc_review.sql)
alter table public.analyses
  add column if not exists doc_review_json jsonb;

comment on column public.analyses.doc_review_json is
  'Documentation review agent output (classifications, reviews, consistency). Nullable.';

-- Per-user analyses (SIP 2.3.4): allow multiple users on same repo+commit.
alter table public.analyses
  drop constraint if exists analyses_repo_commit_unique;

-- Per-user+repo analysis version (append on commit change).
alter table public.analyses
  add column if not exists version integer;

comment on column public.analyses.version is
  'Monotonic version for this user_id + repo_url; bumps when commit_sha changes.';

with ranked as (
  select
    result_id,
    row_number() over (
      partition by user_id, repo_url
      order by analyzed_at asc nulls last, result_id asc
    ) as rn
  from public.analyses
  where version is null
)
update public.analyses a
set version = ranked.rn
from ranked
where a.result_id = ranked.result_id
  and a.version is null;

create index if not exists analyses_user_repo_version_idx
  on public.analyses (user_id, repo_url, version desc);

-- Repair: renumber all versions chronologically (fixes NULL / duplicate-1 rows).
-- Preflight: select count(*) from public.analyses where analyzed_at is null;
with ranked_all as (
  select
    result_id,
    row_number() over (
      partition by user_id, repo_url
      order by analyzed_at asc nulls last, result_id asc
    ) as rn
  from public.analyses
)
update public.analyses a
set version = ranked_all.rn
from ranked_all
where a.result_id = ranked_all.result_id;

-- Canonicalize repo_url (.git vs bare) then renumber versions again.
update public.analyses
set repo_url = regexp_replace(
  regexp_replace(
    regexp_replace(repo_url, '/+$', ''),
    '\.git$',
    '',
    'i'
  ),
  '^(https?://)www\.(github\.com)',
  '\1\2',
  'i'
)
where repo_url ~* '\.git/?$'
   or repo_url ~ '/$'
   or repo_url ~* '://www\.github\.com';

with ranked_canonical as (
  select
    result_id,
    row_number() over (
      partition by user_id, repo_url
      order by analyzed_at asc nulls last, result_id asc
    ) as rn
  from public.analyses
)
update public.analyses a
set version = ranked_canonical.rn
from ranked_canonical
where a.result_id = ranked_canonical.result_id;
