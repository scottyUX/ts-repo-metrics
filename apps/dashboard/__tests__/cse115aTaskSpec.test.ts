import { describe, expect, it } from "vitest";
import { canonicalHeadings, filenameMatchesId, isTaskFilePath, parsePullRequestUrl, parseTaskSpec } from "@/lib/cse115a/taskSpec";

const valid = `---
id: US-1-T-1
story: US-1
sprint: 1
assignee: A. Student
estimate_hours: 3
---

# Reject a non-university email on login

## Description
Serves US-1. Successful login is out of scope.

## Specs
POST /api/login returns 400 for a non-university email.

## Requirements
Use the existing handler.

## Acceptance criteria
1. Reject a non-university email.
`;

describe("CSE 115A task import", () => {
  it("extracts the committed task specification", () => {
    expect(parseTaskSpec(valid)).toMatchObject({
      id: "US-1-T-1", sprint: 1, estimateHours: 3,
      title: "Reject a non-university email on login",
      description: "Serves US-1. Successful login is out of scope.",
    });
  });

  it("accepts only full GitHub pull request URLs", () => {
    expect(parsePullRequestUrl("https://github.com/team/repo/pull/12"))
      .toMatchObject({ owner: "team", repo: "repo", number: 12 });
    expect(parsePullRequestUrl("https://github.com.evil.test/team/repo/pull/12")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/team/repo/issues/12")).toBeNull();
  });

  it("accepts task IDs with a dot, like US-2.3-T-2", () => {
    expect(parseTaskSpec(valid.replace("id: US-1-T-1", "id: US-2.3-T-2")).id).toBe("US-2.3-T-2");
    expect(isTaskFilePath("docs/tasks/sprint-2/US-2.3-T-2.md", 2)).toBe(true);
    expect(isTaskFilePath("docs/tasks/sprint-2/US-1-T-1.md", 2)).toBe(true);
  });

  it("rejects task IDs a git tag can't use or with one part", () => {
    for (const id of [".US-1", "US-1.", "US..1", "US--1", "3"]) {
      expect(() => parseTaskSpec(valid.replace("id: US-1-T-1", `id: ${id}`))).toThrow("invalid id");
      expect(isTaskFilePath(`docs/tasks/sprint-2/${id}.md`, 2)).toBe(false);
    }
    expect(isTaskFilePath("docs/tasks/sprint-3/US-2.3-T-2.md", 2)).toBe(false);
  });

  it("accepts an underscore in a task file name and ID, like 3_2_1", () => {
    expect(isTaskFilePath("docs/tasks/sprint-3/3_2_1.md", 3)).toBe(true);
    expect(parseTaskSpec(valid.replace("id: US-1-T-1", "id: 3_2_1")).id).toBe("3_2_1");
    for (const id of ["_3_2", "3_2_", "3__2"]) {
      expect(isTaskFilePath(`docs/tasks/sprint-3/${id}.md`, 3)).toBe(false);
    }
  });

  it("lets a file name use an underscore where the ID has a dot", () => {
    expect(filenameMatchesId("3_2_1", "3.2.1")).toBe(true);
    expect(filenameMatchesId("3_2_1", "3_2_1")).toBe(true);
    expect(filenameMatchesId("US-2.3-T-2", "US-2.3-T-2")).toBe(true);
    expect(filenameMatchesId("3_2_1", "3.2.2")).toBe(false);
    expect(filenameMatchesId("3-2-1", "3.2.1")).toBe(false);
  });


  it("accepts a section heading with different case, a colon or one typo", () => {
    for (const heading of ["Acceptance Criteria", "Acceptance Critera", "acceptance criteria:", "Acceptance  criteria"]) {
      const spec = parseTaskSpec(valid.replace("## Acceptance criteria", `## ${heading}`));
      expect(spec.acceptanceCriteria).toBe("1. Reject a non-university email.");
    }
  });

  it("still rejects a missing section or one that is too far off", () => {
    for (const heading of ["Acceptance", "Criteria", "Acceptance tests"]) {
      expect(() => parseTaskSpec(valid.replace("## Acceptance criteria", `## ${heading}`)))
        .toThrow("“Acceptance criteria” section");
    }
    expect(() => parseTaskSpec(valid.replace("## Specs", "## Steps"))).toThrow("“Specs” section");
  });

  it("does not guess when two headings are equally close", () => {
    const twice = valid.replace("## Acceptance criteria", "## Acceptance Critera\nA.\n\n## Acceptance criterias");
    expect(() => parseTaskSpec(twice)).toThrow("“Acceptance criteria” section");
  });

  it("rewrites a near-miss heading to the standard name for the stored copy", () => {
    const typo = valid.replace("## Acceptance criteria", "## Acceptance Critera");
    const result = canonicalHeadings(typo);
    expect(result.markdown).toBe(valid);
    expect(result.renamed).toEqual(["Acceptance Critera → Acceptance criteria"]);
    expect(canonicalHeadings(valid)).toEqual({ markdown: valid, renamed: [] });
    const twice = valid.replace("## Acceptance criteria", "## Acceptance Critera\nA.\n\n## Acceptance criterias");
    expect(canonicalHeadings(twice).markdown).toBe(twice);
    const crlf = typo.replace(/\n/g, "\r\n");
    expect(canonicalHeadings(crlf).markdown).toBe(valid.replace(/\n/g, "\r\n"));
  });
});
