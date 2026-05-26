import type { ClassifiedDoc, FileWithText } from "./types";

export async function classifyDocs(
  files: FileWithText[],
  _docsPool: string[],
  _repoWide: string[],
  _openai: unknown,
): Promise<ClassifiedDoc[]> {
  return files.map((file): ClassifiedDoc => {
    const segments = file.path.replace(/\\/g, "/").split("/");
    const filename = (segments[segments.length - 1] ?? "").toLowerCase();

    // sprint-{n}-plan.md
    const sprintPlanMatch = /^sprint-([1-9])-plan\.md$/.exec(filename);
    if (sprintPlanMatch) {
      return {
        path: file.path,
        docType: "sprint_plan",
        sprintNumber: Number(sprintPlanMatch[1]),
      };
    }

    // sprint-{n}-report.md
    const sprintReportMatch = /^sprint-([1-9])-report\.md$/.exec(filename);
    if (sprintReportMatch) {
      return {
        path: file.path,
        docType: "sprint_report",
        sprintNumber: Number(sprintReportMatch[1]),
      };
    }

    if (filename === "release-plan.md") {
      return { path: file.path, docType: "release_plan" };
    }

    if (filename === "test-plan.md") {
      return { path: file.path, docType: "test_plan" };
    }

    if (filename === "definition-of-done.md") {
      return { path: file.path, docType: "definition_of_done" };
    }

    if (filename === "code-standards.md") {
      return { path: file.path, docType: "code_standards" };
    }

    return { path: file.path, docType: "unknown" };
  });
}
