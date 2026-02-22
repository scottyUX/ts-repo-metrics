"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PerFileEntry } from "@/lib/reportTypes";

const HIGH_COMPLEXITY = 10;
const LONG_FUNCTION = 50;

interface FileDetailSheetProps {
  file: PerFileEntry | null;
  onClose: () => void;
}

export function FileDetailSheet({ file, onClose }: FileDetailSheetProps) {
  return (
    <Sheet open={!!file} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        {file && (
          <ScrollArea className="h-full">
            <SheetHeader>
              <SheetTitle className="font-mono text-sm break-all">
                {file.file}
              </SheetTitle>
              <SheetDescription>
                {file.functions} function{file.functions !== 1 ? "s" : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(file.functionsByType).map(([type, count]) => (
                  <Badge key={type} variant="secondary">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
              <div>
                <h4 className="font-medium mb-2">Functions</h4>
                <ul className="space-y-2">
                  {file.functionMetrics.map((fm, i) => {
                    const comp = file.complexity[i];
                    const isHigh = comp?.complexity >= HIGH_COMPLEXITY;
                    const isLong = fm.lines >= LONG_FUNCTION;
                    return (
                      <li
                        key={`${fm.name}-${fm.startLine}`}
                        className="flex flex-wrap items-center gap-2 text-sm border-b pb-2 last:border-0"
                      >
                        <span className="font-medium">{fm.name}</span>
                        <span className="text-muted-foreground">({fm.type})</span>
                        <span>L{fm.startLine}</span>
                        <span>{fm.lines} lines</span>
                        <span>nesting: {fm.maxNestingDepth}</span>
                        <span>CC: {comp?.complexity ?? "—"}</span>
                        {isHigh && <Badge variant="destructive">High CC</Badge>}
                        {isLong && <Badge variant="secondary">Long</Badge>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
