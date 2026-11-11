import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractAddedTests } from "@/lib/cse115a/benchmark/extractTests";
import { censusMarkdown } from "@/lib/cse115a/benchmark/validation/census";
import { compareRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { detectEnvironment, pytestCommand, pythonVersionFrom, testLanguage, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { buildHarborTask, harborEnvFrom, harborSkipReason } from "@/lib/cse115a/benchmark/validation/harbor";
import { PYTEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/pytestReporter";
import { containerScript, PACKAGE_CACHE_ENV, readReports } from "@/lib/cse115a/benchmark/validation/runner";
import { modifiedTests, parseNodeTestReport, pythonTestBodies } from "@/lib/cse115a/benchmark/validation/testIds";

/** A fake repository: path → contents. */
function repo(files: Record<string, string>) {
  const map = new Map(Object.entries(files));
  return async (path: string) => map.get(path) ?? null;
}

const STEP = "PYTHONPATH=/patches REPORT=$REPORT_DIR/pytest-0.json python -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors";

describe("detectEnvironment: Python", () => {
  it("installs requirements.txt at the root, then pytest, on Python 3.12 by default", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_sum.py"], read: repo({ "requirements.txt": "requests\n" }) });
    expect(env).toMatchObject({
      supported: true, runners: ["pytest"], packageManager: "pip", packageDir: "", installDir: "",
      installCommand: "pip install -r requirements.txt && pip install pytest", image: "python:3.12-bookworm", pytestDeclared: false,
    });
    if (!env.supported) return;
    expect(env.testSteps).toEqual([{ kind: "pytest", command: STEP }]);
    expect(env.env).toMatchObject({ CI: "true", PIP_ROOT_USER_ACTION: "ignore", PYTHONDONTWRITEBYTECODE: "1" });
    expect(env.dockerfile).toContain("FROM python:3.12-bookworm");
  });

  it("adds the dev requirement files that exist, and notes a declared pytest", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "requirements.txt": "flask\n", "requirements-dev.txt": "pytest==8.3\n", "dev-requirements.txt": "black\n" }) });
    expect(env).toMatchObject({ installCommand: "pip install -r requirements.txt -r requirements-dev.txt -r dev-requirements.txt && pip install pytest", pytestDeclared: true });
  });

  it("finds pyproject.toml in backend/ for tests in backend/tests/ and reads requires-python", async () => {
    const pyproject = '[project]\nname = "api"\nrequires-python = ">=3.11,<4"\ndependencies = ["fastapi"]\n';
    const env = await detectEnvironment({ testFiles: ["backend/tests/test_api.py", "backend/tests/conftest.py"], read: repo({ "backend/pyproject.toml": pyproject, "README.md": "" }) });
    expect(env).toMatchObject({ supported: true, packageManager: "pip", packageDir: "backend", installDir: "backend", installCommand: "pip install -e . && pip install pytest", image: "python:3.11-bookworm" });
  });

  it("does not try to install a pyproject.toml that only configures tools", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "pyproject.toml": "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n" }) });
    expect(env).toMatchObject({ installCommand: "pip install pytest", pytestDeclared: true });
  });

  it("uses uv sync with uv.lock and runs pytest through uv run", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "pyproject.toml": "[project]\nname = \"a\"\n", "uv.lock": "" }) });
    expect(env).toMatchObject({ packageManager: "uv", installCommand: "pip install uv && uv sync --frozen && uv pip install --python /opt/venv/bin/python pytest" });
    if (env.supported) expect(env.testSteps[0].command).toBe(STEP.replace("python -m pytest", "uv run --no-sync python -m pytest"));
  });

  it("uses poetry install with poetry.lock and runs pytest through poetry run", async () => {
    const env = await detectEnvironment({ testFiles: ["server/tests/test_a.py"], read: repo({ "server/pyproject.toml": "[tool.poetry]\nname = \"a\"\n", "server/poetry.lock": "" }) });
    expect(env).toMatchObject({ packageManager: "poetry", packageDir: "server", installDir: "server", installCommand: "pip install poetry && poetry install --no-interaction --no-root && pip install pytest" });
    if (env.supported) expect(env.testSteps[0].command).toContain("poetry run python -m pytest");
  });

  it("takes .python-version over requires-python", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ ".python-version": "3.10.14\n", "pyproject.toml": '[project]\nrequires-python = ">=3.12"\n' }) });
    expect(env).toMatchObject({ image: "python:3.10-bookworm" });
  });

  it("installs nothing but pytest when there is no manifest at all", async () => {
    expect(await detectEnvironment({ testFiles: ["test_a.py"], read: repo({}) })).toMatchObject({ supported: true, packageDir: "", installCommand: "pip install pytest" });
  });

  it("rejects test files that mix Python and JavaScript, and Python tests in two packages", async () => {
    expect(await detectEnvironment({ testFiles: ["tests/test_a.py", "web/a.test.ts"], read: repo({ "requirements.txt": "", "package.json": "{}" }) }))
      .toEqual({ supported: false, reason: "env_unsupported", detail: "test files mix Python and JavaScript" });
    expect(await detectEnvironment({ testFiles: ["a/tests/test_x.py", "b/tests/test_y.py"], read: repo({ "a/requirements.txt": "", "b/requirements.txt": "" }) }))
      .toMatchObject({ supported: false, detail: "test files span two packages: a and b" });
  });

  it("leaves a JavaScript row exactly as before, fixture files alongside or not", async () => {
    const pkg = JSON.stringify({ scripts: { test: "vitest" }, devDependencies: { vitest: "^3.0.0" } });
    const files = { "package.json": pkg, "package-lock.json": "{}", "requirements.txt": "" };
    const plain = await detectEnvironment({ testFiles: ["src/sum.test.ts"], read: repo(files) });
    const withFixture = await detectEnvironment({ testFiles: ["src/sum.test.ts", "src/__fixtures__/data.json"], read: repo(files) });
    expect(plain).toMatchObject({ supported: true, runners: ["vitest"], packageManager: "npm", installCommand: "npm ci", image: "node:22-bookworm" });
    expect(withFixture).toEqual(plain);
    expect(plain).not.toHaveProperty("pytestDeclared");
  });
});

