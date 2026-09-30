"use client";

import { useState } from "react";
import { SprintChecklistDialog } from "@/components/cse115a/SprintChecklistDialog";
import { cn } from "@/lib/utils";

const COURSE = "preview-course";
const SPRINTS = [
  { number: 1, label: "Sprint 1", submitted: true, tasksAdded: 2 },
  { number: 2, label: "Sprint 2", submitted: false, tasksAdded: 1 },
  { number: 3, label: "Sprint 3", submitted: false, tasksAdded: 0 },
  { number: 4, label: "Sprint 4", submitted: false, tasksAdded: 0 },
];

// Local preview of the tab rule: opening a sprint that is not submitted and has
// no tasks yet shows the checklist.
export function SprintChecklistPreview() {
  const [selected, setSelected] = useState(2);
  const [open, setOpen] = useState(false);
  const sprint = SPRINTS.find((item) => item.number === selected)!;

  function selectSprint(number: number) {
    setSelected(number);
    const target = SPRINTS.find((item) => item.number === number)!;
    if (!target.submitted && target.tasksAdded === 0) setOpen(true);
  }


  return (
    <div className="w-full max-w-5xl space-y-6 py-8">
      <p className="rounded-md border border-border bg-muted p-3 text-sm">Preview: Sprint 3 and 4 have no tasks yet, so opening either shows the checklist.</p>
      <nav className="flex flex-wrap gap-2" aria-label="Sprints">
        {SPRINTS.map((item) => (
          <button key={item.number} type="button" onClick={() => selectSprint(item.number)} aria-current={item.number === selected ? "page" : undefined}
            className={cn("rounded-md border px-4 py-2 text-sm font-medium", item.number === selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted")}>
            {item.label}
          </button>
        ))}
      </nav>
      <h1 className="text-2xl font-semibold">Sprint {sprint.number}</h1>
      <p className="text-sm text-muted-foreground">{sprint.submitted ? "Submitted." : `${sprint.tasksAdded} of 2 tasks added.`}</p>
      <SprintChecklistDialog open={open} onOpenChange={setOpen} courseSlug={COURSE} sprint={sprint.number} />
    </div>
  );
}
