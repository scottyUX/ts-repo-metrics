"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { percentile } from "@/lib/distributionUtils";
import type { RepoReport } from "@/lib/reportTypes";

interface DistributionMetricsSectionProps {
  report: RepoReport;
}

export function DistributionMetricsSection({ report }: DistributionMetricsSectionProps) {
  const distributions = useMemo(() => {
    if (report.distributions) return report.distributions;

    const lengths: number[] = [];
    const complexities: number[] = [];
    for (const entry of report.perFile ?? []) {
      for (const fm of entry.functionMetrics ?? []) {
        lengths.push(fm.lines);
      }
      for (const c of entry.complexity ?? []) {
        complexities.push(c.complexity);
      }
    }
    lengths.sort((a, b) => a - b);
    complexities.sort((a, b) => a - b);

    let percentHighInTop10 = 0;
    const highComplexity = complexities.filter((c) => c >= 10);
    if (highComplexity.length > 0 && (report.perFile?.length ?? 0) > 0) {
      const fileSums = (report.perFile ?? []).map((p) => ({
        file: p.file,
        total: (p.complexity ?? []).reduce((s, c) => s + c.complexity, 0),
        high: (p.complexity ?? []).filter((c) => c.complexity >= 10).length,
      }));
      fileSums.sort((a, b) => b.total - a.total);
      const topCount = Math.max(1, Math.ceil(fileSums.length * 0.1));
      const topFiles = new Set(fileSums.slice(0, topCount).map((f) => f.file));
      const highInTop = (report.perFile ?? [])
        .filter((p) => topFiles.has(p.file))
        .reduce(
          (s, p) =>
            s + (p.complexity ?? []).filter((c) => c.complexity >= 10).length,
          0
        );
      percentHighInTop10 = Math.round((highInTop / highComplexity.length) * 1000) / 10;
    }

    return {
      p50_function_length: percentile(lengths, 50),
      p75_function_length: percentile(lengths, 75),
      p90_function_length: percentile(lengths, 90),
      p50_complexity: percentile(complexities, 50),
      p75_complexity: percentile(complexities, 75),
      p90_complexity: percentile(complexities, 90),
      percent_high_complexity_in_top_10_percent_files: percentHighInTop10,
    };
  }, [report]);

  const items = [
    { label: "p50 function length", key: "p50_function_length" as const },
    { label: "p75 function length", key: "p75_function_length" as const },
    { label: "p90 function length", key: "p90_function_length" as const },
    { label: "p50 complexity", key: "p50_complexity" as const },
    { label: "p75 complexity", key: "p75_complexity" as const },
    { label: "p90 complexity", key: "p90_complexity" as const },
    {
      label: "% high complexity in top 10% files",
      key: "percent_high_complexity_in_top_10_percent_files" as const,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tail Risk Indicators</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ label, key }) => (
            <div key={key} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{label}:</span>
              <span className="font-mono">{distributions[key]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
