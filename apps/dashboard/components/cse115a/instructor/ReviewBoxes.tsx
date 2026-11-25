"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyText, REVIEW_TEXT, type ClipboardLike } from "@/lib/cse115a/reviewText";
import { FullScreenBox } from "./FullScreenBox";
import { MarkdownView } from "./MarkdownView";

// The review page's readable boxes (#440): the task spec as formatted markdown or raw text, a full-height switch per
// box, and Copy buttons that copy the stored text; "Full screen" for each box (#448); and "Collapse" for each diff
// box (#454). Staff only.

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
 * "Collapse" / "Expand" for one patch box (#454), at the right end of its toolbar. Collapsed, the box shows only its
 * header line and toolbar; Copy still copies the stored text. `controls` is the id of the part it hides.
 */
export function CollapseToggle({ collapsed, onToggle, what, controls }: { collapsed: boolean; onToggle: () => void; what: string; controls: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={controls}
      aria-label={collapsed ? REVIEW_TEXT.expandLabel(what) : REVIEW_TEXT.collapseLabel(what)} className={SMALL_BUTTON}>
      {collapsed ? REVIEW_TEXT.expand : REVIEW_TEXT.collapse}
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
  const title = `Task spec · ${taskPath}`;
  // The switch and Copy, on the page and in the full-screen dialog: one Formatted / Raw choice for both.
  const viewSwitch = <SpecViewSwitch raw={raw} onRaw={setRaw} />;
  const copy = <CopyButton text={() => markdown} label={REVIEW_TEXT.copy} ariaLabel={REVIEW_TEXT.copySpecLabel} />;
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{title}</summary>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        {viewSwitch}
        <HeightToggle full={full} onToggle={() => setFull(!full)} what="the task spec" controls={boxId} />
        <FullScreenBox title={title} what="the task spec" tools={<>{viewSwitch}{copy}</>}>
          <SpecBody markdown={markdown} raw={raw} full boxId={`${boxId}-full`} />
        </FullScreenBox>
        {copy}
      </div>
      <SpecBody markdown={markdown} raw={raw} full={full} boxId={boxId} />
    </details>
  );
}

/** Formatted / Raw for the task spec. */
export function SpecViewSwitch({ raw, onRaw }: { raw: boolean; onRaw: (raw: boolean) => void }) {
  return (
    <div role="group" aria-label={REVIEW_TEXT.specViewLabel} className="inline-flex overflow-hidden rounded-md border border-input text-xs">
      <button type="button" aria-pressed={!raw} onClick={() => onRaw(false)} className={`px-2 py-1 font-medium ${raw ? "hover:bg-muted" : "bg-primary text-primary-foreground"}`}>{REVIEW_TEXT.formatted}</button>
      <button type="button" aria-pressed={raw} onClick={() => onRaw(true)} className={`border-l border-input px-2 py-1 font-medium ${raw ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{REVIEW_TEXT.raw}</button>
    </div>
  );
}

/** The spec itself: Raw is the stored text in today's box, exactly; Formatted is MarkdownView. */
export function SpecBody({ markdown, raw, full, boxId }: { markdown: string; raw: boolean; full: boolean; boxId: string }) {
  const height = full ? "" : "max-h-96 ";
  return raw
    ? <pre id={boxId} className={`${height}overflow-auto whitespace-pre-wrap border-t border-border p-3 text-sm`}>{markdown}</pre>
    : <div id={boxId} className={`${height}overflow-auto border-t border-border p-3`}><MarkdownView markdown={markdown} /></div>;
}

type DiffBoxProps = { what: string; title: string; boxId: string; tools?: ReactNode; fullScreenTools?: ReactNode; children: (full: boolean) => ReactNode };

/**
 * A diff box with its own full-height switch and Full screen (#448), and Collapse at the right end of its toolbar
 * (#454). `children` is the diff view, drawn at the height this box chose, and at full height in the dialog; nothing
 * is drawn while collapsed. `title` heads the dialog; `fullScreenTools` are its buttons (a Copy of this box's stored
 * text), `tools` when not given. Starts expanded.
 */
export function DiffBox(props: DiffBoxProps) {
  const [full, setFull] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <DiffBoxView {...props} full={full} onFull={() => setFull(!full)} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />;
}

/** The diff box without state, so a test can call it and look at what it builds. */
export function DiffBoxView({ what, title, boxId, tools, fullScreenTools, children, full, onFull, collapsed, onCollapse }: DiffBoxProps & { full: boolean; onFull: () => void; collapsed: boolean; onCollapse: () => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-2">
        {tools}
        <HeightToggle full={full} onToggle={onFull} what={what} controls={boxId} />
        <FullScreenBox title={title} what={what} tools={fullScreenTools ?? tools}>{children(true)}</FullScreenBox>
        <CollapseToggle collapsed={collapsed} onToggle={onCollapse} what={what} controls={boxId} />
      </div>
      <div id={boxId} hidden={collapsed}>{collapsed ? null : children(full)}</div>
    </div>
  );
}