describe("testLanguage, pythonVersionFrom, pytestCommand", () => {
  it("decides the language from code files only", () => {
    expect(testLanguage(["tests/test_a.py", "tests/data.json"])).toBe("python");
    expect(testLanguage(["a.test.ts", "b.test.mjs"])).toBe("javascript");
    expect(testLanguage([])).toBe("javascript");
    expect(testLanguage(["a.test.ts", "test_b.py"])).toBe("mixed");
  });

  it("takes the lowest minor requires-python allows, never below 3.9", () => {
    expect(pythonVersionFrom("3.11\n", null)).toBe("3.11");
    expect(pythonVersionFrom(null, 'requires-python = "~=3.10"')).toBe("3.10");
    expect(pythonVersionFrom(null, "requires-python = '>=3.9, !=3.9.1, <3.13'")).toBe("3.9");
    expect(pythonVersionFrom(null, 'requires-python = ">=3.7"')).toBe("3.9");
    expect(pythonVersionFrom("system\n", '[project]\nname = "x"\n')).toBeNull();
  });

  it("loads our plugin and keeps going past collection errors", () => {
    expect(pytestCommand()).toBe(STEP);
  });
});

describe("the pytest reporter's output", () => {
  // Produced by really running PYTEST_REPORTER_SOURCE on pytest 8.4.2 (7.4.4 gives the same JSON) over
  // backend/tests/test_cases.py (pass, fail, skip, xfail, parametrized, class, setup error) and
  // backend/tests/test_broken_import.py (imports a module that does not exist), mounted at /work.
  const fixture = async () => JSON.parse(await readFile(join(__dirname, "fixtures", "pytestReport.json"), "utf8")) as Record<string, string>;
  const f = "backend/tests/test_cases.py";

  it("parses into repo-relative ids with the right statuses", async () => {
    expect(parseNodeTestReport(await fixture())).toEqual({
      "backend/tests/test_broken_import.py::(load)": "failed",
      [`${f}::TestThing::test_method`]: "passed",
      [`${f}::test_fail`]: "failed",
      [`${f}::test_param[1-2]`]: "passed",
      [`${f}::test_param[2-4]`]: "passed",
      [`${f}::test_param[x-y]`]: "failed",
      [`${f}::test_pass`]: "passed",
      [`${f}::test_setup_error`]: "failed",
      [`${f}::test_skip`]: "skipped",
      [`${f}::test_xfail`]: "skipped",
    });
  });

  it("uses the ids extractPyTests writes on the row", async () => {
    const diff = [
      "diff --git a/backend/tests/test_cases.py b/backend/tests/test_cases.py", "--- /dev/null", "+++ b/backend/tests/test_cases.py", "@@ -0,0 +1,6 @@",
      "+def test_pass():", "+    assert True", "+class TestThing:", "+    def test_method(self):", "+        assert True", "+def test_setup_error(broken):",
    ].join("\n");
    const observed = parseNodeTestReport(await fixture());
    for (const id of extractAddedTests(diff)) expect(observed).toHaveProperty([id]);
  });

  it("treats a (load) failure like the other runners do: the file's tests count as failed in that state", async () => {
    const r1 = parseNodeTestReport(await fixture());
    const r2 = { ...r1, "backend/tests/test_broken_import.py::test_never_runs": "passed" as const };
    delete (r2 as Record<string, string>)["backend/tests/test_broken_import.py::(load)"];
    const result = compareRuns({ r0: [{}, {}, {}], r1: [r1, r1, r1], r2: [r2, r2, r2] });
    expect(result.failToPass).toContain("backend/tests/test_broken_import.py::test_never_runs");
    expect(result.loadFailures).toEqual(["r1 backend/tests/test_broken_import.py"]);
  });

  it("ships a standard-library-only plugin", () => {
    const imports = PYTEST_REPORTER_SOURCE.split("\n").filter((l) => /^(import|from)\s/.test(l));
    expect(imports).toEqual(["import json", "import os", "import sys"]);
  });
});

