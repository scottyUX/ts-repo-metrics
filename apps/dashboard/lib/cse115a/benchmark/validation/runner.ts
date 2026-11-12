// Runs a repository's test suite in the three validation states, RUNS_PER_STATE times each, and
// returns every run's report as RunResults. The container work is behind `SuiteRunner` so the
// orchestration (checkout, patches, repeats) is tested with a fake and never needs Docker.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "The three states".

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { RUNS_PER_STATE, type RunResults, type StateRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { NODE_TEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/nodeTestReporter";
import { PYTEST_REPORTER_MODULE, PYTEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/pytestReporter";
import { serviceProvenance, type Service } from "@/lib/cse115a/benchmark/validation/services";
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
  /** Database containers started fresh for every run (from the repository's CI); none when empty. */
  services?: Service[];
  /** Installs run in order instead of `installCommand` in `installDir` (CI's install steps); none when empty. */
  installSteps?: Array<{ dir: string; command: string }>;
  /** Comment lines put at the top of the script: how the environment was chosen (provenance only). */
  notes?: string[];
  /**
   * The suite this plan runs (`python in backend`), set only when the row has more than one: it
   * goes into log file names (`r0a.python-backend.log`) and error messages. Unset for one suite.
   */
  label?: string;
  /**
   * Run in a container-local clone instead of the host checkout: the checkout is mounted read-only
   * at /src and cloned (sharing its objects) into /work, so nothing the run installs or writes
   * reaches the host. Used by the coverage run (coverageRun.ts), whose extra tools must not leak
   * into later runs on the same clone.
   */
  isolatedCheckout?: boolean;
  /** Extra files written into /patches next to the patches (name → contents). */
  extraFiles?: Record<string, string>;
};

/** What a coverage run leaves: the test results, and every file under $REPORT_DIR/coverage (path inside it → text). */
export type CoverageRun = { results: RunResults; files: Record<string, string> };

/** One run of the suite in one state. Implemented by Docker, or by a fake in tests. `attempt` is 1-based. */
export interface SuiteRunner {
  runSuite(plan: RunPlan, state: State, attempt: number): Promise<RunResults>;
  /** One R2 run of a coverage plan (coverageRun.ts); optional, so a runner without it measures nothing. */
  runCoverage?(plan: RunPlan): Promise<CoverageRun>;
}

export type ThreeStates = { r0: StateRuns; r1: StateRuns; r2: StateRuns; timings: Record<string, number> };

/** `r0` + attempt 1 → `r0a`; the key used for timings and log file names. */
export function runName(state: State, attempt: number): string {
  return `${state}${String.fromCharCode(96 + attempt)}`;
}

/**
 * Runs each state RUNS_PER_STATE times, in order, and returns every result plus elapsed ms per run.
 * With several plans (one per suite), every run runs each suite in turn, each in its own container
 * on the same checkout state, and merges their results into one map; the run's time is the sum.
 */
export async function runThreeStates(plan: RunPlan | RunPlan[], runner: SuiteRunner): Promise<ThreeStates> {
  const plans = Array.isArray(plan) ? plan : [plan];
  const timings: Record<string, number> = {};
  const runState = async (state: State): Promise<StateRuns> => {
    const results: RunResults[] = [];
    for (let attempt = 1; attempt <= RUNS_PER_STATE; attempt++) {
      const started = Date.now();
      const perSuite: RunResults[] = [];
      for (const p of plans) perSuite.push(await runner.runSuite(p, state, attempt));
      results.push(perSuite.length === 1 ? perSuite[0] : mergeSuiteResults(perSuite, plans, runName(state, attempt)));
      timings[runName(state, attempt)] = Date.now() - started;
    }
    return results;
  };
  return { r0: await runState("r0"), r1: await runState("r1"), r2: await runState("r2"), timings };
}

/**
 * Two suites reported the same test id in one run. Ids are file-qualified, so this means two suites
 * ran the same file; the row is env_error rather than a verdict built on one suite's result.
 */
export class SuiteCollisionError extends Error {}

/** One run's results from every suite, as one map; throws SuiteCollisionError when an id appears in two. */
export function mergeSuiteResults(perSuite: RunResults[], plans: RunPlan[], run: string): RunResults {
  const merged: RunResults = {};
  const owner = new Map<string, number>();
  perSuite.forEach((results, i) => {
    for (const [id, status] of Object.entries(results)) {
      const first = owner.get(id);
      if (first !== undefined) {
        throw new SuiteCollisionError(`test id reported by two suites in ${run}: ${id} (${plans[first].label ?? `suite ${first + 1}`} and ${plans[i].label ?? `suite ${i + 1}`})`);
      }
      owner.set(id, i);
      merged[id] = status;
    }
  });
  return merged;
}

/** The shell script run inside the container for one state. Exported so tests can read it. */
export function containerScript(plan: RunPlan, state: State): string {
  const sub = (dir: string) => (dir ? `cd /work/${dir}` : "cd /work");
  const services = plan.services ?? [];
  const lines = [
    ...(plan.notes ?? []).map((note) => `# ${note}`),
    ...serviceProvenance(services),
    "set -e",
    // The host checkout is at /src (read-only); its objects are shared, not copied.
    ...(plan.isolatedCheckout ? ["git config --global --add safe.directory '*'", "git clone -q --shared --no-checkout /src /work"] : []),
    "cd /work",
    `git checkout -q -f ${plan.baseCommit}`,
    "git clean -fdq",
  ];
  // Patches go on before the install, so a dependency or lockfile the student added is installed.
  if (state !== "r0") lines.push("git apply --whitespace=nowarn /patches/test.diff");
  if (state === "r2") lines.push("git apply --whitespace=nowarn /patches/fix.diff");
  const installs = plan.installSteps?.length ? plan.installSteps : [{ dir: plan.installDir, command: plan.installCommand }];
  for (const step of installs) lines.push(sub(step.dir), installGuard(step.command));
  // The schema step runs from the repository root, as CI runs it, against the run's own database.
  const schema = services.map((s) => s.schemaCommand).filter((c): c is string => Boolean(c));
  if (schema.length) lines.push("cd /work", schemaGuard(schema.join("\n")));
  // Each step may fail (that is the point in R1); the reports are what matter. REPORT_DIR is
  // exported on its own line so the steps can use it in a redirect or pipeline.
  lines.push("mkdir -p /patches/reports", "export REPORT_DIR=/patches/reports", sub(plan.packageDir));
  for (const step of plan.testSteps) lines.push(`${step} || true`);
  return lines.join("\n") + "\n";
}

/** Exit code of a container run whose install step failed; the runner turns it into an InstallError. */
export const INSTALL_FAILED_EXIT = 97;
/** Where the install step's output is kept inside the container (the patches folder on the host). */
export const INSTALL_LOG = "/patches/install.log";

/**
 * The install command wrapped so that any failure in it stops the run with INSTALL_FAILED_EXIT.
 * `set -e` alone is not enough: bash does not exit when a command that is not the last of an `&&`
 * list fails, so `pip install -r requirements.txt && pip install pytest` with a bad requirement
 * would carry on, run no tests, and turn an environment failure into a rejected row. The output is
 * kept in INSTALL_LOG and echoed into the run log either way.
 */
export function installGuard(installCommand: string): string {
  return [
    `if ! { ${installCommand}; } > ${INSTALL_LOG} 2>&1; then`,
    `  cat ${INSTALL_LOG}`,
    `  echo "[hecate] install failed" >&2`,
    `  exit ${INSTALL_FAILED_EXIT}`,
    "fi",
    `cat ${INSTALL_LOG}`,
  ].join("\n");
}

/** Exit code of a container run whose schema step failed; the runner turns it into a SchemaError. */
export const SCHEMA_FAILED_EXIT = 98;
/** Where the schema step's output is kept inside the container. */
export const SCHEMA_LOG = "/patches/schema.log";

/** Single-quotes a string for bash. */
const shellQuote = (text: string) => `'${text.split("'").join("'\\''")}'`;

/**
 * The CI schema command (`pnpm --dir server db:push`) wrapped like the install: any failure stops
 * the run with SCHEMA_FAILED_EXIT. It runs in its own `bash -eo pipefail`, as a GitHub `run:` step
 * does, so a multi-line command stops at its first failing line.
 */
export function schemaGuard(schemaCommand: string): string {
  return [
    `if ! bash -eo pipefail -c ${shellQuote(schemaCommand)} > ${SCHEMA_LOG} 2>&1; then`,
    `  cat ${SCHEMA_LOG}`,
    `  echo "[hecate] schema step failed" >&2`,
    `  exit ${SCHEMA_FAILED_EXIT}`,
    "fi",
    `cat ${SCHEMA_LOG}`,
  ].join("\n");
}

/**
 * Thrown when the install step failed in a run: the environment, not the student. `validateTask`
 * turns it, and the subclasses below, into an `env_error` result, so the row is never written back
 * as rejected.
 */
export class InstallError extends Error {}
/** The CI schema step failed in a run (`schema step failed in r0a: <line>`). */
export class SchemaError extends InstallError {}
/** The database container never answered pg_isready (`database did not start in r0a`). */
export class DatabaseStartError extends InstallError {}

/** The line of an install log that says what went wrong: the first that mentions an error, else the last. */
export function installErrorLine(log: string): string {
  const lines = log.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /\berr(or)?\b/i.test(l)) ?? lines[lines.length - 1] ?? "(no install output)";
}

/**
 * Environment that points npm, pnpm, yarn, corepack, pip, uv and Poetry at one mounted folder, so a batch downloads
 * each package once instead of once per run. The folder is shared by every run and every repository.
 */
export const PACKAGE_CACHE_ENV: Record<string, string> = {
  npm_config_cache: "/cache/npm",
  npm_config_store_dir: "/cache/pnpm-store",
  YARN_CACHE_FOLDER: "/cache/yarn",
  COREPACK_HOME: "/cache/corepack",
  PIP_CACHE_DIR: "/cache/pip",
  UV_CACHE_DIR: "/cache/uv",
  POETRY_CACHE_DIR: "/cache/poetry",
};

/** Runs a command and returns its combined output; rejects with an ExecError. Swapped for a fake in tests. */
export type ExecFn = (command: string, args: string[], timeoutMs: number) => Promise<string>;

/** How long a database container gets to answer pg_isready, in one-second polls. */
export const DATABASE_READY_POLLS = 60;

export type DockerSuiteRunnerDeps = {
  exec?: ExecFn;
  sleep?: (ms: number) => Promise<void>;
  /** Makes the per-run suffix of container and network names; random by default. */
  runId?: () => string;
};

export class DockerSuiteRunner implements SuiteRunner {
  private readonly exec: ExecFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly runId: () => string;

  /**
   * `logDir`: one log per run (`<state><attempt>.log`); nothing is kept when unset.
   * `cacheDir`: a host folder mounted at /cache as the shared package cache; none when unset.
   */
  constructor(private readonly logDir?: string, private readonly cacheDir?: string, deps: DockerSuiteRunnerDeps = {}) {
    this.exec = deps.exec ?? exec;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.runId = deps.runId ?? (() => randomBytes(4).toString("hex"));
  }

  runSuite(plan: RunPlan, state: State, attempt: number): Promise<RunResults> {
    return this.runContainer(plan, state, runName(state, attempt), (patches) => readReports(join(patches, "reports")));
  }

  /** The coverage run: R2 once, logged as `coverage.log`, through the same container path as every other run. */
  runCoverage(plan: RunPlan): Promise<CoverageRun> {
    return this.runContainer(plan, "r2", "coverage", async (patches) => ({
      results: await readReports(join(patches, "reports")),
      files: await readCoverageFiles(join(patches, "reports", "coverage")),
    }));
  }

  /** One container run of `plan` in `state`; `collect` reads what it left in the patches folder before that is removed. */
  private async runContainer<T>(plan: RunPlan, state: State, name: string, collect: (patches: string) => Promise<T>): Promise<T> {
    const patches = await mkdtemp(join(tmpdir(), "hecate-validate-"));
    try {
      await writeFile(join(patches, "test.diff"), plan.testPatch);
      await writeFile(join(patches, "fix.diff"), plan.patch);
      await writeFile(join(patches, "run.sh"), containerScript(plan, state));
      await writeFile(join(patches, "reporter.mjs"), NODE_TEST_REPORTER_SOURCE);
      await writeFile(join(patches, `${PYTEST_REPORTER_MODULE}.py`), PYTEST_REPORTER_SOURCE);
      for (const [file, text] of Object.entries(plan.extraFiles ?? {})) await writeFile(join(patches, file), text);
      const image = plan.image ?? "node:22-bookworm";
      // Several suites share a run: each gets its own log file and says which it was in errors.
      const logName = plan.label ? `${name}.${plan.label.replace(/[^A-Za-z0-9_.-]+/g, "-")}` : name;
      const where = plan.label ? `${name} (${plan.label})` : name;
      const cacheEnv = this.cacheDir ? PACKAGE_CACHE_ENV : {};
      const args = [
        "run", "--rm",
        ...Object.entries({ ...(plan.env ?? {}), ...cacheEnv }).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
        ...(this.cacheDir ? ["-v", `${this.cacheDir}:/cache`] : []),
        "-v", plan.isolatedCheckout ? `${plan.repoDir}:/src:ro` : `${plan.repoDir}:/work`,
        "-v", `${patches}:/patches`,
        "-w", "/work",
        image, "bash", "/patches/run.sh",
      ];
      const timeoutMs = (plan.timeoutSeconds ?? 900) * 1000;
      const services = plan.services ?? [];
      // A run that dies (a registry connection refused mid-install, a Docker hiccup) gets one retry
      // after a pause; a timeout does not, since it would only double the wait.
      for (let tryNumber = 1; ; tryNumber++) {
        try {
          const id = `${name}-${this.runId()}`;
          const output = services.length
            ? await this.withServices(services, id, timeoutMs, (extra) => this.exec("docker", [...args.slice(0, 2), ...extra, ...args.slice(2)], timeoutMs))
            : await this.withNamedContainer(`hecate-run-${id}`, (extra) => this.exec("docker", [...args.slice(0, 2), ...extra, ...args.slice(2)], timeoutMs));
          if (this.logDir) await writeFile(join(this.logDir, `${logName}.log`), output);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const retry = tryNumber === 1 && !(error instanceof ExecError && error.timedOut);
          if (this.logDir) await writeFile(join(this.logDir, `${logName}${retry ? ".attempt1" : ""}.log`), message);
          if (!retry) {
            if (error instanceof ExecError && error.code === INSTALL_FAILED_EXIT) {
              const log = await readFile(join(patches, "install.log"), "utf8").catch(() => "");
              throw new InstallError(`install failed in ${where}: ${installErrorLine(log)}`);
            }
            if (error instanceof ExecError && error.code === SCHEMA_FAILED_EXIT) {
              const log = await readFile(join(patches, "schema.log"), "utf8").catch(() => "");
              throw new SchemaError(`schema step failed in ${where}: ${installErrorLine(log)}`);
            }
            if (error instanceof DatabaseStartError) throw new DatabaseStartError(`database did not start in ${where}`);
            throw error;
          }
          await this.sleep(15_000);
        }
      }
      return await collect(patches);
    } finally {
      await rm(patches, { recursive: true, force: true });
    }
  }

  /**
   * One try of a run without services: the test container gets a name and is removed by it
   * afterwards, since killing the `docker run` client on a timeout does not stop its container
   * (`--rm` only acts once the container exits). After a normal exit it is already gone and the
   * removal is a no-op.
   */
  private async withNamedContainer(testName: string, runTest: (extra: string[]) => Promise<string>): Promise<string> {
    try {
      return await runTest(["--name", testName]);
    } finally {
      await this.exec("docker", ["rm", "-f", testName], 60_000).catch(() => "");
    }
  }

  /**
   * One try of a run with its database: a fresh network `hecate-<id>`, the service container on it
   * (reachable as its CI key, e.g. `postgres`), a wait for pg_isready, then `runTest` with the extra
   * `docker run` arguments that name the test container and put it on the network. Both containers
   * and the network are removed afterwards whatever happened, including a timeout, since killing
   * the `docker run` client does not stop its container. On failure the database's own log is
   * appended to the error.
   */
  private async withServices(services: Service[], id: string, timeoutMs: number, runTest: (extra: string[]) => Promise<string>): Promise<string> {
    const network = `hecate-${id}`;
    const dbNames = services.map((_s, i) => (i === 0 ? `hecate-pg-${id}` : `hecate-pg${i + 1}-${id}`));
    const testName = `hecate-run-${id}`;
    const quiet = (args: string[]) => this.exec("docker", args, 60_000).catch(() => "");
    const dbLog = async () => (await Promise.all(dbNames.map((n) => quiet(["logs", n])))).join("\n");
    try {
      await this.exec("docker", ["network", "create", network], 60_000);
      for (const [i, s] of services.entries()) {
        await this.exec("docker", [
          "run", "-d", "--name", dbNames[i], "--network", network, "--network-alias", s.alias,
          ...Object.entries(s.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
          s.image,
        ], 10 * 60_000);
      }
      for (const [i, s] of services.entries()) {
        const user = s.env.POSTGRES_USER ?? "postgres";
        const db = s.env.POSTGRES_DB ?? user;
        let ready = false;
        for (let poll = 0; poll < DATABASE_READY_POLLS && !ready; poll++) {
          // Over TCP: the image's first-boot server listens only on the socket and then restarts.
          ready = await this.exec("docker", ["exec", dbNames[i], "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", user, "-d", db], 30_000).then(() => true, () => false);
          if (!ready) await this.sleep(1000);
        }
        if (!ready) throw new DatabaseStartError(`database did not start\n--- database log ---\n${await dbLog()}`);
      }
      try {
        return await runTest(["--name", testName, "--network", network]);
      } catch (error) {
        if (error instanceof ExecError) {
          throw new ExecError(`${error.message}\n--- database log ---\n${await dbLog()}`, error.timedOut, error.code);
        }
        throw error;
      }
    } finally {
      await quiet(["rm", "-f", testName, ...dbNames]);
      await quiet(["network", "rm", network]);
    }
  }
}

/**
 * Merges every report in the directory: `vitest-*.json` and `jest-*.json` (same JSON shape), and
 * `node-*.json` and `pytest-*.json` (our reporters, both a flat {id: status} map).
 */
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
    const parsed = name.startsWith("node-") || name.startsWith("pytest-")
      ? parseNodeTestReport(JSON.parse(text) as Record<string, string>)
      : parseVitestReport(JSON.parse(text) as VitestReport);
    Object.assign(results, parsed);
  }
  return results;
}

