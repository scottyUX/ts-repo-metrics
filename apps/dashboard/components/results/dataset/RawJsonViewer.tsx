"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

interface RawJsonViewerProps {
  data: unknown;
}

export function RawJsonViewer({ data }: RawJsonViewerProps) {
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [data]);

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
        <Copy className="size-4" />
        Copy to clipboard
      </Button>
      <div className="rounded-md border bg-muted/30 p-4 overflow-auto max-h-[500px]">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
