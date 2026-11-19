import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { detectEnvironment, installPlan, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { containerScript, FakeSuiteRunner, INSTALL_FAILED_EXIT, INSTALL_LOG, installErrorLine, installGuard, type RunPlan } from "@/lib/cse115a/benchmark/validation/runner";
import { ciTestJob, installStepsFromJob, nodeMajorFromJob } from "@/lib/cse115a/benchmark/validation/services";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

/** The `test` job of JoKHerre/Bookworm's ci.yml (read through the GitHub API on 2026-11-10), trimmed to what matters here. */
const BOOKWORM_TEST_JOB = `on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: bookworm
          POSTGRES_PASSWORD: bookworm
          POSTGRES_DB: bookworm_test
    env:
      DATABASE_URL: postgres://bookworm:bookworm@localhost:5432/bookworm_test
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 12.11.2
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - name: Install frontend dependencies
        run: pnpm install --frozen-lockfile
      - name: Install server dependencies
        run: pnpm install --frozen-lockfile
        working-directory: server
      - name: Apply schema to test database
        run: pnpm db:push
        working-directory: server
      - name: Run backend tests
        run: pnpm test
        working-directory: server
`;

const repo = (files: Record<string, string>) => async (path: string) => files[path] ?? null;
/** Two separate pnpm projects, not a workspace: the frontend (holding shared/) at the root, the server in server/. */
const BOOKWORM_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "bookworm", dependencies: { zod: "3" } }),
  "pnpm-lock.yaml": "",
  "server/package.json": JSON.stringify({ scripts: { test: "vitest run", "db:push": "drizzle-kit push" }, devDependencies: { vitest: "3" } }),
  "server/pnpm-lock.yaml": "",
  ".github/workflows/ci.yml": BOOKWORM_TEST_JOB,
};
const detect = async (files: Record<string, string>) =>
  (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(files), workflowFiles: Object.keys(files).filter((f) => f.startsWith(".github/")) })) as Environment;

describe("Node version and installs from CI", () => {
  it("Bookworm's job: node 24 from CI and both installs, root then server", async () => {
    const env = await detect(BOOKWORM_FILES);
    expect(env.image).toBe("node:24-bookworm");
    expect(env.nodeSource).toBe("CI");
    expect(env.installSteps).toEqual([
      { dir: "", cwd: "", command: "pnpm install --frozen-lockfile" },
      { dir: "server", cwd: "server", command: "pnpm install --frozen-lockfile" },
    ]);
    expect(installPlan(env)).toEqual([
      { dir: "", cwd: "", command: "corepack enable && pnpm install --frozen-lockfile" },
      { dir: "server", cwd: "server", command: "corepack enable && pnpm install --frozen-lockfile" },
    ]);
    expect(env.dockerfile).toContain("FROM node:24-bookworm\n");
    expect(env.dockerfile).toContain("# cd . && pnpm install --frozen-lockfile\n# cd server && pnpm install --frozen-lockfile\n# cd server\n");
  });

  it("repository files win over CI: .nvmrc 20 with CI node 24 is 20", async () => {
    const env = await detect({ ...BOOKWORM_FILES, ".nvmrc": "20\n" });
    expect(env.image).toBe("node:20-bookworm");
    expect(env.nodeSource).toBe(".nvmrc");
    const fromFile = await detect({ ...BOOKWORM_FILES, ".node-version": "v18.20.0\n" });
    expect([fromFile.image, fromFile.nodeSource]).toEqual(["node:18-bookworm", ".node-version"]);
    const fromEngines = await detect({ ...BOOKWORM_FILES, "server/package.json": JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "3" }, engines: { node: ">=22" } }) });
    expect([fromEngines.image, fromEngines.nodeSource]).toEqual(["node:22-bookworm", "engines.node"]);
  });

  it("keeps today's single install and default Node when CI has no install step or setup-node", async () => {
    const ci = "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n      - run: pnpm test\n        working-directory: server\n";
    const withCi = await detect({ ...BOOKWORM_FILES, ".github/workflows/ci.yml": ci });
    const noCi = (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(BOOKWORM_FILES) })) as Environment;
    expect(withCi.installSteps).toEqual([]);
    expect(withCi.nodeSource).toBe("default");
    expect(withCi).toEqual(noCi);
    expect(installPlan(withCi)).toEqual([{ dir: "server", cwd: "server", command: "corepack enable && pnpm install --frozen-lockfile" }]);
    expect(withCi.image).toBe("node:22-bookworm");
  });

  it("recognises install commands with flags, --prefix and cd, and skips global or named-package installs", () => {
    const ci = `on: push
jobs:
  test:
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - uses: actions/setup-node@v4
        with:
          node-version: "24.x"
      - run: npm i -g pnpm@9
      - run: npm install left-pad
      - run: npm ci --no-audit
      - run: npm ci --prefix api
      - run: |
          cd web && yarn install --immutable
          yarn
      - run: npm test
      - run: npm install
`;
    const job = ciTestJob([{ path: "ci.yml", text: ci }], "app")!;
    expect(installStepsFromJob(job)).toEqual([
      { dir: "app", cwd: "app", command: "npm ci --no-audit" },
      // --prefix: installs app/api but runs from app, as written.
      { dir: "app/api", cwd: "app", command: "npm ci --prefix api" },
      { dir: "app/web", cwd: "app/web", command: "yarn install --immutable" },
      { dir: "app", cwd: "app", command: "yarn" },
    ]);
    expect(nodeMajorFromJob(job)).toBe(24);
  });
});

