// The Harbor gold check (validateBenchmarkBatch.ts --gold-check / --gold-only): build a validated
// row's Harbor task with the bundle source into `<out>/harbor-gold/<task>/`, run Harbor's oracle agent
// (applies the student's fix; must score 1.0) and nop agent (changes nothing; must score 0.0), and
// record the outcome on the result as `harbor_gold` (and `harbor_env.gold`). It never changes the
// verdict. Harbor is behind HarborRunner, so tests use a fake and need neither Harbor nor Docker.

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NO_BUNDLE_REASON, writeBundleTask } from "@/lib/cse115a/benchmark/validation/bundleTask";
import { harborSkipReason, type HarborGold, type HarborRow } from "@/lib/cse115a/benchmark/validation/harbor";
import { redactToken } from "@/lib/cse115a/benchmark/validation/runRow";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export type HarborAgent = "oracle" | "nop";

/** Default limit for one Harbor run (image build, agent and verifier together). */
export const GOLD_TIMEOUT_SECONDS = 20 * 60;

export const HARBOR_MISSING_REASON = "Harbor is not installed (harbor --version failed)";

/** One `harbor run`: the job's result.json text when Harbor wrote one, its output, and how it ended. */
export type HarborRun = {
  /** Contents of `<jobsDir>/<jobName>/result.json`, or null when there is none. */
  resultJson: string | null;
  /** stdout and stderr together. */
  output: string;
  /** Null when Harbor exited 0; otherwise why not (exit code, timeout, spawn failure). */
  error: string | null;
};

/** How the gold check reaches Harbor. */
export interface HarborRunner {
  /** Harbor's version, or null when `harbor --version` fails (not installed). */
  version(): Promise<string | null>;
  /** Runs `agent` on the task in `taskDir`, with the job written to `<jobsDir>/<jobName>/`. */
  run(options: { taskDir: string; agent: HarborAgent; jobsDir: string; jobName: string; timeoutMs: number }): Promise<HarborRun>;
}

/** Runs a command, collecting stdout and stderr together; never throws. */
function capture(cmd: string, args: string[], cwd: string | undefined, timeoutMs: number): Promise<{ code: number | null; output: string; error: string | null }> {
  return new Promise((done) => {
    let output = "";
    let settled = false;
    const finish = (code: number | null, error: string | null) => { if (!settled) { settled = true; clearTimeout(timer); done({ code, output, error }); } };
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(null, `timed out after ${Math.round(timeoutMs / 1000)} s`); }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => finish(null, error.message));
    child.on("close", (code) => finish(code, code === 0 ? null : `exited ${code}`));
  });
}

/**
 * The real Harbor CLI: `harbor run -p <task> -a <agent> -o <jobsDir> --job-name <name> -n 1 -q`, with
 * the working directory `jobsDir`, so nothing Harbor writes lands outside the batch folder.
 */
export class CliHarborRunner implements HarborRunner {
  private versionCache: Promise<string | null> | null = null;
  constructor(private readonly command = "harbor") {}

  version(): Promise<string | null> {
    this.versionCache ??= capture(this.command, ["--version"], undefined, 60_000).then((r) => (r.code === 0 ? r.output.trim() || "unknown" : null));
    return this.versionCache;
  }

  async run(options: { taskDir: string; agent: HarborAgent; jobsDir: string; jobName: string; timeoutMs: number }): Promise<HarborRun> {
    await mkdir(options.jobsDir, { recursive: true });
    const { output, error } = await capture(this.command,
      ["run", "-p", options.taskDir, "-a", options.agent, "-o", options.jobsDir, "--job-name", options.jobName, "-n", "1", "-q"],
      options.jobsDir, options.timeoutMs);
    let resultJson: string | null = null;
    try {
      resultJson = await readFile(join(options.jobsDir, options.jobName, "result.json"), "utf8");
    } catch {
      // no result: Harbor stopped before writing one
    }
    return { resultJson, output, error };
  }
}

export type HarborJobResult = {
  /** The mean reward of the job's one evaluation (`stats.evals.<agent>__adhoc.metrics[0].mean`), or null. */
  reward: number | null;
  /** Errored trials and exceptions: the larger of `stats.n_errored_trials` and the evals' `n_errors` sum, at least 1 when `exception_stats` is non-empty. */
  exceptions: number;
  /** The keys of the evals' `exception_stats`. */
  exceptionNames: string[];
};

type JobJson = {
  stats?: {
    n_errored_trials?: number;
    evals?: Record<string, { n_errors?: number; metrics?: Array<{ mean?: unknown }>; exception_stats?: Record<string, unknown> }>;
  };
};

/**
 * Reads a Harbor job's result.json (the file at the job folder's root, as Harbor 0.25 writes it):
 * `stats.evals` holds one entry per agent/dataset pair, here one (`oracle__adhoc` or `nop__adhoc`),
 * with `metrics[0].mean` the mean reward, `n_errors` and `exception_stats`.
 */
export function parseHarborResult(text: string): HarborJobResult {
  const job = JSON.parse(text) as JobJson;
  const evals = Object.values(job.stats?.evals ?? {});
  const mean = evals[0]?.metrics?.[0]?.mean;
  const exceptionNames = evals.flatMap((e) => Object.keys(e.exception_stats ?? {}));
  const errors = Math.max(job.stats?.n_errored_trials ?? 0, evals.reduce((n, e) => n + (e.n_errors ?? 0), 0));
  return {
    reward: typeof mean === "number" && Number.isFinite(mean) ? mean : null,
    exceptions: Math.max(errors, exceptionNames.length ? 1 : 0),
    exceptionNames,
  };
}

