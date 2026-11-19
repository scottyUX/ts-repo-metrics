// The "Get the code" section of a task on the staff review page: the commands to clone the
// student's repository from GitHub, the commands to open the stored repo copy (#298) once a staff
// member has downloaded it, and the validator's run recipe when the task has one. Pure text, shared by
// the page and its tests; the server side (which copy a task has, the signed download link) is
// repoCopyAccess.ts. Staff only: nothing here is used by a student page or the student API.

/** Which stored copy a task has. `complete`: the website's `.full` copy, with the PR's own commits. */
export type RepoCopyInfo = { stored: boolean; object: string | null; complete: boolean };

/** The parts of a task's run recipe (cse_benchmark_tasks.harbor_env) the page shows. */
export type RunRecipe = {
  image: string;
  /** Where the tests run, relative to the checkout ("" is the root). */
  packageDir: string;
  installSteps: Array<{ cwd: string; command: string }>;
  testCommands: string[];
};

/** One task slot's entry in the submission detail response. */
export type TaskCode = { slot: number; instanceId: string | null; repoCopy: RepoCopyInfo; runRecipe: RunRecipe | null };

export const NO_COPY: RepoCopyInfo = { stored: false, object: null, complete: false };

export const GET_CODE_TITLE = "Get the code";
export const FROM_GITHUB_TITLE = "From GitHub";
export const GITHUB_NOTE = "Works when the repository is public or your GitHub account can read it.";
export const FROM_COPY_TITLE = "From the stored copy";
export const DOWNLOAD_LABEL = "Download repo copy";
export const COMPLETE_COPY_NOTE = "hecate-snapshot is where the task started; refs/hecate/pr-head is the PR's last commit; refs/hecate/merge is the merge commit.";
export const OLDER_COPY_NOTE = "This older copy holds the repository only up to where the task started.";
export const NO_COPY_NOTE = "No repo copy is stored for this task yet.";
export const RUN_RECIPE_TITLE = "How to run its tests";
export const RUN_RECIPE_LABEL = "From the validator's run of this task";
export const STUDENT_CODE_WARNING = "This is student code. Run it in a container or a throwaway VM, not directly on your machine.";
export const NO_COPY_ERROR = "No repo copy is stored for this task.";

/** The download route for one task slot of a submission. */
export function repoCopyDownloadPath(submissionId: string, slot: number): string {
  return `/api/cse115a/instructor/submissions/${encodeURIComponent(submissionId)}/repo-copy?slot=${slot}`;
}

/** The file name the download is saved under. */
export function repoCopyFileName(instanceId: string): string {
  return `${instanceId}.bundle`;
}

/** Clone from GitHub and check out the merge commit (left out when the snapshot has none). */
export function githubCommands(repoFullName: string, mergeCommit: string | null | undefined): string {
  const name = repoFullName.split("/").pop() ?? repoFullName;
  const lines = [`git clone https://github.com/${repoFullName}.git`, `cd ${name}`];
  if (mergeCommit) lines.push(`git checkout --detach ${mergeCommit}`);
  return lines.join("\n");
}

/**
 * Open a downloaded copy. A complete copy also fetches the PR's refs (refs/hecate/*; a ref the copy
 * lacks is simply not fetched) and checks out the merge commit; an older copy has only the base.
 */
export function storedCopyCommands(instanceId: string, complete: boolean): string {
  const file = `~/Downloads/${repoCopyFileName(instanceId)}`;
  const lines = [`git clone -b hecate-snapshot ${file} ${instanceId}`, `cd ${instanceId}`];
  if (complete) lines.push(`git fetch ${file} 'refs/hecate/*:refs/hecate/*'`, "git checkout --detach refs/hecate/merge");
  return lines.join("\n");
}

type StoredRecipe = {
  image?: unknown; package_dir?: unknown;
  install_steps?: Array<{ cwd?: unknown; command?: unknown }>;
  test_steps?: Array<{ command?: unknown }>;
};

/** The run recipe from a stored harbor_env, or null when there is none (or it has no image). */
export function runRecipeFrom(harborEnv: unknown): RunRecipe | null {
  if (!harborEnv || typeof harborEnv !== "object") return null;
  const env = harborEnv as StoredRecipe;
  if (typeof env.image !== "string" || !env.image) return null;
  return {
    image: env.image,
    packageDir: typeof env.package_dir === "string" ? env.package_dir : "",
    installSteps: (Array.isArray(env.install_steps) ? env.install_steps : [])
      .filter((step) => typeof step?.command === "string")
      .map((step) => ({ cwd: typeof step.cwd === "string" ? step.cwd : "", command: step.command as string })),
    testCommands: (Array.isArray(env.test_steps) ? env.test_steps : [])
      .map((step) => step?.command).filter((command): command is string => typeof command === "string"),
  };
}

/** The recipe as read-only text: the image, each install step (with its folder), the test commands. */
export function runRecipeText(recipe: RunRecipe): string {
  const where = (dir: string) => (dir ? ` (in ${dir})` : " (in the repository root)");
  return [
    `Image: ${recipe.image}`,
    "Install:",
    ...(recipe.installSteps.length ? recipe.installSteps.map((step) => `  ${step.command}${where(step.cwd)}`) : ["  (none)"]),
    `Tests${where(recipe.packageDir)}:`,
    ...(recipe.testCommands.length ? recipe.testCommands.map((command) => `  ${command}`) : ["  (none)"]),
  ].join("\n");
}
