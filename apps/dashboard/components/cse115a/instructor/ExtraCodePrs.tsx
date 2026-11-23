"use client";

import { useState } from "react";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { extraCodePrLine, extraCodePrReasonLine, WORK_PR_TEXT } from "@/lib/cse115a/workPr";
import { fetchJson } from "./shared";
import { button, CandidateList, primary, seenState, type Listed } from "./WorkPrChooser";

type Preview = {
  prNumber: number; title: string; files: string[]; summary: string; diffTruncated: boolean;
  benchmark: { line: string }; warnings: string[];
};

/**
 * #437, staff only: a task's extra PRs for its code, listed under the main PR (each with a two-step Remove), and
 * "Add another PR for the code" with the same candidate list, a typed PR number or link, a required reason, a
 * preview and Apply. Every write sends what the page saw (`seen`, with the task's extra PRs).
 */
export function ExtraCodePrs({ submissionId, task, recapturedAt, readOnly, onChanged }: {
  submissionId: string; task: TaskSnapshot; recapturedAt: string | null; readOnly: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [listed, setListed] = useState<Listed | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pr, setPr] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewedPr, setPreviewedPr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const url = `/api/cse115a/instructor/submissions/${submissionId}/work-pr`;
  const seen = seenState(task, recapturedAt);
  const extras = task.extraCodePrs ?? [];

  async function openAdder() {
    setOpen(true);
    setMessage(null);
    setListError(null);
    if (listed) return;
    try {
      setListed(await fetchJson<Listed>(`${url}?slot=${task.slot}`));
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "Could not list the student's PRs.");
    }
  }

  function pick(value: string) {
    setPr(value);
    setConfirming(false);
    if (value.trim() !== previewedPr) setPreview(null);
  }

  async function send(body: object) {
    setBusy(true);
    setMessage(null);
    try {
      return await fetchJson<{ preview: Preview | null; message?: string }>(url, { method: "POST", body: JSON.stringify(body) });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The change failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    const chosen = pr.trim();
    const answer = await send({ slot: task.slot, extra: chosen, reason, apply: false, seen });
    setPreview(answer?.preview ?? null);
    setPreviewedPr(answer?.preview ? chosen : null);
  }

  async function apply() {
    const answer = await send({ slot: task.slot, extra: previewedPr, reason, apply: true, seen });
    setConfirming(false);
    if (!answer) return;
    setOpen(false);
    setPreview(null);
    setPreviewedPr(null);
    setPr("");
    setReason("");
    setListed(null);
    setMessage(answer.message ?? null);
    onChanged();
  }

  async function remove(prNumber: number) {
    const answer = await send({ slot: task.slot, removeExtra: prNumber, seen });
    setRemoving(null);
    if (!answer) return;
    setListed(null);
    setMessage(answer.message ?? null);
    onChanged();
  }

  const previewMatches = preview !== null && previewedPr === pr.trim();
  const canPreview = !busy && pr.trim() !== "" && reason.trim() !== "";

  return (
    <div className="space-y-2 text-sm">
      {extras.length ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <h4 className="font-semibold">{WORK_PR_TEXT.extraListHeading}</h4>
          <ul className="space-y-2">
            {extras.map((extra) => (
              <li key={extra.prNumber} className="space-y-1">
                <p><a href={extra.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{extraCodePrLine(extra)}</a></p>
                <p className="text-muted-foreground">{extraCodePrReasonLine(extra.reason)}</p>
                {readOnly ? null : removing === extra.prNumber ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void remove(extra.prNumber)} className={primary}>{WORK_PR_TEXT.confirmRemove(extra.prNumber)}</button>
                    <button type="button" disabled={busy} onClick={() => setRemoving(null)} className={button}>{WORK_PR_TEXT.cancel}</button>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => { setRemoving(extra.prNumber); setMessage(null); }} className={button}>{WORK_PR_TEXT.extraRemove}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {readOnly ? null : !open ? (
        <button type="button" onClick={() => void openAdder()} className={button}>{WORK_PR_TEXT.extraOpen}</button>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold">{WORK_PR_TEXT.extraHeading}</h4>
            <button type="button" onClick={() => { setOpen(false); setConfirming(false); }} className="text-xs text-primary underline">{WORK_PR_TEXT.close}</button>
          </div>
          <p className="text-muted-foreground">{WORK_PR_TEXT.extraIntro}</p>
          <CandidateList name={`extra-pr-${task.slot}`} listed={listed} listError={listError} picked={pr.trim()} onPick={pick} />
          <label className="block">
            <span className="text-muted-foreground">{WORK_PR_TEXT.typedLabel}</span>
            <input type="text" value={pr} onChange={(event) => pick(event.target.value)} placeholder="12"
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
                <button type="button" disabled={busy || reason.trim() === ""} onClick={() => void apply()} className={primary}>{WORK_PR_TEXT.confirmExtra(preview!.prNumber)}</button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={button}>{WORK_PR_TEXT.cancel}</button>
              </>
            ) : (
              <button type="button" disabled={busy || !previewMatches || reason.trim() === ""} onClick={() => setConfirming(true)} className={primary}
                title={previewMatches ? undefined : WORK_PR_TEXT.previewFirst}>{WORK_PR_TEXT.extraAdd}</button>
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
