import "server-only";
import { splitPatch } from "@/lib/cse115a/diff";
import { estimateMeetsTaskMinimum, summarizeCi, type TaskFacts } from "@/lib/cse115a/processChecklist";
import { readCommitChecks } from "@/lib/cse115a/submissionSnapshot";
import { canonicalHeadings, checkTaskSpec, filenameMatchesId, isTaskFilePath, parsePullRequestUrl, taskIdProblem, type TaskSpec } from "@/lib/cse115a/taskSpec";
import { tagCommitSha, type GitHubReader } from "@/lib/cse115a/githubClient";
import { firstCommitHoldsOnlyTaskFiles } from "@/lib/cse115a/sharedPr";

type GitHubPull = {
  title: string;
  state?: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: { sha: string };
  head: { ref: string; sha?: string };
  user: { login: string } | null;
};

type GitHubFile = { filename: string; status?: string };
type GitHubContent = { encoding: string; content: string; size: number };

export type ImportedTask = {
  prUrl: string;
  repoFullName: string;
  prNumber: number;
  taskPath: string;
  markdown: string;
  spec: TaskSpec;
  validation: Record<string, boolean>;
  facts: TaskFacts;
};

/** The PR's files, up to 3 pages of 100. */
async function pullRequestFiles(gh: GitHubReader, owner: string, repo: string, number: number): Promise<GitHubFile[]> {
  const all: GitHubFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const files = await gh.json<GitHubFile[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
    );
    all.push(...(files ?? []));
    if ((files?.length ?? 0) < 100) break;
  }
  return all;
}

/** One of the task files a merged PR adds, offered as a choice for a task slot. */
export type TaskFileChoice = { path: string; taskId: string };

/**
 * A merged PR adds several task files, and the request did not say which one this task is. The route turns it
 * into a `choose_task_file` answer with the choices; it is not a failed check.
 */
export class ChooseTaskFileError extends Error {
  readonly code = "choose_task_file";
  constructor(readonly choices: TaskFileChoice[], readonly repoFullName: string, readonly prNumber: number) {
    super(`This merged PR adds ${choices.length} task files. Choose which one is this task.`);
    this.name = "ChooseTaskFileError";
  }
}

export const SEVERAL_TASK_FILES_NOT_AUTHOR = "A PR with several task files can be added only by the student who opened it.";

const fileName = (path: string) => path.split("/").pop()!;

/**
 * The PR's own task file, or why there is none. Only a task file the PR adds can be its own; one it only
 * modifies or removes, such as a teammate's file changed by a merge, never is. A merged PR may add several:
 * then `several` lists them and the student chooses one per slot. Only when the PR adds no file named after a
 * task ID is a single other .md file it adds directly in the sprint folder taken, so its checks can say what is
 * wrong with it (#388). It never passes them: a name outside TASK_ID_PATTERN cannot fit a valid ID.
 */
function chooseTaskFile(files: GitHubFile[], sprint: number): { path: string } | { several: string[] } | { problem: string } {
  const added = files.filter((file) => file.status === "added" && isTaskFilePath(file.filename, sprint));
  if (added.length === 1) return { path: added[0]!.filename };
  if (added.length > 1) return { several: added.map((file) => file.filename) };
  const notFound = `No task file was found in docs/tasks/sprint-${sprint}/ in this PR.`;
  const folder = new RegExp(`^docs/tasks/sprint-${sprint}/[^/]+\\.md$`, "i");
  const others = files.filter((file) => file.status === "added" && folder.test(file.filename)
    && fileName(file.filename).toLowerCase() !== "readme.md");
  if (others.length === 1) return { path: others[0]!.filename };
  if (others.length === 0) {
    const changed = files.filter((file) => isTaskFilePath(file.filename, sprint)).map((file) => fileName(file.filename));
    if (changed.length === 0) return { problem: notFound };
    return { problem: `${notFound} It changes ${changed.join(", ")} but does not add ${changed.length === 1 ? "it" : "them"}; a PR's task file is one it adds.` };
  }
  const names = others.map((file) => fileName(file.filename)).join(", ");
  return {
    problem: `${notFound} It adds ${others.length} other .md files there (${names}); a task file is named after its task ID, for example US-${sprint}-T-1.md.`,
  };
}

/** Why an open PR with several task files can't be merged as it is. */
function severalTaskFilesProblem(paths: string[]): string {
  return `This PR adds ${paths.length} task files: ${paths.map(fileName).join(", ")}. A task PR adds only its own task file. Before merging, move each task file to its own PR. One PR per task.`;
}

