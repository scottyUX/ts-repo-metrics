/**
 * Unit tests for unsupported Python framework detection.
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
    const repoPath = path.join(FIXTURES, "sample-web2py-repo");
    const result = await detectUnsupportedPythonFramework(repoPath);
    expect(result).toEqual({
      id: "web2py",
      message:
        "This repository uses web2py. Static code analysis is not supported for web2py projects yet.",
    });
  });

  it("detects Django when manage.py and django deps exist", async () => {
    const repoPath = path.join(FIXTURES, "sample-django-repo");
    const result = await detectUnsupportedPythonFramework(repoPath);
    expect(result).toEqual({
      id: "django",
      message:
        "This repository uses Django. Static code analysis is not supported for Django projects yet.",
    });
  });

  it("does not flag Flask-style Python repos", async () => {
    const repoPath = path.join(FIXTURES, "sample-py-repo");
    expect(await detectUnsupportedPythonFramework(repoPath)).toBeNull();
  });

  it("does not flag manage.py without django in dependencies", async () => {
    const repoPath = path.join(FIXTURES, "sample-manage-py-no-django");
    expect(await detectUnsupportedPythonFramework(repoPath)).toBeNull();
  });
});

describe("analyzeRepo (unsupported Python frameworks)", () => {
  it("skips static analysis for web2py with analysisSkipped feedback", async () => {
    const report = await analyzeRepo(path.join(FIXTURES, "sample-web2py-repo"));
    expect(report.analysisSkipped?.id).toBe("web2py");
    expect(report.filesAnalyzed).toBe(0);
    expect(report.perFile).toEqual([]);
    expect(report.profile.pyFiles).toBe(0);
  });

  it("skips static analysis for Django with analysisSkipped feedback", async () => {
    const report = await analyzeRepo(path.join(FIXTURES, "sample-django-repo"));
    expect(report.analysisSkipped?.id).toBe("django");
    expect(report.filesAnalyzed).toBe(0);
    expect(report.perFile).toEqual([]);
  });
});
