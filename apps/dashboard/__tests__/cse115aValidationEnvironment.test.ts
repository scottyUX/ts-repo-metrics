import { describe, expect, it } from "vitest";
import { detectEnvironment, nodeMajorFrom, stepsFromTestScript } from "@/lib/cse115a/benchmark/validation/environment";

/** A fake repository: path → contents. */
function repo(files: Record<string, string | object>) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return async (path: string) => map.get(path) ?? null;
}

const vitestPkg = { name: "app", scripts: { test: "vitest" }, devDependencies: { vitest: "^3.0.0" } };

describe("detectEnvironment: single package at the root", () => {
  it("supports vitest with npm and a package-lock", async () => {
    const env = await detectEnvironment({ testFiles: ["src/sum.test.ts"], read: repo({ "package.json": vitestPkg, "package-lock.json": "{}" }) });
    expect(env).toMatchObject({ supported: true, runners: ["vitest"], packageManager: "npm", installCommand: "npm ci", packageDir: "", installDir: "", image: "node:22-bookworm" });
    if (env.supported) {
      expect(env.testSteps).toEqual([{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }]);
      expect(env.dockerfile).toContain("FROM node:22-bookworm");
      expect(env.env).toMatchObject({ CI: "true", DATABASE_URL: expect.stringContaining("postgresql://") });
      expect(env.dockerfile).toContain("ENV CI=true");
    }
  });

  it("uses npm install when there is no lockfile, and pnpm or yarn through corepack", async () => {
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg }) })).toMatchObject({ installCommand: "npm install" });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg, "pnpm-lock.yaml": "" }) })).toMatchObject({ packageManager: "pnpm", installCommand: "corepack enable && pnpm install --frozen-lockfile" });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg, "yarn.lock": "" }) })).toMatchObject({ packageManager: "yarn", installCommand: "corepack enable && yarn install --immutable" });
  });

  it("falls back to vitest when the test script is npm's default but vitest is a dependency", async () => {
    const pkg = { scripts: { test: 'echo "Error: no test specified" && exit 1' }, dependencies: { vitest: "3.0.0" } };
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": pkg }) })).toMatchObject({ supported: true, runners: ["vitest"] });
  });

  it("reads the Node version from .nvmrc or engines", async () => {
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg, ".nvmrc": "24\n" }) })).toMatchObject({ image: "node:24-bookworm" });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": { ...vitestPkg, engines: { node: ">=20" } } }) })).toMatchObject({ image: "node:20-bookworm" });
  });

  it("rejects bun, a missing package.json, bad JSON, and a script with no known runner", async () => {
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg, "bun.lockb": "" }) })).toMatchObject({ supported: false, detail: expect.stringContaining("bun") });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({}) })).toMatchObject({ supported: false, detail: "no package.json above the test files or at the repository root" });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": "{not json" }) })).toMatchObject({ supported: false, detail: "package.json is not valid JSON" });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": { scripts: { test: "mocha" } } }) })).toMatchObject({ supported: false, detail: expect.stringContaining("mocha") });
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": {} }) })).toMatchObject({ supported: false, detail: "no vitest or jest dependency and no test script in the repository root" });
  });
});

