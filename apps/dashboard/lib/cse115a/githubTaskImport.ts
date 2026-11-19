import "server-only";
import { splitPatch } from "@/lib/cse115a/diff";
import { estimateMeetsTaskMinimum, summarizeCi, type TaskFacts } from "@/lib/cse115a/processChecklist";
import { readCommitChecks } from "@/lib/cse115a/submissionSnapshot";
import { canonicalHeadings, checkTaskSpec, filenameMatchesId, isTaskFilePath, parsePullRequestUrl, taskIdProblem, type TaskSpec } from "@/lib/cse115a/taskSpec";
import { tagCommitSha, type GitHubReader } from "@/lib/cse115a/githubClient";
import { firstCommitHoldsOnlyTaskFiles, type TaskFileCommitter } from "@/lib/cse115a/sharedPr";
import { NEED_TASK_FILE_PR_CODE, needTaskFilePrMessage, PAIR_NOT_AUTHOR, type TaskFilePr } from "@/lib/cse115a/taskFilePr";

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
    super("This merged PR adds several task files. Choose which one is this task. If you don't see the choices, refresh the page.");
    this.name = "ChooseTaskFileError";
  }
}

/**
 * A merged PR adds no task file, and the request did not name a task-file PR to pair it with. The route turns it
 * into a `need_task_file_pr` answer, and the form asks for the second PR; it is not a failed check.
 */
