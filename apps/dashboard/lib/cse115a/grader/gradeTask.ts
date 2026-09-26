import { RUBRIC, type CriterionGrade } from "@/lib/cse115a/rubric";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { gradeProcess, gradeTestsPass } from "./deterministic";
import { gradeWithLlm, type ChatClient } from "./llmGrader";

export type TaskGrade = {
  slot: number;
  rubric: CriterionGrade[];
  agentTotal: number;
  needsReview: boolean;
  model: string;
  promptVersion: string;
};

/** The agent's draft grade for one task, in rubric order. Criteria without points count as zero until an instructor reviews them. */
export async function gradeTask(client: ChatClient, task: TaskSnapshot, model?: string): Promise<TaskGrade> {
  const llm = await gradeWithLlm(client, task, model);
  const byName = new Map<string, CriterionGrade>([
    ...llm.criteria.map((grade) => [grade.name, grade] as const),
    ["Tests pass", gradeTestsPass(task.checks)],
    ["Process", gradeProcess(task.validation)],
  ]);
  const rubric = RUBRIC.map((row) => byName.get(row.name)!);
  return {
    slot: task.slot,
    rubric,
    agentTotal: rubric.reduce((sum, grade) => sum + (grade.awarded ?? 0), 0),
    needsReview: rubric.some((grade) => grade.needsReview),
    model: llm.model,
    promptVersion: llm.promptVersion,
  };
}