describe("pythonTestBodies and modifiedTests for .py files", () => {
  const base = [
    "import pytest",
    "",
    "def test_same():",
    "    assert 1 == 1",
    "",
    "def test_changed():",
    '    """Docstring at',
    "column zero inside the body.",
    '    """',
    "    assert add(1, 2) == 3",
    "",
    "class TestMath:",
    "    def helper(self):",
    "        return 1",
    "",
    "    @pytest.mark.slow",
    "    def test_method(self):",
    "        assert self.helper() == 1",
    "",
    "async def test_async():",
    "    assert await thing(",
    "1)",
    "",
    "def make():",
    "    def test_inner():",
    "        pass",
    "",
  ].join("\n");

  it("finds top-level, class and async tests, with decorators, and ignores helpers and nested defs", () => {
    const { bodies, parsed } = pythonTestBodies("t/test_m.py", base);
    expect(parsed).toBe(true);
    expect([...bodies.keys()].sort()).toEqual(["t/test_m.py::TestMath::test_method", "t/test_m.py::test_async", "t/test_m.py::test_changed", "t/test_m.py::test_same"]);
    expect(bodies.get("t/test_m.py::TestMath::test_method")).toBe("    @pytest.mark.slow\n    def test_method(self):\n        assert self.helper() == 1");
    expect(bodies.get("t/test_m.py::test_changed")).toContain("column zero inside the body.");
    expect(bodies.get("t/test_m.py::test_async")).toBe("async def test_async():\n    assert await thing(\n1)");
  });

  it("reports changed bodies only: not unchanged tests, not new tests", () => {
    const patched = base
      .replace("assert add(1, 2) == 3", "assert add(2, 2) == 4")
      .replace("        assert self.helper() == 1", "        assert self.helper() == 2")
      .replace("assert await thing(", "assert await other(")
      + "\ndef test_new():\n    pass\n";
    expect(modifiedTests("t/test_m.py", base, patched)).toEqual(["t/test_m.py::TestMath::test_method", "t/test_m.py::test_async", "t/test_m.py::test_changed"]);
    expect(modifiedTests("t/test_m.py", base, base + "\ndef test_new():\n    pass\n")).toEqual([]);
  });

  it("treats every base test as modified when a version cannot be parsed", () => {
    const broken = base.replace('    """\n    assert add', "    assert add"); // unterminated docstring
    expect(pythonTestBodies("t/test_m.py", broken).parsed).toBe(false);
    const all = ["t/test_m.py::TestMath::test_method", "t/test_m.py::test_async", "t/test_m.py::test_changed", "t/test_m.py::test_same"];
    expect(modifiedTests("t/test_m.py", base, broken)).toEqual(all);
    expect(modifiedTests("t/test_m.py", broken, base)).toEqual(all);
    const mixedIndent = "def test_a():\n    x = 1\n\tassert x\n";
    expect(pythonTestBodies("t/test_m.py", mixedIndent).parsed).toBe(false);
  });
});

