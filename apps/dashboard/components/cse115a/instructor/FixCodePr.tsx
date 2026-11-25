"use client";

import { useId, useRef, useState } from "react";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { extrasFirstMessage, WORK_PR_TEXT } from "@/lib/cse115a/workPr";
import { ExtraCodePrs } from "./ExtraCodePrs";
import { button, WorkPrChooser, type FlowHandle } from "./WorkPrChooser";

// #454, staff only: one "Fix the code PR" button on the review page in place of "Use a different PR for the code"
// (#431) and "Add another PR for the code" (#437). It opens two labelled choices; each opens that flow, unchanged:
// the same rules, routes, reason, preview, Undo and Remove. While the task has extra PRs, the first choice is
// disabled and shows the message the chooser showed before (`extrasFirstMessage`), as the main PR stays locked.

export type Flow = "different" | "more";

type ViewProps = {
  /** The choices are shown. */
  menuOpen: boolean;
  onMenu: () => void;
  onChoose: (flow: Flow) => void;
  /** The task's extra PRs: while there are any, the main PR can't change. */
  extraPrs: number[];
  idBase: string;
};

/** The button and its two choices without state, so a test can call it and look at what it builds. */
export function FixCodePrView({ menuOpen, onMenu, onChoose, extraPrs, idBase }: ViewProps) {
  const locked = extraPrs.length > 0;
  const menuId = `${idBase}-choices`;
  const choice = (flow: Flow, label: string, line: string, disabled: boolean, note: string | null) => (
    <li className="space-y-1 rounded-lg border border-border p-3">
      <button type="button" disabled={disabled} onClick={() => onChoose(flow)}
        aria-describedby={`${idBase}-${flow}-line${note ? ` ${idBase}-${flow}-note` : ""}`} className={button}>{label}</button>
      <p id={`${idBase}-${flow}-line`} className="text-muted-foreground">{line}</p>
      {note ? <p id={`${idBase}-${flow}-note`} className="text-amber-700 dark:text-amber-300">{note}</p> : null}
    </li>
  );
  return (
    <div className="space-y-2 text-sm">
      <button type="button" aria-expanded={menuOpen} aria-controls={menuId} onClick={onMenu} className={button}>{WORK_PR_TEXT.fixOpen}</button>
      <ul id={menuId} hidden={!menuOpen} aria-label={WORK_PR_TEXT.fixChoicesLabel} className="space-y-2">
        {choice("different", WORK_PR_TEXT.fixDifferent, WORK_PR_TEXT.fixDifferentLine, locked, locked ? extrasFirstMessage(extraPrs) : null)}
        {choice("more", WORK_PR_TEXT.fixMore, WORK_PR_TEXT.fixMoreLine, false, null)}
      </ul>
    </div>
  );
}

/**
 * The two flows where they were, under "Get the code", and the one button under them. The button steps aside while a
 * flow is open, as each old button did; read-only attempts show neither.
 */
export function FixCodePr({ submissionId, task, recapturedAt, readOnly, onChanged }: {
  submissionId: string; task: TaskSnapshot; recapturedAt: string | null; readOnly: boolean; onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const different = useRef<FlowHandle>(null);
  const more = useRef<FlowHandle>(null);
  const idBase = useId();
  const extraPrs = (task.extraCodePrs ?? []).map((extra) => extra.prNumber);
  const props = { submissionId, task, recapturedAt, readOnly, onChanged };

  function choose(next: Flow) {
    if (next === "different" && extraPrs.length > 0) return;
    setMenuOpen(false);
    (next === "different" ? different : more).current?.open();
  }

  return (
    <>
      <WorkPrChooser {...props} ref={different} onOpenChange={(open) => setFlow(open ? "different" : null)} />
      <ExtraCodePrs {...props} ref={more} onOpenChange={(open) => setFlow(open ? "more" : null)} />
      {readOnly || flow ? null : (
        <FixCodePrView menuOpen={menuOpen} onMenu={() => setMenuOpen(!menuOpen)} onChoose={choose} extraPrs={extraPrs} idBase={idBase} />
      )}
    </>
  );
}
