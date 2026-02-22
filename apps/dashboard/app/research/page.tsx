/**
 * Research page: Metric Glossary (Story 3.1).
 * Definitions and thresholds for all KPIs.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KPI_DEFINITIONS, THRESHOLDS } from "@/lib/metricGlossary";

export const metadata = {
  title: "Research | Repo Metrics",
  description: "Metric definitions and thresholds for Repo Metrics",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Metric Glossary</h1>
      <p className="text-muted-foreground">
        Definitions and thresholds used in the dashboard. Interpretation is
        consistent and defensible for research use.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Thresholds</CardTitle>
          <CardDescription>Values used to flag risk</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>High complexity:</strong> ≥ {THRESHOLDS.highComplexity}
            (cyclomatic complexity)
          </p>
          <p>
            <strong>Long function:</strong> ≥ {THRESHOLDS.longFunction} LOC
          </p>
          <p>
            <strong>Deep nesting:</strong> ≥ {THRESHOLDS.deepNesting} levels
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KPI Definitions</CardTitle>
          <CardDescription>Hover over KPIs in the dashboard for tooltips</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(KPI_DEFINITIONS).map(([key, def]) => (
            <div key={key}>
              <h3 className="font-medium text-sm capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </h3>
              <p className="text-muted-foreground text-sm">{def}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
