"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// A short help panel (#449): opens on hover and on keyboard focus, closes on Esc, on moving the pointer away and on
// moving focus away. The panel stays in the page while closed (hidden), and the trigger points at it with
// `aria-describedby`, so a screen reader reads the help when the trigger is focused. Staff only.

/** What can happen to a help panel. "click" is a click or tap on the trigger. */
export type TipEvent = "focus" | "blur" | "enter" | "leave" | "escape" | "click";

/**
 * The panel's next state: open on focus, hover or a click (a tap has no hover); closed on blur, leaving or Esc. A
 * click never closes it, since the focus that comes with the click has just opened it.
 */
export function nextTipOpen(open: boolean, event: TipEvent): boolean {
  return event === "focus" || event === "enter" || event === "click";
}

/** Where the panel sits: fixed under the trigger, so a scrolling table cannot cut it off. Null before it is measured. */
export type TipPosition = { top: number; left: number } | null;

const PANEL_WIDTH = 320;

/** The panel's place under a trigger, kept inside the window with an 8px margin. */
export function tipPosition(rect: { bottom: number; left: number }, windowWidth: number): { top: number; left: number } {
  return { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, windowWidth - PANEL_WIDTH - 8)) };
}

type ViewProps = {
  /** The panel's id; the trigger's `aria-describedby` names it. */
  id: string;
  open: boolean;
  position: TipPosition;
  onEvent: (event: TipEvent) => void;
  /** "button": a small "?" button labelled `label`. "text": the children themselves, focusable, as the trigger. */
  kind: "button" | "text";
  label?: string;
  children?: ReactNode;
  panel: ReactNode;
};

/** The help without state, so a test can call it and press its handlers. */
export function HelpTipView({ id, open, position, onEvent, kind, label, children, panel }: ViewProps) {
  const style: CSSProperties | undefined = position ? { position: "fixed", top: position.top, left: position.left, width: PANEL_WIDTH } : undefined;
  const handlers = {
    onFocus: () => onEvent("focus"),
    onBlur: () => onEvent("blur"),
    onKeyDown: (event: { key: string; stopPropagation?: () => void }) => {
      if (event.key === "Escape" && open) { event.stopPropagation?.(); onEvent("escape"); }
    },
  };
  return (
    <span className="relative inline-flex align-middle normal-case tracking-normal" onMouseEnter={() => onEvent("enter")} onMouseLeave={() => onEvent("leave")}>
      {kind === "button" ? (
        <button type="button" aria-label={label} aria-describedby={id} {...handlers}
          onClick={(event) => { event.stopPropagation(); onEvent("click"); }}
          className="inline-flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          ?
        </button>
      ) : (
        <span tabIndex={0} aria-describedby={id} {...handlers} className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{children}</span>
      )}
      <span id={id} role="tooltip" hidden={!open} style={style}
        className={`${position ? "" : "absolute left-0 top-full mt-1 w-80 "}z-50 block rounded-lg border border-border bg-popover p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-lg`}>
        {panel}
      </span>
    </span>
  );
}

/** A help panel with its own state. Esc anywhere closes an open panel, as does scrolling the page. */
export function HelpTip(props: Omit<ViewProps, "open" | "position" | "onEvent">) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TipPosition>(null);
  const anchor = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function onEvent(event: TipEvent) {
    const next = nextTipOpen(open, event);
    if (next && !open && anchor.current) setPosition(tipPosition(anchor.current.getBoundingClientRect(), window.innerWidth));
    setOpen(next);
  }

  return <span ref={anchor} className="inline-flex"><HelpTipView {...props} open={open} position={position} onEvent={onEvent} /></span>;
}
