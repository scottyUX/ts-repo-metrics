"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyText, REVIEW_TEXT, type ClipboardLike } from "@/lib/cse115a/reviewText";
import { MarkdownView } from "./MarkdownView";

// The review page's readable boxes (#440): the task spec as formatted markdown or raw text, a full-height switch per
// box, and Copy buttons that copy the stored text. Staff only.

const SMALL_BUTTON = "rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

function browserClipboard(): ClipboardLike {
  return typeof navigator === "undefined" ? null : navigator.clipboard;
}

/**
 * A Copy button. `text` is read when pressed, so it is always the stored text of the moment. "Copied" shows for two
 * seconds; a refusal shows the copy-by-hand line until the next press.
 */
export function CopyButton({ text, label, ariaLabel, clipboard }: { text: () => string; label: string; ariaLabel: string; clipboard?: ClipboardLike }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function press() {
    if (timer.current) clearTimeout(timer.current);
    const ok = await copyText(text(), clipboard === undefined ? browserClipboard() : clipboard);
    setState(ok ? "copied" : "failed");
    if (ok) timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void press()} aria-label={ariaLabel} className={SMALL_BUTTON}>{label}</button>
      <span role="status" aria-live="polite" className={state === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {state === "copied" ? REVIEW_TEXT.copied : state === "failed" ? REVIEW_TEXT.copyFailed : ""}
      </span>
    </span>
  );
}

/** "Show full height" / "Show less" for one box. `what` names the box for screen readers. */
export function HeightToggle({ full, onToggle, what, controls }: { full: boolean; onToggle: () => void; what: string; controls?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={full} aria-controls={controls}
      aria-label={full ? REVIEW_TEXT.lessLabel(what) : REVIEW_TEXT.fullHeightLabel(what)} className={SMALL_BUTTON}>
      {full ? REVIEW_TEXT.less : REVIEW_TEXT.fullHeight}
    </button>
  );
}

/**
 * The "Task spec" box: Formatted (the default) or Raw, which is exactly the view before #440, a full-height switch
 * and Copy for the raw markdown.
 */
export function SpecBox({ markdown, taskPath, boxId }: { markdown: string; taskPath: string; boxId: string }) {
  const [raw, setRaw] = useState(false);
  const [full, setFull] = useState(false);
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Task spec · {taskPath}</summary>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <div role="group" aria-label={REVIEW_TEXT.specViewLabel} className="inline-flex overflow-hidden rounded-md border border-input text-xs">
          <button type="button" aria-pressed={!raw} onClick={() => setRaw(false)} className={`px-2 py-1 font-medium ${raw ? "hover:bg-muted" : "bg-primary text-primary-foreground"}`}>{REVIEW_TEXT.formatted}</button>
          <button type="button" aria-pressed={raw} onClick={() => setRaw(true)} className={`border-l border-input px-2 py-1 font-medium ${raw ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{REVIEW_TEXT.raw}</button>
        </div>
        <HeightToggle full={full} onToggle={() => setFull(!full)} what="the task spec" controls={boxId} />
        <CopyButton text={() => markdown} label={REVIEW_TEXT.copy} ariaLabel={REVIEW_TEXT.copySpecLabel} />
      </div>
      <SpecBody markdown={markdown} raw={raw} full={full} boxId={boxId} />
    </details>
  );
}

/** The spec itself: Raw is the stored text in today's box, exactly; Formatted is MarkdownView. */
export function SpecBody({ markdown, raw, full, boxId }: { markdown: string; raw: boolean; full: boolean; boxId: string }) {
  const height = full ? "" : "max-h-96 ";
  return raw
    ? <pre id={boxId} className={`${height}overflow-auto whitespace-pre-wrap border-t border-border p-3 text-sm`}>{markdown}</pre>
    : <div id={boxId} className={`${height}overflow-auto border-t border-border p-3`}><MarkdownView markdown={markdown} /></div>;
}

/** A diff box with its own full-height switch. `children` is the diff view, drawn at the height this box chose. */
export function DiffBox({ what, boxId, tools, children }: { what: string; boxId: string; tools?: ReactNode; children: (full: boolean) => ReactNode }) {
  const [full, setFull] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-2">
        {tools}
        <HeightToggle full={full} onToggle={() => setFull(!full)} what={what} controls={boxId} />
      </div>
      <div id={boxId}>{children(full)}</div>
    </div>
  );
}
