/**
 * Tier-1 ignore rules: vendor, third_party, and minified JavaScript.
 * Python discovery is not part of this suite.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSourceFiles } from "../src/collect/fileDiscovery.js";
import { profileRepo } from "../src/collect/loc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "tier1-ignore-repo");

describe("tier-1 ignore patterns", () => {
  it("excludes vendor, third_party, and minified JS from discovery", async () => {
    const files = await discoverSourceFiles(FIXTURE_PATH);
    const rel = files
      .map((f) => path.relative(FIXTURE_PATH, f).replace(/\\/g, "/"))
      .sort();
    expect(rel).toEqual(["src/app.ts"]);
  });

  it("profiles only the TypeScript source file", async () => {
    const profile = await profileRepo(FIXTURE_PATH);
    expect(profile.totalFiles).toBe(1);
    expect(profile.tsFiles).toBe(1);
    expect(profile.jsFiles).toBe(0);
    expect(profile.jsxFiles).toBe(0);
  });
});
