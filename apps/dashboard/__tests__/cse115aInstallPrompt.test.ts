import { describe, expect, it } from "vitest";
import { needsCourseInstallPrompt, repoFullNameFromPullRequest } from "@/lib/cse115a/installPrompt";

describe("course GitHub App install prompt (#353)", () => {
  it("asks before any task has been saved", () => {
    expect(needsCourseInstallPrompt({ savedRepos: [], uninstalledRepos: [] })).toBe(true);
  });

  it("stays quiet once a repository has been read, including on a later empty sprint", () => {
    expect(needsCourseInstallPrompt({ savedRepos: ["team/app"], uninstalledRepos: [] })).toBe(false);
    expect(needsCourseInstallPrompt({ savedRepos: ["team/app", "team/other"], uninstalledRepos: [] })).toBe(false);
  });

  it("asks again when a check cannot read a repository, including a second one", () => {
    expect(needsCourseInstallPrompt({ savedRepos: ["team/app"], uninstalledRepos: ["team/other"] })).toBe(true);
    expect(needsCourseInstallPrompt({ savedRepos: ["team/app"], uninstalledRepos: ["team/app"] })).toBe(true);
  });

  it("reads the repository from a pull request URL", () => {
    expect(repoFullNameFromPullRequest("https://github.com/Team/App/pull/12")).toBe("team/app");
    expect(repoFullNameFromPullRequest("https://github.com/team/app")).toBeNull();
  });
});
