"use client";

import { Badge } from "@/components/ui/badge";
import type { RQId } from "@/lib/rqConfig";
import { RQ_CONFIGS } from "@/lib/rqConfig";

interface RQFramingHeaderProps {
  rq: RQId;
}

export function RQFramingHeader({ rq }: RQFramingHeaderProps) {
  const config = RQ_CONFIGS[rq];
  if (!config) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="default">{config.id}</Badge>
        <span className="font-semibold">{config.title}</span>
      </div>
      <p className="text-sm font-medium">{config.question}</p>
      <p className="text-sm text-muted-foreground">
        Operationalization: {config.operationalization}
      </p>
    </div>
  );
}
