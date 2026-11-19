import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { criterion, LLM_CRITERIA } from "@/lib/cse115a/rubric";
import { GRADER_PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/cse115a/grader/llmGrader";

// Students push no -base or -done tags (#392). No course page or component tells them to, except the one FAQ
// entry that says they are no longer needed.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COURSE_SOURCES = ["app/cse115a", "app/course", "components/cse115a"];
const FAQ_QUESTION = "Do I still need the -base and -done tags?";

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|mdx?)$/.test(name) ? [path] : [];
  });
}

/** A task tag: "-base" or "-done" after an ID, a placeholder or a template, never a class name like text-base. */
const TAG = /(?<![a-z])-(base|done)\b/;

describe("no tags in course pages (#392)", () => {
  const files = COURSE_SOURCES.flatMap(sourceFiles);

  it("reads the course pages and components", () => {
    expect(files).toEqual(expect.arrayContaining(["components/cse115a/CourseHelp.tsx", "components/cse115a/SprintChecklistDialog.tsx", "app/course/[courseId]/analyze/page.tsx"]));
  });

  it("has no -base, -done or git tag outside the FAQ entry that says they are not needed", () => {
    const found: string[] = [];
    for (const file of files) {
      readFileSync(join(ROOT, file), "utf8").split("\n").forEach((line, index) => {
        if (line.includes(FAQ_QUESTION)) return;
        if (TAG.test(line) || /git tag/i.test(line)) found.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it("keeps the FAQ entry, with its answer", () => {
    const help = readFileSync(join(ROOT, "components/cse115a/CourseHelp.tsx"), "utf8");
    expect(help).toContain(`q: "${FAQ_QUESTION}",`);
    expect(help).toContain(`a: "No. The site finds your pull request's first commit and its merge commit itself. Tags you already pushed are ignored and can stay.",`);
    expect(help).not.toContain("What are the two tags?");
  });

  it("catches the tag forms students were given", () => {
    for (const text of ["<id>-base", "YOUR-ID-done", "&lt;id&gt;-base", "US-2-T-1-done", "${id}-base", "git tag x"]) {
      expect(TAG.test(text) || /git tag/i.test(text)).toBe(true);
    }
    for (const text of ["text-base", "items-baseline", "definition-of-done.md"]) expect(TAG.test(text)).toBe(false);
  });
});

describe("rubric Process row (#392)", () => {
  it("names no tag", () => {
    expect(criterion("Process")).toMatchObject({
      full: "Task file first, Scrum card, merged PR", partial: "A step missing or late", none: "Code came before the task file", evidence: "PR history and Scrum board",
    });
    expect(JSON.stringify(criterion("Tests pass"))).not.toMatch(/tag/i);
  });

  it("is not sent to the AI grader, so the prompt and its version are unchanged", () => {
    expect(LLM_CRITERIA).not.toContain("Process");
    expect(LLM_CRITERIA).not.toContain("Tests pass");
    expect(SYSTEM_PROMPT).not.toContain("Task file first");
    expect(SYSTEM_PROMPT).not.toMatch(/\btags?\b/);
    expect(GRADER_PROMPT_VERSION).toBe("cse115a-grader-v5");
  });
});
