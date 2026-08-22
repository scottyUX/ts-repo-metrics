import * as React from "react";

import { cn } from "@/lib/utils";

export interface CoachSaysSurfaceProps extends React.ComponentProps<"div"> {
  /** Thick left rail, matching GitHub boxed insight cards. */
  showAccent?: boolean;
}

export function CoachSaysSurface({
  className,
  showAccent = true,
  ...props
}: CoachSaysSurfaceProps) {
  return (
    <div
      data-slot="coach-says-surface"
      className={cn(
        "w-full min-w-0 rounded-md border border-border bg-card text-card-foreground shadow-none",
        showAccent && "border-l-4 border-l-success",
        "px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
      {...props}
    />
  );
}
