"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  collectPhase2Rows,
  hasPhase2Block,
  tryGetPhase2Summary,
  type Phase2FunctionRow,
} from "@/lib/phase2Summary";
import type { RepoReport, FunctionDetail } from "@/lib/reportTypes";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MetricHelpButton,
  Phase2MethodologyCard,
  Phase2ReferencesFooter,
} from "./MetricGlossary";
import { Phase2ThresholdLegend } from "./Phase2ThresholdLegend";
import { phase2TrafficCellClass } from "@/lib/phase2Traffic";
import { hasReactUiScope } from "@/lib/hasReactUiScope";
import { Phase2WhatMetricsMeasure } from "./Phase2WhatMetricsMeasure";
import { Phase2CodeComplexityCoreSignals } from "./Phase2CodeComplexityCoreSignals";
import { Phase2AdditionalSignalsSection } from "./Phase2AdditionalSignalsSection";
import { Phase2TopComplexityOutliersTable } from "./Phase2TopComplexityOutliersTable";
import { Phase2ComplexityImprovementSection } from "./Phase2ComplexityImprovementSection";
import {
  Phase2MetricDeepDiveDialog,
  type Phase2DeepDiveId,
} from "./Phase2MetricDeepDiveDialog";
import { cn } from "@/lib/utils";

const CODE_COMPLEXITY_DETAIL_PAGE_SIZE = 25;

type DetailSortKey =
  | "file"
  | "name"
  | "cyclomatic"
  | "halstead"
  | "cognitive"
  | "miNorm"
  | "miRaw"
  | "react";

function initialSortDir(key: DetailSortKey): "asc" | "desc" {
  return key === "file" || key === "name" ? "asc" : "desc";
}

function compareNullableNum(
  a: number | null | undefined,
  b: number | null | undefined,
  asc: boolean,
): number {
  const aMissing = a === undefined || a === null || Number.isNaN(a);
  const bMissing = b === undefined || b === null || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const cmp = a - b;
  return asc ? cmp : -cmp;
}

function tieBreak(a: Phase2FunctionRow, b: Phase2FunctionRow): number {
  const fc = a.file.localeCompare(b.file);
  if (fc !== 0) return fc;
  const nc = a.fn.name.localeCompare(b.fn.name);
  if (nc !== 0) return nc;
  return (a.fn.startLine ?? 0) - (b.fn.startLine ?? 0);
}

function SortGlyph({
  active,
  dir,
  className,
}: {
  active: boolean;
  dir: "asc" | "desc";
  className?: string;
}) {
  if (!active) {
    return (
      <ChevronsUpDown className={cn("size-3 shrink-0 opacity-40", className)} aria-hidden />
    );
  }
  return dir === "asc" ? (
    <ChevronUp className={cn("size-3 shrink-0", className)} aria-hidden />
  ) : (
    <ChevronDown className={cn("size-3 shrink-0", className)} aria-hidden />
  );
}

interface Phase2ComplexityTabProps {
  report: RepoReport;
  onOpenCodeQualityTab?: () => void;
}

