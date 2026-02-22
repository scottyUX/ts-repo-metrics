/**
 * Repository source metadata (commit, branch) from Git.
 */

import { simpleGit } from "simple-git";
import type { SourceInfo } from "../types/report.js";

/**
 * Get current commit and branch from a repository path.
 *
 * @param repoPath - Absolute path to the repository.
 * @returns Commit sha and branch name, or null if not a git repo.
 */
async function getGitInfo(
  repoPath: string,
): Promise<{ commit: string; branch: string } | null> {
  try {
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;

    const [log, branchResult] = await Promise.all([
      git.log({ maxCount: 1 }),
      git.revparse(["--abbrev-ref", "HEAD"]),
    ]);
    const commit = log.latest?.hash ?? "";
    const branch = branchResult.trim() || "HEAD";
    return { commit, branch };
  } catch {
    return null;
  }
}

/**
 * Build source metadata for the report.
 *
 * @param repoPath - Absolute path to the repository.
 * @param type - "local" (user-provided path) or "git" (cloned from URL).
 * @param url - For type "git", the clone URL. For type "local", optionally the origin URL.
 * @returns SourceInfo for the report.
 */
export async function getSourceMetadata(
  repoPath: string,
  type: "local" | "git",
  url: string = "",
): Promise<SourceInfo> {
  const gitInfo = await getGitInfo(repoPath);
  return {
    type,
    url: url || "",
    commit: gitInfo?.commit ?? "",
    branch: gitInfo?.branch ?? "",
  };
}
