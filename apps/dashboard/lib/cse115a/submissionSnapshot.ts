import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { taskFileFirst, type TaskFacts } from "@/lib/cse115a/processChecklist";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { firstCommitHoldsOnlyTaskFiles } from "@/lib/cse115a/sharedPr";
import { savedTaskFilePr, type TaskFilePr } from "@/lib/cse115a/taskFilePr";
import type { WorkPrChoice, WorkPrUndone } from "@/lib/cse115a/workPr";

// Everything grading and benchmark capture need, copied from GitHub when the
// student submits. Later jobs never call GitHub with the student's token.

export const MAX_DIFF_BYTES = 1_000_000;
const MAX_COMMENTS = 100;
const MAX_COMMENT_CHARS = 4000;

export type SubmittedTaskRow = {
  task_slot: number;
  task_id: string;
  pr_url: string;
  repo_full_name: string;
  pr_number: number;
  task_path: string;
  task_spec_markdown: string;
  task_spec_json: TaskSpec;
  validation_json: Record<string, boolean>;
  analysis_result_id: string;
  /** The facts saved at import; `prTaskFiles`, `prTaskFileCommitters` and `taskFilePr` are carried into the snapshot. */
  facts_json?: Partial<TaskFacts> | null;
};

export type SnapshotComment = { kind: "issue" | "review" | "review_comment"; author: string | null; body: string; createdAt: string | null; path?: string };
export type SnapshotCheck = { source: "check_run" | "status"; name: string; status: string; conclusion: string | null };

export type TaskSnapshot = {
  slot: number;
  taskId: string;
  prUrl: string;
  repoFullName: string;
  prNumber: number;
  taskPath: string;
  specMarkdown: string;
  spec: TaskSpec;
  validation: Record<string, boolean>;
  analysisResultId: string;
  /** The task files this task's PR adds in the sprint folder, from import. Missing on older tasks and snapshots. */
  prTaskFiles?: string[];
  /** Who committed each of those task files, for a PR that adds several. Missing on older tasks and snapshots. Staff only. */
  prTaskFileCommitters?: TaskFacts["prTaskFileCommitters"];
  /**
   * For a merged PR with no task file: the separate PR its task file came from. The spec is the saved one; the
   * diff, comments and checks are this task's PR (the work PR). Missing on normal tasks and older snapshots.
   */
  taskFilePr?: TaskFilePr;
  pr: { title: string; body: string; headRef: string; author: string | null; mergedAt: string | null; baseSha: string; mergeCommitSha: string };
  baseCommit: string;
  /**
   * Where the diff starts. `merge_base` (#382): the merge base of the PR's base and its head, as GitHub's "Files
   * changed" computes it; the diff then ends at the PR's head. The others are today's rule before #382, and the
   * fallback when the merge base can't be read: the PR's first commit when the task file came first, otherwise the
   * PR base (#392), with the diff ending at the merge commit. `base_tag` is only on snapshots taken before #392, when
   * a base tag on that same first commit was recorded so.
   */
  baseCommitSource: "merge_base" | "base_tag" | "first_commit" | "pr_base";
  /**
   * Capture's own answer to "did the task file come first": the PR's first commit holds only task files this PR
   * adds, and the task is not paired. False when paired or the first commit can't be read. It can differ from the
   * saved `validation.specCommittedFirst`, which import set, possibly before #392. Missing on snapshots taken before
   * #382.
   */
  taskFileFirstCommit?: boolean;
  /** The PR's head commit (`pull.head.sha`). Missing on snapshots taken before #382. */
  headCommit?: string | null;
  /**
   * Where the diff ends: `head` for the merge-base range, `merge_commit` when the capture fell back to the rule
   * before #382 (the merge base could not be read). Missing on snapshots taken before #382, which all end at the
   * merge commit.
   */
  diffEnd?: "head" | "merge_commit";
  /** Only on snapshots taken before #392: whether a misplaced base tag's commit had the first commit's author. Never read. */
  baseTagSameAuthor?: boolean | null;
  diff: string;
  diffBytes: number;
  diffTruncated: boolean;
  diffError: string | null;
  comments: SnapshotComment[];
  checks: SnapshotCheck[];
  /**
   * Set when staff chose the PR that holds this task's code (#431): `prNumber`, `prUrl`, `pr`, the diff fields,
   * `comments` and `checks` are that PR's, `taskFilePr` is the PR the student submitted, and this records who, when,
   * why and what the task pointed at before. Missing on every other task.
   */
  workPrChoice?: WorkPrChoice;
  /** The last staff choice that was undone (#431): one line of history. Missing unless a choice was undone. */
  workPrUndone?: WorkPrUndone;
};

