"use client";

import { useImperativeHandle, useState, type Ref } from "react";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import {
  choiceDate, WORK_PR_TEXT, workPrChoiceLine, workPrReasonLine, workPrUndoneLine, type WorkPrCandidate,
} from "@/lib/cse115a/workPr";
import { fetchJson } from "./shared";

export type Listed = { candidates: WorkPrCandidate[]; authorKnown: boolean; note: string | null; repoFullName: string };
type Preview = {
  prNumber: number; title: string; files: string[]; summary: string; diffTruncated: boolean;
  benchmark: { line: string }; warnings: string[];
};

export const button = "rounded-lg border border-input px-3 py-1.5 text-sm font-medium disabled:opacity-50";
export const primary = "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";

/**
 * #454: how "Fix the code PR" opens a flow. The flows draw no opener of their own; the page's one button opens one of
 * them, and each says when it opens or closes so that button can step aside meanwhile.
 */
export type FlowHandle = { open: () => void };
export type FlowProps = { ref?: Ref<FlowHandle>; onOpenChange?: (open: boolean) => void };

/** What the page saw, sent with every write (#431; #437 adds the task's extra PRs). */
export function seenState(task: TaskSnapshot, recapturedAt: string | null) {
  return { prNumber: task.prNumber, recapturedAt, extraPrs: (task.extraCodePrs ?? []).map((extra) => extra.prNumber) };
}

/**
 * The student's other merged PRs as radio buttons (the #431 chooser and #437's extra PRs). A PR
 * another task uses, or already added to this task, is shown and can't be picked.
 */
