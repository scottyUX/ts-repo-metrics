/**
 * web2py and Django skip the whole repository, including JavaScript.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectUnsupportedPythonFramework } from "../src/collect/pythonFrameworkDetection.js";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "fixtures");

describe("detectUnsupportedPythonFramework", () => {
  it("detects web2py layout", async () => {
    const result = await detectUnsupportedPythonFramework(
      path.join(FIXTURES, "sample-web2py-repo"),
    );
    expect(result?.id).toBe("web2py");
  });

  it("detects Django when manage.py and django deps exist", async () => {
    const result = await detectUnsupportedPythonFramework(
      path.join(FIXTURES, "sample-django-repo"),
    );
    expect(result?.id).toBe("django");
  });

  it("does not flag Flask-style Python repos", async () => {
    expect(
      await detectUnsupportedPythonFramework(path.join(FIXTURES, "sample-py-repo")),
    ).toBeNull();
  });

  it("does not flag manage.py without django in dependencies", async () => {
    expect(
      await detectUnsupportedPythonFramework(
        path.join(FIXTURES, "sample-manage-py-no-django"),
      ),
    ).toBeNull();
  });
});

describe("analyzeRepo (unsupported Python frameworks)", () => {
  it("skips static analysis for web2py", async () => {
    const report = await analyzeRepo(path.join(FIXTURES, "sample-web2py-repo"));
    expect(report.analysisSkipped?.id).toBe("web2py");
    expect(report.filesAnalyzed).toBe(0);
    expect(report.perFile).toEqual([]);
    expect(report.profile).toMatchObject({
      totalFiles: 0,
      tsFiles: 0,
      tsxFiles: 0,
      jsFiles: 0,
      jsxFiles: 0,
      pyFiles: 0,
      testFiles: 0,
      totalLOC: 0,
      sourceLOC: 0,
      testLOC: 0,
    });
  }, 30_000);

  it("skips static analysis for Django, including its JavaScript", async () => {
    const report = await analyzeRepo(path.join(FIXTURES, "sample-django-repo"));
    expect(report.analysisSkipped?.id).toBe("django");
    expect(report.filesAnalyzed).toBe(0);
    expect(report.perFile).toEqual([]);
    expect(report.profile.jsFiles).toBe(0);
    expect(report.profile.pyFiles).toBe(0);
    expect(report.profile.totalLOC).toBe(0);
  }, 30_000);

  it("analyzes manage.py that is not Django", async () => {
    const report = await analyzeRepo(
      path.join(FIXTURES, "sample-manage-py-no-django"),
    );
    expect(report.analysisSkipped).toBeUndefined();
    expect(report.filesAnalyzed).toBe(1);
    expect(report.profile.pyFiles).toBe(1);
  }, 30_000);
});
