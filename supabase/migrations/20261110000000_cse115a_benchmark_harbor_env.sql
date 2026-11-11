-- The Harbor recipe of a validated benchmark row (image with digest, runners, package dir, install
-- and test steps, container env, services, node source), written by the validator's write-back and
-- read by the instructor Harbor export. Null until a validated result with a recipe is written back;
-- re-capturing a changed PR sets it back to null.
alter table public.cse_benchmark_tasks add column if not exists harbor_env jsonb;

notify pgrst, 'reload schema';
