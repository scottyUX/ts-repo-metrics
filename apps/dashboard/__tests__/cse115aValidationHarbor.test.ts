import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import {
  buildHarborTask, CHECK_PY_SOURCE, CHECK_SOURCE, GIT_REINIT_LAYER, githubFetchLayer, harborEnvFrom, harborSkipReason, harborTaskName,
  PYTEST_PLUGIN_DIR, verifiedRow, type HarborEnv,
} from "@/lib/cse115a/benchmark/validation/harbor";
import { PYTEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/pytestReporter";
import { rejectedWithoutRun } from "@/lib/cse115a/benchmark/validation/batch";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const SHA = "28e92a1c0ffee0000000000000000000000000ab";
const row: TaskRow & { problem_statement: string; hints_text: string } = {
  instance_id: "CSE115a-PocketWatch__PocketWatch-logout-all-1", repo: "CSE115a-PocketWatch/PocketWatch", base_commit: "28e92a1",
  patch: "diff --git a/src/a.ts b/src/a.ts\n", test_patch: "diff --git a/tests/a.test.mjs b/tests/a.test.mjs\n",
  FAIL_TO_PASS: [], PASS_TO_PASS: [], problem_statement: "# logout-all-1\n\nLog out of every session.", hints_text: "",
};
const env: Environment = {
  supported: true, runners: ["node-test"], packageManager: "pnpm", packageDir: "apps/api", installDir: "",
  installCommand: "corepack enable && pnpm install --frozen-lockfile",
  testSteps: [{ kind: "prep", command: "pnpm build" }, { kind: "node-test", command: "REPORT=$REPORT_DIR/node-1.json node --test --test-reporter=/patches/reporter.mjs tests/*.test.mjs" }],
  env: { CI: "true" }, dockerfile: "", image: "node:24-bookworm",
};
const result: ValidationResult = {
  ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["apps/api/tests/a.test.mjs::one"], ABSENT_TO_PASS: ["apps/api/tests/a.test.mjs::two"], PASS_TO_PASS: ["apps/api/tests/old.test.mjs::three"],
  image: "node:24-bookworm", image_digest: "node@sha256:8fa9", snapshot_bundle: "snapshots/x.bundle",
};
const recipe = harborEnvFrom(env, result.image_digest);
const bundle = { kind: "bundle", file: "repo.bundle" } as const;

describe("buildHarborTask, bundle source", () => {
  const files = buildHarborTask({ row: verifiedRow(row, result), env: recipe, source: bundle });

  it("writes the five Harbor parts plus the files the verifier needs", () => {
    expect([...files.keys()].sort()).toEqual([
      "environment/Dockerfile", "instruction.md", "solution/fix.diff", "solution/solve.sh", "task.toml",
      "tests/README.md", "tests/check.mjs", "tests/expected.json", "tests/reporter.mjs", "tests/test.diff", "tests/test.sh",
    ]);
  });

  it("builds the image from the digest and the bundle, and installs where the validator did", () => {
    const dockerfile = files.get("environment/Dockerfile")!;
    expect(dockerfile).toContain("FROM node@sha256:8fa9");
    expect(dockerfile).toContain("git clone -q -b hecate-snapshot /tmp/repo.bundle /app");
    expect(dockerfile).toContain("git -C /app checkout -q 28e92a1");
    expect(dockerfile).toContain("RUN cd /app && corepack enable && pnpm install --frozen-lockfile");
    expect(dockerfile).toContain("ENV DATABASE_URL=");
  });

  it("drops the cloned history and re-creates the checkout as one anonymous commit before installing", () => {
    const dockerfile = files.get("environment/Dockerfile")!;
    expect(dockerfile).toContain(GIT_REINIT_LAYER);
    expect(GIT_REINIT_LAYER).toContain("rm -rf .git && git init -q");
    expect(GIT_REINIT_LAYER).toContain("commit -qm base");
    expect(GIT_REINIT_LAYER).not.toMatch(/github|scottyUX|CSE115a/i);
    const lines = dockerfile.split("\n");
    const clone = lines.findIndex((l) => l.includes("git clone"));
    const reinit = lines.indexOf(GIT_REINIT_LAYER);
    const install = lines.findIndex((l) => l.includes("pnpm install"));
    expect(clone).toBeGreaterThanOrEqual(0);
    expect(reinit).toBeGreaterThan(clone);
    expect(install).toBeGreaterThan(reinit);
  });

  it("grades F2P plus A2P and P2P, with the reporter path moved to /tests", () => {
    expect(JSON.parse(files.get("tests/expected.json")!)).toEqual({
      FAIL_TO_PASS: ["apps/api/tests/a.test.mjs::one", "apps/api/tests/a.test.mjs::two"], PASS_TO_PASS: ["apps/api/tests/old.test.mjs::three"],
    });
    const test = files.get("tests/test.sh")!;
    expect(test).toContain("git apply --whitespace=nowarn /tests/test.diff");
    expect(test).toContain("cd /app/apps/api\npnpm build || true\nREPORT=$REPORT_DIR/node-1.json node --test --test-reporter=/tests/reporter.mjs tests/*.test.mjs || true");
    expect(test).toContain("node /tests/check.mjs /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt");
    expect(files.get("solution/solve.sh")).toContain("git apply --whitespace=nowarn /solution/fix.diff");
    expect(files.get("solution/fix.diff")).toBe(row.patch);
  });

  it("names the task and fills task.toml and instruction.md from the row", () => {
    expect(harborTaskName(row.instance_id)).toBe("cse115a-pocketwatch__pocketwatch-logout-all-1");
    expect(files.get("task.toml")).toContain('instance_id = "CSE115a-PocketWatch__PocketWatch-logout-all-1"');
    expect(files.get("task.toml")).toContain('tags = ["hecate", "cse115a", "typescript", "node-test"]');
    expect(files.get("instruction.md")).toContain("Log out of every session.");
    expect(files.get("instruction.md")).toContain("checked out at `/app` at commit `28e92a1`");
  });

  it("is byte-identical to the builder's output before the recipe existed (fixture captured from the old code)", () => {
    const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "harborBundleTask.json"), "utf8")) as {
      row: typeof row; env: Environment; result: ValidationResult; files: Record<string, string>;
    };
    const built = buildHarborTask({
      row: verifiedRow(fixture.row, fixture.result), env: harborEnvFrom(fixture.env, fixture.result.image_digest),
      source: bundle, flakyCount: fixture.result.flaky.length,
    });
    expect([...built.entries()]).toEqual(Object.entries(fixture.files));
  });
});

