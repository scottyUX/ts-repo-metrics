-- Repair analyses.version after NULL-poisoned max lookups left duplicate 1s.
-- Reassigns version chronologically within (user_id, repo_url) for ALL rows.
--
-- Preflight (run in SQL Editor before applying on hosted DB):
--   select count(*) from public.analyses where analyzed_at is null;  -- expect 0
--   select result_id, commit_sha, version as version_before, analyzed_at,
--     row_number() over (
--       partition by user_id, repo_url
--       order by analyzed_at asc nulls last, result_id asc
--     ) as version_after
--   from public.analyses
--   where repo_url ilike '%repometricstest%'
--   order by user_id, analyzed_at;

with ranked as (
  select
    result_id,
    row_number() over (
      partition by user_id, repo_url
      order by analyzed_at asc nulls last, result_id asc
    ) as rn
  from public.analyses
)
update public.analyses a
set version = ranked.rn
from ranked
where a.result_id = ranked.result_id;
