import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HotspotTables } from "@/components/results/HotspotTables";
import { functionLabel } from "@/lib/functionLabel";
import type { PerFileEntry, RepoReport } from "@/lib/reportTypes";

/** One file with these functions, each [name, start line]. */
function file(functions: [string, number][]): PerFileEntry {
  return {
    file: "src/a.ts",
    functions: functions.length,
    functionsByType: {},
    functionMetrics: functions.map(([name, startLine]) => ({
      name,
      type: "arrow_function",
      startLine,
      lines: 5,
      maxNestingDepth: 1,
      parameterCount: 0,
    })),
    complexity: functions.map(([name, startLine]) => ({ name, type: "arrow_function", startLine, complexity: 3 })),
  };
}

describe("function label", () => {
  it("adds the line number to unnamed functions only (#255)", () => {
    expect(functionLabel("(anonymous)", 42)).toBe("(anonymous) · Line 42");
    expect(functionLabel("parseInput", 42)).toBe("parseInput");
  });

  it("lets the hotspots table tell two unnamed functions in one file apart", () => {
    const report = { perFile: [file([["(anonymous)", 3], ["(anonymous)", 9], ["parseInput", 15]])] } as unknown as RepoReport;
    const html = renderToStaticMarkup(createElement(HotspotTables, { report }));
    expect(html).toContain("(anonymous) · Line 3");
    expect(html).toContain("(anonymous) · Line 9");
    expect(html).toContain("parseInput");
    expect(html).not.toContain("parseInput · Line");
  });
});