/** The task file's text at a commit, with the standard section headings, or null when it cannot be read. */
async function readTaskFile(gh: GitHubReader, owner: string, repo: string, taskPath: string, ref: string): Promise<string | null> {
  const encodedPath = taskPath.split("/").map(encodeURIComponent).join("/");
  const content = await gh.json<GitHubContent>(
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
  );
  if (!content || content.encoding !== "base64" || content.size > 65536) return null;
  // Stored with the standard section headings, so records read the same whatever the student's spelling.
  return canonicalHeadings(Buffer.from(content.content.replace(/\s/g, ""), "base64").toString("utf8")).markdown;
}

/** Every task-file check on one file: its contents, its name against its ID, and its sprint. */
function taskFileProblems(markdown: string, taskPath: string, sprint: number): { spec: TaskSpec | null; problems: string[] } {
  const check = checkTaskSpec(markdown);
  const problems = [...check.problems];
  const filename = taskPath.split("/").pop()!;
  const filenameId = filename.replace(/\.md$/i, "");
  // Only a valid ID is compared with the name; an invalid one is already the problem to fix.
  if (check.id && taskIdProblem(check.id) === null && !filenameMatchesId(filenameId, check.id)) {
    problems.push(`The file is named “${filename}” but the id inside it is “${check.id}”. Name the file ${check.id}.md.`);
  }
  if (Number.isInteger(check.sprint) && check.sprint >= 1 && check.sprint !== sprint) {
    problems.push(`The task file sprint must be ${sprint}.`);
  }
  return { spec: problems.length === 0 ? check.spec : null, problems };
}

/**
 * Checks an open task PR's task file at its head commit, so the student can fix it before merging (#388).
 * Always throws: an open PR is never imported. Reads only the PR, its files and the task file.
 */