export type SubmissionSnapshot = { version: 1; capturedAt: string; tasks: TaskSnapshot[] };

/** A pull request as GitHub's `GET /repos/{owner}/{repo}/pulls/{number}` returns it, as far as capture reads it. */
export type Pull = {
  title: string;
  body: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: { sha: string };
  head: { ref: string; sha?: string };
  user: { login: string } | null;
};
type Comment = { body?: string | null; user?: { login: string } | null; created_at?: string | null; submitted_at?: string | null; path?: string };

/** Cuts a diff to at most maxBytes of UTF-8, ending on a line boundary. */
export function truncateDiff(diff: string, maxBytes = MAX_DIFF_BYTES): { diff: string; bytes: number; truncated: boolean } {
  const bytes = Buffer.byteLength(diff, "utf8");
  if (bytes <= maxBytes) return { diff, bytes, truncated: false };
  const cut = Buffer.from(diff, "utf8").subarray(0, maxBytes).toString("utf8");
  const lastNewline = cut.lastIndexOf("\n");
  return { diff: lastNewline > 0 ? cut.slice(0, lastNewline + 1) : cut, bytes, truncated: true };
}

function comment(kind: SnapshotComment["kind"], item: Comment): SnapshotComment | null {
  const body = item.body?.trim();
  if (!body) return null;
  return {
    kind,
    author: item.user?.login ?? null,
    body: body.slice(0, MAX_COMMENT_CHARS),
    createdAt: item.created_at ?? item.submitted_at ?? null,
    ...(item.path ? { path: item.path } : {}),
  };
}

export async function readCommitChecks(gh: GitHubReader, owner: string, repo: string, sha: string): Promise<SnapshotCheck[]> {
  const base = `/repos/${owner}/${repo}`;
  const [checkRuns, statuses] = await Promise.all([
    gh.json<{ check_runs: Array<{ name: string; status: string; conclusion: string | null }> }>(
      `${base}/commits/${sha}/check-runs?per_page=100`, { optional: true }),
    gh.json<{ statuses: Array<{ context: string; state: string }> }>(`${base}/commits/${sha}/status`, { optional: true }),
  ]);
  return [
    ...(checkRuns?.check_runs ?? []).map((run) => ({ source: "check_run" as const, name: run.name, status: run.status, conclusion: run.conclusion })),
    ...(statuses?.statuses ?? []).map((status) => ({ source: "status" as const, name: status.context, status: "completed", conclusion: status.state })),
  ];
}

/**
 * The merge base of the PR's base and its head, from GitHub's compare (JSON), or null when it can't be read.
 * Never throws: the caller falls back to the rule before #382.
 */
export async function readMergeBase(gh: GitHubReader, owner: string, repo: string, baseSha: string | null | undefined, headSha: string | null | undefined): Promise<string | null> {
  if (!baseSha || !headSha) return null;
  try {
    const compare = await gh.json<{ merge_base_commit?: { sha?: string } | null }>(`/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`);
    const sha = compare?.merge_base_commit?.sha;
    return typeof sha === "string" && sha ? sha : null;
  } catch {
    return null;
  }
}

/** The fields of a task snapshot that the diff capture writes; a re-capture (recaptureTaskDiff) replaces only these. */
export const DIFF_FIELDS = [
  "baseCommit", "baseCommitSource", "taskFileFirstCommit", "headCommit", "diffEnd", "diff", "diffBytes", "diffTruncated", "diffError",
] as const satisfies readonly (keyof TaskSnapshot)[];

export type TaskDiffFields = Required<Pick<TaskSnapshot, (typeof DIFF_FIELDS)[number]>>;

/** What the diff capture needs to know about a task, from its task row at Submit or from its saved snapshot. */
export type TaskDiffInput = {
  repoFullName: string;
  prNumber: number;
  taskPath: string;
  /** The task files this PR adds (`prTaskFiles`), from import. */
  prTaskFiles?: string[];
  /** Set for a paired task: its task file came from a separate PR. */
  taskFilePr?: TaskFilePr;
  /** The task files of the student's other tasks from this same PR (two tasks, one PR). */
  samePrTaskPaths: string[];
};