export function Phase2ComplexityTab({ report, onOpenCodeQualityTab }: Phase2ComplexityTabProps) {
  const showReact = hasReactUiScope(report);

  const [deepDive, setDeepDive] = useState<Phase2DeepDiveId | null>(null);

  const rows = useMemo(() => collectPhase2Rows(report), [report]);

  const [detailSortKey, setDetailSortKey] = useState<DetailSortKey>("cognitive");
  const [detailSortDir, setDetailSortDir] = useState<"asc" | "desc">("desc");

  const sortedDetailRows = useMemo(() => {
    const list = [...rows];
    const asc = detailSortDir === "asc";
    list.sort((a, b) => {
      let d = 0;
      switch (detailSortKey) {
        case "file":
          d = asc ? a.file.localeCompare(b.file) : b.file.localeCompare(a.file);
          break;
        case "name":
          d = asc ? a.fn.name.localeCompare(b.fn.name) : b.fn.name.localeCompare(a.fn.name);
          break;
        case "cyclomatic":
          d = compareNullableNum(a.fn.cyclomaticComplexity, b.fn.cyclomaticComplexity, asc);
          break;
        case "halstead":
          d = compareNullableNum(a.fn.halstead?.volume, b.fn.halstead?.volume, asc);
          break;
        case "cognitive":
          d = compareNullableNum(a.fn.cognitiveComplexity, b.fn.cognitiveComplexity, asc);
          break;
        case "miNorm":
          d = compareNullableNum(
            a.fn.maintainabilityIndexGradAiNorm,
            b.fn.maintainabilityIndexGradAiNorm,
            asc,
          );
          break;
        case "miRaw":
          d = compareNullableNum(
            a.fn.maintainabilityIndexGradAiRaw,
            b.fn.maintainabilityIndexGradAiRaw,
            asc,
          );
          break;
        case "react": {
          const va = a.fn.isReactComponent === true ? 1 : 0;
          const vb = b.fn.isReactComponent === true ? 1 : 0;
          d = asc ? va - vb : vb - va;
          break;
        }
        default:
          break;
      }
      if (d !== 0) return d;
      return tieBreak(a, b);
    });
    return list;
  }, [rows, detailSortKey, detailSortDir]);

  const [detailPage, setDetailPage] = useState(0);
  const detailPageCount = Math.max(1, Math.ceil(sortedDetailRows.length / CODE_COMPLEXITY_DETAIL_PAGE_SIZE));
  const currentDetailPage = Math.min(detailPage, detailPageCount - 1);
  const detailPageRows = sortedDetailRows.slice(
    currentDetailPage * CODE_COMPLEXITY_DETAIL_PAGE_SIZE,
    (currentDetailPage + 1) * CODE_COMPLEXITY_DETAIL_PAGE_SIZE,
  );
  const detailFromRow =
    sortedDetailRows.length === 0 ? 0 : currentDetailPage * CODE_COMPLEXITY_DETAIL_PAGE_SIZE + 1;
  const detailToRow =
    sortedDetailRows.length === 0
      ? 0
      : Math.min(sortedDetailRows.length, (currentDetailPage + 1) * CODE_COMPLEXITY_DETAIL_PAGE_SIZE);

  function toggleDetailSort(key: DetailSortKey) {
    setDetailPage(0);
    if (key === detailSortKey) {
      setDetailSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDetailSortKey(key);
      setDetailSortDir(initialSortDir(key));
    }
  }

  const hasMetrics = useMemo(() => rows.some((r) => hasPhase2Block(r.fn)), [rows]);

  const summary = useMemo(() => tryGetPhase2Summary(report), [report]);

  const sortedOutliers = useMemo(() => {
    const withFullLexical: { file: string; fn: FunctionDetail }[] = [];
    for (const row of rows) {
      if (hasPhase2Block(row.fn)) withFullLexical.push(row);
    }
    return [...withFullLexical].sort((a, b) => {
      const d = b.fn.cognitiveComplexity! - a.fn.cognitiveComplexity!;
      if (d !== 0) return d;
      return b.fn.halstead!.volume - a.fn.halstead!.volume;
    });
  }, [rows]);

  const topOutlier: Phase2FunctionRow | null = sortedOutliers[0] ?? null;

  if (!hasMetrics || !summary) {
    return (
      <div className="space-y-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Lexical and cognitive complexity metrics are not available for this report yet. Re-run analysis with the
          current <code className="rounded bg-muted px-1">@repo-metrics/engine</code>, or load a newer result.
        </p>
        <Phase2ComplexityImprovementSection
          topOutlier={null}
          onOpenCodeQualityTab={onOpenCodeQualityTab}
          hasPerFunctionLexicalMetrics={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Phase2WhatMetricsMeasure
        summary={summary}
        showReact={showReact}
        onOpenDeepDive={setDeepDive}
      />
      <Phase2CodeComplexityCoreSignals summary={summary} onOpenDeepDive={setDeepDive} />
      <Phase2AdditionalSignalsSection summary={summary} showReact={showReact} />
      <Phase2TopComplexityOutliersTable
        sortedOutliers={sortedOutliers}
        summary={summary}
        showReact={showReact}
      />

      <section
        id="per-function-metrics-table"
        aria-labelledby="per-function-metrics-heading"
        className="space-y-4"
      >
        <div>
          <h2 id="per-function-metrics-heading" className="text-lg font-semibold">
            Full function listing — lexical &amp; complexity metrics
          </h2>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-relaxed">
            Every analyzed function with cyclomatic complexity (CC), Halstead volume, cognitive complexity,
            maintainability index (normalized and raw),{showReact ? " React UI labeling," : ""} file path, and name.
            Cells show <span className="tabular-nums">—</span> when a value is not available for that row. Click a
            column header to sort ascending or descending; rank reflects the current sort across all functions.
          </p>
        </div>
        <Phase2ThresholdLegend />

        <div className="overflow-hidden rounded-md border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 min-w-[2.25rem] px-2 text-center text-muted-foreground">
                    <span className="sr-only">Rank</span>
                    <span aria-hidden>#</span>
                  </TableHead>
                  <TableHead className="min-w-[7rem]">
                    <button
                      type="button"
                      className="inline-flex max-w-full items-center gap-0.5 text-left font-medium hover:text-foreground"
                      onClick={() => toggleDetailSort("file")}
                    >
                      File
                      <SortGlyph active={detailSortKey === "file"} dir={detailSortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[6rem]">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                      onClick={() => toggleDetailSort("name")}
                    >
                      Name
                      <SortGlyph active={detailSortKey === "name"} dir={detailSortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                        onClick={() => toggleDetailSort("cyclomatic")}
                      >
                        CC
                        <SortGlyph active={detailSortKey === "cyclomatic"} dir={detailSortDir} />
                      </button>
                      <MetricHelpButton metricId="cyclomatic" label="" align="right" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                        onClick={() => toggleDetailSort("halstead")}
                      >
                        Halstead V
                        <SortGlyph active={detailSortKey === "halstead"} dir={detailSortDir} />
                      </button>
                      <MetricHelpButton metricId="halstead" label="" align="right" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                        onClick={() => toggleDetailSort("cognitive")}
                      >
                        Cognitive
                        <SortGlyph active={detailSortKey === "cognitive"} dir={detailSortDir} />
                      </button>
                      <MetricHelpButton metricId="cognitive" label="" align="right" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                        onClick={() => toggleDetailSort("miNorm")}
                      >
                        MI_norm
                        <SortGlyph active={detailSortKey === "miNorm"} dir={detailSortDir} />
                      </button>
                      <MetricHelpButton metricId="mi" label="" align="right" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => toggleDetailSort("miRaw")}
                    >
                      MI_raw
                      <SortGlyph active={detailSortKey === "miRaw"} dir={detailSortDir} />
                    </button>
                  </TableHead>
                  {showReact ? (
                    <TableHead>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 font-medium hover:text-foreground"
                          onClick={() => toggleDetailSort("react")}
                        >
                          React?
                          <SortGlyph active={detailSortKey === "react"} dir={detailSortDir} />
                        </button>
                        <MetricHelpButton metricId="reactShare" label="" align="left" />
                      </div>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailPageRows.map(({ file, fn }, i) => {
                  const rank = currentDetailPage * CODE_COMPLEXITY_DETAIL_PAGE_SIZE + i + 1;
                  return (
                    <TableRow key={`${file}:${fn.name}:${fn.startLine}`}>
                      <TableCell className="w-10 min-w-[2.25rem] px-2 text-center tabular-nums text-muted-foreground text-xs">
                        {rank}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs">{file}</TableCell>
                      <TableCell className="font-mono text-sm">{fn.name}</TableCell>
                      <TableCell className={phase2TrafficCellClass(fn.cyclomaticComplexity, "cc")}>
                        {fn.cyclomaticComplexity ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fn.halstead?.volume?.toFixed(1) ?? "—"}
                      </TableCell>
                      <TableCell className={phase2TrafficCellClass(fn.cognitiveComplexity, "cognitive")}>
                        {fn.cognitiveComplexity ?? "—"}
                      </TableCell>
                      <TableCell
                        className={phase2TrafficCellClass(fn.maintainabilityIndexGradAiNorm, "mi")}
                      >
                        {fn.maintainabilityIndexGradAiNorm?.toFixed(1) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fn.maintainabilityIndexGradAiRaw?.toFixed(1) ?? "—"}
                      </TableCell>
                      {showReact ? (
                        <TableCell>{fn.isReactComponent ? "yes" : "no"}</TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {sortedDetailRows.length > 0 ? (
            <div
              className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Function metrics table pagination"
            >
              <p className="text-xs text-muted-foreground">
                Rows {detailFromRow}–{detailToRow} of {sortedDetailRows.length}
                {detailPageCount > 1 ? ` · Page ${currentDetailPage + 1} of ${detailPageCount}` : null}
              </p>
              {detailPageCount > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentDetailPage <= 0}
                    onClick={() => setDetailPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentDetailPage >= detailPageCount - 1}
                    onClick={() =>
                      setDetailPage((p) => Math.min(detailPageCount - 1, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <details className="group rounded-xl border border-muted-foreground/25 bg-card text-card-foreground shadow-sm">
        <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-base font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
          <span>How metrics are computed &amp; glossary</span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground group-open:hidden"
            aria-hidden
          />
          <ChevronUp
            className="hidden size-4 shrink-0 text-muted-foreground group-open:inline"
            aria-hidden
          />
        </summary>
        <div className="border-t px-5 pb-5 pt-4">
          <Phase2MethodologyCard includeReactLens={showReact} />
        </div>
      </details>

      <Phase2ReferencesFooter />

      <Phase2ComplexityImprovementSection
        topOutlier={topOutlier}
        onOpenCodeQualityTab={onOpenCodeQualityTab}
        hasPerFunctionLexicalMetrics
      />

      <Phase2MetricDeepDiveDialog
        open={deepDive !== null}
        onOpenChange={(o) => {
          if (!o) setDeepDive(null);
        }}
        metricId={deepDive}
      />
    </div>
  );
}
