import { describe, expect, it } from "vitest";
import { nextAnalysisVersion } from "../lib/analysisVersion";

describe("nextAnalysisVersion", () => {
  it("returns version 1 when there is no prior analysis", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: null,
        latestVersion: null,
        maxVersion: null,
        newCommit: "abc123",
      }),
    ).toEqual({ version: 1, sameCommit: false });
  });

  it("keeps the latest version when commit matches", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: "abc123def456",
        latestVersion: 3,
        maxVersion: 3,
        newCommit: "abc123def456",
      }),
    ).toEqual({ version: 3, sameCommit: true });
  });

  it("bumps to max+1 when commit differs", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: "oldcommit000",
        latestVersion: 2,
        maxVersion: 2,
        newCommit: "newcommit111",
      }),
    ).toEqual({ version: 3, sameCommit: false });
  });

  it("bumps when new commit is null", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: "abc123",
        latestVersion: 1,
        maxVersion: 1,
        newCommit: null,
      }),
    ).toEqual({ version: 2, sameCommit: false });
  });

  it("bumps when latest commit is null", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: null,
        latestVersion: 1,
        maxVersion: 1,
        newCommit: "abc123",
      }),
    ).toEqual({ version: 2, sameCommit: false });
  });

  it("uses maxVersion when same commit but latestVersion is missing", () => {
    expect(
      nextAnalysisVersion({
        latestCommit: "abc123",
        latestVersion: null,
        maxVersion: 4,
        newCommit: "abc123",
      }),
    ).toEqual({ version: 4, sameCommit: true });
  });
});