/** Reads the pull request; throws when it is no longer merged. */
async function readMergedPull(gh: GitHubReader, input: Pick<TaskDiffInput, "repoFullName" | "prNumber">, slot: number): Promise<Pull & { merge_commit_sha: string; merged_at: string }> {
  const pull = await gh.json<Pull>(`${repoPath(input.repoFullName)}/pulls/${input.prNumber}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error(`Task ${slot}: the pull request is no longer merged.`);
  return pull as Pull & { merge_commit_sha: string; merged_at: string };
}

function repoPath(repoFullName: string): string {
  const [owner, repo] = repoFullName.split("/") as [string, string];
  return `/repos/${owner}/${repo}`;
}

/**
 * The diff part of a capture, shared by Submit (captureTaskSnapshot) and the staff re-capture
 * (recaptureTaskDiff): the merge base, the PR's first commit, and the diff. Never throws: a diff that
 * fails to load is `diffError`.
 */
async function captureDiff(gh: GitHubReader, input: TaskDiffInput, pull: Pull & { merge_commit_sha: string }): Promise<TaskDiffFields> {
  const [owner, repo] = input.repoFullName.split("/") as [string, string];
  const base = repoPath(input.repoFullName);
  const mergeSha = pull.merge_commit_sha;
  const headSha = pull.head.sha ?? null;
  const [commits, mergeBase] = await Promise.all([
    gh.json<Array<{ sha: string }>>(`${base}/pulls/${input.prNumber}/commits?per_page=1&page=1`),
    readMergeBase(gh, owner, repo, pull.base.sha, headSha),
  ]);
  // The rule before #382, kept only as the fallback: the diff starts after the PR's first commit when the task
  // file came first (that commit holds only task files this PR adds and the task is not paired), otherwise at the
  // PR base, and ends at the merge commit. No tag is read (#392). The first commit is still read either way, and
  // its answer is saved as `taskFileFirstCommit`.
  const firstSha = commits?.[0]?.sha ?? null;
  let fallbackBase = pull.base.sha;
  let fallbackSource: TaskSnapshot["baseCommitSource"] = "pr_base";
  let taskFileFirstCommit = false;
  if (firstSha && !input.taskFilePr) {
    // A paired task's PR has no task file, so its first commit is never the task file alone.
    const first = await gh.json<{ files?: Array<{ filename: string }> }>(`${base}/commits/${firstSha}`);
    const taskFilesOnly = firstCommitHoldsOnlyTaskFiles(first?.files, input.taskPath, [...input.samePrTaskPaths, ...(input.prTaskFiles ?? [])]);
    taskFileFirstCommit = taskFileFirst(taskFilesOnly, input.taskFilePr);
    if (taskFileFirstCommit) {
      fallbackBase = firstSha;
      fallbackSource = "first_commit";
    }
  }
  // The PR's own diff, as GitHub's "Files changed" shows it (#382): from the merge base of the PR's base and head
  // to the head. Work a teammate merged into main while the task was open stays out, even when the branch pulled
  // main in. The task file is part of it, as on GitHub.
  const fromMergeBase = mergeBase !== null && headSha !== null;
  const baseCommit = fromMergeBase ? mergeBase : fallbackBase;
  const baseCommitSource: TaskSnapshot["baseCommitSource"] = fromMergeBase ? "merge_base" : fallbackSource;
  const diffEndSha = fromMergeBase ? headSha : mergeSha;

  let diff = "";
  let diffBytes = 0;
  let diffTruncated = false;
  let diffError: string | null = null;
  try {
    const cut = truncateDiff(await gh.text(`${base}/compare/${baseCommit}...${diffEndSha}`, "application/vnd.github.diff"));
    diff = cut.diff;
    diffBytes = cut.bytes;
    diffTruncated = cut.truncated;
  } catch (error) {
    diffError = error instanceof Error ? error.message : "The diff could not be loaded.";
  }
  return {
    baseCommit,
    baseCommitSource,
    taskFileFirstCommit,
    headCommit: headSha,
    diffEnd: fromMergeBase ? "head" : "merge_commit",
    diff, diffBytes, diffTruncated, diffError,
  };
}

/** The PR's conversation, review and review comments, as Submit saves them (at most MAX_COMMENTS). */
async function readPrComments(gh: GitHubReader, base: string, prNumber: number): Promise<SnapshotComment[]> {
  const [issueComments, reviews, reviewComments] = await Promise.all([
    gh.json<Comment[]>(`${base}/issues/${prNumber}/comments?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${prNumber}/reviews?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${prNumber}/comments?per_page=100`),
  ]);
  return [
    ...(issueComments ?? []).map((item) => comment("issue", item)),
    ...(reviews ?? []).map((item) => comment("review", item)),
    ...(reviewComments ?? []).map((item) => comment("review_comment", item)),
  ].filter((item): item is SnapshotComment => item !== null).slice(0, MAX_COMMENTS);
}

/** `samePrTaskPaths`: the task files of the student's other tasks from this same PR (two tasks, one PR). */
export async function captureTaskSnapshot(gh: GitHubReader, task: SubmittedTaskRow, samePrTaskPaths: string[] = []): Promise<TaskSnapshot> {
  const taskFilePr = savedTaskFilePr(task.facts_json);
  const [owner, repo] = task.repo_full_name.split("/") as [string, string];
  const base = `/repos/${owner}/${repo}`;
  const input: TaskDiffInput = {
    repoFullName: task.repo_full_name,
    prNumber: task.pr_number,
    taskPath: task.task_path,
    prTaskFiles: task.facts_json?.prTaskFiles,
    taskFilePr: taskFilePr ?? undefined,
    samePrTaskPaths,
  };
  const pull = await readMergedPull(gh, input, task.task_slot);
  const mergeSha = pull.merge_commit_sha;

  const [diffFields, comments, checks] = await Promise.all([
    captureDiff(gh, input, pull),
    readPrComments(gh, base, task.pr_number),
    readCommitChecks(gh, owner, repo, mergeSha),
  ]);

  return {
    slot: task.task_slot,
    taskId: task.task_id,
    prUrl: task.pr_url,
    repoFullName: task.repo_full_name,
    prNumber: task.pr_number,
    taskPath: task.task_path,
    specMarkdown: task.task_spec_markdown,
    spec: task.task_spec_json,
    validation: task.validation_json,
    analysisResultId: task.analysis_result_id,
    ...(Array.isArray(task.facts_json?.prTaskFiles) ? { prTaskFiles: task.facts_json.prTaskFiles } : {}),
    ...(task.facts_json?.prTaskFileCommitters && typeof task.facts_json.prTaskFileCommitters === "object"
      ? { prTaskFileCommitters: task.facts_json.prTaskFileCommitters } : {}),
    ...(taskFilePr ? { taskFilePr } : {}),
    pr: {
      title: pull.title,
      body: pull.body ?? "",
      headRef: pull.head.ref,
      author: pull.user?.login ?? null,
      mergedAt: pull.merged_at,
      baseSha: pull.base.sha,
      mergeCommitSha: mergeSha,
    },
    ...diffFields,
    comments,
    checks,
  };
}

/** An old-rule task: saved before #382, so its snapshot has no `diffEnd`. */
export function isOldRuleTask(task: Pick<TaskSnapshot, "diffEnd">): boolean {
  return task.diffEnd === undefined || task.diffEnd === null;
}

export type RecaptureResult = { ok: true; task: TaskSnapshot } | { ok: false; error: string };

/**
 * Today's diff capture again, for a task already saved (staff re-capture of old-rule diffs). Reads GitHub only
 * with what the snapshot holds (`repoFullName`, `prNumber`, `taskPath`, `taskFilePr`, `prTaskFiles`), never the
 * task tables. Returns the saved task with only DIFF_FIELDS replaced; every other field (`pr`, `spec`,
 * `validation`, `comments`, `checks`, ...) is the saved value. An error, and nothing changed, when the PR can't be
 * read, is no longer merged, has another merge commit than the saved `pr.mergeCommitSha`, or the new diff fails to
 * load. `samePrTaskPaths`: the task paths of the same submission's other tasks from the same PR, as
 * captureSubmissionSnapshot passes them.
 */
export async function recaptureTaskDiff(gh: GitHubReader, saved: TaskSnapshot, samePrTaskPaths: string[] = []): Promise<RecaptureResult> {
  const input: TaskDiffInput = {
    repoFullName: saved.repoFullName,
    prNumber: saved.prNumber,
    taskPath: saved.taskPath,
    prTaskFiles: Array.isArray(saved.prTaskFiles) ? saved.prTaskFiles : undefined,
    taskFilePr: saved.taskFilePr,
    samePrTaskPaths,
  };
  let read: Pull | null;
  try {
    read = await gh.json<Pull>(`${repoPath(input.repoFullName)}/pulls/${input.prNumber}`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Task ${saved.slot}: the pull request could not be read (${text.slice(0, 300)}).` };
  }
  if (!read?.merged_at || !read.merge_commit_sha) return { ok: false, error: `Task ${saved.slot}: the pull request is no longer merged.` };
  const pull = read as Pull & { merge_commit_sha: string };
  if (pull.merge_commit_sha !== saved.pr.mergeCommitSha) {
    return { ok: false, error: `Task ${saved.slot}: the pull request's merge commit is not the one saved at Submit.` };
  }
  const fields = await captureDiff(gh, input, pull);
  if (fields.diffError) return { ok: false, error: `Task ${saved.slot}: the new diff could not be loaded (${fields.diffError.slice(0, 300)}).` };
  return { ok: true, task: { ...saved, ...fields } };
}

