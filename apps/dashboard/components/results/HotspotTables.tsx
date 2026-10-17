"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
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
import { FileDetailSheet } from "./FileDetailSheet";
import { SeverityTableCell } from "./SeverityTableCell";
import { functionLabel } from "@/lib/functionLabel";
import { fileStats } from "@/lib/perFileStats";
import { isPrScopedReport } from "@/lib/analysisScope";
import type { RepoReport, FunctionDetail, FunctionComplexity, PerFileEntry } from "@/lib/reportTypes";
import {
  UI_COMPLEXITY_CRITICAL_GT,
  UI_COMPLEXITY_HIGH_GT,
} from "@/lib/uiComplexityThresholds";

const HIGH_COMPLEXITY = 10;
const LONG_FUNCTION = 50;
const INITIAL_VISIBLE = 10;
const VISIBLE_STEP = 10;

type HotspotRow = {
  name: string;
  file: string;
  startLine: number;
  lines: number;
  complexity: number;
};

function mergeHotspots(report: RepoReport): HotspotRow[] {
  const out: HotspotRow[] = [];
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

function RiskBadge({ complexity }: { complexity: number }) {
  if (complexity > UI_COMPLEXITY_CRITICAL_GT) {
    return <Badge variant="destructive">Critical</Badge>;
  }
  if (complexity > UI_COMPLEXITY_HIGH_GT) {
    return (
      <Badge className="border-0 bg-amber-950 font-medium text-amber-400 shadow-none hover:bg-amber-950">
        High
      </Badge>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

interface HotspotTablesProps {
  report: RepoReport;
}

export function HotspotTables({ report }: HotspotTablesProps) {
  const [selectedFunction, setSelectedFunction] = useState<HotspotRow | null>(null);
  const [selectedFile, setSelectedFile] = useState<PerFileEntry | null>(null);
  const [visibleComplexity, setVisibleComplexity] = useState(INITIAL_VISIBLE);
  const [visibleTopFiles, setVisibleTopFiles] = useState(INITIAL_VISIBLE);

  const hotspots = useMemo(() => mergeHotspots(report), [report]);
  const sortedByComplexity = useMemo(
    () => [...hotspots].sort((a, b) => b.complexity - a.complexity),
    [hotspots],
  );

  const topFilesByMaxComplexity = useMemo(() => {
    const rows = report.perFile.map((pf) => ({
      ...pf,
      ...fileStats(pf),
    }));
    rows.sort((a, b) => b.maxComplexity - a.maxComplexity);
    return rows;
  }, [report.perFile]);

  const visibleFunctions = sortedByComplexity.slice(0, visibleComplexity);
  const visibleFileRows = topFilesByMaxComplexity.slice(0, visibleTopFiles);

  const rowKey = (row: HotspotRow) => `${row.file}:${row.startLine}:${row.name}`;

  useEffect(() => {
    setVisibleComplexity(INITIAL_VISIBLE);
    setVisibleTopFiles(INITIAL_VISIBLE);
  }, [report.analysis_timestamp, report.source?.commit]);

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Top Complexity Hotspots</CardTitle>
                <p className="text-sm text-muted-foreground leading-snug max-w-2xl">
                  These are the highest-risk functions in {isPrScopedReport(report) ? "this pull request's files" : "your codebase"}. Start here when refactoring.
                </p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0 sm:pt-1 sm:text-right sm:max-w-[200px]">
                Functions to refactor first
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFunctions.map((row) => (
                  <TableRow
                    key={`c-${rowKey(row)}`}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedFile(null);
                      setSelectedFunction(row);
                    }}
                  >
                    <TableCell className="font-medium">{functionLabel(row.name, row.startLine)}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[180px] font-mono text-xs">
                      {row.file}
                    </TableCell>
                    <SeverityTableCell variant="sloc" value={row.lines} align="left" />
                    <SeverityTableCell variant="cyclomatic" value={row.complexity} />
                    <TableCell className="text-right">
                      <RiskBadge complexity={row.complexity} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visibleComplexity < sortedByComplexity.length || visibleComplexity > INITIAL_VISIBLE ? (
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-1">
                {visibleComplexity < sortedByComplexity.length ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleComplexity((v) =>
                        Math.min(v + VISIBLE_STEP, sortedByComplexity.length),
                      )
                    }
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Show {Math.min(VISIBLE_STEP, sortedByComplexity.length - visibleComplexity)} more
                    functions →
                  </button>
                ) : null}
                {visibleComplexity > INITIAL_VISIBLE ? (
                  <button
                    type="button"
                    onClick={() => setVisibleComplexity(INITIAL_VISIBLE)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    ← Show less
                  </button>
                ) : null}
              </div>
            ) : null}
            {visibleComplexity >= sortedByComplexity.length && sortedByComplexity.length > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                Showing all {sortedByComplexity.length} functions.
              </p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              Tip: Same bands as Complexity Distribution — above 10 is harder to test; above {UI_COMPLEXITY_HIGH_GT} is high; above {UI_COMPLEXITY_CRITICAL_GT} is critical.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Top Files to Refactor</CardTitle>
                <p className="text-sm text-muted-foreground leading-snug max-w-2xl">
                  These files contain the most complex code. Focus your refactoring efforts here first.
                </p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0 sm:pt-1 sm:text-right sm:max-w-[200px]">
                Files with highest complexity concentration
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Functions</TableHead>
                  <TableHead className="text-right">Max complexity</TableHead>
                  <TableHead className="text-right">Avg complexity</TableHead>
                  <TableHead className="text-right">Max nesting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFileRows.map((row) => (
                  <TableRow
                    key={row.file}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedFunction(null);
                      setSelectedFile(row);
                    }}
                  >
                    <TableCell className="font-mono text-xs truncate max-w-[220px]">{row.file}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.functions}</TableCell>
                    <SeverityTableCell variant="cyclomatic" value={row.maxComplexity} />
                    <SeverityTableCell variant="cyclomatic" value={row.avgComplexity}>
                      {row.avgComplexity.toFixed(1)}
                    </SeverityTableCell>
                    <SeverityTableCell variant="nesting" value={row.maxNesting} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              {topFilesByMaxComplexity.length > visibleTopFiles || visibleTopFiles > INITIAL_VISIBLE ? (
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                  {topFilesByMaxComplexity.length > visibleTopFiles ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleTopFiles((v) =>
                          Math.min(v + VISIBLE_STEP, topFilesByMaxComplexity.length),
                        )
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      Show {Math.min(VISIBLE_STEP, topFilesByMaxComplexity.length - visibleTopFiles)} more
                      files →
                    </button>
                  ) : null}
                  {visibleTopFiles > INITIAL_VISIBLE ? (
                    <button
                      type="button"
                      onClick={() => setVisibleTopFiles(INITIAL_VISIBLE)}
                      className="font-medium text-primary hover:underline"
                    >
                      ← Show less
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="text-center text-xs leading-relaxed">
                {report.perFile.length} files analyzed in total. Showing files with highest complexity
                concentration first.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={!!selectedFunction}
        onOpenChange={(open) => !open && setSelectedFunction(null)}
      >
        <SheetContent className="sm:max-w-lg">
          {selectedFunction && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedFunction.name}</SheetTitle>
                <SheetDescription>
                  {selectedFunction.file} · Line {selectedFunction.startLine}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Lines:</strong> {selectedFunction.lines}{" "}
                  {selectedFunction.lines >= LONG_FUNCTION && "(Long)"}
                </p>
                <p>
                  <strong>Complexity:</strong> {selectedFunction.complexity}{" "}
                  {selectedFunction.complexity >= HIGH_COMPLEXITY && "(elevated)"}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <strong>Risk:</strong>
                  <RiskBadge complexity={selectedFunction.complexity} />
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <FileDetailSheet file={selectedFile} onClose={() => setSelectedFile(null)} />
    </>
  );
}
