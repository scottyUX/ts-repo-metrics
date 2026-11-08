"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MetricHelpButton } from "./MetricGlossary";
import { functionLabel } from "@/lib/functionLabel";
import type { Phase2FunctionRow, Phase2Summary } from "@/lib/phase2Summary";
import {
  phase2HalsteadVolumeCellClass,
  phase2TrafficCellClass,
} from "@/lib/phase2Traffic";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 10;
const VISIBLE_STEP = 5;

interface Phase2TopComplexityOutliersTableProps {
  /** Functions with full Halstead + cognitive + MI_norm; parent sorts cognitive desc, Halstead desc. */
  sortedOutliers: Phase2FunctionRow[];
  summary: Phase2Summary;
  showReact: boolean;
  className?: string;
}

export function Phase2TopComplexityOutliersTable({
  sortedOutliers,
  summary,
  showReact,
  className,
}: Phase2TopComplexityOutliersTableProps) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [selected, setSelected] = useState<Phase2FunctionRow | null>(null);

  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
  }, [sortedOutliers]);

  const slice = useMemo(() => sortedOutliers.slice(0, visible), [sortedOutliers, visible]);
  const remaining = sortedOutliers.length - visible;

  return (
    <>
      <section
        id="code-complexity-top-outliers"
        aria-labelledby="code-complexity-top-outliers-heading"
        className={cn(className)}
      >
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle id="code-complexity-top-outliers-heading" className="text-lg">
                  Top Complexity Outliers
                </CardTitle>
                <p className="max-w-2xl text-sm leading-snug text-muted-foreground">
                  These functions have the highest Halstead volume and cognitive complexity. Simplifying them will
                  improve your overall score.
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground sm:max-w-[200px] sm:pt-1 sm:text-right">
                Functions with highest cognitive load first
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sortedOutliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No complexity outliers to rank yet.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Function</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">
                        <MetricHelpButton metricId="halstead" label="Halstead V" align="right" />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricHelpButton metricId="cognitive" label="Cognitive" align="right" />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricHelpButton metricId="mi" label="MI_norm" align="right" />
                      </TableHead>
                      {showReact ? (
                        <TableHead>
                          <MetricHelpButton metricId="reactShare" label="React?" align="left" />
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slice.map((row) => {
                      const fn = row.fn;
                      const vol = fn.halstead!.volume;
                      return (
                        <TableRow
                          key={`${row.file}:${fn.name}:${fn.startLine}`}
                          className="cursor-pointer"
                          onClick={() => setSelected(row)}
                        >
                          <TableCell
                            className="max-w-[160px] font-medium"
                          >
                            {functionLabel(fn.name, fn.startLine)}
                          </TableCell>
                          <TableCell
                            className="max-w-[220px] truncate font-mono text-xs text-muted-foreground"
                            title={row.file}
                          >
                            {row.file}
                          </TableCell>
                          <TableCell
                            className={phase2HalsteadVolumeCellClass(
                              vol,
                              summary.halsteadVolMean,
                              summary.halsteadVolP90,
                            )}
                          >
                            {vol.toFixed(1)}
                          </TableCell>
                          <TableCell
                            className={phase2TrafficCellClass(fn.cognitiveComplexity!, "cognitive")}
                          >
                            {fn.cognitiveComplexity}
                          </TableCell>
                          <TableCell
                            className={phase2TrafficCellClass(fn.maintainabilityIndexGradAiNorm!, "mi")}
                          >
                            {fn.maintainabilityIndexGradAiNorm!.toFixed(1)}
                          </TableCell>
                          {showReact ? (
                            <TableCell className="text-muted-foreground">
                              {fn.isReactComponent ? "yes" : "no"}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {remaining > 0 || visible > INITIAL_VISIBLE ? (
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-1">
                    {remaining > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setVisible((v) => Math.min(v + VISIBLE_STEP, sortedOutliers.length))
                        }
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Show {Math.min(VISIBLE_STEP, remaining)} more functions →
                      </button>
                    ) : null}
                    {visible > INITIAL_VISIBLE ? (
                      <button
                        type="button"
                        onClick={() => setVisible(INITIAL_VISIBLE)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        ← Show less
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {remaining === 0 && sortedOutliers.length > 0 ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Showing all {sortedOutliers.length} ranked functions.
                  </p>
                ) : null}
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Tip: Cognitive complexity above 8 is elevated; above 15 is high risk. MI_norm below 65 indicates poor
                  maintainability per GRAD-AI bands—see threshold calibration below.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.fn.name}</SheetTitle>
                <SheetDescription>
                  {selected.file} · Line {selected.fn.startLine}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Halstead V:</strong> {selected.fn.halstead!.volume.toFixed(1)}
                </p>
                <p>
                  <strong>Cognitive:</strong> {selected.fn.cognitiveComplexity}
                </p>
                <p>
                  <strong>MI norm:</strong> {selected.fn.maintainabilityIndexGradAiNorm!.toFixed(1)}
                </p>
                <p>
                  <strong>Cyclomatic (CC):</strong> {selected.fn.cyclomaticComplexity}
                </p>
                {showReact ? (
                  <p>
                    <strong>React component:</strong> {selected.fn.isReactComponent ? "yes" : "no"}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
