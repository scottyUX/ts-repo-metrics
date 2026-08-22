import * as React from "react";

import { cn } from "@/lib/utils";

const toneStyles = {
  positive: "border-l-success",
  /** Highest severity opportunity framing (matches “Critical” tier). */
  concern: "border-l-destructive",
  /** Needs-work opportunity framing — forward-looking, not punitive. */
  opportunityModerate: "border-l-amber-500",
  informational: "border-l-primary",
} as const;

export type CoachInsightToneKind = keyof typeof toneStyles;

export interface CoachInsightToneProps extends React.ComponentProps<"div"> {
  tone: CoachInsightToneKind;
  title?: string;
  /** Applied to the body wrapper (below title). */
  bodyClassName?: string;
  children: React.ReactNode;
}

export function CoachInsightTone({
  tone,
  title,
  bodyClassName,
  children,
  className,
  ...props
}: CoachInsightToneProps) {
  return (
    <div
      data-slot="coach-insight-tone"
      data-tone={tone}
      className={cn(
        "rounded-md border border-border border-l-4 bg-card px-4 py-4 shadow-none sm:px-5 sm:py-5",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {title ? (
        <p className="text-base font-semibold leading-snug text-foreground">
          {title}
        </p>
      ) : null}
      <div
        className={cn(
          "text-pretty break-words text-sm leading-relaxed text-muted-foreground",
          title && "mt-2",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