async function refuseOpenPullRequest(
  gh: GitHubReader, owner: string, repo: string, number: number, headSha: string | undefined, sprint: number,
): Promise<never> {
  const chosen = chooseTaskFile(await pullRequestFiles(gh, owner, repo, number), sprint);
  let problems: string[];
  if ("problem" in chosen) {
    problems = [chosen.problem];
  } else if ("several" in chosen) {
    problems = [severalTaskFilesProblem(chosen.several)];
  } else {
    let markdown: string | null = null;
    if (headSha) {
      try {
        markdown = await readTaskFile(gh, owner, repo, chosen.path, headSha);
      } catch {
        markdown = null;
      }
    }
    problems = markdown === null ? ["The task file could not be read from this pull request."] : taskFileProblems(markdown, chosen.path, sprint).problems;
    if (problems.length === 0) {
      throw new Error(`This pull request is not merged yet. Its task file (${fileName(chosen.path)}) passes the task-file checks. Merge the pull request, then add it here again.`);
    }
  }
  throw new Error(`This pull request is not merged yet. Before you merge, fix:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
}

/**
 * Imports a merged task PR. `githubLogin` is the submitting student's linked GitHub account. An open PR is
 * refused with the result of the task-file checks, so the file can still be fixed before the merge.
 * `taskPath` is the task file the student chose, for a merged PR that adds several; it must be one the PR adds.
 * Without it such a PR throws ChooseTaskFileError with the files to choose from.
 */
export async function importTaskFromPullRequest(
  prUrl: string,
  assignmentNumber: number,
  gh: GitHubReader,
  githubLogin: string,
  options: { taskPath?: string | null } = {},
): Promise<ImportedTask> {
  const parsed = parsePullRequestUrl(prUrl);
  if (!parsed) throw new Error("Enter a GitHub pull request URL, such as https://github.com/team/repo/pull/12.");
  const { owner, repo, number } = parsed;
  const pull = await gh.json<GitHubPull>(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) {
    if (pull?.state === "open") return refuseOpenPullRequest(gh, owner, repo, number, pull.head?.sha, assignmentNumber);
    throw new Error("This pull request must be merged before submission.");
  }

  const chosen = chooseTaskFile(await pullRequestFiles(gh, owner, repo, number), assignmentNumber);
  if ("problem" in chosen) throw new Error(chosen.problem);
  const prAuthoredByStudent = pull.user?.login.toLowerCase() === githubLogin.toLowerCase();
  // The task files this PR adds; with several, each can be one of the student's tasks (one PR, two tasks).
  const addedTaskPaths = "several" in chosen ? chosen.several : [chosen.path];
  const requested = options.taskPath?.trim() || null;
  if (requested && !addedTaskPaths.includes(requested)) {
    throw new Error(`This PR does not add ${fileName(requested)} in docs/tasks/sprint-${assignmentNumber}/. Choose a task file it adds: ${addedTaskPaths.map(fileName).join(", ")}.`);
  }
  if ("several" in chosen) {
    if (!prAuthoredByStudent) throw new Error(SEVERAL_TASK_FILES_NOT_AUTHOR);
    if (!requested) {
      throw new ChooseTaskFileError(
        chosen.several.map((path) => ({ path, taskId: fileName(path).replace(/\.md$/i, "") })), `${owner}/${repo}`, number,
      );
    }
  }
  const taskPath = "several" in chosen ? requested! : chosen.path;
  const markdown = await readTaskFile(gh, owner, repo, taskPath, pull.merge_commit_sha);
  if (markdown === null) throw new Error("The task file could not be imported from the merged PR.");
  const checked = taskFileProblems(markdown, taskPath, assignmentNumber);
  if (!checked.spec) throw new Error(checked.problems.join("\n"));
  const spec = checked.spec;

  const encodedFolder = `docs/tasks/sprint-${assignmentNumber}`.split("/").map(encodeURIComponent).join("/");
  const [baseSha, doneSha, commits, folder] = await Promise.all([
    tagCommitSha(gh, owner, repo, `${spec.id}-base`),
    tagCommitSha(gh, owner, repo, `${spec.id}-done`),
    gh.json<Array<{ sha: string }>>(`/repos/${owner}/${repo}/pulls/${number}/commits?per_page=1&page=1`),
    gh.json<Array<{ name: string; type: string }>>(
      `/repos/${owner}/${repo}/contents/${encodedFolder}?ref=${encodeURIComponent(pull.merge_commit_sha)}`,
      { optional: true },
    ),
  ]);
  const filename = fileName(taskPath);
  if (!Array.isArray(folder) || !folder.some((entry) => entry.type === "file" && entry.name === filename)) {
    throw new Error(`The task file is not in docs/tasks/sprint-${assignmentNumber}/ on the merge commit.`);
  }
  // Check the PR's first commit even when the base tag is missing or elsewhere,
  // so the checklist can tell a fixable tag from a spec that wasn't first (#266).
  const firstSha = commits?.[0]?.sha ?? null;
  let firstCommitTaskOnly: boolean | null = null;
  let firstAuthor: string | null = null;
  if (firstSha) {
    const first = await gh.json<{ files?: Array<{ filename: string }>; commit?: { author?: { email?: string } } }>(
      `/repos/${owner}/${repo}/commits/${firstSha}`,
    );
    firstCommitTaskOnly = firstCommitHoldsOnlyTaskFiles(first?.files, taskPath, addedTaskPaths);
    firstAuthor = first?.commit?.author?.email ?? null;
  }
  const specCommittedFirst = firstCommitTaskOnly === true && baseSha === firstSha;
  // A base tag on another author's commit may belong to a teammate's task with the same ID; moving it breaks theirs.
  let baseTagSameAuthor: boolean | null = null;
  if (firstCommitTaskOnly && baseSha && baseSha !== firstSha && firstAuthor) {
    const tagged = await gh.json<{ commit?: { author?: { email?: string } } }>(
      `/repos/${owner}/${repo}/commits/${baseSha}`, { optional: true },
    );
    const taggedAuthor = tagged?.commit?.author?.email;
    if (taggedAuthor) baseTagSameAuthor = taggedAuthor.toLowerCase() === firstAuthor.toLowerCase();
  }
  const mergeSha = pull.merge_commit_sha;
  const checks = await readCommitChecks(gh, owner, repo, mergeSha);
  let testFileCount: number | null = null;
  try {
    const baseCommit = baseSha ?? pull.base?.sha;
    if (baseCommit) {
      const diff = await gh.text(
        `/repos/${owner}/${repo}/compare/${baseCommit}...${mergeSha}`,
        "application/vnd.github.diff",
      );
      testFileCount = splitPatch(diff).testFiles.length;
    }
  } catch {
    testFileCount = null;
  }
  const facts: TaskFacts = {
    ci: summarizeCi(checks),
    testFileCount,
    mergeSha,
    firstCommitSha: commits?.[0]?.sha ?? null,
    firstCommitTaskOnly,
    baseTagSameAuthor,
    prNumber: number,
    prTaskFileCount: addedTaskPaths.length,
    prTaskFiles: addedTaskPaths,
  };
  return {
    prUrl: parsed.url,
    repoFullName: `${owner}/${repo}`,
    prNumber: number,
    taskPath, markdown, spec,
    validation: {
      prMerged: true,
      prAuthoredByStudent,
      prTitleHasTaskId: pull.title.toLowerCase().includes(spec.id.toLowerCase()),
      branchHasTaskId: pull.head.ref.toLowerCase().includes(spec.id.toLowerCase()),
      baseTagPushed: Boolean(baseSha),
      specCommittedFirst,
      doneTagOnMergeCommit: doneSha === pull.merge_commit_sha,
      estimateAtLeastTwoHours: estimateMeetsTaskMinimum(spec.estimateHours),
    },
    facts,
  };
}
