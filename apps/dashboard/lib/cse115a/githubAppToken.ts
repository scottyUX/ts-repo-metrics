// The course GitHub App's own credentials and installation tokens. No "server-only" import, so the
// validation script (a plain Node process) can use it too; githubApp.ts re-exports everything here.
// GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY come from the environment.

import { createSign } from "node:crypto";

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

export type CourseRepoAccessCode = "github_app_unconfigured" | "github_not_linked" | "github_app_not_installed";

/** A problem the student can fix (or report), with a message that says how. */
export class CourseRepoAccessError extends Error {
  constructor(message: string, readonly code: CourseRepoAccessCode) {
    super(message);
  }
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
      `The course GitHub App is not installed on ${owner}/${repo}. Ask the repository owner (or an owner of its organization) to install it: ${githubAppInstallUrl(config)}`,
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
