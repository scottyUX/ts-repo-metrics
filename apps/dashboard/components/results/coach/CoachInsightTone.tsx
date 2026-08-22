import * as React from "react";

import { cn } from "@/lib/utils";

export type CoachInsightToneKind =
  | "positive"
  | "concern"
  | "opportunityModerate"
  | "informational";

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
        "rounded-md border border-border bg-card px-4 py-4 shadow-none sm:px-5 sm:py-5",
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
