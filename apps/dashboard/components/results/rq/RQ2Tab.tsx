"use client";

import { useMemo } from "react";
import { MetricCard } from "../MetricCard";
import { RQFramingHeader } from "./RQFramingHeader";
import { RQ2Quadrant } from "./RQ2Quadrant";
import type { RepoReport } from "@/lib/reportTypes";

interface RQ2TabProps {
  report: RepoReport;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3);
}

export function RQ2Tab({ report }: RQ2TabProps) {
  const profile = report.profile;
  const gv2 = report.gitMetricsV2;
  const complexity = report.complexity;
  const smells = report.smells;

  const testLoc = profile?.testLOC ?? 0;
  const sourceLoc = profile?.sourceLOC ?? 1;
  const testLocRatio = sourceLoc > 0 ? testLoc / sourceLoc : 0;
  const pctCommitsTouchingTests =
    gv2?.testCoupling?.pctCommitsTouchingTests ?? 0;
  const refactorCommitRatio =
    gv2?.refactorBehavior?.refactorCommitRatio ?? 0;
  const highComplexityCount = complexity?.highComplexityFunctions ?? 0;
  const longFunctionCount = smells?.longFunctions ?? 0;
  const maxComplexity = complexity?.max ?? 0;
  const emptyCatchBlocks = smells?.emptyCatchBlocks ?? 0;
  const consoleLogCount = smells?.consoleLogs ?? 0;
  const testFiles = profile?.testFiles ?? 0;

  const { riskIndex, verificationIndex, riskLabel, verificationLabel } =
    useMemo(() => {
      const riskRaw = highComplexityCount + longFunctionCount;
      const riskIndex = Math.min(1, riskRaw / 20);
      const verificationIndex = Math.min(1, testLocRatio * 5);
      const riskLabel: "Low" | "High" = riskRaw >= 10 ? "High" : "Low";
      const verificationLabel: "Low" | "High" =
        testLocRatio >= 0.1 ? "High" : "Low";
      return {
        riskIndex,
        verificationIndex,
        riskLabel,
        verificationLabel,
      };
    }, [highComplexityCount, longFunctionCount, testLocRatio]);

  return (
    <div className="space-y-8">
      <RQFramingHeader rq="RQ2" />
      <section>
        <h2 className="text-lg font-semibold mb-4">A. Verification Effort</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Test LOC"
            value={testLoc}
            rq="RQ2"
            tooltip="Lines of code in test files"
          />
          <MetricCard
            label="Source LOC"
            value={sourceLoc}
            rq="RQ2"
            tooltip="Lines of code in non-test files"
          />
          <MetricCard
            label="Test LOC ratio"
            value={formatNumber(testLocRatio)}
            rq="RQ2"
            tooltip="testLOC / sourceLOC"
          />
          <MetricCard
            label="Test files"
            value={testFiles}
            rq="RQ2"
            tooltip="Files matching *.test.ts, *.spec.ts, etc."
          />
          <MetricCard
            label="% commits touching tests"
            value={`${formatNumber(pctCommitsTouchingTests)}%`}
            rq="RQ2"
            tooltip="Percent of commits that modify test files"
          />
          <MetricCard
            label="Empty catch blocks"
            value={emptyCatchBlocks}
            rq="RQ2"
            tooltip="Catch clauses with empty body"
          />
          <MetricCard
            label="Console log count"
            value={consoleLogCount}
            rq="RQ2"
            tooltip="console.log/warn/error calls"
          />
          <MetricCard
            label="Refactor commit ratio"
            value={`${formatNumber(refactorCommitRatio)}%`}
            rq="RQ2"
            tooltip="% commits with refactor/cleanup in message"
          />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">B. Risk Exposure (minimal)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="High complexity count"
            value={highComplexityCount}
            rq="RQ2"
            tooltip="Functions with complexity ≥ 10"
          />
          <MetricCard
            label="Long function count"
            value={longFunctionCount}
            rq="RQ2"
            tooltip="Functions > 50 lines"
          />
          <MetricCard
            label="Max complexity"
            value={maxComplexity}
            rq="RQ2"
            tooltip="Highest single-function complexity"
          />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">C. Risk vs Verification Profile</h2>
        <RQ2Quadrant
          riskIndex={riskIndex}
          verificationIndex={verificationIndex}
          riskLabel={riskLabel}
          verificationLabel={verificationLabel}
        />
      </section>
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30 p-4 text-sm">
        <p className="text-amber-900 dark:text-amber-100">
          Cognitive engagement is measured via survey and correlated later.
        </p>
        <p className="mt-2 text-amber-800 dark:text-amber-200 font-medium">
          RQ Mapping: RQ2
        </p>
      </div>
    </div>
  );
}