describe("buildHarborTask, github source", () => {
  const files = buildHarborTask({ row: { ...verifiedRow(row, result), base_commit: SHA }, env: recipe, source: { kind: "github" } });
  const dockerfile = files.get("environment/Dockerfile")!;
  const lines = dockerfile.split("\n");

  it("fetches only the base commit in one RUN, then re-initialises, then installs", () => {
    const fetch = `RUN git init -q /app && git -C /app fetch -q --depth 1 https://github.com/CSE115a-PocketWatch/PocketWatch.git ${SHA} && git -C /app checkout -q FETCH_HEAD`;
    expect(githubFetchLayer(row.repo, SHA)).toBe(fetch);
    const at = lines.indexOf(fetch);
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe(GIT_REINIT_LAYER);
    expect(lines.findIndex((l) => l.includes("pnpm install"))).toBe(at + 2);
    expect(lines.filter((l) => /\bgit\b.*\b(fetch|clone)\b/.test(l))).toEqual([fetch]);
  });

  it("copies no bundle into the image", () => {
    expect(dockerfile).not.toMatch(/^COPY /m);
    expect(dockerfile).not.toContain("bundle");
  });

  it("is otherwise the same task as the bundle source", () => {
    const viaBundle = buildHarborTask({ row: { ...verifiedRow(row, result), base_commit: SHA }, env: recipe, source: bundle });
    for (const [path, contents] of files) if (path !== "environment/Dockerfile") expect(contents).toBe(viaBundle.get(path));
  });

  it("refuses a short commit id or a repo that is not owner/name", () => {
    expect(harborSkipReason(recipe, { repo: row.repo, base_commit: "28e92a1" }, { kind: "github" })).toMatch(/not a full commit id/);
    expect(harborSkipReason(recipe, { repo: "a/b; rm -rf /", base_commit: SHA }, { kind: "github" })).toMatch(/not a GitHub owner\/name/);
    expect(harborSkipReason(recipe, { repo: row.repo, base_commit: "28e92a1" }, bundle)).toBeNull();
    expect(() => buildHarborTask({ row: verifiedRow(row, result), env: recipe, source: { kind: "github" } })).toThrow(/not a full commit id/);
  });
});

