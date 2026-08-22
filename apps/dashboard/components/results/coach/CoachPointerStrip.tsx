import * as React from "react";

import { cn } from "@/lib/utils";

export interface CoachPointerStripProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

export function CoachPointerStrip({ className, children, ...props }: CoachPointerStripProps) {
  return (
    <div
      data-slot="coach-pointer-strip"
      className={cn(
        "text-sm leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
