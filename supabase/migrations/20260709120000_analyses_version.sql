-- Per-user+repo analysis version (append on commit change).
-- Existing rows are numbered chronologically within (user_id, repo_url).

alter table public.analyses
  add column if not exists version integer;

comment on column public.analyses.version is
  'Monotonic version for this user_id + repo_url; bumps when commit_sha changes.';

-- Backfill: oldest analysis for each user+repo is version 1.
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
