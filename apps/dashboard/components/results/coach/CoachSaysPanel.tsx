import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CoachInsightTone } from "./CoachInsightTone";
import { CoachPointerStrip } from "./CoachPointerStrip";
import { CoachSaysEyebrow } from "./CoachSaysEyebrow";

export interface CoachSaysPanelProps {
  className?: string;
  eyebrow?: string;
  positive: {
    title?: string;
    body: React.ReactNode;
  };
  concern: {
    title?: string;
    body: React.ReactNode;
    /** critical = red accent; needs_work (or steady weakest) = amber accent. */
    variant?: "critical" | "moderate";
  };
  pointer?: React.ReactNode;
  footerLink?: {
    href: string;
    label: React.ReactNode;
    /** Prefer this for SPA tab switching (e.g. results dashboard). */
    onNavigate?: () => void;
  };
}

export function CoachSaysPanel({
  className,
  eyebrow = "YOUR COACH SAYS",
  positive,
  concern,
  pointer,
  footerLink,
}: CoachSaysPanelProps) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      {eyebrow ? <CoachSaysEyebrow>{eyebrow}</CoachSaysEyebrow> : null}
      <CoachInsightTone tone="positive" title={positive.title}>
        {positive.body}
      </CoachInsightTone>
      <CoachInsightTone
        tone={concern.variant === "critical" ? "concern" : "opportunityModerate"}
        title={concern.title}
      >
        {concern.body}
      </CoachInsightTone>
      {pointer || footerLink ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
          {pointer ? <CoachPointerStrip className="min-w-0 flex-1">{pointer}</CoachPointerStrip> : null}
          {footerLink ? (
            footerLink.onNavigate ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={footerLink.onNavigate}
              >
                {footerLink.label}
              </Button>
            ) : (
              <Button variant="default" size="sm" className="shrink-0 self-start sm:self-center" asChild>
                <Link href={footerLink.href}>{footerLink.label}</Link>
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