export function CandidateList({ name, listed, listError, picked, onPick }: {
  name: string; listed: Listed | null; listError: string | null; picked: string; onPick: (value: string) => void;
}) {
  if (listError) return <p role="alert" className="text-destructive">{listError}</p>;
  if (!listed) return <p className="text-muted-foreground">{WORK_PR_TEXT.loading}</p>;
  return (
    <div className="space-y-1">
      {listed.note ? <p className="text-amber-700 dark:text-amber-300">{listed.note}</p> : null}
      {listed.candidates.length === 0 ? <p className="text-muted-foreground">{WORK_PR_TEXT.noCandidates}</p> : (
        <>
          <p className="text-muted-foreground">{WORK_PR_TEXT.listLabel}</p>
          <ul className="max-h-72 space-y-1 overflow-auto">
            {listed.candidates.map((candidate) => {
              const blocked = Boolean(candidate.usedBy) || candidate.attached === true;
              return (
                <li key={candidate.number}>
                  <label className={`flex gap-2 rounded-md p-2 ${blocked ? "opacity-60" : "cursor-pointer hover:bg-muted"}`}>
                    <input type="radio" name={name} disabled={blocked} checked={picked === String(candidate.number)}
                      onChange={() => onPick(String(candidate.number))} className="mt-1" />
                    <span className="min-w-0">
                      <span className="font-medium">#{candidate.number} {candidate.title}</span>
                      {candidate.likely ? <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{WORK_PR_TEXT.likely}</span> : null}
                      <span className="block break-all text-xs text-muted-foreground">
                        {candidate.branch} · merged {choiceDate(candidate.mergedAt)} · {candidate.filesChanged}{candidate.filesCapped ? "+" : ""} file{candidate.filesChanged === 1 ? "" : "s"}
                      </span>
                      {candidate.reasons.map((item) => <span key={item} className="block text-xs text-emerald-700 dark:text-emerald-300">{item}</span>)}
                      {candidate.attached ? <span className="block text-xs text-muted-foreground">{WORK_PR_TEXT.attached}</span> : null}
                      {candidate.usedBy ? <span className="block text-xs text-destructive">{WORK_PR_TEXT.usedBy(candidate.usedBy)}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * A task's staff choice of the PR that holds its code (#431), under "Get the code": the line when staff have chosen
 * (with Undo, in two steps), and the chooser, which "Fix the code PR" opens (#454: "The code is in a different PR").
 * Every write sends what the page saw (`seen`), so a stale page is refused by the server instead of changing a task
 * that moved on.
 */
export function WorkPrChooser({ submissionId, task, recapturedAt, readOnly, onChanged, ref, onOpenChange }: {
  submissionId: string; task: TaskSnapshot; recapturedAt: string | null; readOnly: boolean; onChanged: () => void;
} & FlowProps) {
  const [open, setOpen] = useState(false);
  const [listed, setListed] = useState<Listed | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pr, setPr] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewedPr, setPreviewedPr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const url = `/api/cse115a/instructor/submissions/${submissionId}/work-pr`;
  const seen = seenState(task, recapturedAt);
  const choice = task.workPrChoice;
  // #437: the main PR can't change while the task has extra PRs; they are removed first.
  const extras = (task.extraCodePrs ?? []).map((extra) => extra.prNumber);
  const locked = readOnly || extras.length > 0;

  function show(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  // The opener is "Fix the code PR" (FixCodePr); it offers this flow only when the task is not locked.
  useImperativeHandle(ref, () => ({ open: () => { if (!locked) void openChooser(); } }));

  async function openChooser() {
    show(true);
    setMessage(null);
    setListError(null);
    if (listed) return;
    try {
      setListed(await fetchJson<Listed>(`${url}?slot=${task.slot}`));
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "Could not list the student's PRs.");
    }
  }

  function choose(value: string) {
    setPr(value);
    setConfirming(false);
    if (value.trim() !== previewedPr) setPreview(null);
  }

  async function send(body: object) {
    setBusy(true);
    setMessage(null);
    try {
      return await fetchJson<{ preview: Preview; message?: string }>(url, { method: "POST", body: JSON.stringify(body) });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The change failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    const chosen = pr.trim();
    const answer = await send({ slot: task.slot, pr: chosen, reason, apply: false, seen });
    if (answer) {
      setPreview(answer.preview);
      setPreviewedPr(chosen);
    } else {
      setPreview(null);
      setPreviewedPr(null);
    }
  }

  async function apply() {
    const answer = await send({ slot: task.slot, pr: previewedPr, reason, apply: true, seen });
    setConfirming(false);
    if (!answer) return;
    show(false);
    setPreview(null);
    setPreviewedPr(null);
    setPr("");
    setReason("");
    setListed(null);
    setMessage(answer.message ?? WORK_PR_TEXT.saved);
    onChanged();
  }

  async function undo() {
    const answer = await send({ slot: task.slot, undo: true, seen });
    setConfirmingUndo(false);
    if (!answer) return;
    setListed(null);
    setMessage(answer.message ?? null);
    onChanged();
  }

  const previewMatches = preview !== null && previewedPr === pr.trim();
  const canPreview = !busy && pr.trim() !== "" && reason.trim() !== "";

  return (
    <div className="space-y-2 text-sm">
      {choice ? (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-amber-700 dark:text-amber-300">{workPrChoiceLine({ ...task, workPrChoice: choice })}</p>
          <p className="text-muted-foreground">{workPrReasonLine(choice)}</p>
          {locked ? null : confirmingUndo ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => void undo()} className={primary}>{WORK_PR_TEXT.confirmUndo(choice.before.prNumber)}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmingUndo(false)} className={button}>{WORK_PR_TEXT.cancel}</button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => { setConfirmingUndo(true); setMessage(null); }} className={button}>{WORK_PR_TEXT.undo}</button>
          )}
        </div>
      ) : task.workPrUndone ? <p className="text-muted-foreground">{workPrUndoneLine(task.workPrUndone)}</p> : null}

      {locked || !open ? null : (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold">{WORK_PR_TEXT.heading}</h4>
            <button type="button" onClick={() => { show(false); setConfirming(false); }} className="text-xs text-primary underline">{WORK_PR_TEXT.close}</button>
          </div>
          <p className="text-muted-foreground">{WORK_PR_TEXT.intro}</p>
          <CandidateList name={`work-pr-${task.slot}`} listed={listed} listError={listError} picked={pr.trim()} onPick={choose} />
          <label className="block">
            <span className="text-muted-foreground">{WORK_PR_TEXT.typedLabel}</span>
            <input type="text" value={pr} onChange={(event) => choose(event.target.value)} placeholder="12"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-muted-foreground">{WORK_PR_TEXT.reasonLabel}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!canPreview} onClick={() => void runPreview()} className={button}>{busy && !confirming ? "…" : WORK_PR_TEXT.preview}</button>
            {confirming && previewMatches ? (
              <>
                <button type="button" disabled={busy || reason.trim() === ""} onClick={() => void apply()} className={primary}>{WORK_PR_TEXT.confirmUse(preview!.prNumber)}</button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={button}>{WORK_PR_TEXT.cancel}</button>
              </>
            ) : (
              <button type="button" disabled={busy || !previewMatches || reason.trim() === ""} onClick={() => setConfirming(true)} className={primary}
                title={previewMatches ? undefined : WORK_PR_TEXT.previewFirst}>{WORK_PR_TEXT.use}</button>
            )}
          </div>
          {preview && previewMatches ? (
            <div className="space-y-1 rounded-md bg-muted p-2">
              <p className="font-medium">#{preview.prNumber} {preview.title}</p>
              <p>{preview.summary}</p>
              {preview.diffTruncated ? <p className="text-amber-700 dark:text-amber-300">{WORK_PR_TEXT.truncated}</p> : null}
              {preview.warnings.map((item) => <p key={item} className="text-amber-700 dark:text-amber-300">{item}</p>)}
              <ul className="max-h-48 overflow-auto font-mono text-xs">{preview.files.map((file) => <li key={file} className="break-all">{file}</li>)}</ul>
              <p className="text-muted-foreground">{preview.benchmark.line}</p>
            </div>
          ) : null}
        </div>
      )}
      {message ? <p role="status" className="text-muted-foreground">{message}</p> : null}
    </div>
  );
}
