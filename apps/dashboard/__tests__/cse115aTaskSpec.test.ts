import { describe, expect, it } from "vitest";
import { isTaskFilePath, parsePullRequestUrl, parseTaskSpec } from "@/lib/cse115a/taskSpec";

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
});
