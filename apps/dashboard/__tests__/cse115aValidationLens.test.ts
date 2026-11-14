// #288 (brief 4): repositories shaped like jacobluanjohnston/lens. A PostGIS service is a Postgres
// service, `alembic upgrade head` is a schema step, a pip suite installs the way CI does, and a
// job's database goes only to the suites one of its test steps runs. The Harbor fixtures in
// fixtures/lens/ are the built files; HECATE_RECORD_LENS=1 rewrites them.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEnvironment, installPlan, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { buildHarborTask, harborEnvFrom, harborSkipReason, serviceSkipReason, type HarborRow, type HarborService } from "@/lib/cse115a/benchmark/validation/harbor";
import { containerScript, type RunPlan } from "@/lib/cse115a/benchmark/validation/runner";
import { ciTestJob, jobRunsSuite, pipInstallStepsFromJob, servicesFromWorkflows, type WorkflowFile } from "@/lib/cse115a/benchmark/validation/services";
import { suitePlan } from "@/lib/cse115a/benchmark/validation/validateTask";

/** jacobluanjohnston/lens .github/workflows/ci.yml at d8380903 (PR #58): one job, back-end and pipeline tests only. */
const LENS_CI = `name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    services:
      db:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: lens
          POSTGRES_USER: lens
          POSTGRES_PASSWORD: lens
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://lens:lens@localhost:5432/lens

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r backend/requirements.txt

      - name: Lint
        run: ruff check backend/

      - name: Run migrations
        run: |
          cd backend
          alembic upgrade head

      - name: Run tests
        run: pytest backend/ pipeline/ --tb=short
`;

/** The same file from Jul 21 on: the front end's install and Jest run joined the same job. */
const LENS_CI_JUL21 = LENS_CI
  .replace("      - name: Install dependencies\n        run: pip install -r backend/requirements.txt\n",
    "      - name: Install dependencies\n        run: pip install -r backend/requirements.txt\n\n      - name: Install frontend dependencies\n        working-directory: frontend\n        run: npm ci\n")
  .concat("\n      - name: Run frontend tests\n        working-directory: frontend\n        run: npm test -- --ci\n");

const wf = (text: string): WorkflowFile[] => [{ path: ".github/workflows/ci.yml", text }];

/** A fake repository: path → contents. */
function repo(files: Record<string, string | object>) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return async (path: string) => map.get(path) ?? null;
}

const LENS_FILES = {
  "pytest.ini": "[pytest]\npythonpath = . backend\n",
  "backend/requirements.txt": "fastapi\nsqlalchemy\nalembic\npsycopg2-binary\ngeoalchemy2\npytest\nhttpx\n",
  "pipeline/requirements.txt": "requests\npandas\n",
  "frontend/package.json": { name: "frontend", scripts: { test: "jest" }, devDependencies: { jest: "^29" } },
  "frontend/package-lock.json": "{}",
};
const detect = (testFiles: string[], ci: string | null, extra: Record<string, string | object> = {}) =>
  detectEnvironment({
    testFiles,
    read: repo({ ...LENS_FILES, ...(ci ? { ".github/workflows/ci.yml": ci } : {}), ...extra }),
    workflowFiles: ci ? [".github/workflows/ci.yml"] : [],
  }) as Promise<Environment>;

const POSTGIS = {
  name: "postgres", alias: "db", image: "postgis/postgis:16-3.4",
  env: { POSTGRES_DB: "lens", POSTGRES_USER: "lens", POSTGRES_PASSWORD: "lens" },
  databaseUrl: "postgresql://lens:lens@localhost:5432/lens",
  containerDatabaseUrl: "postgresql://lens:lens@db:5432/lens",
  schemaCommand: "cd backend\nalembic upgrade head",
};

describe("1. a postgis/postgis service is a Postgres service", () => {
  it("gives one Service with that image, the CI variables and the CI URL (host replaced by the alias)", () => {
    expect(servicesFromWorkflows(wf(LENS_CI), "backend")).toEqual([POSTGIS]);
  });

  it("by tag or digest; another PostGIS-like image is still not recognised", () => {
    const digest = `postgis/postgis@sha256:${"b".repeat(64)}`;
    expect(servicesFromWorkflows(wf(LENS_CI.replace("postgis/postgis:16-3.4", digest)), "backend")[0]?.image).toBe(digest);
    expect(servicesFromWorkflows(wf(LENS_CI.replace("postgis/postgis:16-3.4", "kartoza/postgis:16")), "backend")).toEqual([]);
    expect(servicesFromWorkflows(wf(LENS_CI.replace("postgis/postgis:16-3.4", "postgis/postgis-ext:16")), "backend")).toEqual([]);
  });
});

