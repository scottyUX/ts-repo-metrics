import { parsePullRequestUrl } from "@/lib/cse115a/taskSpec";

/** Remembers that the student closed the install dialog during this browser tab. */
export const INSTALL_PROMPT_SEEN_KEY = "cse115a-github-app-install-seen";

/** `owner/repo` from a pull request URL, or null when the URL is not one. */
export function repoFullNameFromPullRequest(url: string): string | null {
  const parsed = parsePullRequestUrl(url);
  return parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : null;
}

/**
 * Whether to offer the GitHub App install step. The app is installed per
 * repository. A saved task means that repository was readable. A later check
 * that failed because the app is missing (including on a second repository)
 * asks again. With no saved task yet, the repository is still unknown.
 */
export function needsCourseInstallPrompt(input: {
  savedRepos: readonly string[];
  uninstalledRepos: readonly string[];
}): boolean {
  if (input.uninstalledRepos.length > 0) return true;
  return input.savedRepos.length === 0;
}
