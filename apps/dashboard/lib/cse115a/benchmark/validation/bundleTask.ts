// Writes the Harbor task folder for one validated result, with the repository from the batch's
// snapshot bundle (the "bundle" source of harbor.ts). Used by scripts/exportHarbor.ts and by the
// batch's gold check (harborGold.ts). Needs git; no Docker, no database.

import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";
import { buildHarborTask, harborEnvFrom, harborSkipReason, harborTaskName, verifiedRow, type HarborEnv, type HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import { fileIn, run, withPatchedWorktree, workflowFiles } from "@/lib/cse115a/benchmark/validation/runRow";
import { SNAPSHOT_BRANCH } from "@/lib/cse115a/benchmark/validation/snapshots";
import { filesInPatch, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

/** Why a validated result has no bundle task. */
export const NO_BUNDLE_REASON = "no snapshot bundle (run the batch with --snapshots)";

export type BundleTask = { taskDir: string; name: string } | { skip: string };

/**
 * Writes `<to>/<harbor task name>/` for `result` (which must be validated) from `row` (the batch's row,
 * for problem_statement, hints and patches) and the bundle the result records under `batch`. The task
 * is built from the result's Harbor recipe; an older result without one has its environment detected
 * again from the bundle (base + both patches), as the validator did. Returns `{ skip }` with the
 * reason when the task cannot be built: no bundle, an unsupported environment, or harborSkipReason.
 * With `replace`, an existing folder at that path is removed first (the gold check); without it the
 * files are written over it, as the export script always did.
 */
export async function writeBundleTask(options: { row: HarborRow; result: ValidationResult; batch: string; to: string; replace?: boolean }): Promise<BundleTask> {
  const { row, result, batch, to } = options;
  if (!result.snapshot_bundle) return { skip: NO_BUNDLE_REASON };
  const bundle = join(batch, result.snapshot_bundle);

  let recipe: HarborEnv | null = result.harbor_env ?? null;
  if (!recipe) {
    const clone = await mkdtemp(join(tmpdir(), "hecate-harbor-"));
    try {
      await run("git", ["clone", "-q", "-b", SNAPSHOT_BRANCH, bundle, clone]);
      const testFiles = filesInPatch(row.test_patch);
      const env = await withPatchedWorktree(clone, row.base_commit, [row.test_patch, row.patch], (dir) =>
        workflowFiles(dir).then((names) => detectEnvironment({ testFiles, read: (path) => fileIn(dir, path), workflowFiles: names })));
      if (!env.supported) return { skip: `environment ${env.detail}` };
      recipe = harborEnvFrom(env, result.image_digest);
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  }
  const source = { kind: "bundle", file: "repo.bundle" } as const;
  const verified = verifiedRow(row, result);
  const skip = harborSkipReason(recipe, verified, source);
  if (skip) return { skip };

  const name = harborTaskName(row.instance_id);
  const taskDir = join(to, name);
  if (options.replace) await rm(taskDir, { recursive: true, force: true });
  const files = buildHarborTask({ row: verified, env: recipe, source, flakyCount: result.flaky.length, name });
  for (const [path, contents] of files) {
    const full = join(taskDir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents);
    if (path.endsWith(".sh")) await chmod(full, 0o755);
  }
  await copyFile(bundle, join(taskDir, "environment", "repo.bundle"));
  return { taskDir, name };
}
