import "server-only";
import { createSign } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { githubReader, type GitHubReader } from "@/lib/cse115a/githubClient";

// Course repository access through the course's GitHub App. Each team installs the app on its own
// repository with read-only permissions; the server reads that repository with a short-lived
// installation token. Students only link their GitHub account to prove who they are, and may read
// a repository only when that account can push to it. No student GitHub token is stored.

const API = "https://api.github.com";
const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

export type GitHubAppConfig = { appId: string; privateKey: string; slug: string };

/** GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY (PEM, PEM with \n escapes, or base64 of the PEM). */
export function githubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim();
  const slug = env.GITHUB_APP_SLUG?.trim();
  const raw = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !slug || !raw) return null;
  const privateKey = raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  return { appId, privateKey, slug };
}

export function githubAppInstallUrl(config: GitHubAppConfig | null = githubAppConfig()): string | null {
  return config ? `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new` : null;
}

/** A JWT that authenticates as the app itself, valid for 10 minutes (backdated a minute for clock drift). */
export function githubAppJwt(config: GitHubAppConfig, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat, exp: iat + 600, iss: config.appId })}`;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(config.privateKey, "base64url")}`;
}

export type CourseRepoAccessCode = "github_app_unconfigured" | "github_not_linked" | "github_app_not_installed" | "github_not_collaborator";

/** A problem the student can fix (or report), with a message that says how. */
export class CourseRepoAccessError extends Error {
  constructor(message: string, readonly code: CourseRepoAccessCode) {
    super(message);
  }
}

/** The GitHub username of the account the user linked, if any. */
export function githubLoginOf(user: User | null): string | null {
  const data = user?.identities?.find((identity) => identity.provider === "github")?.identity_data;
  const login = data?.user_name ?? data?.preferred_username;
  return typeof login === "string" && login.trim() ? login.trim() : null;
}

type Fetch = typeof fetch;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** A read-only installation token scoped to one repository. Tokens last an hour and are reused until 5 minutes before expiry. */
export async function repoInstallationToken(
  owner: string, repo: string, config: GitHubAppConfig | null = githubAppConfig(), fetchImpl: Fetch = fetch,
): Promise<string> {
  if (!config) throw new CourseRepoAccessError("GitHub access is not set up on this site yet. Tell your instructor.", "github_app_unconfigured");
  const key = `${owner}/${repo}`.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const auth = { ...HEADERS, Authorization: `Bearer ${githubAppJwt(config)}` };
  const found = await fetchImpl(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`, { headers: auth, cache: "no-store" });
  if (found.status === 404) {
    throw new CourseRepoAccessError(
      `The course GitHub App is not installed on ${owner}/${repo}. Install it on your team’s repository: ${githubAppInstallUrl(config)}`,
      "github_app_not_installed",
    );
  }
  if (!found.ok) throw new Error(`GitHub could not check the app installation for ${owner}/${repo} (${found.status}).`);
  const installation = await found.json() as { id: number };

  const created = await fetchImpl(`${API}/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      repositories: [repo],
      permissions: { contents: "read", pull_requests: "read", checks: "read", statuses: "read" },
    }),
    cache: "no-store",
  });
  if (!created.ok) throw new Error(`GitHub could not issue a token for ${owner}/${repo} (${created.status}).`);
  const { token, expires_at } = await created.json() as { token: string; expires_at: string };
  tokenCache.set(key, { token, expiresAt: Date.parse(expires_at) });
  return token;
}

/**
 * An installation token for the repository, after checking the student's linked GitHub account can push to it.
 * Write access is the test: every team member needs it to push task branches, while on a public repository
 * anyone can read. The permission endpoint counts organization owners and team members; GitHub's plain
 * collaborator check, with an installation token, only counts people added to the repository directly.
 */
export async function courseRepoToken(
  githubLogin: string | null, owner: string, repo: string,
  config: GitHubAppConfig | null = githubAppConfig(), fetchImpl: Fetch = fetch,
): Promise<string> {
  if (!githubLogin) throw new CourseRepoAccessError("Connect GitHub first, so we can check you are on this repository’s team.", "github_not_linked");
  const token = await repoInstallationToken(owner, repo, config, fetchImpl);
  const response = await fetchImpl(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(githubLogin)}/permission`,
    { headers: { ...HEADERS, Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok && response.status !== 404) throw new Error(`GitHub could not check your access to ${owner}/${repo} (${response.status}).`);
  const permission = response.ok ? (await response.json() as { permission?: string }).permission : null;
  if (permission === "admin" || permission === "write") return token;
  throw new CourseRepoAccessError(
    `Your GitHub account @${githubLogin} cannot push to ${owner}/${repo}. Submit pull requests from your own team’s repository, and ask its owner to give you write access.`,
    "github_not_collaborator",
  );
}

/** A GitHub reader for `/repos/{owner}/{repo}/...` paths that uses the right repository's token, checking access once per repository. */
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
