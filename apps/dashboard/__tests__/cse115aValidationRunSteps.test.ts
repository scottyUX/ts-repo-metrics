// Run steps inside a test script (#459): `npm run x` and its pnpm and yarn forms are followed into
// script `x`, so a `node --test` or `tsx --test` inside it gets our reporter. All names made up.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEnvironment, NPM_BIN_PATH, RUN_STEP_DEPTH, stepsFromTestScript, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { FakeSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { proofThroughFixScript, validateTask, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { rejectedWithoutRun, summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { buildHarborTask, harborEnvFrom, verifiedRow } from "@/lib/cse115a/benchmark/validation/harbor";

const REPORTER = "--test-reporter=/patches/reporter.mjs";
const node = (i: number, rest: string) => ({ kind: "node-test", command: `REPORT=$REPORT_DIR/node-${i}.json node --test ${REPORTER} ${rest}` });
const jest = (i: number, rest = "") => ({ kind: "jest", command: `npx jest --ci --json --outputFile=$REPORT_DIR/jest-${i}.json --passWithNoTests${rest}` });
const prep = (command: string) => ({ kind: "prep", command });
const innerPrep = (command: string) => prep(`${NPM_BIN_PATH} ${command}`);

describe("stepsFromTestScript: run steps are followed into their script", () => {
  it("gives the reporter to a node --test inside `npm run b`", () => {
    expect(stepsFromTestScript("eslint . && npm run b", null, { b: "node --test spec/" })).toEqual([prep("eslint ."), node(1, "spec/")]);
  });

  it("follows two levels", () => {
    const scripts = { all: "npm run unit", unit: "node --test spec/" };
    expect(stepsFromTestScript("npm run all", null, scripts)).toEqual([node(0, "spec/")]);
  });

  it("stops a script that calls itself and leaves the repeated step opaque", () => {
    const scripts = { loop: "npm run loop && node --test spec/" };
    expect(stepsFromTestScript("npm run loop", null, scripts)).toEqual([innerPrep("npm run loop"), node(1, "spec/")]);
    // A test script that runs itself.
    expect(stepsFromTestScript("npm run test", null, { test: "npm run test" })).toEqual([prep("npm run test")]);
  });

  it(`stops after ${RUN_STEP_DEPTH} levels and leaves the deeper step opaque`, () => {
    const scripts = { a: "npm run b", b: "npm run c", c: "npm run d", d: "node --test spec/" };
    // `npm run d` is past the limit and stays opaque, so nothing above it runs a runner either.
    expect(stepsFromTestScript("npm run a", null, scripts)).toEqual([prep("npm run a")]);
    expect(stepsFromTestScript("npm run b", null, scripts)).toEqual([node(0, "spec/")]);
  });

  it("leaves a step that names no script opaque, exactly as before", () => {
    expect(stepsFromTestScript("npm run missing && jest", null, { other: "node --test" })).toEqual(stepsFromTestScript("npm run missing && jest", null));
    expect(stepsFromTestScript("npm run missing && jest", null, {})).toEqual([prep("npm run missing"), jest(1)]);
  });

  it("follows npm run-script, pnpm run, pnpm x, yarn run and yarn x", () => {
    const scripts = { "test:unit": "node --test spec/" };
    for (const step of ["npm run-script test:unit", "pnpm run test:unit", "pnpm test:unit", "yarn run test:unit", "yarn test:unit", "npm run --silent test:unit"]) {
      expect(stepsFromTestScript(step, null, scripts), step).toEqual([node(0, "spec/")]);
    }
  });

  it("leaves a run step whose script runs no tests (a build) as written", () => {
    expect(stepsFromTestScript("pnpm build && node --test spec/", null, { build: "tsc -p ." })).toEqual([prep("pnpm build"), node(1, "spec/")]);
    expect(stepsFromTestScript("npm run unit", null, { unit: "npm run build && node --test dist/", build: "tsc" }))
      .toEqual([innerPrep("npm run build"), node(1, "dist/")]);
  });

  it("does not take a pnpm or yarn command for a script of the same name", () => {
    expect(stepsFromTestScript("pnpm install && pnpm unit", null, { install: "node --test a", unit: "node --test spec/" }))
      .toEqual([prep("pnpm install"), node(1, "spec/")]);
  });

  it("keeps npm's pre and post scripts as preparation steps around the script", () => {
    const scripts = { preunit: "node seed.mjs", unit: "node --test spec/", postunit: "node clean.mjs" };
    expect(stepsFromTestScript("npm run unit", null, scripts)).toEqual([prep("npm run preunit"), node(1, "spec/"), prep("npm run postunit")]);
    // pnpm (7 and later) and yarn (2 and later) do not run them.
    expect(stepsFromTestScript("pnpm run unit", null, scripts)).toEqual([node(0, "spec/")]);
  });

  it("passes the words after npm's -- to the script's last segment", () => {
    const scripts = { unit: "tsc && node --test dist/" };
    expect(stepsFromTestScript("npm run unit -- --test-concurrency=1", null, scripts)).toEqual([innerPrep("tsc"), node(1, "dist/ --test-concurrency=1")]);
    // pnpm and yarn with extra words: left opaque.
    expect(stepsFromTestScript("pnpm run unit --watch", null, scripts)).toEqual([prep("pnpm run unit --watch")]);
  });

  it("runs a preparation segment from inside a script with node_modules/.bin on PATH, as npm run does", () => {
    expect(stepsFromTestScript("npm run unit", null, { unit: "tsc -p . && node --test dist/" })).toEqual([innerPrep("tsc -p ."), node(1, "dist/")]);
    const dir = mkdtempSync(join(tmpdir(), "hecate-binpath-"));
    try {
      const pkg = join(dir, "apps", "api");
      mkdirSync(join(pkg, "node_modules", ".bin"), { recursive: true });
      mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
      for (const [where, name] of [[pkg, "local-tool"], [dir, "hoisted-tool"]] as const) {
        writeFileSync(join(where, "node_modules", ".bin", name), `#!/bin/sh\necho ${name} ran\n`);
        chmodSync(join(where, "node_modules", ".bin", name), 0o755);
      }
      const out = spawnSync("bash", ["-c", `${NPM_BIN_PATH} local-tool && ${NPM_BIN_PATH} hoisted-tool`], { cwd: pkg, encoding: "utf8" });
      expect(out.stdout).toBe("local-tool ran\nhoisted-tool ran\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recognises tsx --test and npx tsx --test, started through npx", () => {
    expect(stepsFromTestScript("tsx --test spec/a.test.ts", null, {})).toEqual([
      { kind: "node-test", command: `REPORT=$REPORT_DIR/node-0.json npx tsx --test ${REPORTER} spec/a.test.ts` },
    ]);
    expect(stepsFromTestScript("jest && npm run unit", "jest", { unit: "npx tsx --test spec/*.test.ts" })).toEqual([
      jest(0), { kind: "node-test", command: `REPORT=$REPORT_DIR/node-1.json npx tsx --test ${REPORTER} spec/*.test.ts` },
    ]);
  });

  it("does not append the default runner when an expanded script already runs it", () => {
    expect(stepsFromTestScript("npm run unit", "jest", { unit: "jest --runInBand" })).toEqual([jest(0, " --runInBand")]);
    // Before expansion, the opaque step plus the appended default ran jest twice.
    expect(stepsFromTestScript("npm run unit", "jest")).toEqual([prep("npm run unit"), jest(0)]);
  });

  it("leaves a workspace fan-out opaque", () => {
    const scripts = { test: "x", unit: "node --test spec/" };
    for (const step of ["npm run test --workspaces", "npm run unit -w api", "npm run unit --workspace=api", "pnpm --filter api unit", "pnpm -r unit", "yarn workspaces run unit"]) {
      expect(stepsFromTestScript(step, null, scripts), step).toEqual([prep(step)]);
    }
  });

  it("leaves a script that changes the shell opaque, so its cd does not leak into later steps", () => {
    const scripts = { api: "cd server && node --test spec/", env: "export TZ=UTC && node --test spec/", ui: "jest" };
    expect(stepsFromTestScript("npm run api && npm run ui", null, scripts)).toEqual([prep("npm run api"), jest(1)]);
    expect(stepsFromTestScript("npm run env", null, scripts)).toEqual([prep("npm run env")]);
  });

  it("does not follow a run step after a cd, which would read another folder's package.json", () => {
    expect(stepsFromTestScript("cd server && npm run unit", null, { unit: "node --test spec/" })).toEqual([prep("cd server"), prep("npm run unit")]);
  });
});

describe("stepsFromTestScript: scripts with no run step are unchanged", () => {
  const scripts = { build: "tsc", lint: "eslint .", "test:unit": "node --test spec/", pretest: "node seed.mjs" };
  const pinned: Array<[string | null, "vitest" | "jest" | null, unknown[]]> = [
    [null, "vitest", [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }]],
    ['echo "Error: no test specified" && exit 1', "jest", [jest(0)]],
    ["tsc && vitest run --coverage && node --test dist/tests", null, [
      prep("tsc"),
      { kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-1.json --passWithNoTests" },
      node(2, "dist/tests"),
    ]],
    ["NODE_OPTIONS=--experimental-vm-modules jest --coverage spec/", null, [{ kind: "jest", command: "NODE_OPTIONS=--experimental-vm-modules npx jest --ci --json --outputFile=$REPORT_DIR/jest-0.json --passWithNoTests spec/" }]],
    ["node --experimental-strip-types --test spec/*.test.ts", "jest", [
      { kind: "node-test", command: `REPORT=$REPORT_DIR/node-0.json node --experimental-strip-types --test ${REPORTER} spec/*.test.ts` },
    ]],
    ["cd server && mocha", "vitest", [prep("cd server"), prep("mocha"), { kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }]],
    ["yarn jest --runInBand", null, [jest(0, " --runInBand")]],
  ];
  it.each(pinned)("%s", (script, runner, expected) => {
    expect(stepsFromTestScript(script, runner, scripts)).toEqual(expected);
    expect(stepsFromTestScript(script, runner)).toEqual(expected);
  });
});

/** A fake repository: path → contents. */
function repo(files: Record<string, string | object>) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return async (path: string) => map.get(path) ?? null;
}

const splitPkg = {
  name: "made-up-ledger",
  scripts: { test: "npm run test:unit && npm run test:ui", "test:unit": "node --experimental-strip-types --test spec/unit/*.test.ts", "test:ui": "jest" },
  devDependencies: { jest: "^30.0.0" },
};

describe("detectEnvironment with run steps", () => {
  it("expands the package's scripts: node --test gets the reporter and jest runs once", async () => {
    const env = await detectEnvironment({ testFiles: ["spec/unit/total.test.ts"], read: repo({ "package.json": splitPkg, "package-lock.json": "{}" }) });
    expect(env).toMatchObject({ supported: true, runners: ["node-test", "jest"] });
    if (!env.supported) return;
    expect(env.testSteps).toEqual([
      { kind: "node-test", command: `REPORT=$REPORT_DIR/node-0.json node --experimental-strip-types --test ${REPORTER} spec/unit/*.test.ts` },
      jest(1),
    ]);
  });

  it("carries the expanded steps into the Harbor export", async () => {
    const env = await detectEnvironment({ testFiles: ["spec/unit/total.test.ts"], read: repo({ "package.json": splitPkg, "package-lock.json": "{}" }) }) as Environment;
    const row: TaskRow = {
      instance_id: "made-up__ledger-T-1", repo: "made-up/ledger", base_commit: "0123456",
      patch: "diff --git a/src/total.ts b/src/total.ts\n", test_patch: "diff --git a/spec/unit/total.test.ts b/spec/unit/total.test.ts\n",
      FAIL_TO_PASS: [], PASS_TO_PASS: [],
    };
    const result: ValidationResult = {
      ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
      FAIL_TO_PASS: ["spec/unit/total.test.ts::adds"], image: env.image,
    };
    const recipe = harborEnvFrom(env);
    expect(recipe.test_steps).toEqual(env.testSteps);
    const test = buildHarborTask({ row: { ...verifiedRow(row, result), problem_statement: "Add totals.", hints_text: "" }, env: recipe, source: { kind: "bundle", file: "repo.bundle" } }).get("tests/test.sh")!;
    expect(test).toContain(`REPORT=$REPORT_DIR/node-0.json node --experimental-strip-types --test --test-reporter=/tests/reporter.mjs spec/unit/*.test.ts || true\n${jest(1).command} || true`);
    expect(test).not.toContain("npm run test:unit");
  });
});

describe("proof_through_fix_script", () => {
  const testFiles = ["spec/new.test.ts", "spec/old.test.ts"];

  it("lists proving ids whose test-patch file was present in R1 but not run there", () => {
    const r1 = [{ "spec/old.test.ts::kept": "passed" as const }];
    expect(proofThroughFixScript(["spec/new.test.ts::adds", "spec/old.test.ts::kept", "spec/other.test.ts::was failing"], testFiles, r1))
      .toEqual(["spec/new.test.ts::adds"]);
    // A file that failed to load in R1 did run there.
    expect(proofThroughFixScript(["spec/new.test.ts::adds"], testFiles, [{ "spec/new.test.ts::(load)": "failed" }])).toEqual([]);
  });

  const row: TaskRow = {
    instance_id: "made-up__ledger-T-2", repo: "made-up/ledger", base_commit: "0123456",
    patch: "diff --git a/package.json b/package.json\n",
    test_patch: "diff --git a/spec/new.test.ts b/spec/new.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/spec/new.test.ts\n",
    FAIL_TO_PASS: [], PASS_TO_PASS: [],
  };
  const env: Environment = {
    supported: true, runners: ["node-test"], packageManager: "npm", packageDir: "", installDir: "", installCommand: "npm ci",
    testSteps: [node(0, "spec/")] as Environment["testSteps"], env: { CI: "true" }, dockerfile: "FROM node:22-bookworm", image: "node:22-bookworm",
  };

  it("is filled for an id absent in R1 that passes after the fix, and the summary says so", async () => {
    const runner = new FakeSuiteRunner({ r0: {}, r1: {}, r2: { "spec/new.test.ts::adds": "passed" } });
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner });
    expect(result).toMatchObject({ validation_status: "validated", ABSENT_TO_PASS: ["spec/new.test.ts::adds"], proof_through_fix_script: ["spec/new.test.ts::adds"] });
    expect(summarize([result]).rows[0].reason).toBe("proof through a fix script: 1");
    expect(summaryMarkdown(summarize([result]))).toContain("| made-up__ledger-T-2 | validated | proof through a fix script: 1 |");
  });

  it("is empty for an ordinary fail-to-pass, and the summary adds nothing", async () => {
    const runner = new FakeSuiteRunner({ r0: {}, r1: { "spec/new.test.ts::adds": "failed" }, r2: { "spec/new.test.ts::adds": "passed" } });
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner });
    expect(result).toMatchObject({ validation_status: "validated", FAIL_TO_PASS: ["spec/new.test.ts::adds"] });
    // Written only when non-empty, so results without one stay byte-identical.
    expect(result).not.toHaveProperty("proof_through_fix_script");
    expect(summarize([result]).rows[0].reason).toBe("");
  });

  it("follows the other notes in the reason cell", () => {
    const base = rejectedWithoutRun(row, "env_error", "");
    const cell = summarize([{ ...base, validation_status: "validated", reason: null, untested_files: ["src/a.ts"], proof_through_fix_script: ["a", "b"] } as ValidationResult]).rows[0].reason;
    expect(cell).toBe("untested files: 1; proof through a fix script: 2");
  });
});
