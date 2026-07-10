-- Drop legacy unique constraint on (repo_url, commit_sha) alone.
-- Per-user result_id (SIP 2.3.4) requires multiple rows for the same repo snapshot
-- when different users analyze the same public repo at the same commit.
-- This constraint was not in repo migrations; it was added manually on hosted Supabase.

alter table public.analyses
  drop constraint if exists analyses_repo_commit_unique;
