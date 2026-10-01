import { describe, expect, it } from "vitest";
import { parsePullRequestUrl, parseTaskSpec } from "@/lib/cse115a/taskSpec";

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

## Tests
| Test | Asserts | Criterion |
|---|---|---|
| US-1-T-1 rejects email | HTTP 400 | 1 |
`;

describe("CSE 115A task import", () => {
  it("extracts the committed task specification", () => {
    expect(parseTaskSpec(valid)).toMatchObject({
      id: "US-1-T-1", sprint: 1, estimateHours: 3,
      title: "Reject a non-university email on login",
      description: "Serves US-1. Successful login is out of scope.",
    });
  });

  it("rejects a missing tests section", () => {
    expect(() => parseTaskSpec(valid.replace("## Tests", "## Test notes")))
      .toThrow(/Tests/);
  });

  it("accepts only full GitHub pull request URLs", () => {
    expect(parsePullRequestUrl("https://github.com/team/repo/pull/12"))
      .toMatchObject({ owner: "team", repo: "repo", number: 12 });
    expect(parsePullRequestUrl("https://github.com.evil.test/team/repo/pull/12")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/team/repo/issues/12")).toBeNull();
  });
});