describe("harborEnvFrom", () => {
  it("keeps what the builder needs, with the digest and services by name and image only", () => {
    const withService: Environment = {
      ...env, nodeSource: "CI", installSteps: [{ dir: "", cwd: "", command: "pnpm install" }, { dir: "apps/api", cwd: "apps/api", command: "npm ci" }],
      services: [{ name: "postgres", alias: "db", image: "postgres:16", env: { POSTGRES_PASSWORD: "pw" }, databaseUrl: "x", containerDatabaseUrl: "y", schemaCommand: null }],
    };
    const r = harborEnvFrom(withService, "node:24-bookworm@sha256:abc");
    expect(r).toEqual({
      image: "node:24-bookworm@sha256:abc", runners: ["node-test"], package_dir: "apps/api",
      install_steps: [{ cwd: "", command: "corepack enable && pnpm install" }, { cwd: "apps/api", command: "npm ci" }],
      test_steps: env.testSteps, env: { CI: "true" }, services: [{ name: "postgres", image: "postgres:16" }], node_source: "CI",
    } satisfies HarborEnv);
    expect(JSON.stringify(r)).not.toContain("pw");
    expect(harborSkipReason(r)).toBe("Harbor export for rows with a database service is not built yet");
    expect(harborEnvFrom(env).image).toBe("node:24-bookworm");
  });
});

describe("buildHarborTask, pytest recipe", () => {
  it("ships check.py and the reporter plugin, and test.sh runs pytest with it", async () => {
    const py = await detectEnvironment({ testFiles: ["tests/test_a.py"], read: async (p) => (p === "requirements.txt" ? "" : null) }) as Environment;
    expect(harborSkipReason(harborEnvFrom(py))).toBeNull();
    const files = buildHarborTask({ row: verifiedRow(row, result), env: harborEnvFrom(py), source: bundle });
    expect([...files.keys()].sort()).toEqual([
      "environment/Dockerfile", "instruction.md", "solution/fix.diff", "solution/solve.sh", "task.toml",
      "tests/README.md", "tests/check.py", "tests/expected.json", "tests/pytest_plugin/hecate_pytest_reporter.py", "tests/test.diff", "tests/test.sh",
    ]);
    expect(files.get("tests/check.py")).toBe(CHECK_PY_SOURCE);
    expect(files.get("tests/pytest_plugin/hecate_pytest_reporter.py")).toBe(PYTEST_REPORTER_SOURCE);
    const test = files.get("tests/test.sh")!;
    expect(test).toContain(`PYTHONPATH=${PYTEST_PLUGIN_DIR} REPORT=$REPORT_DIR/pytest-0.json python -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors || true`);
    expect(test).not.toContain("/patches");
    expect(test).toContain("python3 /tests/check.py /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt");
    expect(test).toContain("cd /app && (pip install -r requirements.txt && pip install pytest) || true");
    const dockerfile = files.get("environment/Dockerfile")!;
    expect(dockerfile).toContain("FROM python:3.12-bookworm");
    expect(dockerfile).toContain("ENV PYTHONDONTWRITEBYTECODE=1");
    expect(dockerfile).toContain("RUN cd /app && pip install -r requirements.txt && pip install pytest");
    expect(files.get("task.toml")).toContain('tags = ["hecate", "cse115a", "python", "pytest"]');
  });
});