/**
 * The first useful line of Harbor's output, token-free, at most 300 characters: the first line that
 * mentions an error or failure, else the first non-empty one. Colour codes and box-drawing are dropped.
 */
export function usefulLine(output: string): string {
  const lines = output
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.replace(/[│╭╮╰╯─━┃┏┓┗┛]/g, "").trim())
    .filter(Boolean);
  const line = lines.find((l) => /error|exception|fail|traceback|denied|not found|timed out/i.test(l)) ?? lines[0] ?? "";
  const clean = redactToken(line);
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
}

/** `1` → `1.0`, `0.5` → `0.5`. */
function rewardText(reward: number): string {
  return Number.isInteger(reward) ? reward.toFixed(1) : String(reward);
}

/** One agent's run: its reward, and what went wrong (null when it ran cleanly and reported a reward). */
export function agentOutcome(agent: HarborAgent, run: HarborRun): { reward: number | null; problem: string | null } {
  const line = usefulLine(run.output);
  let parsed: HarborJobResult | null = null;
  try {
    parsed = run.resultJson ? parseHarborResult(run.resultJson) : null;
  } catch {
    return { reward: null, problem: `${agent}: result.json is not valid JSON` };
  }
  if (!parsed) return { reward: null, problem: `${agent}: ${[run.error, line].filter(Boolean).join(": ") || "no result.json"}` };
  if (parsed.exceptions > 0) {
    const names = parsed.exceptionNames.length ? parsed.exceptionNames.join(", ") : `${parsed.exceptions} exception(s)`;
    return { reward: parsed.reward, problem: `${agent}: ${names}${line ? `: ${line}` : ""}` };
  }
  if (parsed.reward === null) return { reward: null, problem: `${agent}: no reward in result.json` };
  return { reward: parsed.reward, problem: null };
}

/** The verdict from the two runs: passed only with oracle 1.0, nop 0.0 and no exceptions. */
export function goldVerdict(oracleRun: HarborRun, nopRun: HarborRun, checkedAt: string): HarborGold {
  const oracle = agentOutcome("oracle", oracleRun);
  const nop = agentOutcome("nop", nopRun);
  const problems: string[] = [];
  if (oracle.problem) problems.push(oracle.problem);
  else if (oracle.reward !== 1) problems.push(`oracle ${rewardText(oracle.reward!)}`);
  if (nop.problem) problems.push(nop.problem);
  else if (nop.reward === 1) problems.push("nop 1.0: tests pass without the fix");
  else if (nop.reward !== 0) problems.push(`nop ${rewardText(nop.reward!)}`);
  return {
    status: problems.length ? "failed" : "passed",
    oracle: oracle.reward, nop: nop.reward,
    reason: problems.length ? problems.join("; ") : null,
    checked_at: checkedAt,
  };
}

export function skippedGold(reason: string, checkedAt: string): HarborGold {
  return { status: "skipped", oracle: null, nop: null, reason, checked_at: checkedAt };
}

/** The result with the gold check recorded: `harbor_gold`, and `harbor_env.gold` when there is a recipe. Nothing else changes. */
export function withGold(result: ValidationResult, gold: HarborGold): ValidationResult {
  return { ...result, harbor_gold: gold, ...(result.harbor_env ? { harbor_env: { ...result.harbor_env, gold } } : {}) };
}

export type GoldCheckOptions = {
  /** The batch folder: the bundle is read from it, the task goes to `harbor-gold/`, Harbor's jobs to `harbor-gold/jobs/`. */
  out: string;
  row: HarborRow;
  /** A validated result (others are not checked; the caller decides). */
  result: ValidationResult;
  harbor: HarborRunner;
  timeoutMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
};

/**
 * Gold-checks one validated result. `skipped` when Harbor is not installed, the row had a database
 * service (harborSkipReason), there is no bundle, or the task cannot be built; otherwise the oracle
 * and nop runs decide (goldVerdict). Both agents always run, so a failure reports both rewards.
 */
export async function goldCheck(options: GoldCheckOptions): Promise<HarborGold> {
  const { out, row, result, harbor } = options;
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? GOLD_TIMEOUT_SECONDS * 1000;
  const checkedAt = () => now().toISOString();

  if (!(await harbor.version())) return skippedGold(HARBOR_MISSING_REASON, checkedAt());
  // Without a source, harborSkipReason checks only what no source can build: a database service.
  const database = result.harbor_env ? harborSkipReason(result.harbor_env) : null;
  if (database) return skippedGold(database, checkedAt());
  if (!result.snapshot_bundle) return skippedGold(NO_BUNDLE_REASON, checkedAt());

  const goldDir = join(out, "harbor-gold");
  let task;
  try {
    task = await writeBundleTask({ row, result, batch: out, to: goldDir, replace: true });
  } catch (error) {
    return skippedGold(`could not build the task: ${usefulLine(error instanceof Error ? error.message : String(error))}`, checkedAt());
  }
  if ("skip" in task) return skippedGold(task.skip, checkedAt());

  const jobsDir = join(goldDir, "jobs");
  const stamp = checkedAt().replace(/[:.]/g, "-");
  const runAgent = (agent: HarborAgent) => {
    log(`  gold check: harbor run -a ${agent} on ${task.taskDir}`);
    return harbor.run({ taskDir: task.taskDir, agent, jobsDir, jobName: `${task.name}__${agent}__${stamp}`, timeoutMs });
  };
  const oracle = await runAgent("oracle");
  const nop = await runAgent("nop");
  return goldVerdict(oracle, nop, checkedAt());
}
