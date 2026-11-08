// Runs a repository's test suite in the three validation states, twice each, and returns the
// six Vitest reports as RunResults. The container work is behind `SuiteRunner` so the
// orchestration (checkout, patches, repeats) is tested with a fake and never needs Docker.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "The three states".

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunResults, StateRuns } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { parseVitestReport, type VitestReport } from "@/lib/cse115a/benchmark/validation/testIds";

/** Which repository state to run: base; base + test_patch; base + test_patch + patch. */
export type State = "r0" | "r1" | "r2";

/** What one validation needs from the row and the environment. */
export type RunPlan = {
  /** Repository checkout on the host, at any commit; the runner resets it to `baseCommit`. */
  repoDir: string;
  baseCommit: string;
  patch: string;
  testPatch: string;
  /** Shell to install dependencies, e.g. `npm ci`. */
  installCommand: string;
  /** Shell to run the suite and write a Vitest JSON report to $REPORT, e.g. `npx vitest run --reporter=json --outputFile=$REPORT`. */
  testCommand: string;
  /** Docker image; defaults to node:22-bookworm. */
  image?: string;
  /** Seconds before one suite run is killed. */
  timeoutSeconds?: number;
};

/** One run of the suite in one state. Implemented by Docker, or by a fake in tests. */
export interface SuiteRunner {
  runSuite(plan: RunPlan, state: State, attempt: 1 | 2): Promise<RunResults>;
}

export type ThreeStates = { r0: StateRuns; r1: StateRuns; r2: StateRuns; timings: Record<string, number> };

/** Runs each state twice, in order, and returns the six results plus elapsed ms per run. */
export async function runThreeStates(plan: RunPlan, runner: SuiteRunner): Promise<ThreeStates> {
  const timings: Record<string, number> = {};
  const runState = async (state: State): Promise<StateRuns> => {
    const results: RunResults[] = [];
    for (const attempt of [1, 2] as const) {
      const started = Date.now();
      results.push(await runner.runSuite(plan, state, attempt));
      timings[`${state}${attempt === 1 ? "a" : "b"}`] = Date.now() - started;
    }
    return [results[0]!, results[1]!];
  };
  return { r0: await runState("r0"), r1: await runState("r1"), r2: await runState("r2"), timings };
}

/** The shell script run inside the container for one state. Exported so tests can read it. */
export function containerScript(plan: RunPlan, state: State): string {
  const lines = [
    "set -e",
    "cd /work",
    `git checkout -q -f ${plan.baseCommit}`,
    "git clean -fdq",
    plan.installCommand,
  ];
  if (state !== "r0") lines.push("git apply --whitespace=nowarn /patches/test.diff");
  if (state === "r2") lines.push("git apply --whitespace=nowarn /patches/fix.diff");
  // The suite may fail (that is the point in R1); the report is what matters. REPORT is
  // exported on its own line so the test command can use it in a redirect or pipeline.
  lines.push("export REPORT=/patches/report.json", `${plan.testCommand} || true`);
  return lines.join("\n") + "\n";
}

/** Runs `docker run` with the repo mounted at /work and the patches at /patches. */
export class DockerSuiteRunner implements SuiteRunner {
  async runSuite(plan: RunPlan, state: State): Promise<RunResults> {
    const patches = await mkdtemp(join(tmpdir(), "hecate-validate-"));
    try {
      await writeFile(join(patches, "test.diff"), plan.testPatch);
      await writeFile(join(patches, "fix.diff"), plan.patch);
      await writeFile(join(patches, "run.sh"), containerScript(plan, state));
      const image = plan.image ?? "node:22-bookworm";
      await exec("docker", [
        "run", "--rm",
        "-v", `${plan.repoDir}:/work`,
        "-v", `${patches}:/patches`,
        "-w", "/work",
        image, "bash", "/patches/run.sh",
      ], (plan.timeoutSeconds ?? 900) * 1000);
      let text: string;
      try {
        text = await readFile(join(patches, "report.json"), "utf8");
      } catch {
        // No report at all: the suite never started (install failed, no vitest). Nothing ran.
        return {};
      }
      return parseVitestReport(JSON.parse(text) as VitestReport);
    } finally {
      await rm(patches, { recursive: true, force: true });
    }
  }
}

/** Spawns a process; rejects on a non-zero exit or on timeout, with stderr in the message. */
function exec(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args[0]} exited ${code}: ${stderr.trim().slice(-2000)}`));
    });
  });
}

/** A runner for tests: returns scripted results per state and attempt, and records the calls. */
export class FakeSuiteRunner implements SuiteRunner {
  calls: Array<{ state: State; attempt: 1 | 2 }> = [];
  constructor(private readonly scripted: Partial<Record<`${State}${"a" | "b"}`, RunResults>> & Partial<Record<State, RunResults>>) {}
  async runSuite(_plan: RunPlan, state: State, attempt: 1 | 2): Promise<RunResults> {
    this.calls.push({ state, attempt });
    return this.scripted[`${state}${attempt === 1 ? "a" : "b"}`] ?? this.scripted[state] ?? {};
  }
}
