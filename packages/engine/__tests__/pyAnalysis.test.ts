/**
 * Python scoring: functions, cyclomatic complexity, smells, and lexical nulls.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import { parseSource } from "../src/parsing/tsParser.js";
import { PYTHON_PROFILE } from "../src/utils/languageProfile.js";
import { extractFunctionMetrics } from "../src/extract/functionMetrics.js";
import { computeComplexity } from "../src/extract/complexity.js";
import { detectSmells } from "../src/extract/smells.js";
import { countFunctions } from "../src/extract/functionCount.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "sample-py-repo");

function scorePython(code: string) {
  const tree = parseSource(code, "py");
  const metrics = extractFunctionMetrics(tree.rootNode, {
    relativeFilePath: "a.py",
    languageProfile: PYTHON_PROFILE,
  });
  return {
    metrics,
    complexity: computeComplexity(tree.rootNode, PYTHON_PROFILE),
    smells: detectSmells(tree.rootNode, PYTHON_PROFILE),
    counts: countFunctions(tree.rootNode, PYTHON_PROFILE),
  };
}

describe("analyzeRepo (Python)", () => {
  it("analyzes .py files and leaves lexical metrics null", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);

    expect(report.filesAnalyzed).toBeGreaterThan(0);
    expect(report.profile.pyFiles).toBeGreaterThan(0);
    expect(report.profile.testFiles).toBeGreaterThanOrEqual(1);
    expect(report.totals.functions).toBeGreaterThan(0);
    expect(report.functionMetricsSummary.totalFunctions).toBeGreaterThan(0);
    expect(report.complexity.max).toBeGreaterThanOrEqual(1);
    expect(report.smells.consoleLogs).toBeGreaterThan(0);
    expect(report.smells.emptyCatchBlocks).toBeGreaterThan(0);
    expect(report.reactMetrics).toBeUndefined();
    expect(report.analysisSkipped).toBeUndefined();

    const byType = report.perFile.find((f) => f.file.endsWith("utils.py"))?.functionsByType;
    expect(byType?.function_definition).toEqual(expect.any(Number));
    expect(Number.isFinite(byType?.function_definition)).toBe(true);

    for (const file of report.perFile) {
      for (const fn of file.functionMetrics) {
        expect(fn.halstead).toBeNull();
        expect(fn.cognitiveComplexity).toBeNull();
        expect(fn.maintainabilityIndexGradAiRaw).toBeNull();
        expect(fn.maintainabilityIndexGradAiNorm).toBeNull();
      }
    }
  }, 30_000);
});

describe("Python cyclomatic complexity and names", () => {
  it("counts and/or via the operator field", () => {
    const andIf = scorePython("def f(a, b):\n    if a and b:\n        return 1\n");
    expect(andIf.complexity.find((c) => c.name === "f")?.complexity).toBe(3);

    const chain = scorePython("def f(a, b, c):\n    return a and b and c\n");
    expect(chain.complexity.find((c) => c.name === "f")?.complexity).toBe(3);
  });

  it("counts match cases and ignores comprehension filters", () => {
    const matched = scorePython(
      "def classify(x):\n    match x:\n        case 1:\n            return 1\n        case 2:\n            return 2\n",
    );
    expect(matched.complexity.find((c) => c.name === "classify")?.complexity).toBe(3);

    const comp = scorePython("def keep(a):\n    return [i for i in a if i]\n");
    expect(comp.complexity.find((c) => c.name === "keep")?.complexity).toBe(1);
  });

  it("names assigned lambdas only when the left side is an identifier", () => {
    const named = scorePython("f = lambda x: x\n");
    expect(named.metrics.functions.map((fn) => fn.name)).toContain("f");
    expect(named.complexity.map((fn) => fn.name)).toContain("f");

    const attribute = scorePython("def outer():\n    self.f = lambda: 1\n");
    const lambdas = attribute.metrics.functions.filter((fn) => fn.type === "lambda");
    expect(lambdas.map((fn) => fn.name)).toEqual(["(anonymous)"]);

    const tupleLeft = scorePython("c, d = lambda: 1\n");
    expect(tupleLeft.metrics.functions.map((fn) => fn.name)).toEqual(["(anonymous)"]);
  });

  it("skips self and cls only on real methods", () => {
    const method = scorePython(
      "class C:\n    def method(self, a, b, c, d):\n        return a\n",
    );
    expect(method.metrics.functions[0]?.parameterCount).toBe(4);
    expect(method.smells.longParameterLists).toBe(0);

    const typed = scorePython(
      'class C:\n    def n(self: "A", a, b, c, d):\n        return a\n',
    );
    expect(typed.metrics.functions[0]?.parameterCount).toBe(4);

    const conditional = scorePython(
      "class C:\n    if True:\n        def m(self, a, b, c, d):\n            return a\n",
    );
    expect(conditional.metrics.functions[0]?.parameterCount).toBe(5);

    const moduleLevel = scorePython(
      "def module_level(self, a, b, c, d):\n    return a\n",
    );
    expect(moduleLevel.metrics.functions[0]?.parameterCount).toBe(5);

    const laterSelf = scorePython(
      "class C:\n    def m(x, self, a, b, c, d):\n        return a\n",
    );
    expect(laterSelf.metrics.functions[0]?.parameterCount).toBe(6);

    const staticCls = scorePython(
      "class C:\n    @staticmethod\n    def s(a, b, c, d, cls):\n        return a\n",
    );
    expect(staticCls.metrics.functions[0]?.parameterCount).toBe(5);
  });

  it("does not treat a non-empty except as empty", () => {
    const scored = scorePython(
      "def handle(x):\n    try:\n        risky()\n    except ValueError:\n        log.error(x)\n",
    );
    expect(scored.smells.emptyCatchBlocks).toBe(0);
  });

  it("analyzes a file of about 40,000 characters", async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), "py-large-"));
    try {
      const code = `def big():\n    x = "${"a".repeat(40_000)}"\n    return x\n`;
      expect(code.length).toBeGreaterThan(39_000);
      await writeFile(path.join(repoPath, "big.py"), code);
      const report = await analyzeRepo(repoPath);
      expect(report.filesAnalyzed).toBe(1);
      expect(report.filesSkipped).toBeUndefined();
      expect(report.totals.functions).toBe(1);
      expect(report.duplication).toBeNull();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});

describe("Python duplication under a .cache path", () => {
  it("keeps one clone pair and ignores the venv copy", async () => {
    const shared = `def build_student_report(user, items, flags):
    header = user.name + " weekly report"
    summary = ""
    for item in items:
        summary = summary + item.label + ": " + item.value + "\\n"
    footer = "DRAFT" if flags.draft else "FINAL"
    body = header + "\\n" + summary + footer
    checksum = len(body) + len(items) + user.id
    meta = "generated for " + user.email
    banner = "URGENT" if flags.urgent else "NORMAL"
    note = "lines=" + str(len(items))
    stamp = str(user.id) + "-" + str(flags.draft)
    title = banner + " / " + meta
    closing = note + " " + stamp
    extra = "repo-metrics duplication fixture block"
    return title + "\\n" + body + "\\n" + closing + "\\n" + extra + "\\n" + str(checksum)
`;
    const parent = await mkdtemp(path.join(tmpdir(), "py-dup-"));
    const repoPath = path.join(parent, ".cache", "repo");
    try {
      await mkdir(path.join(repoPath, "src"), { recursive: true });
      await mkdir(path.join(repoPath, "venv"), { recursive: true });
      await writeFile(path.join(repoPath, "src", "left.py"), shared);
      await writeFile(path.join(repoPath, "src", "right.py"), shared);
      await writeFile(path.join(repoPath, "venv", "left.py"), shared);

      const { detectDuplication } = await import("../src/collect/duplication.js");
      const result = await detectDuplication(repoPath);
      expect(result).not.toBeNull();
      expect(result!.metrics.cloneClusters).toBe(1);
      expect(result!.metrics.percentage).not.toBe(0);
      for (const dup of result!.duplicates) {
        for (const name of [dup.firstFile?.name, dup.secondFile?.name]) {
          expect(name).toBeTruthy();
          expect(path.isAbsolute(name!)).toBe(false);
          expect(name!.includes("venv")).toBe(false);
        }
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 30_000);
});
