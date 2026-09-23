/**
 * JavaScript and JSX scoring, emit siblings, and pull-request allow-lists.
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSourceFiles } from "../src/collect/fileDiscovery.js";
import { profileRepo } from "../src/collect/loc.js";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "js-jsx-repo");

const ANALYZABLE = [
  "src/plain.js",
  "src/Card.js",
  "src/Panel.jsx",
  "src/plain.test.js",
];

describe("JavaScript and JSX analysis", () => {
  it("scores a pull-request allow-list of JS and JSX files", async () => {
    const report = await analyzeRepo(FIXTURE_PATH, { includePaths: ANALYZABLE });
    expect(report.filesAnalyzed).toBe(4);
    expect(report.totals.functions).toBeGreaterThan(0);

    const card = report.perFile.find((f) => f.file.endsWith("Card.js"));
    expect(card?.functionMetrics.some((fn) => fn.name === "Card")).toBe(true);
    expect(card?.functionMetrics.find((fn) => fn.name === "Card")?.isReactComponent).toBe(
      true,
    );

    const panel = report.perFile.find((f) => f.file.endsWith("Panel.jsx"));
    expect(
      panel?.functionMetrics.find((fn) => fn.name === "Panel")?.isReactComponent,
    ).toBe(true);

    expect(report.reactMetrics).toBeDefined();
    expect(report.reactMetrics?.summary.componentsAnalyzed).toBe(2);
  }, 30_000);

  it("profiles JS and JSX separately and skips minified and config files", async () => {
    const profile = await profileRepo(FIXTURE_PATH);
    expect(profile.jsFiles).toBe(3);
    expect(profile.jsxFiles).toBe(1);
    expect(profile.testFiles).toBe(1);
    expect(profile.tsFiles).toBe(0);

    const files = await discoverSourceFiles(FIXTURE_PATH);
    const rel = files.map((f) => path.relative(FIXTURE_PATH, f).replace(/\\/g, "/"));
    expect(rel).not.toContain("static/app.min.js");
    expect(rel).not.toContain("jest.config.js");
  });
});

describe("compiled emit next to TypeScript", () => {
  it("keeps the TypeScript file and a .js file next to a declaration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "emit-"));
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;\n");
      await writeFile(path.join(root, "src", "a.js"), "export const a = 1;\n");
      await writeFile(path.join(root, "src", "b.tsx"), "export const B = () => null;\n");
      await writeFile(path.join(root, "src", "b.jsx"), "export const B = () => null;\n");
      await writeFile(path.join(root, "src", "foo.d.ts"), "export const foo: number;\n");
      await writeFile(path.join(root, "src", "foo.js"), "export const foo = 1;\n");

      const files = await discoverSourceFiles(root);
      const rel = files
        .map((f) => path.relative(root, f).replace(/\\/g, "/"))
        .sort();
      expect(rel).toEqual(["src/a.ts", "src/b.tsx", "src/foo.d.ts", "src/foo.js"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
