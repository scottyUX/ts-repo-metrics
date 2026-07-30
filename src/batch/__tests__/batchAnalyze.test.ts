/**
 * Regression tests for the batch-mode silent-skip fix (Bug 2).
 *
 * batchAnalyze used to gate on a root `package.json` and skip anything without
 * one, while still writing summary.csv from whatever survived. A run that
 * analyzed one of six repositories produced a one-row CSV indistinguishable
 * from a complete batch — the exclusions appeared only on stderr. Five of the
 * six CSE 115A cohort repos are Python or plain-JS with no root package.json,
 * so that gate excluded most of the cohort.
 *
 * Two things are asserted: the gate no longer excludes non-Node projects, and
 * every target is accounted for in the ARTIFACTS rather than only the terminal.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { batchAnalyze } from "../batchAnalyze.js";

let parentDir: string;
let outputDir: string;

beforeAll(() => {
  parentDir = mkdtempSync(path.join(os.tmpdir(), "batch-parent-"));
  outputDir = mkdtempSync(path.join(os.tmpdir(), "batch-out-"));

  // 1. A Node/TypeScript project — analyzed under the old gate too.
  const tsRepo = path.join(parentDir, "ts-project");
  mkdirSync(path.join(tsRepo, "src"), { recursive: true });
  writeFileSync(path.join(tsRepo, "package.json"), JSON.stringify({ name: "ts-project" }));
  writeFileSync(
    path.join(tsRepo, "src", "index.ts"),
    "export function add(a: number, b: number) {\n  if (a > b) { return a; }\n  return b;\n}\n",
  );

  // 2. A Python project with NO package.json — this is the case that was
  //    silently dropped. It is the whole point of the fix.
  const pyRepo = path.join(parentDir, "python-project");
  mkdirSync(path.join(pyRepo, "app"), { recursive: true });
  writeFileSync(
    path.join(pyRepo, "app", "main.py"),
    "def handler(value):\n    if value > 0:\n        return value\n    return 0\n",
  );

  // 3. A directory with no analyzable source — legitimately skipped, but it
  //    must still be visible in the artifacts rather than vanishing.
  const emptyRepo = path.join(parentDir, "docs-only");
  mkdirSync(emptyRepo, { recursive: true });
  writeFileSync(path.join(emptyRepo, "README.md"), "# docs only\n");
});

afterAll(() => {
  rmSync(parentDir, { recursive: true, force: true });
  rmSync(outputDir, { recursive: true, force: true });
});

describe("batchAnalyze — no silent skips (Bug 2)", () => {
  let manifest: {
    targetsFound: number;
    analyzed: number;
    skipped: number;
    failed: number;
    complete: boolean;
    entries: Array<{ repo: string; status: string; reason: string }>;
  };
  let csvText: string;

  beforeAll(async () => {
    await batchAnalyze({ parentDir, outputDir, csv: true });
    manifest = JSON.parse(
      readFileSync(path.join(outputDir, "batch_manifest.json"), "utf8"),
    );
    csvText = readFileSync(path.join(outputDir, "summary.csv"), "utf8");
  }, 120_000);

  it("analyzes a project with no root package.json (the old gate)", () => {
    const py = manifest.entries.find((e) => e.repo === "python-project");
    expect(py).toBeDefined();
    expect(py!.status).toBe("analyzed");
    expect(existsSync(path.join(outputDir, "python-project.json"))).toBe(true);
  });

  it("accounts for every target in the manifest", () => {
    expect(manifest.targetsFound).toBe(3);
    expect(manifest.analyzed).toBe(2);
    expect(manifest.skipped).toBe(1);
    expect(manifest.failed).toBe(0);
    expect(manifest.entries.map((e) => e.repo).sort()).toEqual([
      "docs-only",
      "python-project",
      "ts-project",
    ]);
  });

  it("marks an incomplete batch as incomplete, with a reason", () => {
    expect(manifest.complete).toBe(false);
    const skipped = manifest.entries.find((e) => e.repo === "docs-only");
    expect(skipped!.status).toBe("skipped");
    expect(skipped!.reason).toMatch(/no analyzable source/i);
  });

  it("summary.csv carries status and reason, with a row per target", () => {
    const lines = csvText.trim().split("\n");
    const header = lines[0]!.split(",");
    expect(header[0]).toBe("repo");
    expect(header[1]).toBe("status");
    expect(header[2]).toBe("reason");

    // Header + one row per target, including the skipped one. Under the old
    // code this file had only the surviving rows.
    expect(lines.length).toBe(4);
    expect(lines.some((l) => l.startsWith("docs-only,skipped,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("python-project,analyzed,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("ts-project,analyzed,"))).toBe(true);
  });

  it("keeps every CSV row the same width so blanks are visible as blanks", () => {
    const lines = csvText.trim().split("\n");
    const width = lines[0]!.split(",").length;
    for (const line of lines.slice(1)) {
      expect(line.split(",").length).toBe(width);
    }
  });

  it("writes a manifest even when nothing can be analyzed", async () => {
    const emptyParent = mkdtempSync(path.join(os.tmpdir(), "batch-empty-"));
    const emptyOut = mkdtempSync(path.join(os.tmpdir(), "batch-empty-out-"));
    mkdirSync(path.join(emptyParent, "nothing-here"), { recursive: true });
    writeFileSync(path.join(emptyParent, "nothing-here", "notes.txt"), "hi\n");

    const count = await batchAnalyze({
      parentDir: emptyParent,
      outputDir: emptyOut,
      csv: true,
    });

    expect(count).toBe(0);
    // "No output" and "output covering zero repos" must not look alike.
    const m = JSON.parse(readFileSync(path.join(emptyOut, "batch_manifest.json"), "utf8"));
    expect(m.targetsFound).toBe(1);
    expect(m.analyzed).toBe(0);
    expect(m.complete).toBe(false);
    expect(existsSync(path.join(emptyOut, "summary.csv"))).toBe(true);

    rmSync(emptyParent, { recursive: true, force: true });
    rmSync(emptyOut, { recursive: true, force: true });
  }, 60_000);
});
