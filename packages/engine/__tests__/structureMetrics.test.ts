/**
 * Structure metrics at a path list: import fan-out, directory expansion,
 * and Django repos that analyzeRepo still skips.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach } from "vitest";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import { analyzeStructure } from "../src/pipeline/analyzeStructure.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DJANGO_FIXTURE = path.resolve(__dirname, "fixtures", "sample-django-repo");

function write(repo: string, rel: string, content: string): void {
  const abs = path.join(repo, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe("analyzeStructure", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  function tempRepo(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "structure-metrics-"));
    dirs.push(dir);
    return dir;
  }

  it("counts import fan-out across a package, including a relative import, and ignores third-party imports", async () => {
    const repo = tempRepo();
    write(repo, "pkg/__init__.py", "");
    write(repo, "pkg/b.py", "def helper():\n    return 1\n");
    write(repo, "pkg/c.py", "VALUE = 1\n");
    write(repo, "pkg/sub/__init__.py", "");
    write(
      repo,
      "pkg/sub/d.py",
      "from ..c import VALUE\n\ndef thing():\n    return VALUE\n",
    );
    write(
      repo,
      "pkg/a.py",
      [
        "import os",
        "import requests",
        "import pkg.c",
        "from .b import helper",
        "from .sub.d import thing",
        "from pkg.sub import d",
        "",
        "def run(flag):",
        "    if flag:",
        "        return helper()",
        "    return thing",
        "",
      ].join("\n"),
    );
    write(
      repo,
      "pkg/third_party.py",
      "import requests\nfrom django.http import HttpResponse\n",
    );

    const report = await analyzeStructure(repo, {
      paths: ["pkg/a.py", "pkg/third_party.py", "pkg/sub/d.py"],
    });

    expect(report.missing).toEqual([]);
    const a = report.files.find((f) => f.file === "pkg/a.py");
    const third = report.files.find((f) => f.file === "pkg/third_party.py");
    const nested = report.files.find((f) => f.file === "pkg/sub/d.py");
    expect(a).toMatchObject({
      file: "pkg/a.py",
      fanOut: 3,
      functions: 1,
      cyclomaticMean: 2,
      cyclomaticMax: 2,
      maxNestingDepth: 1,
    });
    expect(third).toMatchObject({
      file: "pkg/third_party.py",
      fanOut: 0,
      functions: 0,
      cyclomaticMean: 0,
      cyclomaticMax: 0,
    });
    expect(nested).toMatchObject({ file: "pkg/sub/d.py", fanOut: 1, functions: 1 });
  });

  it("expands a directory to analyzable source files and reports a missing path", async () => {
    const repo = tempRepo();
    write(repo, "src/keep.py", "x = 1\n");
    write(repo, "src/nested/also.py", "def f():\n    return 1\n");
    write(
      repo,
      "src/nested/note.ipynb",
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        cells: [
          {
            cell_type: "code",
            source: ["def n(x):\n", "    if x:\n", "        return 1\n"],
          },
        ],
      }),
    );
    write(repo, "src/readme.txt", "not source\n");

    const report = await analyzeStructure(repo, {
      paths: ["src", "gone.py"],
    });

    expect(report.missing).toEqual(["gone.py"]);
    expect(report.files.map((f) => f.file)).toEqual([
      "src/keep.py",
      "src/nested/also.py",
      "src/nested/note.ipynb",
    ]);
    expect(report.files.find((f) => f.file === "src/nested/also.py")?.functions).toBe(1);
  });

  it("rejects path traversal and absolute paths", async () => {
    const repo = tempRepo();
    write(repo, "src/keep.py", "x = 1\n");
    await expect(analyzeStructure(repo, { paths: ["../outside.py"] })).rejects.toThrow(
      /traversal/i,
    );
    await expect(analyzeStructure(repo, { paths: ["/etc/passwd"] })).rejects.toThrow(
      /repo-relative/i,
    );
  });

  it("scores a Django-style repo that analyzeRepo skips", async () => {
    const report = await analyzeStructure(DJANGO_FIXTURE, {
      paths: ["manage.py", "frontend"],
    });
    expect(report.missing).toEqual([]);
    expect(report.files.map((f) => f.file)).toEqual([
      "frontend/app.js",
      "manage.py",
    ]);
    const manage = report.files.find((f) => f.file === "manage.py");
    expect(manage).toMatchObject({
      file: "manage.py",
      functions: 0,
      cyclomaticMean: 2,
      cyclomaticMax: 2,
      maxNestingDepth: 1,
      fanOut: 0,
      loc: 8,
    });
    expect(report.files.find((f) => f.file === "frontend/app.js")).toMatchObject({
      functions: 1,
      cyclomaticMean: 1,
      cyclomaticMax: 1,
      fanOut: 0,
    });

    const skipped = await analyzeRepo(DJANGO_FIXTURE);
    expect(skipped.analysisSkipped?.id).toBe("django");
    expect(skipped.filesAnalyzed).toBe(0);
    expect(skipped.perFile).toEqual([]);
  }, 30_000);
});
