import { RUBRIC, TASK_POINTS } from "@/lib/cse115a/rubric";
import { formatPoints } from "./shared";

/** One row of `cse_task_ai_grades` as the submission route returns it (#429). */
export type AiGradeEntry = {
  task_slot: number;
  rubric: unknown;
  agent_total: number | string;
  model: string;
  prompt_version: string;
  graded_at: string;
};

/** "Graded 3 times by the AI". */
export function aiGradeHistoryLabel(count: number): string {
  return `Graded ${count} times by the AI`;
}

function awarded(rubric: unknown, name: string): number | null {
  if (!Array.isArray(rubric)) return null;
  const item = rubric.find((row: unknown) => Boolean(row) && typeof row === "object" && (row as { name?: unknown }).name === name) as { awarded?: unknown } | undefined;
  const value = item?.awarded;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every AI grade of one task, newest first, read-only: one closed line under the task's rubric, shown only
 * when the AI graded the task more than once. Blank boxes show "—".
 */
export function AiGradeHistory({ entries }: { entries: AiGradeEntry[] }) {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => Date.parse(b.graded_at) - Date.parse(a.graded_at));
  const cell = "px-2 py-1 text-right tabular-nums";
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{aiGradeHistoryLabel(entries.length)}</summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-1 font-medium">Date</th>
              <th scope="col" className="px-2 py-1 font-medium">Model</th>
              <th scope="col" className="px-2 py-1 font-medium">Prompt version</th>
              <th scope="col" className="px-2 py-1 text-right font-medium">Total</th>
              {RUBRIC.map((row) => <th key={row.name} scope="col" className="px-2 py-1 text-right font-medium">{row.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((entry) => (
              <tr key={entry.graded_at}>
                <td className="px-2 py-1">{new Date(entry.graded_at).toLocaleString()}</td>
                <td className="px-2 py-1">{entry.model}</td>
                <td className="px-2 py-1">{entry.prompt_version}</td>
                <td className={cell}>{formatPoints(Number(entry.agent_total), TASK_POINTS)}</td>
                {RUBRIC.map((row) => <td key={row.name} className={cell}>{formatPoints(awarded(entry.rubric, row.name), row.points)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
