/**
 * Unit tests for src/utils/githubUrl.ts.
 * Covers parseGitHubUrl validation, normalization, and isGitHubUrl.
 */

import { describe, it, expect } from "vitest";
import { parseGitHubUrl, isGitHubUrl } from "../utils/githubUrl.js";

describe("parseGitHubUrl", () => {
  it("parses valid https URL", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo");
    expect(r).toEqual({
      owner: "owner",
      repo: "repo",
      url: "https://github.com/owner/repo",
    });
  });

  it("normalizes trailing slashes", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo/");
    expect(r?.url).toBe("https://github.com/owner/repo");
  });

  it("accepts .git suffix", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(r?.owner).toBe("owner");
    expect(r?.repo).toBe("repo");
  });

  it("accepts owner/repo with hyphens and underscores", () => {
    const r = parseGitHubUrl("https://github.com/some-user/repo_name");
    expect(r?.owner).toBe("some-user");
    expect(r?.repo).toBe("repo_name");
  });

  it("returns null for non-GitHub URL", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("http://github.com/owner/repo")).toBeNull();
  });

  it("returns null for invalid pattern", () => {
    expect(parseGitHubUrl("https://github.com/owner")).toBeNull();
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });
});

describe("isGitHubUrl", () => {
  it("returns true for GitHub URL", () => {
    expect(isGitHubUrl("https://github.com/owner/repo")).toBe(true);
  });

  it("returns false for non-GitHub URL", () => {
    expect(isGitHubUrl("/path/to/repo")).toBe(false);
    expect(isGitHubUrl("https://gitlab.com/owner/repo")).toBe(false);
  });
});