describe("runner and Harbor for pytest rows", () => {
  it("readReports merges a pytest report alongside a Vitest one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hecate-reports-"));
    try {
      await writeFile(join(dir, "pytest-0.json"), JSON.stringify({ "/work/backend/tests/test_a.py::TestX::test_y[1]": "passed", "/work/backend/tests/test_b.py::(load)": "failed" }));
      await writeFile(join(dir, "vitest-0.json"), JSON.stringify({ testResults: [{ name: "/work/web/a.test.ts", assertionResults: [{ ancestorTitles: [], title: "ok", status: "passed" }] }] }));
      expect(await readReports(dir)).toEqual({
        "backend/tests/test_a.py::TestX::test_y[1]": "passed",
        "backend/tests/test_b.py::(load)": "failed",
        "web/a.test.ts::ok": "passed",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("shares pip, uv and Poetry downloads through the cache mount, and runs the Python steps in the package dir", async () => {
    expect(PACKAGE_CACHE_ENV).toMatchObject({ PIP_CACHE_DIR: "/cache/pip", UV_CACHE_DIR: "/cache/uv", POETRY_CACHE_DIR: "/cache/poetry" });
    const env = await detectEnvironment({ testFiles: ["backend/tests/test_a.py"], read: repo({ "backend/requirements.txt": "" }) });
    if (!env.supported) throw new Error(env.detail);
    const script = containerScript({ repoDir: "/r", baseCommit: "abc", patch: "", testPatch: "", installDir: env.installDir, installCommand: env.installCommand, packageDir: env.packageDir, testSteps: env.testSteps.map((s) => s.command) }, "r1");
    expect(script).toContain(`cd /work/backend\nif ! { pip install -r requirements.txt && pip install pytest; }`);
    expect(script).toContain(`cd /work/backend\n${STEP} || true\n`);
  });

  it("is exported by Harbor: no pytest skip any more", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "requirements.txt": "" }) }) as Environment;
    const row = { instance_id: "x-1", repo: "o/x", base_commit: "abc", patch: "", test_patch: "", FAIL_TO_PASS: [], PASS_TO_PASS: [] };
    expect(harborSkipReason(harborEnvFrom(env))).toBeNull();
    expect(buildHarborTask({ row, env: harborEnvFrom(env), source: { kind: "bundle", file: "repo.bundle" } }).has("tests/check.py")).toBe(true);
  });

  it("census lists a Python repo with its manager, image and whether it declares pytest", async () => {
    const env = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "pyproject.toml": "[project]\nname = \"a\"\n", "uv.lock": "" }) });
    const md = censusMarkdown([{ instance_id: "p-1", repo: "x/p", env, signals: { database: [], browser: [], otherRunners: [] }, note: "" }]);
    expect(md).toContain("| p-1 | x/p | . | uv | pytest | python:3.12-bookworm | no |  |  |  | supported; pytest not declared, installed by the validator |");
    expect(md).toContain("Detector unsupported: 0. Python: 1.");
  });
});
