export type GitHubReader = {
  json<T>(path: string, options?: { optional?: boolean }): Promise<T | null>;
  text(path: string, accept: string): Promise<string>;
};

function githubError(status: number, what: string): Error {
  return new Error(status === 401 || status === 403
    ? "GitHub cannot read this repository. Check that the course GitHub App is still installed on it, then try again."
    : `GitHub could not load ${what} (${status}).`);
}

/** Reads the GitHub API with a fixed token, or with a token looked up for each request path. */
export function githubReader(token: string | ((path: string) => Promise<string>), fetchImpl: typeof fetch = fetch): GitHubReader {
  const request = async (path: string, accept: string) => fetchImpl(`https://api.github.com${path}`, {
    headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${typeof token === "string" ? token : await token(path)}` },
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
