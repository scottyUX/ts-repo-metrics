import { describe, expect, it } from "vitest";
import {
  analysisResultIdLookupIds,
  buildAnalysisResultId,
} from "../lib/buildAnalysisResultId";

const USER_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const USER_B = "ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj";

describe("buildAnalysisResultId", () => {
  it("prefixes userId so different users get different ids for the same repo", () => {
    const input = {
      owner: "scottyUX",
      repo: "ts-repo-metrics",
      commitSha: "9fb7133df0dbabcd1234567890abcdef",
    };

    const idA = buildAnalysisResultId({ userId: USER_A, ...input });
    const idB = buildAnalysisResultId({ userId: USER_B, ...input });

    expect(idA).toBe(
      `${USER_A}-scottyUX-ts-repo-metrics-9fb7133df0db`,
    );
    expect(idB).toBe(
      `${USER_B}-scottyUX-ts-repo-metrics-9fb7133df0db`,
    );
    expect(idA).not.toBe(idB);
  });

  it("uses a random suffix when commitSha is null", () => {
    const id = buildAnalysisResultId({
      userId: USER_A,
      owner: "owner",
      repo: "repo",
      commitSha: null,
    });

    expect(id).toMatch(
      new RegExp(`^${USER_A}-owner-repo-[0-9a-f]{12}$`),
    );
  });
});

describe("analysisResultIdLookupIds", () => {
  it("returns the requested id first", () => {
    expect(analysisResultIdLookupIds(USER_A, "owner-repo-abc123")).toEqual([
      "owner-repo-abc123",
      `${USER_A}-owner-repo-abc123`,
    ]);
  });

  it("does not duplicate prefix when id is already user-scoped", () => {
    const scoped = `${USER_A}-owner-repo-abc123`;
    expect(analysisResultIdLookupIds(USER_A, scoped)).toEqual([scoped]);
  });

  it("returns only the requested id when userId is null", () => {
    expect(analysisResultIdLookupIds(null, "owner-repo-abc123")).toEqual([
      "owner-repo-abc123",
    ]);
  });

  it("returns empty array for blank ids", () => {
    expect(analysisResultIdLookupIds(USER_A, "  ")).toEqual([]);
  });

  it("prefers user-scoped id before legacy id when requested", () => {
    expect(
      analysisResultIdLookupIds(USER_A, "owner-repo-abc123", {
        preferUserScope: true,
      }),
    ).toEqual([`${USER_A}-owner-repo-abc123`, "owner-repo-abc123"]);
  });
});