describe("2. alembic upgrade is a schema step", () => {
  it("`cd backend` + `alembic upgrade head` in one run: block is taken as written, both lines, in order", () => {
    expect(servicesFromWorkflows(wf(LENS_CI), "backend")[0].schemaCommand).toBe("cd backend\nalembic upgrade head");
  });

  it("so is `flask db upgrade` (Flask-Migrate runs Alembic); a step with its own directory runs in a subshell there", () => {
    const flask = LENS_CI.replace("        run: |\n          cd backend\n          alembic upgrade head\n", "        working-directory: backend\n        run: flask db upgrade\n");
    expect(servicesFromWorkflows(wf(flask), "backend")[0].schemaCommand).toBe("(\n  cd backend\n  flask db upgrade\n)");
  });
});

describe("3. Python installs follow CI", () => {
  it("the LENS shape: tests in pipeline/tests/ install with CI's root command, then pytest", async () => {
    const env = await detect(["pipeline/tests/test_slug.py"], LENS_CI);
    expect(env).toMatchObject({ supported: true, runners: ["pytest"], packageDir: "pipeline", installDir: "pipeline", installCommand: "pip install -r requirements.txt && pip install pytest" });
    expect(installPlan(env)).toEqual([
      { dir: "", cwd: "", command: "pip install -r backend/requirements.txt" },
      { dir: "", cwd: "", command: "pip install pytest" },
    ]);
    expect(env.services).toEqual([POSTGIS]);
    expect(env.dockerfile).toContain("# cd . && pip install -r backend/requirements.txt\n# cd . && pip install pytest\n# cd pipeline\n");
    // The run: CI's install from the root, then the migration from the root, then pytest in pipeline/.
    const script = containerScript(suitePlan({ row: { base_commit: "b", patch: "", test_patch: "" } as never, repoDir: "/r" }, env) as RunPlan, "r2");
    const at = (s: string) => script.indexOf(s);
    expect(at("cd /work\nif ! { pip install -r backend/requirements.txt; }")).toBeGreaterThan(-1);
    expect(at("{ pip install -r backend/requirements.txt; }")).toBeLessThan(at("cd /work\nif ! { pip install pytest; }"));
    expect(at("{ pip install pytest; }")).toBeLessThan(at("cd /work\nif ! bash -eo pipefail -c 'cd backend\nalembic upgrade head'"));
    expect(at("bash -eo pipefail")).toBeLessThan(at("cd /work/pipeline\nPYTHONPATH="));
  });

  it("a Python repo whose CI has no pip step: exactly today's environment (and no installSteps key)", async () => {
    const noPip = LENS_CI.replace("        run: pip install -r backend/requirements.txt\n", "        run: echo nothing to install\n");
    const withCi = await detect(["pipeline/tests/test_slug.py"], noPip);
    const without = await detect(["pipeline/tests/test_slug.py"], null);
    expect("installSteps" in withCi).toBe(false);
    expect(installPlan(withCi)).toEqual(installPlan(without));
    expect({ ...withCi, services: undefined, env: undefined, dockerfile: undefined }).toEqual({ ...without, services: undefined, env: undefined, dockerfile: undefined });
  });

  const job = (run: string, extra = "") =>
    ciTestJob(wf(`jobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n${run.split("\n").map((l) => `          ${l}`).join("\n")}\n${extra}      - run: pytest\n`), "")!;

  it("accepts pip, pip3, python -m pip, python3 -m pip with -r, -e ., ., named packages and flags, as written, with cd and working-directory", () => {
    const steps = pipInstallStepsFromJob(job("python -m pip install --upgrade pip\npip3 install -e .\ncd api && pip install -r requirements.txt pytest-cov\npython3 -m pip install \\\n  httpx", "      - working-directory: tools\n        run: pip install .\n"));
    expect(steps).toEqual([
      { dir: "", cwd: "", command: "python -m pip install --upgrade pip" },
      { dir: "", cwd: "", command: "pip3 install -e ." },
      { dir: "api", cwd: "api", command: "pip install -r requirements.txt pytest-cov" },
      { dir: "", cwd: "", command: "python3 -m pip install httpx" },
      { dir: "tools", cwd: "tools", command: "pip install ." },
    ]);
  });

  it("follows none of them when one uses a GitHub expression or is bare, or the job also installs with uv, Poetry, Pipenv or conda", () => {
    expect(pipInstallStepsFromJob(job("pip install -r requirements.txt\npip install ${{ matrix.extra }}"))).toEqual([]);
    expect(pipInstallStepsFromJob(job("pip install"))).toEqual([]);
    for (const other of ["uv sync", "uv pip install -r requirements.txt", "poetry install", "pipenv install --dev", "conda install numpy"]) {
      expect(pipInstallStepsFromJob(job(`pip install uv poetry pipenv\n${other}`))).toEqual([]);
    }
    // Not installs: pip's other verbs, and installs after the test step.
    expect(pipInstallStepsFromJob(job("pip freeze\npip download x"))).toEqual([]);
  });

  it("a uv or Poetry suite keeps its own install even when CI runs pip", async () => {
    const env = await detect(["pipeline/tests/test_slug.py"], LENS_CI, { "pipeline/uv.lock": "", "pipeline/pyproject.toml": "[project]\nname='p'\n" });
    expect(env.packageManager).toBe("uv");
    expect("installSteps" in env).toBe(false);
  });
});