describe("an install with --prefix", () => {
  it("runs from the step's directory as written and records the package it installs", async () => {
    const ci = "on: push\njobs:\n  test:\n    steps:\n      - run: npm ci --prefix server\n      - run: npm --prefix server test\n";
    const files = { "server/package.json": JSON.stringify({ scripts: { test: "node --test" } }), "server/package-lock.json": "{}", ".github/workflows/ci.yml": ci };
    const env = await detect(files);
    const row: TaskRow = { instance_id: "x-1", repo: "o/x", base_commit: "abc", patch: "+++ b/server/a.js\n", test_patch: "+++ b/server/test/a.test.js\n", FAIL_TO_PASS: [], PASS_TO_PASS: [] };
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: new FakeSuiteRunner({}) });
    expect(result.eval_script).toContain("git apply --whitespace=nowarn /patches/fix.diff\ncd /work\nif ! { npm ci --prefix server; }");
    expect(result.install_dirs).toEqual(["server"]);
  });
});

describe("several installs in the container script", () => {
  const plan: RunPlan = {
    repoDir: "/r", baseCommit: "abc", patch: "", testPatch: "", installDir: "server", installCommand: "npm ci", packageDir: "server", testSteps: ["npx vitest run || x"],
    installSteps: [{ dir: "", command: "corepack enable && pnpm install --frozen-lockfile" }, { dir: "server", command: "corepack enable && pnpm install --frozen-lockfile" }],
  };

  it("runs each install, in order, inside its own guard, before the test steps", () => {
    const script = containerScript(plan, "r1");
    expect(script).toContain("cd /work\nif ! { corepack enable && pnpm install --frozen-lockfile; }");
    expect(script).toContain("cat /patches/install.log\ncd /work/server\nif ! { corepack enable && pnpm install --frozen-lockfile; }");
    expect(script).not.toContain("npm ci");
    expect(script.lastIndexOf("install.log")).toBeLessThan(script.indexOf("REPORT_DIR"));
  });

  it("stops at a failing second install with the install exit code and its first error line (real bash)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hecate-installs-"));
    const log = join(dir, "install.log");
    const script = ["set -e", installGuard("echo root-ok"), installGuard("sh -c 'echo \" ERR_PNPM_NO_LOCKFILE  Cannot install with frozen-lockfile\"; exit 1'"), "echo after"]
      .join("\n").split(INSTALL_LOG).join(log);
    try {
      const error = await promisify(execFile)("bash", ["-c", script]).then(() => null, (e: { code: number; stdout: string }) => e);
      expect(error?.code).toBe(INSTALL_FAILED_EXIT);
      expect(error?.stdout).toContain("root-ok");
      expect(error?.stdout).not.toContain("after");
      expect(installErrorLine(await readFile(log, "utf8"))).toBe("ERR_PNPM_NO_LOCKFILE  Cannot install with frozen-lockfile");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("test files that never load after the fix", () => {
  const row: TaskRow = {
    instance_id: "JoKHerre__Bookworm-3", repo: "JoKHerre/Bookworm", base_commit: "abc",
    patch: "diff --git a/server/src/a.ts b/server/src/a.ts\n+++ b/server/src/a.ts\n",
    test_patch: "diff --git a/server/test/books.test.ts b/server/test/books.test.ts\n+++ b/server/test/books.test.ts\n",
    FAIL_TO_PASS: [], PASS_TO_PASS: [],
  };
  const env = async () => detect(BOOKWORM_FILES);
  const load = "server/test/books.test.ts::(load)";

  it("keeps the verdict but says so in detail, the result, and the batch summary", async () => {
    const runner = new FakeSuiteRunner({ r0: { [load]: "failed" }, r1: { [load]: "failed" }, r2: { [load]: "failed" } });
    const { runs, ...result } = await validateTask({ row, repoDir: "/r", env: await env(), modified: new Set(), runner });
    void runs;
    expect(result.validation_status).toBe("rejected");
    expect(result.reason).toBe("no_fail_to_pass");
    expect(result.detail).toBe("test patch file(s) never loaded after the fix: server/test/books.test.ts; check the run log");
    expect(result.test_files_never_loaded).toEqual(["server/test/books.test.ts"]);
    expect(summaryMarkdown(summarize([result]))).toContain("| JoKHerre__Bookworm-3 | rejected | no_fail_to_pass (test patch file(s) never loaded after the fix: server/test/books.test.ts) |");
  });

  it("adds no note when the file loads in R2 (a load failure in R1 is the expected kind)", async () => {
    const runner = new FakeSuiteRunner({ r1: { [load]: "failed" }, r2: { "server/test/books.test.ts::adds a book": "passed" } });
    const { runs, ...result } = await validateTask({ row, repoDir: "/r", env: await env(), modified: new Set(), runner });
    void runs;
    expect(result.validation_status).toBe("validated");
    expect(result.detail).toBeNull();
    expect(result.test_files_never_loaded).toBeUndefined();
    expect(summaryMarkdown(summarize([result]))).toContain("| JoKHerre__Bookworm-3 | validated |  |");
  });

  it("records the install directories and the Node source in the result and in eval_script", async () => {
    const { runs, ...result } = await validateTask({ row, repoDir: "/r", env: await env(), modified: new Set(), runner: new FakeSuiteRunner({}) });
    void runs;
    expect(result.install_dirs).toEqual(["", "server"]);
    expect(result.node_source).toBe("from CI");
    expect(result.eval_script!.startsWith("# node: node:24-bookworm (from CI)\n# install in: ., server (from CI)\n# service postgres:")).toBe(true);
    const nvmrc = await validateTask({ row, repoDir: "/r", env: await detect({ ...BOOKWORM_FILES, ".nvmrc": "20" }), modified: new Set(), runner: new FakeSuiteRunner({}) });
    expect(nvmrc.node_source).toBe("from .nvmrc");
  });
});
