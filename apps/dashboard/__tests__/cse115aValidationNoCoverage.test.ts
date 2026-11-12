// #288: a result made without --fix-coverage is byte for byte what the validator wrote before the
// coverage run existed. The three saved results under fixtures/noCoverage/ were written by the code
// at befe21e (the commit before fix_coverage) from these same inputs, for the three shapes the live
// rows have: PocketWatch (Vitest, a build, node --test on build output), Bookworm (node --test with
// a CI Postgres service and two installs) and a pytest package. Set HECATE_WRITE_NO_COVERAGE_FIXTURES=1
// to rewrite them (only ever from that commit).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { FakeSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const tree = (files: Record<string, string>) => async (path: string) => files[path] ?? null;

const CI_POSTGRES = `on: push
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
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgres://bookworm:bookworm@localhost:5432/bookworm_test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - run: pnpm install --frozen-lockfile
      - run: pnpm install --frozen-lockfile
        working-directory: server
      - run: pnpm db:push
        working-directory: server
      - run: pnpm test
        working-directory: server
`;

type Shape = { name: string; files: Record<string, string>; testFiles: string[]; workflows: string[]; row: TaskRow; r1: Record<string, "passed" | "failed">; r2: Record<string, "passed" | "failed"> };

const patch = (path: string, text: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${text}\n`;

const SHAPES: Shape[] = [
  {
    name: "pocketwatch",
    files: {
      ".nvmrc": "24\n",
      "package.json": JSON.stringify({ private: true }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "",
      "apps/api/package.json": JSON.stringify({ type: "module", scripts: { build: "nest build", test: "vitest run && pnpm build && node --test tests/*.test.mjs" }, devDependencies: { vitest: "^5.1.0" } }),
      "apps/api/tsconfig.json": JSON.stringify({ compilerOptions: { outDir: "./dist", rootDir: "./src", sourceMap: true }, include: ["src/**/*.ts"] }),
      "apps/api/tests/cleanup.test.mjs": `import { Cleanup } from "../dist/auth/cleanup.service.js";\n`,
      "apps/api/src/auth/cleanup.service.ts": "export class Cleanup {}\n",
      "apps/api/src/app.module.ts": "export class AppModule {}\n",
    },
    testFiles: ["apps/api/tests/cleanup.test.mjs"], workflows: [],
    row: {
      instance_id: "Team__PocketWatch-cleanup-1", repo: "team/pocketwatch", base_commit: "c97955fd766e2787c5c16628441b133a63978f7a",
      patch: patch("apps/api/src/auth/cleanup.service.ts", "export class Cleanup { run() {} }") + patch("apps/api/src/app.module.ts", "export class AppModule { x = 1 }"),
      test_patch: "diff --git a/apps/api/tests/cleanup.test.mjs b/apps/api/tests/cleanup.test.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/apps/api/tests/cleanup.test.mjs\n@@ -0,0 +1 @@\n+test\n",
      FAIL_TO_PASS: [], PASS_TO_PASS: [],
    },
    r1: { "apps/api/tests/cleanup.test.mjs::cleanup deletes": "failed", "apps/api/src/old.spec.ts::keeps": "passed" },
    r2: { "apps/api/tests/cleanup.test.mjs::cleanup deletes": "passed", "apps/api/src/old.spec.ts::keeps": "passed" },
  },
  {
    name: "bookworm",
    files: {
      "package.json": JSON.stringify({ private: true }),
      "pnpm-lock.yaml": "",
      "server/package.json": JSON.stringify({ scripts: { test: `node --test "backend_tests/*.test.ts"`, "db:push": "drizzle-kit push" } }),
      "server/pnpm-lock.yaml": "",
      ".github/workflows/ci.yml": CI_POSTGRES,
      "server/backend_tests/schema.test.ts": `import { books } from "../src/db/schema.ts";\n`,
      "server/src/db/schema.ts": "export const books = 1;\n",
      "server/src/routes/library.ts": "export const library = 1;\n",
    },
    testFiles: ["server/backend_tests/schema.test.ts"], workflows: [".github/workflows/ci.yml"],
    row: {
      instance_id: "Team__Bookworm-COL-1", repo: "team/bookworm", base_commit: "4122f9a921e8471c7d4fd06551e1dadf79694787",
      patch: patch("server/src/db/schema.ts", "export const books = 2;") + patch("server/src/routes/library.ts", "export const library = 2;"),
      test_patch: "diff --git a/server/backend_tests/schema.test.ts b/server/backend_tests/schema.test.ts\n--- a/server/backend_tests/schema.test.ts\n+++ b/server/backend_tests/schema.test.ts\n@@ -1 +1 @@\n-a\n+b\n",
      FAIL_TO_PASS: [], PASS_TO_PASS: [],
    },
    r1: { "server/backend_tests/schema.test.ts::COL-1 status": "failed", "server/backend_tests/schema.test.ts::creates": "passed" },
    r2: { "server/backend_tests/schema.test.ts::COL-1 status": "passed", "server/backend_tests/schema.test.ts::creates": "passed" },
  },
  {
    name: "pytest",
    files: {
      "server/requirements.txt": "flask\n",
      "server/tests/test_prefs.py": "from app.preferences import rank\n",
      "server/app/__init__.py": "",
      "server/app/preferences.py": "def rank(x):\n    return x\n",
      "server/app/unused.py": "X = 1\n",
    },
    testFiles: ["server/tests/test_prefs.py"], workflows: [],
    row: {
      instance_id: "Team__Restroom-US-1", repo: "team/restroom", base_commit: "d8ec697dd896cbe94efab060b28a86736d053efc",
      patch: patch("server/app/preferences.py", "def rank(x): return sorted(x)") + patch("server/app/unused.py", "X = 2"),
      test_patch: "diff --git a/server/tests/test_prefs.py b/server/tests/test_prefs.py\n--- a/server/tests/test_prefs.py\n+++ b/server/tests/test_prefs.py\n@@ -1 +1 @@\n-a\n+b\n",
      FAIL_TO_PASS: [], PASS_TO_PASS: [],
    },
    r1: { "server/tests/test_prefs.py::test_rank": "failed", "server/tests/test_prefs.py::test_old": "passed" },
    r2: { "server/tests/test_prefs.py::test_rank": "passed", "server/tests/test_prefs.py::test_old": "passed" },
  },
];

const FIXTURES = join(__dirname, "fixtures", "noCoverage");

describe("results without --fix-coverage", () => {
  for (const shape of SHAPES) {
    it(`${shape.name}: byte-identical to the result written before fix_coverage existed`, async () => {
      const read = tree(shape.files);
      const env = (await detectEnvironment({ testFiles: shape.testFiles, read, workflowFiles: shape.workflows })) as Environment;
      expect(env.supported).toBe(true);
      const runner = new FakeSuiteRunner({ r0: shape.r1, r1: shape.r1, r2: shape.r2 });
      const { runs, ...result } = await validateTask({
        row: shape.row, repoDir: "/repo", env, modified: new Set(), runner,
        withPostFixTree: (fn) => fn(read),
      });
      void runs;
      const text = JSON.stringify(result, null, 2) + "\n";
      const file = join(FIXTURES, `${shape.name}.json`);
      if (process.env.HECATE_WRITE_NO_COVERAGE_FIXTURES) writeFileSync(file, text);
      expect(text).toBe(readFileSync(file, "utf8"));
      // The shape is the one intended: a validated row whose import rule flags a file.
      expect(result.validation_status).toBe("validated");
      expect(result.untested_files?.length).toBe(1);
    });
  }
});
