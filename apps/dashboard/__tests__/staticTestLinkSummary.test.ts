import { describe, expect, it } from "vitest";
import { summarizeStaticTestLinks } from "@/lib/staticTestLinkSummary";
import type { SymbolVerificationRisk } from "@/lib/reportTypes";

function row(evidence: SymbolVerificationRisk["evidence"], pairedTestPath?: string): SymbolVerificationRisk {
  return {
    file: "src/cart.ts", name: "fn", startLine: 1, cyclomaticComplexity: 1,
    verificationScore: evidence === "none" ? 0 : 1, evidence, pairedTestPath, riskScore: 0,
  } as SymbolVerificationRisk;
}

describe("summarizeStaticTestLinks", () => {
  it("counts links from anywhere in the repo, and separately those in the PR", () => {
    // Maya's PR changes only src/cart.ts; src/cart.test.ts already existed (#286).
    const rows = [row("referenced_in_test", "src/cart.test.ts"), row("paired_file_only", "src/cart.test.ts")];
    const summary = summarizeStaticTestLinks(rows, ["src/cart.ts"]);
    expect(summary).toMatchObject({ total: 2, withSignal: 2, withSignalInPr: 0 });
  });

  it("counts a paired test that the PR changed", () => {
    const rows = [row("referenced_in_test", "src/cart.test.ts"), row("none")];
    const summary = summarizeStaticTestLinks(rows, ["src/cart.ts", "src/cart.test.ts"]);
    expect(summary).toMatchObject({ total: 2, withSignal: 1, withSignalInPr: 1, none: 1 });
  });

  it("has no in-PR count on a repository report", () => {
    const summary = summarizeStaticTestLinks([row("paired_file_only", "src/cart.test.ts")], undefined);
    expect(summary?.withSignalInPr).toBeNull();
  });

  it("is null with no rows", () => {
    expect(summarizeStaticTestLinks([], ["src/cart.ts"])).toBeNull();
  });
});