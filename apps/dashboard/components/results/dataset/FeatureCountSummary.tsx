"use client";

import { Badge } from "@/components/ui/badge";
import {
  buildFeatureVector,
  getFeaturesByCategoryCount,
} from "@/lib/featureVector";
import type { RepoReport } from "@/lib/reportTypes";

interface FeatureCountSummaryProps {
  report: RepoReport;
}

export function FeatureCountSummary({ report }: FeatureCountSummaryProps) {
  const vec = buildFeatureVector(report);
  const total = Object.keys(vec).length;
  const byCategory = getFeaturesByCategoryCount(vec);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div>
        <span className="text-sm text-muted-foreground">Total features: </span>
        <Badge variant="secondary">{total}</Badge>
      </div>
      {Object.entries(byCategory).map(([cat, count]) => (
        <div key={cat}>
          <span className="text-sm text-muted-foreground">{cat}: </span>
          <Badge variant="outline">{count}</Badge>
        </div>
      ))}
    </div>
  );
}
