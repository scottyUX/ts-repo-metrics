/**
 * Regression tests for the jscpd ignore-glob fix (Bug 1).
 *
 * jscpd matches `--ignore` entries as GLOB patterns. The engine previously sent
 * bare directory names ("node_modules,dist,build,..."), which match nothing —
 * not a nested `pkg/node_modules/**` and not even a top-level `node_modules/**`.
 * jscpd therefore walked the whole dependency tree and reported duplication
 * dominated by third-party code (42.18% for this repository, from 10,487 files
 * scanned against ~363 real sources), or aborted out-of-memory on larger trees.
 *
 * The load-bearing assertion is `does not move`: dropping a heavily duplicated
 * dependency tree into the repo must not change the reported score at all.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectDuplication } from "../src/collect/duplication.js";

/** A chunk long enough to clear jscpd's 5-line / 50-token clone floor. */
function chunk(tag: string): string {
  return `
export function ${tag}Handler(input: Record<string, number>, limit: number) {
  const collected: number[] = [];
  for (const key of Object.keys(input)) {
    const value = input[key] ?? 0;
    if (value > limit) {
      collected.push(value * 2);
    } else if (value < 0) {
      collected.push(0);
    } else {
      collected.push(value);
    }
  }
  return collected.sort((a, b) => a - b);
}
`;
}

let repoDir: string;

beforeAll(() => {
  repoDir = mkdtempSync(path.join(os.tmpdir(), "dup-ignore-"));
  // Two identical real sources: a genuine, intentional duplicate pair so the
  // baseline score is non-zero and a change would be visible.
  mkdirSync(path.join(repoDir, "src"), { recursive: true });
  writeFileSync(path.join(repoDir, "src", "a.ts"), chunk("alpha"));
  writeFileSync(path.join(repoDir, "src", "b.ts"), chunk("alpha"));
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe("detectDuplication — node_modules exclusion (Bug 1)", () => {
  it("measures duplication among real sources", async () => {
    const result = await detectDuplication(repoDir);
    expect(result).not.toBeNull();
    // The two identical files are a real clone pair and must be detected;
    // otherwise the "does not move" assertion below would pass vacuously.
    expect(result!.metrics.cloneClusters).toBeGreaterThan(0);
    expect(result!.metrics.percentage).toBeGreaterThan(0);
  });

  it("score does not move when duplicated node_modules trees are added", async () => {
    const before = await detectDuplication(repoDir);
    expect(before).not.toBeNull();

    // Top-level node_modules AND a nested one, each carrying many copies of a
    // distinct duplicated chunk. Under the old bare-string ignore both were
    // walked, which is exactly what inflated the reported percentage.
    for (const base of [
      path.join(repoDir, "node_modules", "topdep"),
      path.join(repoDir, "packages", "inner", "node_modules", "nesteddep"),
    ]) {
      mkdirSync(base, { recursive: true });
      for (let i = 0; i < 6; i++) {
        writeFileSync(path.join(base, `dep${i}.ts`), chunk("vendor"));
      }
    }

    const after = await detectDuplication(repoDir);
    expect(after).not.toBeNull();

    // The whole point: identical numbers, not merely "close".
    expect(after!.metrics.percentage).toBe(before!.metrics.percentage);
    expect(after!.metrics.duplicateLines).toBe(before!.metrics.duplicateLines);
    expect(after!.metrics.cloneClusters).toBe(before!.metrics.cloneClusters);

    // And no reported clone may cite a path inside any node_modules.
    const cited = after!.duplicates.flatMap((d) => [
      d.firstFile?.name ?? "",
      d.secondFile?.name ?? "",
    ]);
    expect(cited.filter((p) => p.includes("node_modules"))).toEqual([]);
  });

  it("returns null rather than a false 0% when jscpd cannot run", async () => {
    // A path that does not exist makes jscpd exit non-zero. The pipeline must
    // see null — never a fabricated zero, which would silently become a real
    // data point in phase3.srs.
    const missing = path.join(repoDir, "does", "not", "exist");
    const result = await detectDuplication(missing);
    expect(result).toBeNull();
  });
});
