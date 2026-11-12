// A row with one test suite must come out byte-identical to what the validator produced before
// multi-suite support: the detected environment, the result (field order included) and harbor_env.
// The fixtures in fixtures/singleSuite/ were recorded from the code before that change
// (RECORD_SINGLE_SUITE=1 rewrites them; only do that on purpose).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { harborEnvFrom } from "@/lib/cse115a/benchmark/validation/harbor";
import { FakeSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const BOOKWORM_CI = `on: [push]
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

/** A test patch that adds `file` (enough for filesInPatch). */
const addFile = (file: string) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+test\n`;

type Shape = { name: string; files: Record<string, string>; testFile: string; f2p: string; p2p: string };

const SHAPES: Shape[] = [
  {
    name: "pocketwatch",
    files: {
      "package.json": JSON.stringify({ name: "root", devDependencies: { prettier: "^3" } }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "",
      ".nvmrc": "24",
      "apps/api/package.json": JSON.stringify({ name: "@app/api", scripts: { test: "vitest run && pnpm build && node --test tests/*.test.mjs", build: "nest build" }, devDependencies: { vitest: "^3" } }),
    },
    testFile: "apps/api/tests/logout-all.test.mjs",
    f2p: "apps/api/tests/logout-all.test.mjs::logout all > revokes every session",
    p2p: "apps/api/src/app.spec.ts::app > boots",
  },
  {
    name: "bookworm-postgres",
    files: {
      "package.json": JSON.stringify({ name: "bookworm", dependencies: { zod: "3" } }),
      "pnpm-lock.yaml": "",
      "server/package.json": JSON.stringify({ scripts: { test: "vitest run", "db:push": "drizzle-kit push" }, devDependencies: { vitest: "3" } }),
      "server/pnpm-lock.yaml": "",
      ".github/workflows/ci.yml": BOOKWORM_CI,
    },
    testFile: "server/test/books.test.ts",
    f2p: "server/test/books.test.ts::books > adds a book",
    p2p: "server/test/health.test.ts::health > ok",
  },
  {
    name: "pytest",
    files: {
      "backend/pyproject.toml": '[project]\nname = "api"\nrequires-python = ">=3.11,<4"\ndependencies = ["fastapi"]\n',
      "backend/requirements.txt": "fastapi\npytest\n",
    },
    testFile: "backend/tests/test_api.py",
    f2p: "backend/tests/test_api.py::test_create",
    p2p: "backend/tests/test_health.py::test_ok",
  },
];

/** The environment, the result (without `runs`, timings zeroed) and harbor_env, as the files hold them. */
async function produce(shape: Shape): Promise<string> {
  const read = async (path: string) => shape.files[path] ?? null;
  const workflowFiles = Object.keys(shape.files).filter((f) => f.startsWith(".github/"));
  const env = (await detectEnvironment({ testFiles: [shape.testFile], read, workflowFiles })) as Environment;
  const row: TaskRow = { instance_id: `shape-${shape.name}`, repo: "team/app", base_commit: "0123456789abcdef0123456789abcdef01234567", patch: addFile("src/fix.ts"), test_patch: addFile(shape.testFile), FAIL_TO_PASS: [shape.f2p], PASS_TO_PASS: [] };
  const runner = new FakeSuiteRunner({ r0: { [shape.p2p]: "passed" }, r1: { [shape.p2p]: "passed", [shape.f2p]: "failed" }, r2: { [shape.p2p]: "passed", [shape.f2p]: "passed" } });
  const { runs, ...result } = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner });
  void runs;
  result.timings = Object.fromEntries(Object.keys(result.timings).map((k) => [k, 0]));
  return [
    JSON.stringify(env, null, 2),
    JSON.stringify(result, null, 2),
    JSON.stringify(harborEnvFrom(env), null, 2),
  ].join("\n---\n") + "\n";
}

const fixture = (name: string) => join(__dirname, "fixtures", "singleSuite", `${name}.txt`);

describe("2. one suite: byte-identical to the output before multi-suite support", () => {
  for (const shape of SHAPES) {
    it(`${shape.name}: environment, result and harbor_env`, async () => {
      const text = await produce(shape);
      if (process.env.RECORD_SINGLE_SUITE === "1") writeFileSync(fixture(shape.name), text);
      expect(text).toBe(readFileSync(fixture(shape.name), "utf8"));
      expect(text).not.toContain("suites");
    });
  }
});
