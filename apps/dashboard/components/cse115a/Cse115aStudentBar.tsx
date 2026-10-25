"use client";

const INSTRUCTIONS = "https://github.com/scottyUX/hecate-router/blob/main/docs/cse115a-sprint-task-specifications.md";

export function Cse115aStudentBar({
  courseLabel,
  email,
  onSignOut,
}: {
  courseLabel: string | null;
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <p className="text-base font-bold text-slate-900">{courseLabel ?? "CSE 115A"}</p>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700" aria-label="Account">
        <a href={INSTRUCTIONS} target="_blank" rel="noopener noreferrer" className="font-medium underline">Instructions</a>
        {email ? <span>{email}</span> : null}
        <button type="button" onClick={onSignOut} className="font-medium underline">Sign out</button>
      </nav>
    </header>
  );
}
