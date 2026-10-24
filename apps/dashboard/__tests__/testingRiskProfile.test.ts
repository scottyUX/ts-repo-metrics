import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TestingMetricsTab } from "@/components/results/rq/TestingMetricsTab";
import { TooltipProvider } from "@/components/ui/tooltip";
import { COMMIT_HABITS_SCOPE_TEAM } from "@/lib/commitHabitsScopeMetrics";
import type { RepoReport } from "@/lib/reportTypes";
import { visibleText } from "./helpers/visibleText";

// The risk profile reads only these fields.
function report(highComplexityFunctions: number, longFunctions: number, highComplexityOrLongFunctions?: number): RepoReport {
  return {
    complexity: { average: 0, max: 0, highComplexityFunctions },
    smells: { longFunctions, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 },
    highComplexityOrLongFunctions,
    profile: { sourceLOC: 100, testLOC: 10 },
  } as unknown as RepoReport;
}

/** Visible text of the structural risk half of "Your risk profile". */
function structuralRiskText(r: RepoReport): string {
  const html = renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(TestingMetricsTab, { report: r, scopeId: COMMIT_HABITS_SCOPE_TEAM, onScopeIdChange: () => {} }),
    ),
  );
  const text = visibleText(html);
  return text.slice(text.indexOf("Structural risk score"), text.indexOf("Verification score"));
}

describe("Your risk profile", () => {
  it("scores each high-complexity or long function once (#258)", () => {
    // Six functions, each both high-complexity and long.
    const text = structuralRiskText(report(6, 6, 6));
    expect(text).toContain("From 6 high-complexity + 6 long functions (6 distinct)");
    expect(text).toContain("30%");
    expect(text).toContain("Low band");
    expect(text).not.toContain("High band");
  });

  it("adds the two counts on reports from before the engine counted them once", () => {
    const text = structuralRiskText(report(6, 6));
    expect(text).toContain("From 6 high-complexity + 6 long functions (12 combined)");
    expect(text).toContain("60%");
    expect(text).toContain("High band");
  });
});