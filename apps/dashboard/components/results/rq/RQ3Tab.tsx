"use client";

import { MetricCard } from "../MetricCard";
import { RQFramingHeader } from "./RQFramingHeader";
import { HotspotTables } from "../HotspotTables";
import { FileTable } from "../FileTable";
import type { RepoReport } from "@/lib/reportTypes";

interface RQ3TabProps {
  report: RepoReport;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function RQ3Tab({ report }: RQ3TabProps) {
  const r = report;
  const dist = r.distributions;
  const comp = r.complexity;
  const fm = r.functionMetricsSummary;
  const smells = r.smells;

  const totalFunctions = r.totals?.functions ?? 0;
  const avgComplexity = comp?.average ?? 0;
  const maxComplexity = comp?.max ?? 0;
  const highComplexityCount = comp?.highComplexityFunctions ?? 0;
  const avgFunctionLength = fm?.averageLength ?? 0;
  const longFunctionCount = smells?.longFunctions ?? 0;
  const maxNestingDepth = fm?.maxNestingDepth ?? 0;
  const p90FunctionLength = dist?.p90_function_length ?? 0;
  const p90Complexity = dist?.p90_complexity ?? 0;
  const maintainabilityScore = r.maintainability?.score ?? 0;
  const maintainabilityClass = r.maintainability?.classification ?? "—";
  const duplicationPercent = r.duplication?.percentage ?? 0;
  const consoleLogCount = smells?.consoleLogs ?? 0;
  const emptyCatchBlocks = smells?.emptyCatchBlocks ?? 0;
  const longParamCount = smells?.longParameterLists ?? 0;
  const percentHighInTop10 =
    dist?.percent_high_complexity_in_top_10_percent_files ?? 0;

  return (
    <div className="space-y-8">
      <RQFramingHeader rq="RQ3" />
      <section>
        <h2 className="text-lg font-semibold mb-4">A. Structural Complexity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Total functions"
            value={totalFunctions}
            rq="RQ3"
            tooltip="Count of function-like AST nodes"
          />
          <MetricCard
            label="Avg complexity"
            value={formatNumber(avgComplexity)}
            rq="RQ3"
            tooltip="Mean cyclomatic complexity"
          />
          <MetricCard
            label="Max complexity"
            value={maxComplexity}
            rq="RQ3"
            tooltip="Highest single-function complexity"
          />
          <MetricCard
            label="High complexity count"
            value={highComplexityCount}
            rq="RQ3"
            tooltip="Functions with complexity ≥ 10"
          />
          <MetricCard
            label="Avg function length"
            value={formatNumber(avgFunctionLength)}
            rq="RQ3"
            tooltip="Mean line count"
          />
          <MetricCard
            label="Long function count"
            value={longFunctionCount}
            rq="RQ3"
            tooltip="Functions > 50 lines"
          />
          <MetricCard
            label="Max nesting depth"
            value={maxNestingDepth}
            rq="RQ3"
            tooltip="Deepest nesting level"
          />
          <MetricCard
            label="P90 function length"
            value={formatNumber(p90FunctionLength)}
            rq="RQ3"
            tooltip="90th percentile function length"
          />
          <MetricCard
            label="P90 complexity"
            value={formatNumber(p90Complexity)}
            rq="RQ3"
            tooltip="90th percentile complexity"
          />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">B. Maintainability & Hygiene</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Maintainability score"
            value={formatNumber(maintainabilityScore)}
            rq="RQ3"
            tooltip="Maintainability Index (0-100)"
          />
          <MetricCard
            label="Maintainability class"
            value={maintainabilityClass}
            rq="RQ3"
            tooltip="low / moderate / high"
          />
          <MetricCard
            label="Duplication %"
            value={`${formatNumber(duplicationPercent)}%`}
            rq="RQ3"
            tooltip="Duplicate code percentage"
          />
          <MetricCard
            label="Console log count"
            value={consoleLogCount}
            rq="RQ3"
            tooltip="console.log/warn/error calls"
          />
          <MetricCard
            label="Empty catch blocks"
            value={emptyCatchBlocks}
            rq="RQ3"
            tooltip="Catch clauses with empty body"
          />
          <MetricCard
            label="Long parameter list count"
            value={longParamCount}
            rq="RQ3"
            tooltip="Functions with > 4 parameters"
          />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">C. Distribution & Concentration</h2>
        <div className="space-y-4">
          <MetricCard
            label="% high complexity in top 10% files"
            value={`${formatNumber(percentHighInTop10)}%`}
            rq="RQ3"
            tooltip="Concentration of high-complexity functions in few files"
          />
          <HotspotTables report={report} />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">D. Per-File Table</h2>
        <FileTable report={report} />
      </section>
      <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30 p-4 text-sm">
        <p className="text-green-900 dark:text-green-100 font-medium">
          RQ Mapping: RQ3
        </p>
      </div>
    </div>
  );
}
