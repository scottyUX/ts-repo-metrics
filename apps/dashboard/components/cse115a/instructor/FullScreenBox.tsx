"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";

// "Full screen" for one review box (#448): the spec box or a diff box over the whole window, at full width and
// scrolling, with the same tools as on the page. Radix's modal dialog (as the review page's other dialogs) keeps focus
// inside, stops the page behind from scrolling, closes on Esc and returns focus to the "Full screen" button. Nothing is
// saved by opening or closing it, and no score field is inside. Staff only.

const SMALL_BUTTON = "rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

/** The dialog's box over the whole window; tailwind-merge drops the centred, narrow defaults of DialogContent. */
export const FULL_SCREEN_CLASS = "inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none";

type ViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's heading, naming the box: "Task 1 · patch", "Task spec · docs/tasks/x.md". */
  title: string;
  /** The box for the button's label: "the task spec" gives "Show the task spec full screen". */
  what: string;
  /** The box's buttons (Formatted / Raw, Copy), shown beside the heading. */
  tools?: ReactNode;
  children: ReactNode;
};

/** The button and the dialog without state, so a test can call it and look at what it builds. */
export function FullScreenView({ open, onOpenChange, title, what, tools, children }: ViewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button type="button" aria-label={REVIEW_TEXT.fullScreenLabel(what)} className={SMALL_BUTTON}>{REVIEW_TEXT.fullScreen}</button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} aria-modal="true" aria-describedby={undefined} className={FULL_SCREEN_CLASS}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <DialogTitle className="mr-auto text-base">{title}</DialogTitle>
          {tools}
          <DialogClose asChild>
            <button type="button" className={SMALL_BUTTON}>{REVIEW_TEXT.close}</button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{open ? children : null}</div>
      </DialogContent>
    </Dialog>
  );
}

/** "Full screen" beside "Show full height": opens this one box in a dialog over the whole window. */
export function FullScreenBox(props: Omit<ViewProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return <FullScreenView {...props} open={open} onOpenChange={setOpen} />;
}
