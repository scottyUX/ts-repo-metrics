export type GitHubReader = {
  json<T>(path: string, options?: { optional?: boolean }): Promise<T | null>;
  text(path: string, accept: string): Promise<string>;
};

function githubError(status: number, what: string): Error {
  return new Error(status === 401 || status === 403
    ? "GitHub access expired or cannot read this repository. Reconnect GitHub and try again."
    : `GitHub could not load ${what} (${status}).`);
}

export function githubReader(token: string): GitHubReader {
  const request = (path: string, accept: string) => fetch(`https://api.github.com${path}`, {
    headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return {
    async json<T>(path: string, options?: { optional?: boolean }) {
      const response = await request(path, "application/vnd.github+json");
      if (options?.optional && response.status === 404) return null;
      if (!response.ok) throw githubError(response.status, "this pull request");
      return response.json() as Promise<T>;
    },
    async text(path: string, accept: string) {
      const response = await request(path, accept);
      if (!response.ok) throw githubError(response.status, "this pull request diff");
      return response.text();
    },
  };
}

export async function tagCommitSha(gh: GitHubReader, owner: string, repo: string, tag: string): Promise<string | null> {
  const ref = await gh.json<{ object: { type: string; sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { optional: true },
  );
  if (!ref) return null;
  if (ref.object.type === "commit") return ref.object.sha;
  if (ref.object.type !== "tag") return null;
  const annotated = await gh.json<{ object: { type: string; sha: string } }>(
    `/repos/${owner}/${repo}/git/tags/${ref.object.sha}`,
  );
  return annotated?.object.type === "commit" ? annotated.object.sha : null;
}
