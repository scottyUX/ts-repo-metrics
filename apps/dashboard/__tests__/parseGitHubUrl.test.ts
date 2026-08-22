import { describe, expect, it } from "vitest";
import {
  isValidGitHubUrl,
  normalizeGitHubUrl,
  parseGitHubUrl,
} from "../lib/github/parseGitHubUrl";

describe("parseGitHubUrl", () => {
  it("parses full HTTPS URL", () => {
    expect(parseGitHubUrl("https://github.com/foo/bar")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseGitHubUrl("foo/bar")).toEqual({ owner: "foo", repo: "bar" });
  });

  it("strips .git suffix", () => {
    expect(parseGitHubUrl("https://github.com/foo/bar.git")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });

  it("parses pull request URLs", () => {
    expect(parseGitHubUrl("https://github.com/foo/bar/pull/12")).toEqual({
      owner: "foo",
      repo: "bar",
      pullNumber: 12,
    });
  });

  it("returns null for invalid input", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });
});

describe("isValidGitHubUrl", () => {
  it("accepts shorthand, full URLs, and pull requests", () => {
    expect(isValidGitHubUrl("foo/bar")).toBe(true);
    expect(isValidGitHubUrl("https://github.com/foo/bar")).toBe(true);
    expect(isValidGitHubUrl("https://github.com/foo/bar/pull/3")).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(isValidGitHubUrl("hello")).toBe(false);
  });
});

describe("normalizeGitHubUrl", () => {
  it("prefixes owner/repo with github.com", () => {
    expect(normalizeGitHubUrl("foo/bar")).toBe("https://github.com/foo/bar");
  });
});