// The two verifiers against the same reports. check.mjs runs on this Node; check.py needs python3.
const hasPython = spawnSync("python3", ["--version"]).status === 0;

type Reports = Record<string, unknown>;
const EXPECTED = { FAIL_TO_PASS: ["src/a.test.ts::sum > adds", "tests/x.test.mjs::one"], PASS_TO_PASS: ["src/a.test.ts::sum > keeps"] };
const vitestReport = (adds: string) => ({
  testResults: [{ name: "/app/src/a.test.ts", assertionResults: [
    { ancestorTitles: ["sum"], title: "adds", status: adds },
    { ancestorTitles: ["sum"], title: "keeps", status: "passed" },
  ] }],
});
const CASES: Array<[string, Reports, string]> = [
  ["every expected id passed", { "vitest-0.json": vitestReport("passed"), "node-1.json": { "/app/tests/x.test.mjs::one": "passed" } }, "1\n"],
  ["one expected id failed", { "vitest-0.json": vitestReport("failed"), "node-1.json": { "/app/tests/x.test.mjs::one": "passed" } }, "0\n"],
  ["an expected id is absent", { "vitest-0.json": vitestReport("passed") }, "0\n"],
];

function runCheck(kind: "mjs" | "py", reports: Reports, expected: object = EXPECTED): { reward: string; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), "hecate-check-"));
  try {
    mkdirSync(join(dir, "reports"));
    for (const [name, report] of Object.entries(reports)) writeFileSync(join(dir, "reports", name), JSON.stringify(report));
    writeFileSync(join(dir, "expected.json"), JSON.stringify(expected));
    writeFileSync(join(dir, "check.mjs"), CHECK_SOURCE);
    writeFileSync(join(dir, "check.py"), CHECK_PY_SOURCE);
    const [command, script] = kind === "mjs" ? [process.execPath, [join(dir, "check.mjs")]] : ["python3", ["-I", join(dir, "check.py")]];
    const stdout = execFileSync(command, [...script, join(dir, "expected.json"), join(dir, "reports"), "/app/", join(dir, "out", "reward.txt")], { encoding: "utf8" });
    return { reward: readFileSync(join(dir, "out", "reward.txt"), "utf8"), stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const checkMjs = (reports: Reports, expected?: object) => runCheck("mjs", reports, expected);
const checkPy = (reports: Reports, expected?: object) => runCheck("py", reports, expected);

describe("check.mjs", () => {
  it.each(CASES)("%s", (_name, reports, reward) => {
    expect(checkMjs(reports).reward).toBe(reward);
  });
});

describe.skipIf(!hasPython)(hasPython ? "check.py" : "check.py (SKIPPED: python3 is not on PATH)", () => {
  it.each(CASES)("%s, with the same summary as check.mjs", (_name, reports, reward) => {
    const py = checkPy(reports);
    expect(py.reward).toBe(reward);
    expect(py.stdout).toBe(checkMjs(reports).stdout);
  });

  it("reads the pytest reporter's flat report", () => {
    const expected = { FAIL_TO_PASS: ["tests/test_a.py::test_new"], PASS_TO_PASS: ["tests/test_a.py::TestOld::test_kept"] };
    const pass = { "pytest-0.json": { "/app/tests/test_a.py::test_new": "passed", "/app/tests/test_a.py::TestOld::test_kept": "passed" } };
    const fail = { "pytest-0.json": { "/app/tests/test_a.py::test_new": "failed", "/app/tests/test_a.py::TestOld::test_kept": "passed" } };
    expect(checkPy(pass, expected).reward).toBe("1\n");
    const failed = checkPy(fail, expected);
    expect(failed.reward).toBe("0\n");
    expect(failed.stdout).toBe("FAIL_TO_PASS not passed: tests/test_a.py::test_new (failed)\n1/2 expected tests passed\n");
    expect(checkPy({}, expected).stdout).toContain("FAIL_TO_PASS not passed: tests/test_a.py::test_new (absent)");
  });
});
