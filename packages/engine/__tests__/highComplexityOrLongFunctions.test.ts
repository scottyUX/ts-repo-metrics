/**
 * A function that is both high-complexity and long counts once (#258).
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";

/** A function with `branches` if-statements and `padding` extra lines. */
function fn(name: string, branches: number, padding: number): string {
  const ifs = "  if (a > 0) a -= 1;\n".repeat(branches);
  const pad = "  a += 1;\n".repeat(padding);
  return `export function ${name}(a: number): number {\n${ifs}${pad}  return a;\n}\n`;
}

describe("highComplexityOrLongFunctions", () => {
  it("counts a function that is both high-complexity and long once", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "risk-"));
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(
        path.join(root, "src", "a.ts"),
        [
          fn("both", 12, 40), // complexity 13, 55 lines
          fn("complexOnly", 12, 0), // complexity 13, 15 lines
          fn("longOnly", 0, 60), // complexity 1, 63 lines
          fn("atLimits", 9, 38), // complexity 10, 50 lines: neither
        ].join("\n"),
      );

      const report = await analyzeRepo(root);
      expect(report.complexity.highComplexityFunctions).toBe(2);
      expect(report.smells.longFunctions).toBe(2);
      expect(report.highComplexityOrLongFunctions).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});