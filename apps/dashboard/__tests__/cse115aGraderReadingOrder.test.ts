import { describe, expect, it } from "vitest";
import { splitPatch } from "@/lib/cse115a/diff";
import { buildMessages, graderInput, graderPatches, GRADER_PROMPT_VERSION, toCriterionGrades } from "@/lib/cse115a/grader/llmGrader";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

// The grader reads this task's own files first, so another task's files in the same diff can't fill its window.
// Nothing is removed: only the order changes. All names are made up.

/** One added file in git diff form. */
function added(path: string, body: string): string {
  const lines = body.split("\n");
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`;
}

function specNaming(...names: string[]): string {
  return `---
id: X-T-8
sprint: 2
---
# Task X-T-8

## Specs
The handler returns 200.

## Tests
${names.map((name) => `- ${name}`).join("\n")}
`;
}

function snapshot(diff: string, specMarkdown: string): TaskSnapshot {
  return {
    slot: 2, taskId: "X-T-8", prUrl: "https://github.com/team/app/pull/12", repoFullName: "team/app", prNumber: 12,
    taskPath: "docs/tasks/sprint-2/X-T-8.md", specMarkdown, spec: { id: "X-T-8", estimateHours: 4 } as TaskSpec,
    validation: { prMerged: true }, analysisResultId: "r2",
    pr: { title: "X-T-8", body: "", headRef: "feature/x-t-8", author: "student", mergedAt: "2026-10-14T00:00:00Z", baseSha: "main0", mergeCommitSha: "squash" },
    baseCommit: "main0", baseCommitSource: "pr_base", diff, diffBytes: diff.length, diffTruncated: false, diffError: null, comments: [], checks: [],
  };
}

const order = (text: string) => [...text.matchAll(/^diff --git a\/(.+?) b\//gm)].map((match) => match[1]);

describe("the grader reads this task's own test files first", () => {
  // The first task's tests nearly fill the 40,000-character test window.
  const first = added("client/tests/a.test.ts", Array.from({ length: 740 }, (_, index) => `it("first task case ${String(index).padStart(3, "0")}", () => expect(1).toBe(1));`).join("\n"));
  const second = added("client/tests/b.test.ts", [
    `import { thing } from "../thing";`,
    ...Array.from({ length: 40 }, (_, index) => `it("X-T-8 case ${index} returns 200", () => expect(thing(${index})).toBe(200));`),
    `it("X-T-8 last case", () => expect(thing()).toBeTruthy());`,
  ].join("\n"));
  const diff = first + second;

  it("15. puts the named file first, and the grader sees all of it", () => {
    expect(first.length).toBeGreaterThan(38_000);
    expect(first.length).toBeLessThan(40_000);
    // Today's order would cut the second file.
    const before = buildMessages({ specMarkdown: "", testPatch: splitPatch(diff).testPatch, patch: "", notes: [] })[1]!.content;
    expect(before).not.toContain("X-T-8 last case");

    const input = graderInput(snapshot(diff, specNaming("client/tests/b.test.ts")));
    expect(order(input.testPatch)).toEqual(["client/tests/b.test.ts", "client/tests/a.test.ts"]);
    expect(buildMessages(input)[1]!.content).toContain(second.trimEnd());
    // Nothing is removed.
    expect(input.testPatch.length).toBe(splitPatch(diff).testPatch.length);
  });

  it("16. counts a file named only by its file name, or by a path from a subfolder, ignoring case", () => {
    expect(order(graderInput(snapshot(diff, specNaming("b.test.ts"))).testPatch)[0]).toBe("client/tests/b.test.ts");
    expect(order(graderInput(snapshot(diff, specNaming("tests/B.test.ts"))).testPatch)[0]).toBe("client/tests/b.test.ts");
    expect(order(graderInput(snapshot(diff, "See `b.test.ts`.")).testPatch)[0]).toBe("client/tests/b.test.ts");
  });

  it("does not count a name that is only part of a longer name", () => {
    expect(order(graderInput(snapshot(diff, specNaming("sub.test.ts", "b.test.tsx"))).testPatch)[0]).toBe("client/tests/a.test.ts");
  });
});

describe("the grader reads source files in a useful order", () => {
  const diff = [
    added("public/logo.svg", "<svg></svg>"),
    added("src/other.ts", "export const other = 1;"),
    added("package-lock.json", "{}"),
    added("docs/tasks/sprint-2/Y-T-1.md", "# Task Y-T-1"),
    added("src/handler.ts", "export const handler = () => 200;"),
    added("src/handler.test.ts", "it('works', () => {});"),
    added("assets/Photo.PNG", "binary"),
  ].join("");

  it("18. named source first, then other source, then images, lockfiles and task files", () => {
    const input = graderInput(snapshot(diff, specNaming("src/handler.ts")));
    expect(order(input.patch)).toEqual(["src/handler.ts", "src/other.ts", "public/logo.svg", "package-lock.json", "docs/tasks/sprint-2/Y-T-1.md", "assets/Photo.PNG"]);
    expect(order(input.testPatch)).toEqual(["src/handler.test.ts"]);
  });

  it("puts noise last even with nothing named", () => {
    expect(order(graderInput(snapshot(diff, specNaming())).patch))
      .toEqual(["src/other.ts", "src/handler.ts", "public/logo.svg", "package-lock.json", "docs/tasks/sprint-2/Y-T-1.md", "assets/Photo.PNG"]);
  });

  it("17. is byte-identical to today's text when nothing is named and nothing is noise", () => {
    const plain = [added("src/a.ts", "a"), added("src/a.test.ts", "t"), added("lib/b.py", "b"), added("tests/test_b.py", "u")].join("");
    const today = splitPatch(plain);
    const input = graderInput(snapshot(plain, specNaming("nothing here")));
    expect(input.testPatch).toBe(today.testPatch);
    expect(input.patch).toBe(today.patch);
    expect(graderPatches("", "")).toEqual({ testPatch: "", patch: "" });
  });
});

describe("quotes and everything else", () => {
  const diff = added("src/other.ts", "export const other = 1;") + added("src/handler.ts", "export const handler = () => 200;");
  const raw = (quote: string) => Object.fromEntries(["scope", "specs", "acceptance_criteria", "test_quality"].map((key) => [key, { level: "full" as const, rationale: "ok", evidence_quotes: [quote] }]));

  it("19. a quote from a file that moved still verifies; a made-up quote is still flagged", () => {
    const input = graderInput(snapshot(diff, specNaming("handler.ts")));
    expect(order(input.patch)[0]).toBe("src/handler.ts");
    expect(toCriterionGrades(raw("export const handler = () => 200;"), input).every((grade) => !grade.needsReview)).toBe(true);
    expect(toCriterionGrades(raw("export const other = 1;"), input).every((grade) => !grade.needsReview)).toBe(true);
    expect(toCriterionGrades(raw("export const invented = 3;"), input).every((grade) => grade.needsReview)).toBe(true);
  });

  it("20. splitPatch and benchmark rows keep the diff's order; only the version string changes", () => {
    const task = snapshot(diff, specNaming("handler.ts"));
    expect(order(splitPatch(diff).patch)).toEqual(["src/other.ts", "src/handler.ts"]);
    expect(order(buildInstance(task, 2, null).instance.patch)).toEqual(["src/other.ts", "src/handler.ts"]);
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v6");
  });
});
