import "server-only";
import { parsePullRequestUrl, parseTaskSpec, type TaskSpec } from "@/lib/cse115a/taskSpec";
import { githubReader, tagCommitSha } from "@/lib/cse115a/githubClient";

type GitHubPull = {
  title: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string };
  user: { login: string } | null;
};

type GitHubFile = { filename: string };
type GitHubContent = { encoding: string; content: string; size: number };

export type ImportedTask = {
  prUrl: string;
  repoFullName: string;
  prNumber: number;
  taskPath: string;
  markdown: string;
  spec: TaskSpec;
  validation: Record<string, boolean>;
};

export async function importTaskFromPullRequest(
  prUrl: string,
  assignmentNumber: number,
  token: string,
): Promise<ImportedTask> {
  const parsed = parsePullRequestUrl(prUrl);
  if (!parsed) throw new Error("Enter a GitHub pull request URL, such as https://github.com/team/repo/pull/12.");
  const { owner, repo, number } = parsed;
  const gh = githubReader(token);
  const [pull, githubUser] = await Promise.all([
    gh.json<GitHubPull>(`/repos/${owner}/${repo}/pulls/${number}`),
    gh.json<{ login: string }>("/user"),
  ]);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error("This pull request must be merged before submission.");

  const candidatePaths: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const files = await gh.json<GitHubFile[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
    );
    for (const file of files ?? []) {
      if (new RegExp(`^docs/tasks/sprint-${assignmentNumber}/[A-Za-z0-9_-]+\\.md$`, "i").test(file.filename)) {
        candidatePaths.push(file.filename);
      }
    }
    if ((files?.length ?? 0) < 100) break;
  }
  if (candidatePaths.length !== 1) {
    throw new Error(candidatePaths.length === 0
      ? `No task file was found in docs/tasks/sprint-${assignmentNumber}/ in this PR.`
      : "This PR changes multiple task files. Submit one task per pull request.");
  }

  const taskPath = candidatePaths[0]!;
  const encodedPath = taskPath.split("/").map(encodeURIComponent).join("/");
  const content = await gh.json<GitHubContent>(
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(pull.merge_commit_sha)}`,
  );
  if (!content || content.encoding !== "base64" || content.size > 65536) {
    throw new Error("The task file could not be imported from the merged PR.");
  }
  const markdown = Buffer.from(content.content.replace(/\s/g, ""), "base64").toString("utf8");
  const spec = parseTaskSpec(markdown);
  const filenameId = taskPath.split("/").pop()!.replace(/\.md$/i, "");
  if (spec.id !== filenameId) throw new Error("The task ID in the file must match its filename.");
  if (spec.sprint !== assignmentNumber) throw new Error(`The task file sprint must be ${assignmentNumber}.`);

  const [baseSha, doneSha, commits] = await Promise.all([
    tagCommitSha(gh, owner, repo, `${spec.id}-base`),
    tagCommitSha(gh, owner, repo, `${spec.id}-done`),
    gh.json<Array<{ sha: string }>>(`/repos/${owner}/${repo}/pulls/${number}/commits?per_page=1&page=1`),
  ]);
  let specCommittedFirst = false;
  if (baseSha && commits?.[0]?.sha === baseSha) {
    const first = await gh.json<{ files?: Array<{ filename: string }> }>(
      `/repos/${owner}/${repo}/commits/${baseSha}`,
    );
    specCommittedFirst = first?.files?.length === 1 && first.files[0]?.filename === taskPath;
  }
  return {
    prUrl: parsed.url,
    repoFullName: `${owner}/${repo}`,
    prNumber: number,
    taskPath, markdown, spec,
    validation: {
      prMerged: true,
      prAuthoredByStudent: pull.user?.login.toLowerCase() === githubUser?.login.toLowerCase(),
      prTitleHasTaskId: pull.title.includes(spec.id),
      branchHasTaskId: pull.head.ref.includes(spec.id),
      baseTagPushed: Boolean(baseSha),
      specCommittedFirst,
      doneTagOnMergeCommit: doneSha === pull.merge_commit_sha,
      estimateAtLeastTwoHours: spec.estimateHours >= 2,
    },
  };
}
