-- Canonicalize analyses.repo_url so .git / bare URLs share one version sequence.
-- Then renumber version chronologically within (user_id, repo_url).

-- Strip trailing slashes, then trailing .git; drop www. on github.com host.
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
