-- What a validated benchmark row's result says beyond its test lists: the coverage run
-- (fix_coverage), the changed code files the proving tests never run (untested_files and how that
-- list was made), where the code came from (repo_source, snapshot_bundle), the counts of
-- ABSENT_TO_PASS, flaky and outside-the-test-patch proving tests, and the result's own time and
-- validator commit when it records them. Copied from the result file by the validator's
-- write-back, for validated rows only; null otherwise. Re-capturing a changed PR sets it back to
-- null with harbor_env. Internal: neither the JSONL nor the Harbor export carries it.
-- Undo: alter table public.cse_benchmark_tasks drop column if exists validation_detail; notify pgrst, 'reload schema';
alter table public.cse_benchmark_tasks add column if not exists validation_detail jsonb;

notify pgrst, 'reload schema';
