import { describe, expect, it } from "vitest";
import { buildAnalysisResultId } from "../lib/analysisResultId";

describe("buildAnalysisResultId", () => {
  it("keeps default-branch ids as owner-repo-sha", () => {
    expect(
      buildAnalysisResultId({
        owner: "acme",
        repo: "app",
        commitSha: "abcdef1234567890",
      }),
    ).toBe("acme-app-abcdef123456");
  });

  it("prefixes pull-request ids", () => {
    expect(
      buildAnalysisResultId({
        owner: "acme",
        repo: "app",
        commitSha: "abcdef1234567890",
        ref: { type: "pr", prNumber: 42 },
      }),
    ).toBe("acme-app-pr42-abcdef123456");
  });

  it("uses report scope when ref is omitted", () => {
    expect(
      buildAnalysisResultId({
        owner: "acme",
        repo: "app",
        commitSha: "abcdef1234567890",
        scope: "pr",
        prNumber: 7,
      }),
    ).toBe("acme-app-pr7-abcdef123456");
  });

  it("includes a sanitized branch name", () => {
    expect(
      buildAnalysisResultId({
        owner: "acme",
        repo: "app",
        commitSha: "abcdef1234567890",
        ref: { type: "branch", branch: "feat/pr-scope" },
      }),
    ).toBe("acme-app-feat-pr-scope-abcdef123456");
  });
});