describe("4. a job's database goes only to the suites it runs", () => {
  const frontend = ["frontend/__tests__/map.test.js"];

  it("a job with only a root pytest step gives no service (and no schema step) to a JavaScript suite in frontend/", async () => {
    expect(jobRunsSuite(ciTestJob(wf(LENS_CI), "frontend")!, "frontend", "javascript")).toBe(false);
    const env = await detect(frontend, LENS_CI);
    expect(env).toMatchObject({ supported: true, runners: ["jest"], packageDir: "frontend" });
    expect(env.services).toEqual([]);
    expect(env.env.DATABASE_URL).toBe("postgresql://hecate:hecate@localhost:5432/hecate");
  });

  it("but the Python suites in backend/ and pipeline/ both get it from that root pytest step", async () => {
    expect((await detect(["backend/tests/test_api.py"], LENS_CI)).services).toEqual([POSTGIS]);
    expect((await detect(["pipeline/tests/test_slug.py"], LENS_CI)).services).toEqual([POSTGIS]);
  });

  it("a job with a test step in frontend/ does give it to the frontend suite", async () => {
    expect(jobRunsSuite(ciTestJob(wf(LENS_CI_JUL21), "frontend")!, "frontend", "javascript")).toBe(true);
    const env = await detect(frontend, LENS_CI_JUL21);
    expect(env.services).toEqual([POSTGIS]);
    // Out of scope (reported): the Python job's migration comes with it, and cannot run in a Node image.
    expect(env.services![0].schemaCommand).toBe("cd backend\nalembic upgrade head");
  });

  it("a root step in the other language does not run a suite; one in the same language does", () => {
    const root = (line: string) => ciTestJob(wf(`jobs:\n  t:\n    services:\n      pg:\n        image: postgres:16\n    steps:\n      - run: ${line}\n`), "")!;
    expect(jobRunsSuite(root("npm test"), "web", "javascript")).toBe(true);
    expect(jobRunsSuite(root("npm test"), "api", "python")).toBe(false);
    expect(jobRunsSuite(root("python -m pytest"), "api", "python")).toBe(true);
    expect(jobRunsSuite(root("pnpm --dir server test"), "server", "javascript")).toBe(true);
    expect(jobRunsSuite(root("pnpm --dir server test"), "web", "javascript")).toBe(false);
  });
});

describe("5. Harbor: a PostGIS row", () => {
  const FIXTURES = join(__dirname, "fixtures", "lens");
  const matchesFixture = (name: string, text: string) => {
    if (process.env.HECATE_RECORD_LENS === "1") writeFileSync(join(FIXTURES, name), text);
    expect(text).toBe(readFileSync(join(FIXTURES, name), "utf8"));
  };
  const row: HarborRow = {
    instance_id: "jacobluanjohnston__lens-PR-58", repo: "jacobluanjohnston/lens", base_commit: "76105569899d8e6ca98245fae8801dd81b878f8e",
    patch: "diff --git a/backend/app/api/lens.py b/backend/app/api/lens.py\n", test_patch: "diff --git a/backend/tests/test_lens.py b/backend/tests/test_lens.py\n",
    FAIL_TO_PASS: ["backend/tests/test_lens.py::test_lens_ok"], PASS_TO_PASS: ["backend/tests/test_health.py::test_health"],
    problem_statement: "# PR 58\n\nAdd the lens endpoint.", hints_text: "",
  };

  it("builds a sidecar task: the PostGIS image under the CI alias, CI's pip install, the migration before pytest", async () => {
    const recipe = harborEnvFrom(await detect(["backend/tests/test_lens.py"], LENS_CI));
    expect(recipe.services).toEqual([{ name: "postgres", image: "postgis/postgis:16-3.4", alias: "db", env: POSTGIS.env, schema_command: POSTGIS.schemaCommand }]);
    const source = { kind: "bundle", file: "repo.bundle" } as const;
    expect(harborSkipReason(recipe, row, source)).toBeNull();
    const files = buildHarborTask({ row, env: recipe, source, flakyCount: 0 });
    matchesFixture("Dockerfile", files.get("environment/Dockerfile")!);
    matchesFixture("docker-compose.yaml", files.get("environment/docker-compose.yaml")!);
    matchesFixture("test.sh", files.get("tests/test.sh")!);
    expect(files.get("environment/docker-compose.yaml")).toContain('  db:\n    image: "postgis/postgis:16-3.4"\n');
  });

  it("other images still skip with the reason", () => {
    const s: HarborService = { name: "postgres", image: "postgis/postgis:16-3.4", alias: "db", env: POSTGIS.env, schema_command: null };
    expect(serviceSkipReason([s])).toBeNull();
    expect(serviceSkipReason([{ ...s, image: `postgis/postgis@sha256:${"c".repeat(64)}` }])).toBeNull();
    for (const image of ["kartoza/postgis:16", "mysql:8", "postgis/postgis-ext:16"]) {
      expect(serviceSkipReason([{ ...s, image }])).toBe(`database service image ${JSON.stringify(image)} is not a postgres image; Harbor export supports Postgres (postgres or postgis/postgis) only`);
    }
  });
});