export class NeedTaskFilePrError extends Error {
  readonly code = NEED_TASK_FILE_PR_CODE;
  constructor(sprint: number, changedNote: string | null, readonly repoFullName: string, readonly prNumber: number) {
    super(needTaskFilePrMessage(sprint, changedNote));
    this.name = "NeedTaskFilePrError";
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
type NoTaskFile = { problem: string; pairable?: { changedNote: string | null } };

/**
 * `pairable` is set when the PR adds no file in the sprint folder that could be a task file: then a merged PR can be
 * paired with a task-file PR. `changedNote` is the "It changes X…" sentence, when the PR changes a task file there.
 */
function chooseTaskFile(files: GitHubFile[], sprint: number): { path: string } | { several: string[] } | NoTaskFile {
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
    if (changed.length === 0) return { problem: notFound, pairable: { changedNote: null } };
    const changedNote = `It changes ${changed.join(", ")} but does not add ${changed.length === 1 ? "it" : "them"}; a PR's task file is one it adds.`;
    return { problem: `${notFound} ${changedNote}`, pairable: { changedNote } };
  }
  const names = others.map((file) => fileName(file.filename)).join(", ");
  return {
    problem: `${notFound} It adds ${others.length} other .md files there (${names}); a task file is named after its task ID, for example US-${sprint}-T-1.md.`,
  };
}

/**
 * Who made the commit that added a task file, called only for a PR that adds more than one: "student" when its
 * GitHub account is the student's linked login, "someone_else" for another account, "unknown" when the commit has
 * no GitHub account or the lookup can't tell (a failed request, an empty list, or a full page of 100 that may have
 * more). The list is newest first, so the last entry added the file. Never throws.
 */
async function taskFileCommitter(
  gh: GitHubReader, owner: string, repo: string, headSha: string | undefined, path: string, githubLogin: string,
): Promise<TaskFileCommitter> {
  if (!headSha) return "unknown";
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const commits = await gh.json<Array<{ author?: { login?: string } | null }>>(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(headSha)}&path=${encodedPath}&per_page=100`,
    );
    if (!Array.isArray(commits) || commits.length === 0 || commits.length >= 100) return "unknown";
    const login = commits[commits.length - 1]?.author?.login;
    if (typeof login !== "string" || !login) return "unknown";
    return login.toLowerCase() === githubLogin.toLowerCase() ? "student" : "someone_else";
  } catch {
    return "unknown";
  }
}

/** Who committed each task file a PR adds, by path. */
async function taskFileCommitters(
  gh: GitHubReader, owner: string, repo: string, headSha: string | undefined, paths: string[], githubLogin: string,
): Promise<Record<string, TaskFileCommitter>> {
  const found = await Promise.all(paths.map((path) => taskFileCommitter(gh, owner, repo, headSha, path, githubLogin)));
  return Object.fromEntries(paths.map((path, index) => [path, found[index]!]));
}

/** No task file the PR adds is the student's own. */
function noTaskFileYoursMessage(githubLogin: string): string {
  return `None of the task files this PR adds were committed from your GitHub account (@${githubLogin}). If you commit from another account, contact a TA.`;
}

/** An open PR's task files committed by someone else, usually from a teammate's branch merged into the student's. */
function someoneElsesTaskFilesProblem(paths: string[]): string {
  const names = paths.map(fileName).join(", ");
  return paths.length === 1
    ? `${names} was committed by someone else, probably because their branch was merged into yours. Their PR should merge first; then update your branch from main and it drops out of this PR.`
    : `${names} were committed by someone else, probably because their branch was merged into yours. Their PR should merge first; then update your branch from main and they drop out of this PR.`;
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
 * Always throws: an open PR is never imported. Reads only the PR, its files and the task file, and, when it adds
 * several task files, who committed each.
 */
async function refuseOpenPullRequest(
  gh: GitHubReader, owner: string, repo: string, number: number, headSha: string | undefined, sprint: number, githubLogin: string,
): Promise<never> {
  const chosen = chooseTaskFile(await pullRequestFiles(gh, owner, repo, number), sprint);
  const formatProblems = async (path: string): Promise<string[]> => {
    let markdown: string | null = null;
    if (headSha) {
      try {
        markdown = await readTaskFile(gh, owner, repo, path, headSha);
      } catch {
        markdown = null;
      }
    }
    return markdown === null ? ["The task file could not be read from this pull request."] : taskFileProblems(markdown, path, sprint).problems;
  };
  let problems: string[];
  if ("problem" in chosen) {
    // No task file at all: add it to this PR before merging. Pairing is only for a PR that can't be changed.
    problems = [chosen.pairable
      ? `No task file was found in docs/tasks/sprint-${sprint}/ in this PR.${chosen.pairable.changedNote ? ` ${chosen.pairable.changedNote}` : ""} Add your task file to this PR before you merge.`
      : chosen.problem];
  } else if ("several" in chosen) {
    const committers = await taskFileCommitters(gh, owner, repo, headSha, chosen.several, githubLogin);
    const yours = chosen.several.filter((path) => committers[path] !== "someone_else");
    const theirs = chosen.several.filter((path) => committers[path] === "someone_else");
    const theirsProblem = theirs.length ? [someoneElsesTaskFilesProblem(theirs)] : [];
    if (yours.length === 0) problems = [noTaskFileYoursMessage(githubLogin)];
    else if (yours.length === 1) problems = [...await formatProblems(yours[0]!), ...theirsProblem];
    else problems = [severalTaskFilesProblem(yours), ...theirsProblem];
  } else {
    problems = await formatProblems(chosen.path);
    if (problems.length === 0) {
      throw new Error(`This pull request is not merged yet. Its task file (${fileName(chosen.path)}) passes the task-file checks. Merge the pull request, then add it here again.`);
    }
  }
  throw new Error(`This pull request is not merged yet. Before you merge, fix:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
}

/** Up to five paths, then how many more. */
function listChanged(paths: string[]): string {
  if (paths.length === 0) return "no files";
  const shown = paths.slice(0, 5).join(", ");
  return paths.length > 5 ? `${shown}, and ${paths.length - 5} more` : shown;
}

/**
 * The task file from a task-file PR, paired with a merged work PR that adds none. Checked in order: same
 * repository, not the work PR, merged, opened by the student, adds exactly one task file for this sprint and
 * changes nothing else, and that file passes every task-file check at the task-file PR's merge commit.
 */
async function readTaskFilePr(
  gh: GitHubReader, owner: string, repo: string, workNumber: number, taskFilePrUrl: string, sprint: number, githubLogin: string,
): Promise<{ pr: TaskFilePr; taskPath: string; markdown: string; spec: TaskSpec }> {
  const parsed = parsePullRequestUrl(taskFilePrUrl);
  if (!parsed || parsed.owner.toLowerCase() !== owner.toLowerCase() || parsed.repo.toLowerCase() !== repo.toLowerCase()) {
    throw new Error(`The task-file PR must be in the same repository as your work PR (${owner}/${repo}).`);
  }
  if (parsed.number === workNumber) throw new Error("Paste a different PR: this one is your work PR.");
  const pull = await gh.json<GitHubPull>(`/repos/${owner}/${repo}/pulls/${parsed.number}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error("The task-file PR is not merged yet. Merge it, then add it here again.");
  if (pull.user?.login.toLowerCase() !== githubLogin.toLowerCase()) throw new Error("The task-file PR must be opened from your GitHub account.");
  const files = await pullRequestFiles(gh, owner, repo, parsed.number);
  const only = files.length === 1 ? files[0]! : null;
  if (!only || only.status !== "added" || !isTaskFilePath(only.filename, sprint)) {
    throw new Error(`The task-file PR must add one task file in docs/tasks/sprint-${sprint}/ and change nothing else. This one changes: ${listChanged(files.map((file) => file.filename))}.`);
  }
  const taskPath = only.filename;
  const mergeSha = pull.merge_commit_sha;
  const markdown = await readTaskFile(gh, owner, repo, taskPath, mergeSha);
  if (markdown === null) throw new Error("The task file could not be imported from the task-file PR.");
  const checked = taskFileProblems(markdown, taskPath, sprint);
  if (!checked.spec) throw new Error(checked.problems.join("\n"));
  return { pr: { url: parsed.url, number: parsed.number, mergeSha }, taskPath, markdown, spec: checked.spec };
}

/**
 * Imports a merged task PR. `githubLogin` is the submitting student's linked GitHub account. An open PR is
 * refused with the result of the task-file checks, so the file can still be fixed before the merge.
 * `taskPath` is the task file the student chose, for a merged PR that adds several; it must be one the PR adds
 * and not one committed from another GitHub account. Without it such a PR throws ChooseTaskFileError with the
 * student's own files to choose from, or imports the only one that is theirs.
 * `taskFilePrUrl` pairs a merged PR that adds no task file with a merged PR that adds only the task file: the
 * task file comes from that PR, everything else from this one. Without it such a PR throws NeedTaskFilePrError.
 */
export async function importTaskFromPullRequest(
  prUrl: string,
  assignmentNumber: number,
  gh: GitHubReader,
  githubLogin: string,
  options: { taskPath?: string | null; taskFilePrUrl?: string | null } = {},
): Promise<ImportedTask> {
  const parsed = parsePullRequestUrl(prUrl);
  if (!parsed) throw new Error("Enter a GitHub pull request URL, such as https://github.com/team/repo/pull/12.");
  const { owner, repo, number } = parsed;
  const pull = await gh.json<GitHubPull>(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) {
    if (pull?.state === "open") return refuseOpenPullRequest(gh, owner, repo, number, pull.head?.sha, assignmentNumber, githubLogin);
    throw new Error("This pull request must be merged before submission.");
  }

  const chosen = chooseTaskFile(await pullRequestFiles(gh, owner, repo, number), assignmentNumber);
  const prAuthoredByStudent = pull.user?.login.toLowerCase() === githubLogin.toLowerCase();
  let taskFilePr: TaskFilePr | null = null;
  let taskPath: string | null;
  let markdown: string;
  let spec: TaskSpec;
  // The task files this PR adds; with several, each can be one of the student's tasks (one PR, two tasks).
  let addedTaskPaths: string[];
  let committers: Record<string, TaskFileCommitter> | null = null;
  if ("problem" in chosen) {
    // A merged PR with no task file: its task file comes from a separate task-file PR, by the same student.
    if (!chosen.pairable) throw new Error(chosen.problem);
    if (!prAuthoredByStudent) throw new Error(PAIR_NOT_AUTHOR);
    const taskFilePrUrl = options.taskFilePrUrl?.trim() || null;
    if (!taskFilePrUrl) throw new NeedTaskFilePrError(assignmentNumber, chosen.pairable.changedNote, `${owner}/${repo}`, number);
    const fromPr = await readTaskFilePr(gh, owner, repo, number, taskFilePrUrl, assignmentNumber, githubLogin);
    taskFilePr = fromPr.pr;
    taskPath = fromPr.taskPath;
    markdown = fromPr.markdown;
    spec = fromPr.spec;
    addedTaskPaths = [];
  } else {
    addedTaskPaths = "several" in chosen ? chosen.several : [chosen.path];
    const requested = options.taskPath?.trim() || null;
    if (requested && !addedTaskPaths.includes(requested)) {
      throw new Error(`This PR does not add ${fileName(requested)} in docs/tasks/sprint-${assignmentNumber}/. Choose a task file it adds: ${addedTaskPaths.map(fileName).join(", ")}.`);
    }
    taskPath = "several" in chosen ? requested : chosen.path;
    if ("several" in chosen) {
      if (!prAuthoredByStudent) throw new Error(SEVERAL_TASK_FILES_NOT_AUTHOR);
      // Only the student's own task files can be their task: a teammate's can reach the PR through a branch merge.
      // A file whose committer can't be told is still offered; the review page says so.
      committers = await taskFileCommitters(gh, owner, repo, pull.head?.sha, chosen.several, githubLogin);
      const yours = chosen.several.filter((path) => committers![path] !== "someone_else");
      if (yours.length === 0) throw new Error(noTaskFileYoursMessage(githubLogin));
      if (requested && committers[requested] === "someone_else") {
        throw new Error(`${fileName(requested)} was committed by someone else, so it can't be your task. Choose a task file you committed.`);
      }
      if (!requested) {
        if (yours.length > 1) {
          throw new ChooseTaskFileError(
            yours.map((path) => ({ path, taskId: fileName(path).replace(/\.md$/i, "") })), `${owner}/${repo}`, number,
          );
        }
        taskPath = yours[0]!;
      }
    }
    if (!taskPath) throw new Error("The task file could not be imported from the merged PR.");
    const read = await readTaskFile(gh, owner, repo, taskPath, pull.merge_commit_sha);
    if (read === null) throw new Error("The task file could not be imported from the merged PR.");
    const checked = taskFileProblems(read, taskPath, assignmentNumber);
    if (!checked.spec) throw new Error(checked.problems.join("\n"));
    markdown = read;
    spec = checked.spec;
  }
  if (!taskPath) throw new Error("The task file could not be imported from the merged PR.");

  // The task file is looked for on the commit it was read from: the task-file PR's merge commit for a pair.
  const taskFileCommit = taskFilePr?.mergeSha ?? pull.merge_commit_sha;
  const encodedFolder = `docs/tasks/sprint-${assignmentNumber}`.split("/").map(encodeURIComponent).join("/");
  const [baseSha, doneSha, commits, folder] = await Promise.all([
    tagCommitSha(gh, owner, repo, `${spec.id}-base`),
    tagCommitSha(gh, owner, repo, `${spec.id}-done`),
    gh.json<Array<{ sha: string }>>(`/repos/${owner}/${repo}/pulls/${number}/commits?per_page=1&page=1`),
    gh.json<Array<{ name: string; type: string }>>(
      `/repos/${owner}/${repo}/contents/${encodedFolder}?ref=${encodeURIComponent(taskFileCommit)}`,
      { optional: true },
    ),
  ]);
  const filename = fileName(taskPath);
  if (!Array.isArray(folder) || !folder.some((entry) => entry.type === "file" && entry.name === filename)) {
    throw new Error(`The task file is not in docs/tasks/sprint-${assignmentNumber}/ on the merge commit.`);
  }
  // Check the PR's first commit even when the base tag is missing or elsewhere,
  // so the checklist can tell a fixable tag from a spec that wasn't first (#266).
  // A paired work PR has no task file, so its first commit can't be the task file alone.
  const firstSha = commits?.[0]?.sha ?? null;
  let firstCommitTaskOnly: boolean | null = null;
  let firstAuthor: string | null = null;
  if (taskFilePr) {
    firstCommitTaskOnly = false;
  } else if (firstSha) {
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
    ...(committers ? { prTaskFileCommitters: committers } : {}),
    ...(taskFilePr ? { taskFilePr } : {}),
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
