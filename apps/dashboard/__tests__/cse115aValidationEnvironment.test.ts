import { describe, expect, it } from "vitest";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";

const vitestPkg = JSON.stringify({ name: "app", scripts: { test: "vitest" }, devDependencies: { vitest: "^3.0.0" } });

describe("detectEnvironment", () => {
  it("supports vitest with npm and a package-lock", () => {
    const env = detectEnvironment({ packageJson: vitestPkg, lockfiles: ["package-lock.json"] });
    expect(env).toMatchObject({ supported: true, runner: "vitest", packageManager: "npm", installCommand: "npm ci", image: "node:22-bookworm" });
    if (env.supported) {
      expect(env.testCommand).toContain("--reporter=json --outputFile=$REPORT");
      expect(env.dockerfile).toContain("FROM node:22-bookworm");
    }
  });

  it("uses npm install when there is no lockfile", () => {
    expect(detectEnvironment({ packageJson: vitestPkg, lockfiles: [] })).toMatchObject({ supported: true, installCommand: "npm install" });
  });

  it("uses pnpm or yarn through corepack when their lockfile is present", () => {
    expect(detectEnvironment({ packageJson: vitestPkg, lockfiles: ["pnpm-lock.yaml"] })).toMatchObject({ packageManager: "pnpm", installCommand: "corepack enable && pnpm install --frozen-lockfile" });
    expect(detectEnvironment({ packageJson: vitestPkg, lockfiles: ["yarn.lock"] })).toMatchObject({ packageManager: "yarn", installCommand: "corepack enable && yarn install --immutable" });
  });

  it("finds vitest in dependencies too, and ignores the test script", () => {
    const pkg = JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' }, dependencies: { vitest: "3.0.0" } });
    expect(detectEnvironment({ packageJson: pkg, lockfiles: [] })).toMatchObject({ supported: true });
  });

  it("rejects jest, bun, a missing package.json, and bad JSON with a detail", () => {
    const jest = JSON.stringify({ devDependencies: { jest: "^29" } });
    expect(detectEnvironment({ packageJson: jest, lockfiles: ["package-lock.json"] })).toEqual({ supported: false, reason: "env_unsupported", detail: "jest; only vitest is supported in the first batch" });
    expect(detectEnvironment({ packageJson: vitestPkg, lockfiles: ["bun.lockb"] })).toMatchObject({ supported: false, detail: expect.stringContaining("bun") });
    expect(detectEnvironment({ packageJson: null, lockfiles: [] })).toMatchObject({ supported: false, detail: "no package.json at the repository root" });
    expect(detectEnvironment({ packageJson: "{not json", lockfiles: [] })).toMatchObject({ supported: false, detail: "package.json is not valid JSON" });
    expect(detectEnvironment({ packageJson: "{}", lockfiles: [] })).toMatchObject({ supported: false, detail: "no vitest dependency" });
  });
});
