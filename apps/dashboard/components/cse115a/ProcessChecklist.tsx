import { ciFactText, processChecklist, testFactText, type TaskFacts } from "@/lib/cse115a/processChecklist";

export function ProcessChecklist({
  validation,
  facts,
  taskId,
}: {
  validation: Record<string, boolean>;
  facts: Partial<TaskFacts> | null | undefined;
  taskId: string;
}) {
  const lines = processChecklist(validation, facts, taskId);
  const tests = testFactText(facts);
  return (
    <div className="mt-4 space-y-2 text-sm">
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.key}>
            <p className="flex gap-2">
              <span className={line.ok ? "text-emerald-700" : "text-amber-700"} aria-hidden>{line.ok ? "✓" : "✗"}</span>
              <span>{line.label}</span>
            </p>
            {line.detail ? (
              <p className={`mt-1 pl-6 ${line.detail.startsWith("git ") ? "font-mono text-xs" : "text-slate-600"}`}>{line.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p data-fact="ci">{ciFactText(facts)}</p>
      {tests ? <p data-fact="tests">{tests}</p> : null}
    </div>
  );
}
