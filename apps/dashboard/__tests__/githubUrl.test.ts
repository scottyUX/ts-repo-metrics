import { describe, expect, it } from "vitest";
import { isValidGitHubUrl, normalizeGitHubUrl } from "../lib/githubUrl";

describe("isValidGitHubUrl", () => {
  it("accepts https github URL", () => {
    expect(isValidGitHubUrl("https://github.com/owner/repo")).toBe(true);
  });

  it("accepts owner/repo shorthand", () => {
    expect(isValidGitHubUrl("scottyUX/ts-repo-metrics")).toBe(true);
  });

  it("accepts http and www variants", () => {
    expect(isValidGitHubUrl("http://github.com/o/r")).toBe(true);
    expect(isValidGitHubUrl("https://www.github.com/o/r")).toBe(true);
  });

  it("rejects empty and non-strings", () => {
    expect(isValidGitHubUrl("")).toBe(false);
    expect(isValidGitHubUrl("   ")).toBe(false);
    expect(isValidGitHubUrl(null as unknown as string)).toBe(false);
  });

  it("rejects non-GitHub hosts and missing segments", () => {
    expect(isValidGitHubUrl("https://gitlab.com/o/r")).toBe(false);
    expect(isValidGitHubUrl("https://github.com/onlyowner")).toBe(false);
  });
});

describe("normalizeGitHubUrl", () => {
  it("passes through full https URL", () => {
    expect(normalizeGitHubUrl("https://github.com/a/b")).toBe(
      "https://github.com/a/b",
    );
  });

  it("prefixes owner/repo with https://github.com/", () => {
    expect(normalizeGitHubUrl("owner/repo")).toBe("https://github.com/owner/repo");
  });

  it("prefixes github.com path without scheme", () => {
    expect(normalizeGitHubUrl("github.com/x/y")).toBe("https://github.com/x/y");
  });

  it("strips .git, trailing slash, and www", () => {
    expect(normalizeGitHubUrl("https://www.github.com/a/b.git/")).toBe(
      "https://github.com/a/b",
    );
  });
});
