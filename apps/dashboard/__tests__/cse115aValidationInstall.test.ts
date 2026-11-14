import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { containerScript, FakeSuiteRunner, INSTALL_FAILED_EXIT, INSTALL_LOG, InstallError, installErrorLine, installGuard, type RunPlan, type State } from "@/lib/cse115a/benchmark/validation/runner";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

const run = promisify(execFile);

/** Runs the guarded install under `set -e` with real bash, the log redirected to a temp file, then `echo after`. */
async function guarded(installCommand: string): Promise<{ code: number; stdout: string; log: string }> {
  const dir = await mkdtemp(join(tmpdir(), "hecate-install-"));
  const logFile = join(dir, "install.log");
  const script = ["set -e", installGuard(installCommand).split(INSTALL_LOG).join(logFile), "echo after"].join("\n");
  try {
    const { stdout } = await run("bash", ["-c", script]);
    return { code: 0, stdout, log: await readFile(logFile, "utf8") };
  } catch (error) {
    const e = error as { code: number; stdout: string };
    return { code: e.code, stdout: e.stdout, log: await readFile(logFile, "utf8").catch(() => "") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const repo = (files: Record<string, string>) => async (path: string) => files[path] ?? null;
const pythonEnv = async () => (await detectEnvironment({ testFiles: ["tests/test_a.py"], read: repo({ "requirements.txt": "nope==1\n" }) })) as Environment;
const jsEnv = async () => (await detectEnvironment({ testFiles: ["a.test.ts"], read: repo({ "package.json": JSON.stringify({ scripts: { test: "vitest" }, devDependencies: { vitest: "3" } }), "pnpm-lock.yaml": "" }) })) as Environment;

const row: TaskRow = { instance_id: "o__r-1", repo: "o/r", base_commit: "abc", patch: "diff --git a/m.py b/m.py\n", test_patch: "diff --git a/tests/test_a.py b/tests/test_a.py\n", FAIL_TO_PASS: [], PASS_TO_PASS: [] };

/** A runner whose install fails in the given run, as DockerSuiteRunner reports it. */
class FailingInstallRunner extends FakeSuiteRunner {
  constructor(private readonly failAt: string, private readonly line: string) { super({}); }
  async runSuite(plan: RunPlan, state: State, attempt: number) {
    const name = `${state}${String.fromCharCode(96 + attempt)}`;
    if (name === this.failAt) throw new InstallError(`install failed in ${name}: ${this.line}`);
    return super.runSuite(plan, state, attempt);
  }
}

describe("installGuard under set -e (real bash)", () => {
  it("stops a Python install whose first command fails, which bare set -e lets through", async () => {
    const env = await pythonEnv();
    expect(env.installCommand).toBe("pip install -r requirements.txt && pip install pytest");
    const command = "sh -c 'echo Collecting nope==1; echo \"ERROR: No matching distribution found for nope==1\"; exit 1' && echo installed-pytest";
    const bare = await run("bash", ["-c", `set -e\n${command}\necho after`]);
    expect(bare.stdout).toContain("after"); // the hole the guard closes
    const result = await guarded(command);
    expect(result.code).toBe(INSTALL_FAILED_EXIT);
    expect(result.stdout).not.toContain("after");
    expect(result.stdout).not.toContain("installed-pytest");
    expect(installErrorLine(result.log)).toBe("ERROR: No matching distribution found for nope==1");
  });

  it("stops a JS install (corepack enable && pnpm install) whose first command fails", async () => {
    const env = await jsEnv();
    expect(env.installCommand).toBe("corepack enable && pnpm install --frozen-lockfile");
    const result = await guarded("sh -c 'echo \"Internal Error: corepack could not fetch pnpm\"; exit 1' && echo installed");
    expect(result.code).toBe(INSTALL_FAILED_EXIT);
    expect(installErrorLine(result.log)).toBe("Internal Error: corepack could not fetch pnpm");
  });

  it("lets a good install through and echoes its output into the run log", async () => {
    const result = await guarded("echo step-one && echo step-two");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("step-one\nstep-two\nafter\n");
  });

  it("keeps test steps as data: a failing step is still `|| true` after the guard", async () => {
    const env = await pythonEnv();
    const plan: RunPlan = { repoDir: "/r", baseCommit: "abc", patch: "", testPatch: "", installDir: env.installDir, installCommand: env.installCommand, packageDir: env.packageDir, testSteps: env.testSteps.map((s) => s.command) };
    const script = containerScript(plan, "r1");
    expect(script).toContain(`if ! { ${env.installCommand}; } > ${INSTALL_LOG} 2>&1; then`);
    expect(script).toContain(`${env.testSteps[0].command} || true\n`);
  });

  it("picks the line that names the error, else the last line", () => {
    expect(installErrorLine("npm warn deprecated x\nnpm error code E404\nnpm error 404 Not Found\n")).toBe("npm error code E404");
    expect(installErrorLine("Resolving...\nKilled\n")).toBe("Killed");
    expect(installErrorLine("")).toBe("(no install output)");
  });
});

describe("validateTask: a failed install is env_error, never a verdict", () => {
  for (const [name, makeEnv, line] of [
    ["Python", pythonEnv, "ERROR: No matching distribution found for nope==1"],
    ["JS", jsEnv, "npm error code E404"],
  ] as const) {
    it(`${name}: install failing in any run gives env_error with the install's error line`, async () => {
      const env = await makeEnv();
      for (const failAt of ["r0a", "r2c"]) {
        const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: new FailingInstallRunner(failAt, line) });
        expect(result.reason).toBe("env_error");
        expect(result.detail).toBe(`install failed in ${failAt}: ${line}`);
        expect(result.FAIL_TO_PASS).toEqual([]);
        expect(result.image).toBe(env.image);
      }
    });
  }

  it("a failing test step is still data: the row gets a verdict, not env_error", async () => {
    const env = await pythonEnv();
    const runner = new FakeSuiteRunner({ r0: {}, r1: { "tests/test_a.py::test_x": "failed" }, r2: { "tests/test_a.py::test_x": "failed" } });
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner });
    expect(result.reason).toBe("no_fail_to_pass");
    expect(result.FAIL_TO_FAIL).toEqual(["tests/test_a.py::test_x"]);
  });

  it("other runner errors still propagate (the batch records them as env_error with the full message)", async () => {
    const env = await jsEnv();
    const runner = { runSuite: async () => { throw new Error("docker run exited 125"); } };
    await expect(validateTask({ row, repoDir: "/r", env, modified: new Set(), runner })).rejects.toThrow("docker run exited 125");
  });
});
