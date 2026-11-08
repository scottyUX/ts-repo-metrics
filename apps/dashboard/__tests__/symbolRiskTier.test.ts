import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SymbolRiskTable } from "@/components/results/rq/SymbolRiskTable";
import type { SymbolVerificationRisk } from "@/lib/reportTypes";
import { tierFromRisk } from "@/lib/symbolRiskViz";

/** A complexity-37 function, the example from #263, with the engine's risk score for its test link. */
function row(
  evidence: SymbolVerificationRisk["evidence"],
  verificationScore: number,
  riskScore: number,
): SymbolVerificationRisk {
  return {
    file: "src/a.ts",
    name: "parseInput",
    startLine: 1,
    cyclomaticComplexity: 37,
    verificationScore,
    evidence,
    riskScore,
  };
}

describe("risk tier", () => {
  it("drops as the test link gets stronger (#263)", () => {
    expect(tierFromRisk(row("none", 0, 37))).toBe("critical");
    expect(tierFromRisk(row("paired_file_only", 0.3, 25.9))).toBe("high");
    expect(tierFromRisk(row("referenced_in_test", 1, 0))).toBe("low");
  });

  it("does not tell a fully tested function to prioritize tests", () => {
    const html = renderToStaticMarkup(
      createElement(SymbolRiskTable, { rows: [row("referenced_in_test", 1, 0)] }),
    );
    expect(html).toContain("Monitor during changes.");
    expect(html).not.toContain("Prioritize tests or decompose.");
  });
});