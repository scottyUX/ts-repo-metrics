// Runs a repository's test suite in the three validation states, RUNS_PER_STATE times each, and
// returns every run's report as RunResults. The container work is behind `SuiteRunner` so the
// orchestration (checkout, patches, repeats) is tested with a fake and never needs Docker.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "The three states".

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNS_PER_STATE, type RunResults, type StateRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { NODE_TEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/nodeTestReporter";
import { parseNodeTestReport, parseVitestReport, type VitestReport } from "@/lib/cse115a/benchmark/validation/testIds";

/** Which repository state to run: base; base + test_patch; base + test_patch + patch. */
export type State = "r0" | "r1" | "r2";

/** What one validation needs from the row and the environment. */
export type RunPlan = {
  /** Repository checkout on the host, at any commit; the runner resets it to `baseCommit`. */
  repoDir: string;
  baseCommit: string;
  patch: string;
  testPatch: string;
  /** Where `installCommand` runs, relative to the repo root; "" for the root. */
  installDir: string;
  /** Shell to install dependencies, e.g. `npm ci`. */
  installCommand: string;
  /** Directory of the package under test, relative to the repo root; "" for the root. */
  packageDir: string;
  /** Shell lines run in `packageDir`, each allowed to fail. Reports go to $REPORT_DIR. */
  testSteps: string[];
  /** Environment variables for the container. */
  env?: Record<string, string>;
  /** Docker image; defaults to node:22-bookworm. */
  image?: string;
  /** Seconds before one suite run is killed. */
  timeoutSeconds?: number;
};

/** One run of the suite in one state. Implemented by Docker, or by a fake in tests. `attempt` is 1-based. */
export interface SuiteRunner {
  runSuite(plan: RunPlan, state: State, attempt: number): Promise<RunResults>;
}

export type ThreeStates = { r0: StateRuns; r1: StateRuns; r2: StateRuns; timings: Record<string, number> };

/** `r0` + attempt 1 → `r0a`; the key used for timings and log file names. */
export function runName(state: State, attempt: number): string {
  return `${state}${String.fromCharCode(96 + attempt)}`;
}

/** Runs each state RUNS_PER_STATE times, in order, and returns every result plus elapsed ms per run. */
export async function runThreeStates(plan: RunPlan, runner: SuiteRunner): Promise<ThreeStates> {
  const timings: Record<string, number> = {};
  const runState = async (state: State): Promise<StateRuns> => {
    const results: RunResults[] = [];
    for (let attempt = 1; attempt <= RUNS_PER_STATE; attempt++) {
      const started = Date.now();
      results.push(await runner.runSuite(plan, state, attempt));
      timings[runName(state, attempt)] = Date.now() - started;
    }
    return results;
  };
  return { r0: await runState("r0"), r1: await runState("r1"), r2: await runState("r2"), timings };
}

/** The shell script run inside the container for one state. Exported so tests can read it. */
export function containerScript(plan: RunPlan, state: State): string {
  const sub = (dir: string) => (dir ? `cd /work/${dir}` : "cd /work");
  const lines = [
    "set -e",
    "cd /work",
    `git checkout -q -f ${plan.baseCommit}`,
    "git clean -fdq",
  ];
  // Patches go on before the install, so a dependency or lockfile the student added is installed.
  if (state !== "r0") lines.push("git apply --whitespace=nowarn /patches/test.diff");
  if (state === "r2") lines.push("git apply --whitespace=nowarn /patches/fix.diff");
  lines.push(sub(plan.installDir), plan.installCommand);
  // Each step may fail (that is the point in R1); the reports are what matter. REPORT_DIR is
  // exported on its own line so the steps can use it in a redirect or pipeline.
  lines.push("mkdir -p /patches/reports", "export REPORT_DIR=/patches/reports", sub(plan.packageDir));
  for (const step of plan.testSteps) lines.push(`${step} || true`);
  return lines.join("\n") + "\n";
}

/** Runs `docker run` with the repo mounted at /work and the patches at /patches. */
/**
 * Environment that points npm, pnpm, yarn and corepack at one mounted folder, so a batch downloads
 * each package once instead of once per run. The folder is shared by every run and every repository.
 */
export const PACKAGE_CACHE_ENV: Record<string, string> = {
  npm_config_cache: "/cache/npm",
  npm_config_store_dir: "/cache/pnpm-store",
  YARN_CACHE_FOLDER: "/cache/yarn",
  COREPACK_HOME: "/cache/corepack",
};

export class DockerSuiteRunner implements SuiteRunner {
  /**
   * `logDir`: one log per run (`<state><attempt>.log`); nothing is kept when unset.
   * `cacheDir`: a host folder mounted at /cache as the shared package cache; none when unset.
   */
  constructor(private readonly logDir?: string, private readonly cacheDir?: string) {}

  async runSuite(plan: RunPlan, state: State, attempt: number): Promise<RunResults> {
    const patches = await mkdtemp(join(tmpdir(), "hecate-validate-"));
    try {
      await writeFile(join(patches, "test.diff"), plan.testPatch);
      await writeFile(join(patches, "fix.diff"), plan.patch);
      await writeFile(join(patches, "run.sh"), containerScript(plan, state));
      await writeFile(join(patches, "reporter.mjs"), NODE_TEST_REPORTER_SOURCE);
      const image = plan.image ?? "node:22-bookworm";
      const name = runName(state, attempt);
      const cacheEnv = this.cacheDir ? PACKAGE_CACHE_ENV : {};
      const args = [
        "run", "--rm",
        ...Object.entries({ ...(plan.env ?? {}), ...cacheEnv }).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
        ...(this.cacheDir ? ["-v", `${this.cacheDir}:/cache`] : []),
        "-v", `${plan.repoDir}:/work`,
        "-v", `${patches}:/patches`,
        "-w", "/work",
        image, "bash", "/patches/run.sh",
      ];
      const timeoutMs = (plan.timeoutSeconds ?? 900) * 1000;
      // A run that dies (a registry connection refused mid-install, a Docker hiccup) gets one retry
      // after a pause; a timeout does not, since it would only double the wait.
      for (let tryNumber = 1; ; tryNumber++) {
        try {
          const output = await exec("docker", args, timeoutMs);
          if (this.logDir) await writeFile(join(this.logDir, `${name}.log`), output);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const retry = tryNumber === 1 && !(error instanceof ExecError && error.timedOut);
          if (this.logDir) await writeFile(join(this.logDir, `${name}${retry ? ".attempt1" : ""}.log`), message);
          if (!retry) throw error;
          await new Promise((r) => setTimeout(r, 15_000));
        }
      }
      return readReports(join(patches, "reports"));
    } finally {
      await rm(patches, { recursive: true, force: true });
    }
  }
}

/** Merges every report in the directory: `vitest-*.json` and `jest-*.json` (same JSON shape) and `node-*.json` (our reporter). */
export async function readReports(dir: string): Promise<RunResults> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    // No reports at all: the steps never ran (install failed). Nothing ran.
    return {};
  }
  const results: RunResults = {};
  for (const name of names) {
    const text = await readFile(join(dir, name), "utf8");
    const parsed = name.startsWith("node-")
      ? parseNodeTestReport(JSON.parse(text) as Record<string, string>)
      : parseVitestReport(JSON.parse(text) as VitestReport);
    Object.assign(results, parsed);
  }
  return results;
}

/** Thrown by `exec`; `timedOut` tells a hung run from one that died. */
export class ExecError extends Error {
  constructor(message: string, readonly timedOut: boolean) {
    super(message);
  }
}

/**
 * Spawns a process and returns its combined output; rejects with an ExecError on a non-zero exit or
 * on timeout, with the tail of that output in the message.
 */
function exec(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new ExecError(`${command} timed out after ${timeoutMs} ms\n${output.trim().slice(-3000)}`, true)); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new ExecError(`${command} ${args[0]} exited ${code}:\n${output.trim().slice(-3000)}`, false));
    });
  });
}

/**
 * A runner for tests: returns scripted results per state (`r1`) or per run (`r1b`), and records
 * the calls. A run with no script of its own uses the state's.
 */
export class FakeSuiteRunner implements SuiteRunner {
  calls: Array<{ state: State; attempt: number }> = [];
  constructor(private readonly scripted: Partial<Record<string, RunResults>>) {}
  async runSuite(_plan: RunPlan, state: State, attempt: number): Promise<RunResults> {
    this.calls.push({ state, attempt });
    return this.scripted[runName(state, attempt)] ?? this.scripted[state] ?? {};
  }
}
