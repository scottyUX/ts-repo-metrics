/**
 * Unit tests for src/collect/loc.ts (profileRepo).
 * Covers ignore rules (node_modules, dist, etc.), empty files, CRLF, trailing newlines.
 * Uses fixtures/loc-repo/ for file discovery and ignore-rule verification.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { profileRepo } from "../collect/loc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "loc-repo");

describe("profileRepo", () => {
  it("excludes node_modules, dist, build from file discovery", async () => {
    const result = await profileRepo(FIXTURE_PATH);
    expect(result.totalFiles).toBe(5);
    expect(result.tsFiles).toBe(5);
  });

  it("counts empty file as 0 lines", async () => {
    const result = await profileRepo(FIXTURE_PATH);
    expect(result.totalLOC).toBe(7);
  });

  it("handles files with CRLF line endings", async () => {
    const result = await profileRepo(FIXTURE_PATH);
    expect(result.totalLOC).toBe(7);
  });

  it("handles files ending with newline", async () => {
    const result = await profileRepo(FIXTURE_PATH);
    expect(result.totalLOC).toBe(7);
  });

  it("classifies test files and separates source vs test LOC", async () => {
    const result = await profileRepo(FIXTURE_PATH);
    expect(result.testFiles).toBe(1);
    expect(result.sourceLOC).toBe(5);
    expect(result.testLOC).toBe(2);
    expect(result.totalLOC).toBe(7);
  });
});
