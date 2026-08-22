import * as React from "react";

import { cn } from "@/lib/utils";

export interface CoachSaysSurfaceProps extends React.ComponentProps<"div"> {
  /** Kept for callers; accent rails are no longer drawn. */
  showAccent?: boolean;
}

export function CoachSaysSurface({
  className,
  showAccent: _showAccent = true,
  ...props
}: CoachSaysSurfaceProps) {
  return (
    <div
      data-slot="coach-says-surface"
      className={cn(
        "w-full min-w-0 rounded-md border border-border bg-card px-4 py-4 text-card-foreground shadow-none sm:px-5 sm:py-5",
        className,
      )}
      {...props}
    />
  );
}
