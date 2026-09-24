"use client";

import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RepoReport } from "@/lib/reportTypes";
import {
  UI_COMPLEXITY_CRITICAL_GT,
  UI_COMPLEXITY_HEALTHY_LT,
  UI_COMPLEXITY_HIGH_GT,
} from "@/lib/uiComplexityThresholds";
import { countUiComplexityBucketsPaired } from "@/lib/codeQualityScope";
import { ConceptHelpDialog } from "../ConceptHelpDialog";
import { CodeQualityComplexityDistributionHelpBody } from "./metricHelpContent";

function formatPct(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

interface CodeQualityComplexityDistributionCardProps {
  report: RepoReport;
}

export function CodeQualityComplexityDistributionCard({ report }: CodeQualityComplexityDistributionCardProps) {
  const percentHighInTop10 =
    report.distributions?.percent_high_complexity_in_top_10_percent_files ?? 0;
  const totalFunctions = report.totals?.functions ?? 0;

  const { highGtUi, criticalGtUi, moderateUi, healthyLtUi, totalPaired } = useMemo(
    () => countUiComplexityBucketsPaired(report.perFile ?? []),
    [report.perFile],
  );

  const healthyPct =
    totalPaired > 0 ? Math.round((healthyLtUi / totalPaired) * 1000) / 10 : 0;

  const concentrated = percentHighInTop10 >= 35;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Complexity Distribution</CardTitle>
            <ConceptHelpDialog title="Complexity Distribution" ariaLabel="About complexity distribution">
              <CodeQualityComplexityDistributionHelpBody />
            </ConceptHelpDialog>
          </div>
          <CardDescription className="mt-1.5 max-w-2xl">
            Where complexity is concentrated across analyzed functions.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 space-y-2 lg:col-span-4">
            <p className="text-4xl font-semibold tabular-nums text-amber-500 sm:text-5xl">
              {formatPct(percentHighInTop10)}%
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              High complexity concentration
            </p>
            <p className="text-sm text-muted-foreground">
              of high-complexity burden sits in the busiest files (top 10% by function count).
            </p>
          </div>

          <div className="col-span-12 space-y-4 text-sm leading-relaxed text-muted-foreground lg:col-span-5">
            {concentrated ? (
              <p>
                This is actually good news: the hardest functions are not spread evenly across the
                whole tree — they cluster in a smaller set of files. That means focused refactors on a
                handful of hotspots can move the needle quickly.
              </p>
            ) : (
              <p>
                High-complexity work is relatively spread across files. Expect coordination and
                incremental refactors across several areas rather than a single hotspot fix.
              </p>
            )}
            <div className="flex gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-50">
              <Lightbulb className="size-4 shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm">
                Fix the top five hotspots in the complexity tables below for a meaningful drop in
                structural complexity in this view.
              </p>
            </div>
          </div>

          <div className="col-span-12 space-y-3 text-sm lg:col-span-3 lg:border-l lg:border-border lg:pl-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total functions
              </p>
              <p className="text-lg font-semibold tabular-nums">{totalFunctions}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                High complexity (&gt; {UI_COMPLEXITY_HIGH_GT})
              </p>
              <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {highGtUi}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Critical complexity (&gt; {UI_COMPLEXITY_CRITICAL_GT})
              </p>
              <p className="text-lg font-semibold tabular-nums text-destructive">
                {criticalGtUi}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Moderate ({UI_COMPLEXITY_HEALTHY_LT}–{UI_COMPLEXITY_HIGH_GT})
              </p>
              <p className="text-lg font-semibold tabular-nums">{moderateUi}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Healthy functions (&lt; {UI_COMPLEXITY_HEALTHY_LT})
              </p>
              <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {healthyLtUi}
              </p>
            </div>
            {totalPaired > 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {healthyPct}% of functions in this view fall below complexity {UI_COMPLEXITY_HEALTHY_LT}.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
