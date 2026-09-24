import "server-only";
import { parsePullRequestUrl, parseTaskSpec, type TaskSpec } from "@/lib/cse115a/taskSpec";

type GitHubPull = {
  title: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string };
  user: { login: string } | null;
};

type GitHubFile = { filename: string };
type GitHubContent = { encoding: string; content: string; size: number };

async function githubJson<T>(path: string, token: string, optional = false): Promise<T | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "GitHub access expired or cannot read this repository. Reconnect GitHub and try again."
    : `GitHub could not load this pull request (${response.status}).`);
  return response.json() as Promise<T>;
}

async function tagCommitSha(owner: string, repo: string, tag: string, token: string): Promise<string | null> {
  const ref = await githubJson<{ object: { type: string; sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, token, true,
  );
  if (!ref) return null;
  if (ref.object.type === "commit") return ref.object.sha;
  if (ref.object.type !== "tag") return null;
  const annotated = await githubJson<{ object: { type: string; sha: string } }>(
    `/repos/${owner}/${repo}/git/tags/${ref.object.sha}`, token,
  );
  return annotated?.object.type === "commit" ? annotated.object.sha : null;
}

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
  const [pull, githubUser] = await Promise.all([
    githubJson<GitHubPull>(`/repos/${owner}/${repo}/pulls/${number}`, token),
    githubJson<{ login: string }>("/user", token),
  ]);
  if (!pull?.merged_at || !pull.merge_commit_sha) throw new Error("This pull request must be merged before submission.");

  const candidatePaths: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const files = await githubJson<GitHubFile[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`, token,
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
  const content = await githubJson<GitHubContent>(
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(pull.merge_commit_sha)}`, token,
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
    tagCommitSha(owner, repo, `${spec.id}-base`, token),
    tagCommitSha(owner, repo, `${spec.id}-done`, token),
    githubJson<Array<{ sha: string }>>(`/repos/${owner}/${repo}/pulls/${number}/commits?per_page=1&page=1`, token),
  ]);
  let specCommittedFirst = false;
  if (baseSha && commits?.[0]?.sha === baseSha) {
    const first = await githubJson<{ files?: Array<{ filename: string }> }>(
      `/repos/${owner}/${repo}/commits/${baseSha}`, token,
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
