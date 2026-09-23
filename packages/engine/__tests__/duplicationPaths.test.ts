/**
 * jscpd must scan repo-relative paths so ignore globs do not match `.cache`
 * in the clone path, and duplicate file names must stay openable.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectDuplication } from "../src/collect/duplication.js";
import { readLineRange } from "../src/collect/weightedRedundancy.js";

const SHARED = `function buildStudentReport(user, items, flags) {
  const header = user.name + " weekly report";
  let summary = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    summary = summary + item.label + ": " + item.value + "\\n";
  }
  const footer = flags.draft ? "DRAFT" : "FINAL";
  const body = header + "\\n" + summary + footer;
  const checksum = body.length + items.length + user.id;
  const meta = "generated for " + user.email;
  const banner = flags.urgent ? "URGENT" : "NORMAL";
  const note = "lines=" + String(items.length);
  const stamp = String(user.id) + "-" + String(flags.draft);
  const title = banner + " / " + meta;
  const closing = note + " " + stamp;
  const extra = "repo-metrics duplication fixture block";
  return title + "\\n" + body + "\\n" + closing + "\\n" + extra + "\\n" + String(checksum);
}
`;

describe("detectDuplication under a .cache path", () => {
  it("keeps one clone pair and repo-relative file names", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "dup-"));
    const repoPath = path.join(parent, ".cache", "repo");
    try {
      await mkdir(path.join(repoPath, "src"), { recursive: true });
      await mkdir(path.join(repoPath, "vendor"), { recursive: true });
      await writeFile(path.join(repoPath, "src", "left.js"), SHARED);
      await writeFile(path.join(repoPath, "src", "right.js"), SHARED);
      await writeFile(path.join(repoPath, "vendor", "left.js"), SHARED);

      const result = await detectDuplication(repoPath);
      expect(result).not.toBeNull();
      expect(result!.metrics.cloneClusters).toBe(1);
      expect(result!.metrics.percentage).not.toBe(0);

      for (const dup of result!.duplicates) {
        for (const name of [dup.firstFile?.name, dup.secondFile?.name]) {
          expect(name).toBeTruthy();
          expect(path.isAbsolute(name!)).toBe(false);
          expect(existsSync(path.join(repoPath, name!))).toBe(true);
        }
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("readLineRange", () => {
  it("opens a relative name and an absolute name", async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), "lines-"));
    try {
      await mkdir(path.join(repoPath, "src"));
      const abs = path.join(repoPath, "src", "a.js");
      await writeFile(abs, "alpha\nbeta\n");
      expect(readLineRange(repoPath, "src/a.js", 1, 2)).toBe("alpha\nbeta");
      expect(readLineRange(repoPath, abs, 1, 1)).toBe("alpha");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
