// Each PR, and each task ID within a repository, belongs to one student in a course (#336).

export type OtherStudentTask = { repo_full_name: string; pr_number: number; task_id: string };

/** Why another student's task blocks this one, or null. Repository names and task IDs are compared without case. */
export function duplicateTaskMessage(
  others: OtherStudentTask[],
  task: { repoFullName: string; prNumber: number; taskId: string },
): string | null {
  const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const sameRepo = others.filter((row) => sameText(row.repo_full_name, task.repoFullName));
  if (sameRepo.some((row) => row.pr_number === task.prNumber)) {
    return "This PR is already added by another student in this course. Each PR counts for one student's task. If you think this is an error, please contact a TA.";
  }
  if (sameRepo.some((row) => sameText(row.task_id, task.taskId))) {
    return `Task ID ${task.taskId} is already used by another student in ${task.repoFullName}. Use a new task ID. If you think this is an error, please contact a TA.`;
  }
  return null;
}