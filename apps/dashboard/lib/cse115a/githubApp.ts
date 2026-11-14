import "server-only";
import type { User } from "@supabase/supabase-js";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";
import { CourseRepoAccessError, githubAppConfig, repoInstallationToken, type GitHubAppConfig } from "@/lib/cse115a/githubAppToken";

type Fetch = typeof fetch;

export {
  CourseRepoAccessError,
  githubAppConfig,
  githubAppInstallUrl,
  githubAppJwt,
  repoInstallationToken,
  type CourseRepoAccessCode,
  type GitHubAppConfig,
} from "@/lib/cse115a/githubAppToken";

// Course repository access through the course's GitHub App. Each team installs the app on its own
// repository with read-only permissions; the server reads that repository with a short-lived
// installation token. Students link their GitHub account so the site knows which pull requests are
// theirs; any linked student may read a repository the app is installed on. No student GitHub token is stored.

/** The GitHub username of the account the user linked, if any. */
export function githubLoginOf(user: User | null): string | null {
  const data = user?.identities?.find((identity) => identity.provider === "github")?.identity_data;
  const login = data?.user_name ?? data?.preferred_username;
  return typeof login === "string" && login.trim() ? login.trim() : null;
}

/**
 * An installation token for the repository, for a student with a linked GitHub account. Teammates don't need
 * write access: installing the app on the repository is what lets the site read it.
 */
export async function courseRepoToken(
  githubLogin: string | null, owner: string, repo: string,
  config: GitHubAppConfig | null = githubAppConfig(), fetchImpl: Fetch = fetch,
): Promise<string> {
  if (!githubLogin) throw new CourseRepoAccessError("Connect GitHub first, so we know which pull requests are yours.", "github_not_linked");
  return repoInstallationToken(owner, repo, config, fetchImpl);
}

/** A GitHub reader for `/repos/{owner}/{repo}/...` paths that uses the right repository's token, looked up once per repository. */
export function courseRepoReader(githubLogin: string | null, config: GitHubAppConfig | null = githubAppConfig(), fetchImpl: Fetch = fetch): GitHubReader {
  const tokens = new Map<string, Promise<string>>();
  return githubReader((path) => {
    const match = /^\/repos\/([^/]+)\/([^/?]+)/.exec(path);
    if (!match) return Promise.reject(new Error(`Not a repository path: ${path}`));
    const [owner, repo] = [decodeURIComponent(match[1]!), decodeURIComponent(match[2]!)];
    const key = `${owner}/${repo}`.toLowerCase();
    if (!tokens.has(key)) tokens.set(key, courseRepoToken(githubLogin, owner, repo, config, fetchImpl));
    return tokens.get(key)!;
  }, fetchImpl);
}
