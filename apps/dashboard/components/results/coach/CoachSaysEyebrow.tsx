import * as React from "react";

import { cn } from "@/lib/utils";

export interface CoachSaysEyebrowProps extends React.ComponentProps<"p"> {
  children: string;
}

export function CoachSaysEyebrow({ className, children, ...props }: CoachSaysEyebrowProps) {
  if (!children.trim()) return null;

  return (
    <p
      data-slot="coach-says-eyebrow"
      className={cn(
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
