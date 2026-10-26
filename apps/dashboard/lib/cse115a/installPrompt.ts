import { parsePullRequestUrl } from "@/lib/cse115a/taskSpec";

/** `owner/repo` from a pull request URL, or null when the URL is not one. */
export function repoFullNameFromPullRequest(url: string): string | null {
  const parsed = parsePullRequestUrl(url);
  return parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : null;
}

/**
 * Whether the install dialog and banner should show. Opening the course does
 * not ask. A check that could not read a repository does, including when the
 * student switches to a repository the app is not installed on.
 */
export function needsCourseInstallPrompt(input: { uninstalledRepos: readonly string[] }): boolean {
  return input.uninstalledRepos.length > 0;
}
