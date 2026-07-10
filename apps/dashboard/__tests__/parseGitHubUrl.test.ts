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

  it("returns null for invalid input", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });
});

describe("isValidGitHubUrl", () => {
  it("accepts shorthand and full URLs", () => {
    expect(isValidGitHubUrl("foo/bar")).toBe(true);
    expect(isValidGitHubUrl("https://github.com/foo/bar")).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(isValidGitHubUrl("hello")).toBe(false);
  });
});

describe("normalizeGitHubUrl", () => {
  it("prefixes owner/repo with github.com", () => {
    expect(normalizeGitHubUrl("foo/bar")).toBe("https://github.com/foo/bar");
  });

  it("strips .git suffix", () => {
    expect(normalizeGitHubUrl("https://github.com/foo/bar.git")).toBe(
      "https://github.com/foo/bar",
    );
  });

  it("strips trailing slash and www", () => {
    expect(normalizeGitHubUrl("https://www.github.com/foo/bar/")).toBe(
      "https://github.com/foo/bar",
    );
  });

  it("collapses .git and bare URL to the same canonical form", () => {
    expect(normalizeGitHubUrl("https://github.com/JoshuaC-coder/repometricstest.git")).toBe(
      normalizeGitHubUrl("https://github.com/JoshuaC-coder/repometricstest"),
    );
  });
});
