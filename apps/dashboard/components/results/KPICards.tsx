"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { RepoReport } from "@/lib/reportTypes";
import { KPI_DEFINITIONS } from "@/lib/metricGlossary";

interface KPICardsProps {
  report: RepoReport;
}

const KPIS = [
  {
    key: "filesAnalyzed",
    label: "Files Analyzed",
    get: (r: RepoReport) => r.filesAnalyzed,
  },
  {
    key: "totalFunctions",
    label: "Total Functions",
    get: (r: RepoReport) => r.totals.functions,
  },
  {
    key: "avgFunctionLength",
    label: "Avg Function Length",
    get: (r: RepoReport) => r.functionMetricsSummary.averageLength.toFixed(1),
  },
  {
    key: "maxFunctionLength",
    label: "Max Function Length",
    get: (r: RepoReport) => {
      const max = Math.max(
        ...r.perFile.flatMap((p) => p.functionMetrics.map((f) => f.lines)),
        0
      );
      return max;
    },
  },
  {
    key: "avgComplexity",
    label: "Avg Complexity",
    get: (r: RepoReport) => r.complexity.average.toFixed(1),
  },
  {
    key: "maxComplexity",
    label: "Max Complexity",
    get: (r: RepoReport) => r.complexity.max,
  },
  {
    key: "highComplexityCount",
    label: "High Complexity (≥10)",
    get: (r: RepoReport) => r.complexity.highComplexityFunctions,
  },
  {
    key: "longFunctionCount",
    label: "Long Functions (≥50 LOC)",
    get: (r: RepoReport) => r.smells.longFunctions,
  },
  {
    key: "maxNestingDepth",
    label: "Max Nesting Depth",
    get: (r: RepoReport) => r.functionMetricsSummary.maxNestingDepth,
  },
];

export function KPICards({ report }: KPICardsProps) {
  return (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPIS.map((kpi) => {
          const value = kpi.get(report);
          const def = KPI_DEFINITIONS[kpi.key];
          return (
            <Card key={kpi.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {kpi.label}
                </CardTitle>
                {def && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{def}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
