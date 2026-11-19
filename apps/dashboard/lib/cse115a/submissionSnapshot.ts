import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { taskFileFirst, type TaskFacts } from "@/lib/cse115a/processChecklist";
import type { GitHubReader } from "@/lib/cse115a/githubClient";
import { firstCommitHoldsOnlyTaskFiles } from "@/lib/cse115a/sharedPr";
import { savedTaskFilePr, type TaskFilePr } from "@/lib/cse115a/taskFilePr";

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
   * Where the diff starts: the PR's first commit when the task file came first, otherwise the PR base (#392).
   * `base_tag` is only on snapshots taken before #392, when a base tag on that same first commit was recorded so.
   */
  baseCommitSource: "base_tag" | "first_commit" | "pr_base";
  /** Only on snapshots taken before #392: whether a misplaced base tag's commit had the first commit's author. Never read. */
  baseTagSameAuthor?: boolean | null;
  diff: string;
  diffBytes: number;
  diffTruncated: boolean;
  diffError: string | null;
  comments: SnapshotComment[];
  checks: SnapshotCheck[];
};

export type SubmissionSnapshot = { version: 1; capturedAt: string; tasks: TaskSnapshot[] };

type Pull = {
  title: string;
  body: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: { sha: string };
  head: { ref: string };
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

/** `samePrTaskPaths`: the task files of the student's other tasks from this same PR (two tasks, one PR). */
export async function captureTaskSnapshot(gh: GitHubReader, task: SubmittedTaskRow, samePrTaskPaths: string[] = []): Promise<TaskSnapshot> {
  const taskFilePr = savedTaskFilePr(task.facts_json);
  const [owner, repo] = task.repo_full_name.split("/") as [string, string];
  const base = `/repos/${owner}/${repo}`;
  const pull = await gh.json<Pull>(`${base}/pulls/${task.pr_number}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error(`Task ${task.task_slot}: the pull request is no longer merged.`);
  const mergeSha = pull.merge_commit_sha;

  const [commits, issueComments, reviews, reviewComments, checks] = await Promise.all([
    gh.json<Array<{ sha: string }>>(`${base}/pulls/${task.pr_number}/commits?per_page=1&page=1`),
    gh.json<Comment[]>(`${base}/issues/${task.pr_number}/comments?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${task.pr_number}/reviews?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${task.pr_number}/comments?per_page=100`),
    readCommitChecks(gh, owner, repo, mergeSha),
  ]);
  // The diff starts after the PR's first commit only when the task file came first: that commit holds only task
  // files this PR adds and the task is not paired. Otherwise it starts at the PR base. No tag is read (#392).
  const firstSha = commits?.[0]?.sha ?? null;
  let baseCommit = pull.base.sha;
  let baseCommitSource: TaskSnapshot["baseCommitSource"] = "pr_base";
  if (firstSha && !taskFilePr) {
    // A paired task's PR has no task file, so its first commit is never the task file alone.
    const first = await gh.json<{ files?: Array<{ filename: string }> }>(`${base}/commits/${firstSha}`);
    const taskFilesOnly = firstCommitHoldsOnlyTaskFiles(first?.files, task.task_path, [...samePrTaskPaths, ...(task.facts_json?.prTaskFiles ?? [])]);
    if (taskFileFirst(taskFilesOnly, taskFilePr)) {
      baseCommit = firstSha;
      baseCommitSource = "first_commit";
    }
  }

  let diff = "";
  let diffBytes = 0;
  let diffTruncated = false;
  let diffError: string | null = null;
  try {
    const cut = truncateDiff(await gh.text(`${base}/compare/${baseCommit}...${mergeSha}`, "application/vnd.github.diff"));
    diff = cut.diff;
    diffBytes = cut.bytes;
    diffTruncated = cut.truncated;
  } catch (error) {
    diffError = error instanceof Error ? error.message : "The diff could not be loaded.";
  }

  const comments = [
    ...(issueComments ?? []).map((item) => comment("issue", item)),
    ...(reviews ?? []).map((item) => comment("review", item)),
    ...(reviewComments ?? []).map((item) => comment("review_comment", item)),
  ].filter((item): item is SnapshotComment => item !== null).slice(0, MAX_COMMENTS);

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
    baseCommit,
    baseCommitSource,
    diff, diffBytes, diffTruncated, diffError,
    comments,
    checks,
  };
}

export async function captureSubmissionSnapshot(gh: GitHubReader, tasks: SubmittedTaskRow[], now = new Date()): Promise<SubmissionSnapshot> {
  const sorted = [...tasks].sort((a, b) => a.task_slot - b.task_slot);
  const snapshots = await Promise.all(sorted.map((task) => captureTaskSnapshot(gh, task, sorted
    .filter((other) => other.task_slot !== task.task_slot && other.pr_url.toLowerCase() === task.pr_url.toLowerCase())
    .map((other) => other.task_path))));
  return { version: 1, capturedAt: now.toISOString(), tasks: snapshots };
}
