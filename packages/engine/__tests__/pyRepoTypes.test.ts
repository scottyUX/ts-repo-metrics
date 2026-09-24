/**
 * Python backends (Flask / FastAPI), AI/ML stacks, notebooks, and mixed repos.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import { parseSource } from "../src/parsing/tsParser.js";
import { extractPythonSilentFailures } from "../src/extract/python/silentFailures.js";
import { extractEndpoints } from "../src/extract/python/endpoints.js";
import { computeModuleScope } from "../src/extract/python/moduleScope.js";
import { extractNotebookSource } from "../src/parsing/notebook.js";
import { pairedTestPathCandidates } from "../src/extract/symbolVerificationRisk.js";
import { isAnalyzableSourcePath, isTestFilePath } from "../src/utils/constants.js";
import { detectFramework } from "../src/collect/frameworkDetection.js";

const tempDirs: string[] = [];

async function writeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "py-types-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function notebook(cells: { type: "code" | "markdown"; source: string }[]): string {
  return JSON.stringify({
    cells: cells.map((c) => ({
      cell_type: c.type,
      source: c.source.split(/(?<=\n)/),
      ...(c.type === "code" ? { outputs: [{ output_type: "stream", text: ["ignored\n"] }] } : {}),
    })),
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  });
}

const py = (code: string) => parseSource(code, "py").rootNode;

describe("Python silent failures", () => {
  it("flags do-nothing and log-only except bodies, not handling", () => {
    const root = py(`
def f():
    try:
        a()
    except ValueError:
        pass
    try:
        a()
    except KeyError:
        ...
    for x in xs:
        try:
            a()
        except Exception:
            continue
    try:
        a()
    except Exception as e:
        logger.exception(e)
    try:
        a()
    except Exception:
        self.logger.warning("x")
    try:
        a()
    except Exception:
        print("oops")
    try:
        a()
    except Exception as e:
        logging.error(e)
        raise
    try:
        a()
    except Exception:
        return None
`);
    const kinds = extractPythonSilentFailures(root, "a.py").map((e) => e.kind);
    expect(kinds).toEqual([
      "empty_catch",
      "empty_catch",
      "empty_catch",
      "console_only_catch",
      "console_only_catch",
      "console_only_catch",
    ]);
  });

  it("counts Python events toward sfd outside React scope", async () => {
    const repo = await writeRepo({
      "app/main.py": "def f():\n    try:\n        g()\n    except Exception:\n        pass\n",
    });
    const report = await analyzeRepo(repo);
    expect(report.phase3?.silentFailureEvents).toEqual([
      { file: "app/main.py", line: 4, kind: "empty_catch" },
    ]);
    expect(report.phase3?.sfd).toBeGreaterThan(0);
    expect(report.reactMetrics).toBeUndefined();
  });
});

describe("Flask and FastAPI endpoints", () => {
  it("finds route handlers and blocking calls in async handlers", () => {
    const root = py(`
@app.get("/items/{item_id}", response_model=Item)
async def read_item(item_id: int):
    r = requests.get(url)
    time.sleep(1)
    await client.get(url)
    return r

@router.post("")
def create(item):
    return item

@bp.route("/orders", methods=["POST", "put"])
def orders():
    if x:
        return 1
    return 2

@app.route("/health")
def health():
    return "ok"

@mock.patch("pkg.mod")
def not_a_route(m):
    pass

@app.get("relative")
def no_leading_slash():
    pass

@pytest.mark.parametrize("a", [1])
def also_not(a):
    pass
`);
    const eps = extractEndpoints(root, "app/api.py");
    expect(eps.map((e) => [e.handler, e.methods, e.path])).toEqual([
      ["read_item", ["GET"], "/items/{item_id}"],
      ["create", ["POST"], ""],
      ["orders", ["POST", "PUT"], "/orders"],
      ["health", ["ROUTE"], "/health"],
    ]);
    expect(eps[0]).toMatchObject({ isAsync: true, blockingCalls: 2 });
    expect(eps[2]?.cyclomaticComplexity).toBe(2);
  });

  it("keeps every path when route decorators are stacked on one handler", () => {
    const eps = extractEndpoints(
      py(`@bp.route("/", methods=["GET", "POST"])\n@bp.route("/index", methods=["GET"])\ndef index():\n    pass\n`),
      "app/main/routes.py",
    );
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ handler: "index", path: "/", paths: ["/", "/index"], methods: ["GET", "POST"] });
  });

  it("summarizes endpoints and skips handlers in test files", async () => {
    const repo = await writeRepo({
      "backend/app/main.py":
        'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/a")\nasync def a():\n    requests.get(u)\n\n@app.post("/b")\ndef b():\n    return 1\n',
      "backend/tests/test_main.py": '@app.get("/fake")\ndef fake():\n    pass\n',
    });
    const report = await analyzeRepo(repo);
    expect(report.backendMetrics?.summary).toMatchObject({
      endpointCount: 2,
      asyncEndpoints: 1,
      blockingCallsInAsync: 1,
      asyncHandlersWithBlockingCalls: 1,
      fatHandlers: 0,
    });
    expect(report.framework).toMatchObject({
      type: "FastAPI",
      hasBackend: true,
      pythonBackend: "FastAPI",
    });
  });
});

describe("Python type hints and top-level code", () => {
  it("counts annotated parameters and return annotations on defs", async () => {
    const repo = await writeRepo({
      "m.py":
        "def f(a: int, b, *args: str, **kw) -> int:\n    return a\n\nclass C:\n    def m(self, x: int):\n        pass\n\ng = lambda y: y\n",
    });
    const report = await analyzeRepo(repo);
    const fns = report.perFile[0]?.functionMetrics ?? [];
    expect(fns.find((f) => f.name === "f")).toMatchObject({ typedParameterCount: 2, hasReturnAnnotation: true, parameterCount: 4 });
    expect(fns.find((f) => f.name === "m")).toMatchObject({ typedParameterCount: 1, hasReturnAnnotation: false, parameterCount: 1 });
    expect(fns.find((f) => f.name === "g")?.typedParameterCount).toBeUndefined();
    expect(report.python?.typeHints).toEqual({
      functions: 2,
      functionsWithReturnAnnotation: 1,
      parameters: 5,
      typedParameters: 3,
      parameterCoverage: 0.6,
      returnCoverage: 0.5,
    });
  });

  it("scores top-level logic and ignores defs, imports, and docstrings", () => {
    const script = py(`"""Train a model."""
import torch

def helper(x):
    if x:
        return 1

for epoch in range(3):
    if epoch > 1 and verbose:
        print(epoch)
model.save()
`);
    expect(computeModuleScope(script)).toEqual({ cyclomaticComplexity: 4, maxNestingDepth: 2, lines: 4 });
    expect(computeModuleScope(py("import os\n\ndef f():\n    pass\n"))).toBeNull();
  });

  it("keeps top-level code out of function totals", async () => {
    const repo = await writeRepo({ "train.py": "for i in range(3):\n    if i:\n        print(i)\n" });
    const report = await analyzeRepo(repo);
    expect(report.totals.functions).toBe(0);
    expect(report.perFile[0]?.moduleScope).toEqual({ cyclomaticComplexity: 3, maxNestingDepth: 2, lines: 3 });
    expect(report.python?.moduleScope).toMatchObject({ filesWithTopLevelCode: 1, maxComplexity: 3 });
  });
});

describe("Jupyter notebooks", () => {
  it("joins code cells, blanks magics, and drops a %% cell", () => {
    const src = extractNotebookSource(
      notebook([
        { type: "markdown", source: "# Title\n" },
        { type: "code", source: "%matplotlib inline\n!pip install x\nimport numpy as np\n" },
        { type: "code", source: "%%bash\necho hi\n" },
        { type: "code", source: "def f(x):\n    return x\n" },
      ]),
    );
    expect(src.code).toBe("\n\nimport numpy as np\n\n\n\n\ndef f(x):\n    return x\n");
    expect(src.cellStartLines).toEqual([1, 5, 8]);
  });

  it("scores notebooks as Python and reports them apart", async () => {
    const repo = await writeRepo({
      "analysis.ipynb": notebook([
        { type: "markdown", source: "notes\n" },
        { type: "code", source: "import torch\nx = 1\n" },
        { type: "code", source: "def train(model, data):\n    if data:\n        return model\n" },
      ]),
      "broken.ipynb": "{ not json",
      "app.py": "def f():\n    return 1\n",
    });
    const report = await analyzeRepo(repo);
    expect(report.profile).toMatchObject({ notebookFiles: 2, pyFiles: 1 });
    expect(report.filesSkipped).toBe(1);
    const nb = report.perFile.find((p) => p.file === "analysis.ipynb");
    expect(nb?.functionMetrics[0]).toMatchObject({ name: "train", notebookCell: 2, cyclomaticComplexity: 2 });
    expect(report.byLanguage?.notebook).toMatchObject({ files: 1, functions: 1 });
    expect(report.byLanguage?.python).toMatchObject({ files: 1, functions: 1 });
    expect(report.framework?.pythonStack).toEqual(["torch"]);
  });
});

describe("stack detection and mixed repos", () => {
  it("reads dependency files one level down and merges with package.json", async () => {
    const repo = await writeRepo({
      "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      "frontend/App.tsx": "export function App() { return <div />; }\n",
      "backend/requirements.txt": "# api\nflask==3.0\nscikit-learn>=1.4\nopenai\n",
      "backend/app.py": "def index():\n    return 'ok'\n",
    });
    const report = await analyzeRepo(repo);
    expect(report.framework).toMatchObject({
      type: "React",
      hasReact: true,
      hasBackend: true,
      pythonBackend: "Flask",
      pythonStack: ["scikit-learn", "openai"],
    });
    expect(Object.keys(report.byLanguage ?? {}).sort()).toEqual(["ecmascript", "python"]);
    expect(report.reactMetrics).toBeDefined();
  });

  it("detects the stack from imports alone", async () => {
    const repo = await writeRepo({
      "bot.py": "from anthropic import Anthropic\nimport langchain_core.messages as m\n",
    });
    const report = await analyzeRepo(repo);
    expect(report.framework).toEqual({
      type: "Python",
      hasReact: false,
      hasBackend: false,
      pythonBackend: null,
      pythonStack: ["langchain", "anthropic"],
    });
  });

  it("leaves a TypeScript-only repo's framework unchanged", async () => {
    const repo = await writeRepo({
      "package.json": JSON.stringify({ dependencies: { express: "^4" } }),
      "src/index.ts": "export const x = 1;\n",
    });
    const report = await analyzeRepo(repo);
    expect(report.framework).toEqual({ type: "Express", hasReact: false, hasBackend: true });
    expect(report.python).toBeUndefined();
    expect(report.backendMetrics).toBeUndefined();
  });
});

describe("repo layout rules from the public-repo run", () => {
  it("skips generated Alembic revisions but keeps migrations/env.py", () => {
    expect(isAnalyzableSourcePath("migrations/versions/8388415d2247_users.py")).toBe(false);
    expect(isAnalyzableSourcePath("backend/app/alembic/versions/e2412789c190_init.py")).toBe(false);
    expect(isAnalyzableSourcePath("migrations/env.py")).toBe(true);
    expect(isAnalyzableSourcePath("src/versions/migrations.ts")).toBe(true);
  });

  it("treats a unittest-style tests.py as a test file", () => {
    expect(isTestFilePath("tests.py")).toBe(true);
    expect(isTestFilePath("app/tests.py")).toBe(true);
    expect(isTestFilePath("app/tests_helpers.py")).toBe(false);
  });

  it("finds React in a monorepo subfolder package.json", async () => {
    const repo = await writeRepo({
      "package.json": JSON.stringify({ private: true, workspaces: ["frontend"] }),
      "frontend/package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      "node_modules/x/package.json": JSON.stringify({ dependencies: { next: "1" } }),
    });
    expect(await detectFramework(repo)).toEqual({ type: "React", hasReact: true, hasBackend: false });
  });

  it("tags Streamlit apps", async () => {
    const repo = await writeRepo({ "Home.py": "import streamlit as st\nst.title('x')\n" });
    const report = await analyzeRepo(repo);
    expect(report.framework?.pythonStack).toEqual(["streamlit"]);
  });
});

describe("Python test pairing", () => {
  it("mirrors the package layout under tests/", () => {
    expect(pairedTestPathCandidates("app/api/users.py")).toEqual([
      "app/api/test_users.py",
      "app/api/users_test.py",
      "app/api/tests/test_users.py",
      "tests/app/api/test_users.py",
      "tests/api/test_users.py",
      "tests/test_users.py",
      "app/api/tests.py",
      "tests.py",
    ]);
    expect(pairedTestPathCandidates("main.py")).toEqual([
      "test_main.py",
      "main_test.py",
      "tests/test_main.py",
      "tests.py",
    ]);
    expect(pairedTestPathCandidates("analysis.ipynb")).toEqual([]);
  });
});

describe("catch-all tests.py pairing", () => {
  it("credits only the functions tests.py references", async () => {
    const repo = await writeRepo({
      "app/models.py": "def set_password(u, p):\n    return p\n\ndef export_rows(rows):\n    return rows\n",
      "tests.py": "from app.models import set_password\n\ndef test_pw():\n    assert set_password(None, 'x') == 'x'\n",
    });
    const report = await analyzeRepo(repo);
    const byName = Object.fromEntries((report.symbolVerificationRisks ?? []).map((r) => [r.name, r]));
    expect(byName.set_password).toMatchObject({ evidence: "referenced_in_test", verificationScore: 1, pairedTestPath: "tests.py" });
    expect(byName.export_rows).toMatchObject({ evidence: "none", verificationScore: 0 });
    expect(byName.export_rows?.pairedTestPath).toBeUndefined();
  });
});
