import { describe, expect, it } from "vitest";
import { needsCourseInstallPrompt, repoFullNameFromPullRequest } from "@/lib/cse115a/installPrompt";

describe("course GitHub App install prompt (#353)", () => {
  it("stays quiet when the student opens the course, including after a repository was already read", () => {
    expect(needsCourseInstallPrompt({ uninstalledRepos: [] })).toBe(false);
  });

  it("asks when a check cannot read a repository, including a second one", () => {
    expect(needsCourseInstallPrompt({ uninstalledRepos: ["team/other"] })).toBe(true);
    expect(needsCourseInstallPrompt({ uninstalledRepos: ["team/app"] })).toBe(true);
  });

  it("reads the repository from a pull request URL", () => {
    expect(repoFullNameFromPullRequest("https://github.com/Team/App/pull/12")).toBe("team/app");
    expect(repoFullNameFromPullRequest("https://github.com/team/app")).toBeNull();
  });
});
