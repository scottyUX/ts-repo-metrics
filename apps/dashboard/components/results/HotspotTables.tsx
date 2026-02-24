"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RepoReport, PerFileEntry, FunctionDetail, FunctionComplexity } from "@/lib/reportTypes";

const HIGH_COMPLEXITY = 10;
const LONG_FUNCTION = 50;

function mergeHotspots(report: RepoReport): Array<{
  name: string;
  file: string;
  startLine: number;
  lines: number;
  complexity: number;
}> {
  const out: Array<{
    name: string;
    file: string;
    startLine: number;
    lines: number;
    complexity: number;
  }> = [];
  for (const pf of report.perFile) {
    for (let i = 0; i < pf.functionMetrics.length; i++) {
      const fm = pf.functionMetrics[i] as FunctionDetail;
      const comp = pf.complexity[i] as FunctionComplexity;
      if (fm && comp) {
        out.push({
          name: fm.name,
          file: pf.file,
          startLine: fm.startLine,
          lines: fm.lines,
          complexity: comp.complexity,
        });
      }
    }
  }
  return out;
}

interface HotspotTablesProps {
  report: RepoReport;
}

export function HotspotTables({ report }: HotspotTablesProps) {
  const [selected, setSelected] = useState<{
    name: string;
    file: string;
    startLine: number;
    lines: number;
    complexity: number;
  } | null>(null);

  const hotspots = mergeHotspots(report);
  const byComplexity = [...hotspots].sort((a, b) => b.complexity - a.complexity).slice(0, 10);
  const byLines = [...hotspots].sort((a, b) => b.lines - a.lines).slice(0, 10);

  const handleRowClick = (row: (typeof byComplexity)[0]) => {
    setSelected(row);
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 by Complexity</CardTitle>
            <CardDescription>Highest cyclomatic complexity</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Complexity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byComplexity.map((row, i) => (
                  <TableRow
                    key={`c-${i}`}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[150px]">
                      {row.file}
                    </TableCell>
                    <TableCell>{row.startLine}</TableCell>
                    <TableCell>{row.lines}</TableCell>
                    <TableCell>
                      {row.complexity >= HIGH_COMPLEXITY ? (
                        <Badge variant="destructive">High</Badge>
                      ) : (
                        row.complexity
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 by Lines</CardTitle>
            <CardDescription>Longest functions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Complexity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLines.map((row, i) => (
                  <TableRow
                    key={`l-${i}`}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[150px]">
                      {row.file}
                    </TableCell>
                    <TableCell>{row.startLine}</TableCell>
                    <TableCell>
                      {row.lines >= LONG_FUNCTION ? (
                        <Badge variant="secondary">Long</Badge>
                      ) : (
                        row.lines
                      )}
                    </TableCell>
                    <TableCell>{row.complexity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.file} · Line {selected.startLine}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 text-sm">
                <p><strong>Lines:</strong> {selected.lines} {selected.lines >= LONG_FUNCTION && "(Long)"}</p>
                <p><strong>Complexity:</strong> {selected.complexity} {selected.complexity >= HIGH_COMPLEXITY && "(High)"}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
