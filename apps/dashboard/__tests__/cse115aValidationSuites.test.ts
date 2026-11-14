// Tasks whose tests span two languages or two packages: one suite per (language, package), each run
// in its own container in every run, results merged before compareRuns. No Docker: fake runners, and
// DockerSuiteRunner with a fake exec for the database sidecar.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { censusMarkdown } from "@/lib/cse115a/benchmark/validation/census";
import type { RunResults } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { harborEnvFrom, harborSkipReason, MULTI_SUITE_REASON } from "@/lib/cse115a/benchmark/validation/harbor";
import { DockerSuiteRunner, InstallError, runName, type ExecFn, type RunPlan, type State, type SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const repo = (files: Record<string, string>) => async (path: string) => files[path] ?? null;
const vitestPkg = JSON.stringify({ name: "web", scripts: { test: "vitest run" }, devDependencies: { vitest: "^3.0.0" } });

/** A FastAPI back end tested with pytest and a Vite front end tested with Vitest. */
const FULLSTACK: Record<string, string> = {
  "backend/requirements.txt": "fastapi\npytest\n",
  "frontend/package.json": vitestPkg,
  "frontend/package-lock.json": "{}",
};
const BACKEND_TEST = "backend/tests/test_api.py";
const FRONTEND_TEST = "frontend/src/App.test.tsx";

async function fullstack(files = FULLSTACK, workflowFiles?: string[]): Promise<Environment> {
  const env = await detectEnvironment({ testFiles: [BACKEND_TEST, FRONTEND_TEST], read: repo(files), workflowFiles });
  if (!env.supported) throw new Error(env.detail);
  return env;
}

const addFile = (file: string) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+test\n`;
const row: TaskRow = {
  instance_id: "team__app-T-1", repo: "team/app", base_commit: "0123456789abcdef0123456789abcdef01234567",
  patch: addFile("backend/app/api.py"), test_patch: addFile(BACKEND_TEST) + addFile(FRONTEND_TEST), FAIL_TO_PASS: [], PASS_TO_PASS: [],
};

const API = `${BACKEND_TEST}::test_create_item`;
const APP = `${FRONTEND_TEST}::App > renders the list`;

/** A runner scripted per suite (the plan's label) and state; records every call. */
class SuiteFake implements SuiteRunner {
  calls: Array<{ label: string | undefined; run: string; image: string | undefined }> = [];
  constructor(private readonly script: (label: string | undefined, state: State, attempt: number) => RunResults) {}
  async runSuite(plan: RunPlan, state: State, attempt: number): Promise<RunResults> {
    this.calls.push({ label: plan.label, run: runName(state, attempt), image: plan.image });
    return this.script(plan.label, state, attempt);
  }
}

/** Back end: API fails before the fix and passes after; front end: APP passes throughout. */
const proving = (label: string | undefined, state: State): RunResults =>
  label === "python in backend" ? (state === "r0" ? {} : { [API]: state === "r1" ? "failed" : "passed" }) : { [APP]: "passed" };

describe("1. detection", () => {
  it("pytest under backend/ plus Vitest under frontend/: two suites with their own package, image and runners", async () => {
    const env = await fullstack();
    expect(env.suites?.map((s) => ({ dir: s.packageDir, image: s.image, runners: s.runners, manager: s.packageManager }))).toEqual([
      { dir: "backend", image: "python:3.12-bookworm", runners: ["pytest"], manager: "pip" },
      { dir: "frontend", image: "node:22-bookworm", runners: ["vitest"], manager: "npm" },
    ]);
    // The environment's own fields are the first suite's.
    const { suites, ...first } = env;
    expect(first).toEqual(suites![0]);
  });

  it("two JavaScript packages, client/ with Vitest and server/ with node --test: two suites", async () => {
    const env = await detectEnvironment({
      testFiles: ["server/test/auth.test.ts", "client/src/Login.test.tsx"],
      read: repo({ "client/package.json": vitestPkg, "server/package.json": JSON.stringify({ scripts: { test: "node --test test/" } }) }),
    });
    expect(env.supported && env.suites?.map((s) => [s.packageDir, s.runners])).toEqual([["client", ["vitest"]], ["server", ["node-test"]]]);
  });

  it("five suites: env_unsupported, listing them", async () => {
    const dirs = ["a", "b", "c", "d", "e"];
    const env = await detectEnvironment({ testFiles: dirs.map((d) => `${d}/x.test.ts`), read: repo(Object.fromEntries(dirs.map((d) => [`${d}/package.json`, vitestPkg]))) });
    expect(env).toEqual({
      supported: false, reason: "env_unsupported",
      detail: "test files form 5 suites, more than 4: javascript in a; javascript in b; javascript in c; javascript in d; javascript in e",
    });
  });

  it("four suites are allowed", async () => {
    const dirs = ["a", "b", "c", "d"];
    const env = await detectEnvironment({ testFiles: dirs.map((d) => `${d}/x.test.ts`), read: repo(Object.fromEntries(dirs.map((d) => [`${d}/package.json`, vitestPkg]))) });
    expect(env.supported && env.suites?.length).toBe(4);
  });

  it("one suite unsupported (Mocha): env_unsupported naming that suite", async () => {
    const env = await detectEnvironment({ testFiles: [BACKEND_TEST, FRONTEND_TEST], read: repo({ ...FULLSTACK, "frontend/package.json": JSON.stringify({ scripts: { test: "mocha" } }) }) });
    expect(env).toEqual({ supported: false, reason: "env_unsupported", detail: "suite javascript in frontend: test script in frontend uses none of vitest, jest, or node --test: mocha" });
  });

  it("fixture files in a two-language row join no suite; a Python file with no manifest joins the only Python package", async () => {
    const env = await detectEnvironment({
      testFiles: [BACKEND_TEST, "backend/tests/helpers/test_util.py", FRONTEND_TEST, "frontend/src/__snapshots__/App.test.tsx.snap"],
      read: repo(FULLSTACK),
    });
    expect(env.supported && env.suites?.map((s) => s.packageDir)).toEqual(["backend", "frontend"]);
  });
});

describe("3. running (fake runner)", () => {
  it("each suite runs in each state and each run, one after another, and the results merge", async () => {
    const runner = new SuiteFake((label, state) => proving(label, state));
    const { runs, ...result } = await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner });
    const order = ["r0a", "r0b", "r0c", "r1a", "r1b", "r1c", "r2a", "r2b", "r2c"].flatMap((run) => [
      { label: "python in backend", run, image: "python:3.12-bookworm" },
      { label: "javascript in frontend", run, image: "node:22-bookworm" },
    ]);
    expect(runner.calls).toEqual(order);
    expect(runs.r2[0]).toEqual({ [API]: "passed", [APP]: "passed" });
    expect(Object.keys(result.timings)).toEqual(["r0a", "r0b", "r0c", "r1a", "r1b", "r1c", "r2a", "r2b", "r2c"]);
  });

  it("an install failure in either suite is env_error", async () => {
    for (const failing of ["python in backend", "javascript in frontend"]) {
      const runner = new SuiteFake((label, state, attempt) => {
        if (label === failing && state === "r1" && attempt === 2) throw new InstallError(`install failed in r1b (${failing}): ERROR: No matching distribution`);
        return proving(label, state);
      });
      const result = await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner });
      expect(result).toMatchObject({ validation_status: "rejected", reason: "env_error", detail: `install failed in r1b (${failing}): ERROR: No matching distribution` });
      expect(result.suites).toHaveLength(2);
    }
  });

  it("a test id reported by both suites is env_error, not a verdict", async () => {
    const runner = new SuiteFake(() => ({ [APP]: "passed" }));
    const result = await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner });
    expect(result).toMatchObject({
      validation_status: "rejected", reason: "env_error",
      detail: `test id reported by two suites in r0a: ${APP} (python in backend and javascript in frontend)`,
    });
  });
});

describe("4. verdicts on merged results", () => {
  it("a back-end FAIL_TO_PASS plus a front-end PASS_TO_PASS validates", async () => {
    const result = await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner: new SuiteFake((label, state) => proving(label, state)) });
    expect(result).toMatchObject({ validation_status: "validated", reason: null, FAIL_TO_PASS: [API], PASS_TO_PASS: [APP] });
  });

  it("a regression in either suite rejects", async () => {
    const OLD_API = "backend/tests/test_health.py::test_ok";
    const backendRegresses = new SuiteFake((label, state) =>
      label === "python in backend" ? { ...proving(label, state), [OLD_API]: state === "r2" ? "failed" : "passed" } : proving(label, state));
    expect(await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner: backendRegresses }))
      .toMatchObject({ validation_status: "rejected", reason: "regressions", regressions: [OLD_API] });
    const frontendRegresses = new SuiteFake((label, state) =>
      label === "javascript in frontend" ? { [APP]: state === "r2" ? "failed" : "passed" } : proving(label, state));
    expect(await validateTask({ row, repoDir: "/r", env: await fullstack(), modified: new Set(), runner: frontendRegresses }))
      .toMatchObject({ validation_status: "rejected", reason: "regressions", regressions: [APP] });
  });
});

describe("5. recording", () => {
  it("suites, eval_script, log_parser and harbor_env.suites", async () => {
    const env = await fullstack();
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: new SuiteFake((label, state) => proving(label, state)) });
    expect(result.suites).toEqual([
      { language: "python", package_dir: "backend", runners: ["pytest"], image: "python:3.12-bookworm", node_source: null, services: [] },
      { language: "javascript", package_dir: "frontend", runners: ["vitest"], image: "node:22-bookworm", node_source: "default", services: [] },
    ]);
    expect(result.image).toBe("python:3.12-bookworm");
    expect(result.package_dir).toBe("backend");
    expect(result.log_parser).toBe("pytest-json+vitest-json");
    const script = result.eval_script!;
    expect(script.startsWith("# ---- suite 1 of 2: python in backend ----\n")).toBe(true);
    const second = script.indexOf("# ---- suite 2 of 2: javascript in frontend ----\n");
    expect(second).toBeGreaterThan(0);
    expect(script.slice(0, second)).toContain("python -m pytest");
    expect(script.slice(0, second)).not.toContain("vitest");
    expect(script.slice(second)).toContain("npx vitest run");
    expect(script.slice(second)).toContain("cd /work/frontend\nif ! { npm ci; }");

    const recipe = result.harbor_env!;
    const { suites, ...top } = recipe;
    expect(top).toEqual(harborEnvFrom(env.suites![0]));
    expect(suites).toEqual(env.suites!.map((s) => harborEnvFrom(s)));
    expect(suites![1]).toMatchObject({ image: "node:22-bookworm", runners: ["vitest"], package_dir: "frontend" });
  });

  it("harborSkipReason skips multi-suite rows; single-suite rows are unaffected", async () => {
    const recipe = harborEnvFrom(await fullstack());
    expect(MULTI_SUITE_REASON).toBe("Harbor export for tasks with more than one test suite is not built yet");
    expect(harborSkipReason(recipe)).toBe(MULTI_SUITE_REASON);
    expect(harborSkipReason(recipe, row, { kind: "github" })).toBe(MULTI_SUITE_REASON);
    expect(harborSkipReason(recipe, row, { kind: "bundle", file: "repo.bundle" })).toBe(MULTI_SUITE_REASON);
    const single = (await detectEnvironment({ testFiles: [FRONTEND_TEST], read: repo(FULLSTACK) })) as Environment;
    expect(single.suites).toBeUndefined();
    expect(harborSkipReason(harborEnvFrom(single), row, { kind: "github" })).toBeNull();
  });

  it("the summary shows the suite count next to untested files; the census counts the row as supported", async () => {
    const env = await fullstack();
    const { runs, ...result } = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: new SuiteFake((label, state) => proving(label, state)) });
    void runs;
    expect(summaryMarkdown(summarize([result]))).toContain(`| ${row.instance_id} | validated | 2 suites |`);
    expect(summaryMarkdown(summarize([{ ...result, untested_files: ["backend/app/x.py"] }]))).toContain(`| ${row.instance_id} | validated | untested files: 1; 2 suites |`);
    const md = censusMarkdown([{ instance_id: row.instance_id, repo: row.repo, env, signals: { database: [], browser: [], otherRunners: [] }, note: "" }]);
    expect(md).toContain("| backend / frontend | pip / npm | pytest / vitest | python:3.12-bookworm / node:22-bookworm | no / no |");
    expect(md).toContain("supported; 2 suites: python in backend, javascript in frontend; pytest declared |");
    expect(md).toContain("Detector unsupported: 0. Python: 1. More than one suite: 1.");
  });
});

describe("6. a database sidecar from one suite's CI starts only for that suite's runs", () => {
  const CI = `on: [push]
jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: app_test
    steps:
      - uses: actions/checkout@v5
      - run: pip install -r requirements.txt
        working-directory: backend
      - run: pytest
        working-directory: backend
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
        working-directory: frontend
      - run: npm test
        working-directory: frontend
`;
  let logDir = "";
  beforeAll(async () => { logDir = await mkdtemp(join(tmpdir(), "hecate-suites-logs-")); });
  afterAll(async () => { await rm(logDir, { recursive: true, force: true }); });

  it("detection gives the service to the back-end suite only", async () => {
    const env = await fullstack({ ...FULLSTACK, ".github/workflows/ci.yml": CI }, [".github/workflows/ci.yml"]);
    expect(env.suites!.map((s) => (s.services ?? []).map((sv) => sv.image))).toEqual([["postgres:16"], []]);
    expect(env.suites![0].env.DATABASE_URL).toBe("postgresql://app:app@postgres:5432/app_test");
    expect(env.suites![1].env.DATABASE_URL).toBe("postgresql://hecate:hecate@localhost:5432/hecate");
  });

  it("DockerSuiteRunner (fake exec): a network and database for every back-end run, none for the front end; one log per suite per run", async () => {
    const env = await fullstack({ ...FULLSTACK, ".github/workflows/ci.yml": CI }, [".github/workflows/ci.yml"]);
    const calls: string[][] = [];
    const exec: ExecFn = async (_command, args) => { calls.push(args); return args[0] === "exec" ? "accepting connections" : "ok"; };
    let id = 0;
    const runner = new DockerSuiteRunner(logDir, undefined, { exec, sleep: async () => {}, runId: () => `x${++id}` });
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner });
    const testRuns = calls.filter((a) => a[0] === "run" && a[1] === "--rm");
    const backend = testRuns.filter((a) => a.includes("python:3.12-bookworm"));
    const frontend = testRuns.filter((a) => a.includes("node:22-bookworm"));
    expect(backend).toHaveLength(9);
    expect(frontend).toHaveLength(9);
    expect(backend.every((a) => a.includes("--network"))).toBe(true);
    expect(frontend.some((a) => a.includes("--network"))).toBe(false);
    expect(calls.filter((a) => a[0] === "network" && a[1] === "create")).toHaveLength(9);
    expect(calls.filter((a) => a[0] === "run" && a[1] === "-d").every((a) => a.includes("postgres:16"))).toBe(true);
    const logs = (await readdir(logDir)).sort();
    expect(logs).toContain("r0a.python-in-backend.log");
    expect(logs).toContain("r2c.javascript-in-frontend.log");
    expect(logs).toHaveLength(18);
    expect(result.suites!.map((s) => s.services)).toEqual([[{ name: "postgres", image: "postgres:16" }], []]);
    // eval_script names the database only in the back-end suite's part.
    const second = result.eval_script!.indexOf("# ---- suite 2 of 2");
    expect(result.eval_script!.slice(0, second)).toContain("# service postgres:");
    expect(result.eval_script!.slice(second)).not.toContain("# service postgres:");
  });
});