/** The task paths of the submission's other tasks from the same PR as `task` (as captureSubmissionSnapshot passes them). */
export function samePrTaskPathsOf(tasks: Array<Pick<TaskSnapshot, "slot" | "prUrl" | "taskPath">>, task: Pick<TaskSnapshot, "slot" | "prUrl">): string[] {
  return tasks.filter((other) => other.slot !== task.slot && other.prUrl.toLowerCase() === task.prUrl.toLowerCase()).map((other) => other.taskPath);
}

export async function captureSubmissionSnapshot(gh: GitHubReader, tasks: SubmittedTaskRow[], now = new Date()): Promise<SubmissionSnapshot> {
  const sorted = [...tasks].sort((a, b) => a.task_slot - b.task_slot);
  const snapshots = await Promise.all(sorted.map((task) => captureTaskSnapshot(gh, task, sorted
    .filter((other) => other.task_slot !== task.task_slot && other.pr_url.toLowerCase() === task.pr_url.toLowerCase())
    .map((other) => other.task_path))));
  return { version: 1, capturedAt: now.toISOString(), tasks: snapshots };
}

/** Reads a pull request of the repository; null when GitHub says it does not exist. Throws when it can't be read. */
export async function readPull(gh: GitHubReader, repoFullName: string, prNumber: number): Promise<Pull | null> {
  return gh.json<Pull>(`${repoPath(repoFullName)}/pulls/${prNumber}`, { optional: true });
}

