import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { tagCommitSha, type GitHubReader } from "@/lib/cse115a/githubClient";

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
  pr: { title: string; body: string; headRef: string; author: string | null; mergedAt: string | null; baseSha: string; mergeCommitSha: string };
  baseCommit: string;
  baseCommitSource: "base_tag" | "pr_base";
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

export async function captureTaskSnapshot(gh: GitHubReader, task: SubmittedTaskRow): Promise<TaskSnapshot> {
  const [owner, repo] = task.repo_full_name.split("/") as [string, string];
  const base = `/repos/${owner}/${repo}`;
  const pull = await gh.json<Pull>(`${base}/pulls/${task.pr_number}`);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error(`Task ${task.task_slot}: the pull request is no longer merged.`);
  const mergeSha = pull.merge_commit_sha;

  const [baseTagSha, issueComments, reviews, reviewComments, checkRuns, statuses] = await Promise.all([
    tagCommitSha(gh, owner, repo, `${task.task_id}-base`),
    gh.json<Comment[]>(`${base}/issues/${task.pr_number}/comments?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${task.pr_number}/reviews?per_page=100`),
    gh.json<Comment[]>(`${base}/pulls/${task.pr_number}/comments?per_page=100`),
    gh.json<{ check_runs: Array<{ name: string; status: string; conclusion: string | null }> }>(
      `${base}/commits/${mergeSha}/check-runs?per_page=100`, { optional: true }),
    gh.json<{ statuses: Array<{ context: string; state: string }> }>(`${base}/commits/${mergeSha}/status`, { optional: true }),
  ]);
  const baseCommit = baseTagSha ?? pull.base.sha;

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

  const checks: SnapshotCheck[] = [
    ...(checkRuns?.check_runs ?? []).map((run) => ({ source: "check_run" as const, name: run.name, status: run.status, conclusion: run.conclusion })),
    ...(statuses?.statuses ?? []).map((status) => ({ source: "status" as const, name: status.context, status: "completed", conclusion: status.state })),
  ];

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
    baseCommitSource: baseTagSha ? "base_tag" : "pr_base",
    diff, diffBytes, diffTruncated, diffError,
    comments,
    checks,
  };
}

export async function captureSubmissionSnapshot(gh: GitHubReader, tasks: SubmittedTaskRow[], now = new Date()): Promise<SubmissionSnapshot> {
  const snapshots = await Promise.all([...tasks].sort((a, b) => a.task_slot - b.task_slot).map((task) => captureTaskSnapshot(gh, task)));
  return { version: 1, capturedAt: now.toISOString(), tasks: snapshots };
}