describe("detectEnvironment: jest", () => {
  const jestStep = (i: number) => `npx jest --ci --json --outputFile=$REPORT_DIR/jest-${i}.json --passWithNoTests`;

  it("turns a bare jest script into one jest step", async () => {
    const pkg = { scripts: { test: "jest" }, devDependencies: { jest: "^29.7.0" } };
    const env = await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": pkg, "package-lock.json": "{}" }) });
    expect(env).toMatchObject({ supported: true, runners: ["jest"] });
    if (env.supported) expect(env.testSteps).toEqual([{ kind: "jest", command: jestStep(0) }]);
  });

  it("keeps --config and test paths, drops --coverage, --watch and --silent", async () => {
    const pkg = { scripts: { test: "jest --config jest.config.ts --coverage" }, devDependencies: { jest: "^29.7.0" } };
    const env = await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": pkg }) });
    if (!env.supported) throw new Error(env.detail);
    expect(env.testSteps).toEqual([{ kind: "jest", command: `${jestStep(0)} --config jest.config.ts` }]);
    expect(stepsFromTestScript("tsc && jest --watch --silent tests/", null)).toEqual([{ kind: "prep", command: "tsc" }, { kind: "jest", command: `${jestStep(1)} tests/` }]);
  });

  it("keeps leading NAME=value assignments, so ESM projects keep NODE_OPTIONS", () => {
    expect(stepsFromTestScript("NODE_OPTIONS=--experimental-vm-modules npx jest", null)).toEqual([{ kind: "jest", command: `NODE_OPTIONS=--experimental-vm-modules ${jestStep(0)}` }]);
  });

  it("falls back to jest when there is a jest dependency and no test script", async () => {
    const env = await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": { devDependencies: { jest: "^29" } }, "package-lock.json": "" }) });
    expect(env).toMatchObject({ supported: true, runners: ["jest"], testSteps: [{ kind: "jest", command: jestStep(0) }] });
  });

  it("still picks vitest for a vitest package", async () => {
    expect(await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": vitestPkg }) })).toMatchObject({ runners: ["vitest"] });
  });

  it("handles heather-loll/115a-restroom-app: an Expo app in client/ with jest-expo and no root package.json", async () => {
    const pkg = { scripts: { start: "expo start", lint: "expo lint", test: "jest" }, devDependencies: { jest: "~30.5.2", "jest-expo": "~58.0.12" }, jest: { preset: "jest-expo" } };
    const env = await detectEnvironment({ testFiles: ["client/src/components/BottomNav.test.tsx"], read: repo({ "client/package.json": pkg, "client/package-lock.json": "{}" }) });
    expect(env).toMatchObject({ supported: true, runners: ["jest"], packageDir: "client", installDir: "client", installCommand: "npm ci", testSteps: [{ kind: "jest", command: jestStep(0) }] });
  });
});

describe("detectEnvironment: nested package and node --test (the PocketWatch shape)", () => {
  const files = {
    "package.json": { name: "root", devDependencies: { prettier: "^3" } },
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "pnpm-lock.yaml": "",
    ".nvmrc": "24",
    "apps/api/package.json": { name: "@app/api", scripts: { test: "vitest run && pnpm build && node --test tests/*.test.mjs", build: "nest build" }, devDependencies: { vitest: "^3" } },
  };

  it("installs at the workspace root and tests in the package, following its test script", async () => {
    const env = await detectEnvironment({ testFiles: ["apps/api/tests/logout-all.test.mjs"], read: repo(files) });
    expect(env).toMatchObject({ supported: true, packageDir: "apps/api", installDir: "", packageManager: "pnpm", runners: ["vitest", "node-test"], image: "node:24-bookworm" });
    if (env.supported) {
      expect(env.testSteps).toEqual([
        { kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" },
        { kind: "prep", command: "pnpm build" },
        { kind: "node-test", command: "REPORT=$REPORT_DIR/node-2.json node --test --test-reporter=/patches/reporter.mjs tests/*.test.mjs" },
      ]);
    }
  });

  it("installs in the package itself when the root is not a workspace", async () => {
    const env = await detectEnvironment({
      testFiles: ["server/backend_tests/auth.test.ts"],
      read: repo({ "package.json": { name: "frontend" }, "server/package.json": { scripts: { test: 'node --test "backend_tests/*.test.ts"' } }, "server/package-lock.json": "" }),
    });
    expect(env).toMatchObject({ supported: true, packageDir: "server", installDir: "server", installCommand: "npm ci", runners: ["node-test"] });
  });

  // This used to be env_unsupported ("test files span two packages"); it is now two suites.
  it("splits test files that belong to two different packages into two suites", async () => {
    const env = await detectEnvironment({
      testFiles: ["apps/api/a.test.ts", "apps/web/b.test.ts"],
      read: repo({ ...files, "apps/web/package.json": vitestPkg }),
    });
    expect(env).toMatchObject({ supported: true, packageDir: "apps/api" });
    if (env.supported) expect(env.suites?.map((s) => [s.packageDir, s.runners])).toEqual([["apps/api", ["vitest", "node-test"]], ["apps/web", ["vitest"]]]);
  });
});

describe("stepsFromTestScript and nodeMajorFrom", () => {
  it("keeps prep segments as written and only rewrites the runners", () => {
    expect(stepsFromTestScript("tsc && vitest run --coverage && node --test dist/tests", null).map((s) => s.kind)).toEqual(["prep", "vitest", "node-test"]);
    expect(stepsFromTestScript(null, "vitest")).toHaveLength(1);
    expect(stepsFromTestScript(null, null)).toEqual([]);
  });

  it("parses Node majors and ignores what it cannot read", () => {
    expect(nodeMajorFrom("v24.1.0\n", undefined)).toBe(24);
    expect(nodeMajorFrom(null, "^22.0.0")).toBe(22);
    expect(nodeMajorFrom("lts/*", undefined)).toBeNull();
  });
});