/** Where a staff change (#431) points a task's code: the work PR and, for a pair, the task-file PR. */
export type WorkPrTarget = {
  prNumber: number;
  prUrl: string;
  /** The task-file PR, or undefined to capture the PR as a normal task (an undo of a task that was not paired). */
  taskFilePr?: TaskFilePr;
  /** `prTaskFiles` to save: none for a chosen PR, the saved list again on an undo. */
  prTaskFiles?: string[] | null;
};

/**
 * Captures a saved task again from another PR of the same repository (#431): the PR's details, its diff on today's
 * rule (captureDiff, as Submit), its comments and its checks. Every other field is the saved value: the spec, task
 * path, task ID, validation, analysis and the task-file committers. `pull` is the PR as read by readPull and must be
 * merged. `samePrTaskPaths` matters only for a task captured without a task-file PR. The caller sets or clears the
 * staff-choice record.
 */
export async function captureWorkPrTask(
  gh: GitHubReader, saved: TaskSnapshot, target: WorkPrTarget, pull: Pull, samePrTaskPaths: string[] = [],
): Promise<RecaptureResult> {
  if (!pull.merged_at || !pull.merge_commit_sha) return { ok: false, error: `PR #${target.prNumber} is not merged.` };
  const merged = pull as Pull & { merge_commit_sha: string; merged_at: string };
  const [owner, repo] = saved.repoFullName.split("/") as [string, string];
  const input: TaskDiffInput = {
    repoFullName: saved.repoFullName,
    prNumber: target.prNumber,
    taskPath: saved.taskPath,
    prTaskFiles: Array.isArray(target.prTaskFiles) ? target.prTaskFiles : undefined,
    taskFilePr: target.taskFilePr,
    samePrTaskPaths,
  };
  const [fields, comments, checks] = await Promise.all([
    captureDiff(gh, input, merged),
    readPrComments(gh, repoPath(saved.repoFullName), target.prNumber),
    readCommitChecks(gh, owner, repo, merged.merge_commit_sha),
  ]);
  if (fields.diffError) return { ok: false, error: `PR #${target.prNumber}: the diff could not be loaded (${fields.diffError.slice(0, 300)}).` };
  // The pair and the task-file list are the target's: a chosen PR is paired, an undo puts the saved ones back.
  const rest: TaskSnapshot = { ...saved };
  delete rest.taskFilePr;
  delete rest.prTaskFiles;
  return {
    ok: true,
    task: {
      ...rest,
      prNumber: target.prNumber,
      prUrl: target.prUrl,
      ...(Array.isArray(target.prTaskFiles) ? { prTaskFiles: target.prTaskFiles } : {}),
      ...(target.taskFilePr ? { taskFilePr: target.taskFilePr } : {}),
      pr: {
        title: merged.title,
        body: merged.body ?? "",
        headRef: merged.head.ref,
        author: merged.user?.login ?? null,
        mergedAt: merged.merged_at,
        baseSha: merged.base.sha,
        mergeCommitSha: merged.merge_commit_sha,
      },
      ...fields,
      comments,
      checks,
    },
  };
}
