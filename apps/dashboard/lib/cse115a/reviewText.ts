// Staff-only page texts and helpers for a readable review page and the Submissions table's team and "no code"
// columns (#440). Client-safe: no server imports. Nothing here is shown to students.

/** Page texts, word for word. */
export const REVIEW_TEXT = {
  // Task spec box.
  specViewLabel: "Task spec view",
  formatted: "Formatted",
  raw: "Raw",
  copySpecLabel: "Copy the task spec's markdown",
  imageNotLoaded: (alt: string) => `Image not loaded: ${alt || "no description"}`,
  // Height and copy.
  fullHeight: "Show full height",
  less: "Show less",
  copy: "Copy",
  copyAll: "Copy all",
  copied: "Copied",
  copyFailed: "Could not copy. Select the text and copy it by hand.",
  copyAllLabel: (tab: DiffTab) => `Copy the whole ${tab}`,
  copySectionLabel: (tab: DiffTab, pr: number) => `Copy PR #${pr}'s ${tab}`,
  fullHeightLabel: (what: string) => `Show ${what} at full height`,
  lessLabel: (what: string) => `Show less of ${what}`,
  // Team and GitHub username.
  team: "Team",
  allTeams: "All teams",
  teamLine: "Team:",
  githubLine: "GitHub:",
  // The "no code in PR" marker.
  noCode: (slot: number) => `Task ${slot}: no code in PR`,
  chosenByStaff: (slot: number) => `Task ${slot}: code PR chosen by staff`,
  needsCodePr: "Needs a code PR",
  tableNote: "Team is the repository of the student's tasks. \"No code in PR\" means the task's PR changes only task files (docs/tasks/); open Review and use \"Use a different PR for the code\".",
  noCodeFailed: "The \"no code in PR\" marker could not be loaded. The rest of the table is up to date.",
} as const;

export type DiffTab = "patch" | "test_patch";

/** The text the review page shows for an empty tab; "Copy all" puts it under that section's heading. */
export const EMPTY_TAB_TEXT: Record<DiffTab, string> = {
  patch: "No source files changed.",
  test_patch: "No test files changed.",
};

/** One diff section as the review page shows it: a heading naming the PR (null when the task has one PR) and its text. */
export type CopySection = { heading: string | null; text: string };

/**
 * What "Copy all" copies for one tab: the stored text, never the shown text, so nothing past the display limit is
 * lost. One section (no extra PRs): exactly that text. With extra PRs: every section in the order shown, each under
 * its one-line heading, separated by a blank line; an empty section says so under its heading.
 */
export function copyAllText(sections: CopySection[], tab: DiffTab): string {
  if (sections.length === 1 && sections[0]!.heading === null) return sections[0]!.text;
  return sections.map((section) => {
    const body = section.text ? section.text.replace(/\n$/, "") : EMPTY_TAB_TEXT[tab];
    return section.heading ? `${section.heading}\n${body}` : body;
  }).join("\n\n") + "\n";
}

/** The part of a clipboard this page uses. */
export type ClipboardLike = { writeText(text: string): Promise<void> } | undefined | null;

/** Copies text; false when the browser has no clipboard or refuses (no permission, not a secure page). */
export async function copyText(text: string, clipboard: ClipboardLike): Promise<boolean> {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---- Team and GitHub username ----

const REPO_FULL_NAME = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** A team as the pages show it: the repository's name, its `owner/repo`, and its GitHub address. */
export type TeamLink = { name: string; fullName: string; url: string };

/** A repository as a team, or null when the value is not an `owner/repo` name. */
export function teamLink(repoFullName: unknown): TeamLink | null {
  if (typeof repoFullName !== "string" || !REPO_FULL_NAME.test(repoFullName)) return null;
  const [owner, repo] = repoFullName.split("/") as [string, string];
  return { name: repo, fullName: repoFullName, url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` };
}

/** The distinct teams of a submission's tasks, sorted by name and then by `owner/repo`. */
export function teamLinks(repoFullNames: unknown[]): TeamLink[] {
  const seen = new Map<string, TeamLink>();
  for (const value of repoFullNames) {
    const link = teamLink(value);
    if (link && !seen.has(link.fullName.toLowerCase())) seen.set(link.fullName.toLowerCase(), link);
  }
  return [...seen.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()));
}

/** A GitHub username with its profile address, or null when missing or not a GitHub username. */
export function githubProfile(login: unknown): { login: string; url: string } | null {
  if (typeof login !== "string" || !GITHUB_LOGIN.test(login)) return null;
  return { login, url: `https://github.com/${login}` };
}

/** The distinct usernames (PR authors) of a submission's tasks, in task order. */
export function githubProfiles(logins: unknown[]): Array<{ login: string; url: string }> {
  const seen = new Map<string, { login: string; url: string }>();
  for (const value of logins) {
    const profile = githubProfile(value);
    if (profile && !seen.has(profile.login.toLowerCase())) seen.set(profile.login.toLowerCase(), profile);
  }
  return [...seen.values()];
}
