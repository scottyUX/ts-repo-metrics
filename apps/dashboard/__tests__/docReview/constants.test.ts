import { describe, expect, it } from "vitest";
import {
  isDocExtension,
  isDocsPoolPath,
  isSkippedImageExtension,
  pathDepth,
} from "../../lib/docReview/constants";

describe("isDocsPoolPath", () => {
  it("matches the documentation folder only", () => {
    expect(isDocsPoolPath("documentation/readme.md")).toBe(true);
    expect(isDocsPoolPath("Documentation/Plan.md")).toBe(true);
  });

  it("does not match other folders or repo-root paths", () => {
    expect(isDocsPoolPath("docs/readme.md")).toBe(false);
    expect(isDocsPoolPath("deliverables/sprint1.md")).toBe(false);
    expect(isDocsPoolPath("README.md")).toBe(false);
    expect(isDocsPoolPath("src/utils.md")).toBe(false);
    expect(isDocsPoolPath("DEFINITION_OF_DONE.md")).toBe(false);
  });
});

describe("isDocExtension", () => {
  it("accepts markdown only, case-insensitively", () => {
    expect(isDocExtension("file.MD")).toBe(true);
    expect(isDocExtension("file.PDF")).toBe(false);
    expect(isDocExtension("file.txt")).toBe(false);
  });
});

describe("isSkippedImageExtension", () => {
  it("detects common image extensions", () => {
    expect(isSkippedImageExtension("documentation/sprints/Release.png")).toBe(true);
    expect(isSkippedImageExtension("docs/CodeStandards.jpg")).toBe(true);
    expect(isSkippedImageExtension("docs/plan.md")).toBe(false);
  });
});

describe("pathDepth", () => {
  it("counts path segments", () => {
    expect(pathDepth("docs/sprint/plan.md")).toBe(3);
    expect(pathDepth("README.md")).toBe(1);
  });
});
