import { describe, expect, it } from "vitest";
import { classifyDocs } from "../../lib/docReview/classifyDocs";
import type { FileWithText } from "../../lib/docReview/types";

function file(path: string): FileWithText {
  return { path, text: "", bytes: 0, truncated: false };
}

describe("classifyDocs (filename matching)", () => {
  it("classifies sprint plan by filename", async () => {
    const result = await classifyDocs(
      [file("documentation/sprint-1-plan.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("sprint_plan");
    expect(result[0]?.sprintNumber).toBe(1);
  });

  it("classifies sprint report by filename", async () => {
    const result = await classifyDocs(
      [file("documentation/sprint-2-report.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("sprint_report");
    expect(result[0]?.sprintNumber).toBe(2);
  });

  it("classifies release plan", async () => {
    const result = await classifyDocs(
      [file("documentation/release-plan.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("release_plan");
  });

  it("classifies test plan", async () => {
    const result = await classifyDocs(
      [file("documentation/test-plan.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("test_plan");
  });

  it("classifies definition of done", async () => {
    const result = await classifyDocs(
      [file("documentation/definition-of-done.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("definition_of_done");
  });

  it("classifies code standards", async () => {
    const result = await classifyDocs(
      [file("documentation/code-standards.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("code_standards");
  });

  it("is case-insensitive", async () => {
    const result = await classifyDocs(
      [file("documentation/Sprint-3-Plan.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("sprint_plan");
    expect(result[0]?.sprintNumber).toBe(3);
  });

  it("returns unknown for unrecognised filenames", async () => {
    const result = await classifyDocs(
      [file("documentation/meeting-notes.md")],
      [],
      [],
      null as never,
    );
    expect(result[0]?.docType).toBe("unknown");
  });

  it("classifies multiple files correctly", async () => {
    const files = [
      file("documentation/sprint-1-plan.md"),
      file("documentation/sprint-1-report.md"),
      file("documentation/release-plan.md"),
      file("documentation/random-notes.md"),
    ];
    const result = await classifyDocs(files, [], [], null as never);
    expect(result).toHaveLength(4);
    expect(result[0]?.docType).toBe("sprint_plan");
    expect(result[1]?.docType).toBe("sprint_report");
    expect(result[2]?.docType).toBe("release_plan");
    expect(result[3]?.docType).toBe("unknown");
  });
});