/** Every file under `dir`, recursively, as path (relative to `dir`) → text; {} when there is no such folder. */
export async function readCoverageFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files[full.slice(dir.length + 1).split("\\").join("/")] = await readFile(full, "utf8");
  }
  return files;
}

/** Thrown by `exec`; `timedOut` tells a hung run from one that died. */
export class ExecError extends Error {
  constructor(message: string, readonly timedOut: boolean, readonly code: number | null = null) {
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
      else reject(new ExecError(`${command} ${args[0]} exited ${code}:\n${output.trim().slice(-3000)}`, false, code));
    });
  });
}

/**
 * A runner for tests: returns scripted results per state (`r1`) or per run (`r1b`), and records
 * the calls. A run with no script of its own uses the state's.
 */
export class FakeSuiteRunner implements SuiteRunner {
  calls: Array<{ state: State; attempt: number }> = [];
  /** Every coverage plan run, in order. */
  coveragePlans: RunPlan[] = [];
  /**
   * `coverage`: what runCoverage returns, for every plan or as a function of the plan; an Error is
   * thrown. Without it, runCoverage returns no results and no files.
   */
  constructor(
    private readonly scripted: Partial<Record<string, RunResults>>,
    private readonly coverage?: CoverageRun | Error | ((plan: RunPlan) => CoverageRun | Error),
  ) {}
  async runSuite(_plan: RunPlan, state: State, attempt: number): Promise<RunResults> {
    this.calls.push({ state, attempt });
    return this.scripted[runName(state, attempt)] ?? this.scripted[state] ?? {};
  }
  async runCoverage(plan: RunPlan): Promise<CoverageRun> {
    this.coveragePlans.push(plan);
    const out = typeof this.coverage === "function" ? this.coverage(plan) : this.coverage;
    if (out instanceof Error) throw out;
    return out ?? { results: {}, files: {} };
  }
}
