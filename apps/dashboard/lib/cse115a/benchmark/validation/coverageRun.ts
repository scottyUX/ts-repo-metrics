// The coverage run behind `fix_coverage` (fixCoverage.ts): for a validated row, one more R2 run per
// suite that has a proving test file, with line coverage on and only the proving test files
// selected. It reuses the suite's run plan (image, installs, database, environment) and changes only
// the test steps; the container works in its own clone of the checkout (RunPlan.isolatedCheckout),
// so the coverage tools it installs never reach the host checkout, the image digest or the Harbor
// task. Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Fix coverage".

import { posix } from "node:path";
import { envLanguage, suiteLabel, type Environment, type TestStep } from "@/lib/cse115a/benchmark/validation/environment";
import {
  changedLinesInPatch, classifyFixCoverage, codeLines, istanbulPaths, parseCoveragePyReport, parseIstanbulReport, unavailableCoverage,
  type CoverageLanguage, type FixCoverage, type ReportCoverage,
} from "@/lib/cse115a/benchmark/validation/fixCoverage";
import type { RunPlan, SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import type { ReadFile } from "@/lib/cse115a/benchmark/validation/untestedFiles";
import { fileOfTestId, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

/** Where every coverage file goes inside the container; the runner hands back everything under it. */
export const COVERAGE_DIR = "$REPORT_DIR/coverage";
/** c8 (V8 coverage → Istanbul, with source maps) for `node --test`; works on Node 18 and later. */
export const C8_VERSION = "10.1.3";
const C8_PREFIX = "/tmp/hecate-c8";
/** coverage.py settings, written into /patches: data outside the checkout, only repository files, the repository's own config ignored. */
export const COVERAGERC_NAME = "hecate_coveragerc";
export const COVERAGERC = "[run]\ndata_file = /tmp/hecate.coverage\ninclude = /work/*\nomit =\n    */site-packages/*\n    */node_modules/*\n";

/** Single-quotes a string for bash. */
const quote = (text: string) => `'${text.split("'").join("'\\''")}'`;

/** Node flags whose value is the next token (so that token is not a test path). */
const NODE_VALUE_FLAGS = new Set([
  "--import", "--require", "-r", "--loader", "--experimental-loader", "--env-file", "--test-reporter", "--test-reporter-destination",
  "--test-name-pattern", "--test-skip-pattern", "--test-concurrency", "--test-timeout", "--conditions", "-C", "--input-type", "--test-shard",
]);

/** A glob (`*`, `**`, `?`, `{a,b}`) as a regular expression over a whole relative path. */
export function globRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i++; }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += `(?:${glob.slice(i + 1, end).split(",").map((part) => part.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|")})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** The test paths a `node --test` segment names (files, folders, globs), and where the `node` token is. */
function nodeTestArgs(segment: string): { tokens: string[]; node: number; paths: number[] } {
  const tokens = segment.split(/\s+/).filter(Boolean);
  const node = tokens.findIndex((t) => t === "node" || t.endsWith("/node"));
  const paths: number[] = [];
  for (let i = node + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      if (!t.includes("=") && NODE_VALUE_FLAGS.has(t)) i++;
      continue;
    }
    paths.push(i);
  }
  return { tokens, node, paths };
}

const unquote = (arg: string) => arg.replace(/^["']|["']$/g, "").replace(/^\.\//, "");

/** Whether `node --test` with these path arguments (none: Node's default patterns) runs `file` (relative to its folder). */
export function nodeTestRuns(args: string[], file: string): boolean {
  if (!args.length) {
    const base = posix.basename(file);
    return /^(test|test-.+|.+[.\-_]test)\.[cm]?[jt]sx?$/.test(base) || /(^|\/)test\//.test(file);
  }
  return args.map(unquote).some((arg) => (/[*?{]/.test(arg) ? globRegex(arg).test(file) : file === arg || file.startsWith(`${arg.replace(/\/$/, "")}/`)));
}

/** The report tag of a step (`vitest-0`), from its report file name; `<kind>-<index>` otherwise. */
function stepTag(step: TestStep, index: number): string {
  const match = /\$REPORT_DIR\/(vitest|jest|node|pytest)-(\d+)\.json/.exec(step.command);
  return match ? `${match[1]}-${match[2]}` : `${step.kind === "node-test" ? "node" : step.kind}-${index}`;
}

export type CoverageSteps = {
  /** The test steps of the coverage plan. */
  steps: string[];
  /** One per runner step kept: its report tag (`vitest-0`), its kind, and the proving files it runs. */
  reports: Array<{ tag: string; kind: TestStep["kind"]; files: string[] }>;
};

/**
 * The suite's test steps rewritten for the coverage run, running only `files` (proving test files,
 * relative to the package folder). A `node --test` step takes the files its own path arguments (or
 * Node's default patterns) match; Vitest and Jest steps take the rest (each ignores files outside
 * its own config), or a `node --test` step does when there is neither. A runner step left with no
 * file is dropped, and so is every other step after the last one kept.
 */
export function coverageSteps(env: Environment, files: string[]): CoverageSteps {
  const steps = env.testSteps;
  const assigned = new Map<number, string[]>();
  const nodeSteps = steps.map((s, i) => (s.kind === "node-test" ? i : -1)).filter((i) => i >= 0);
  const otherSteps = steps.map((s, i) => (s.kind === "vitest" || s.kind === "jest" || s.kind === "pytest" ? i : -1)).filter((i) => i >= 0);
  const rest: string[] = [];
  for (const file of files) {
    const owner = nodeSteps.find((i) => {
      const { tokens, paths } = nodeTestArgs(steps[i].command);
      return nodeTestRuns(paths.map((p) => tokens[p]), file);
    });
    if (owner !== undefined) assigned.set(owner, [...(assigned.get(owner) ?? []), file]);
    else rest.push(file);
  }
  if (rest.length) {
    const takers = otherSteps.length ? otherSteps : nodeSteps.slice(0, 1);
    for (const i of takers) assigned.set(i, [...(assigned.get(i) ?? []), ...rest]);
  }
  const last = Math.max(-1, ...assigned.keys());
  const out: CoverageSteps = { steps: [`mkdir -p ${COVERAGE_DIR}`], reports: [] };
  steps.forEach((step, i) => {
    if (i > last) return;
    if (step.kind === "prep") { out.steps.push(step.command); return; }
    const mine = assigned.get(i);
    if (!mine?.length) return;
    const tag = stepTag(step, i);
    out.reports.push({ tag, kind: step.kind, files: mine });
    out.steps.push(...runnerSteps(env, step, tag, mine));
  });
  return out;
}

/** The lines that set up one runner's coverage tool and run its step with coverage on. */
function runnerSteps(env: Environment, step: TestStep, tag: string, files: string[]): string[] {
  const paths = files.map(quote).join(" ");
  const error = (message: string) => `echo ${quote(message)} > ${COVERAGE_DIR}/error-${tag}.txt`;
  const tool = `${COVERAGE_DIR}/tool-${tag}.txt`;
  const installLog = `${COVERAGE_DIR}/install-${tag}.log`;
  if (step.kind === "pytest") {
    const prefix = env.packageManager === "uv" ? "uv run --no-sync " : env.packageManager === "poetry" ? "poetry run " : "";
    const install = env.packageManager === "uv" ? "uv pip install --python /opt/venv/bin/python coverage" : "pip install coverage";
    const rc = `--rcfile=/patches/${COVERAGERC_NAME}`;
    return [
      `${install} > ${installLog} 2>&1 || ${error("could not install coverage.py")}`,
      `${step.command.replace(/python -m pytest /, `python -m coverage run ${rc} -m pytest `)} ${paths}`,
      `${prefix}python -m coverage json ${rc} -q -o ${COVERAGE_DIR}/${tag}.json`,
      `echo "coverage.py $(${prefix}python -m coverage --version | head -n 1 | sed -E 's/^Coverage\\.py, version ([^ ]+).*/\\1/')" > ${tool}`,
    ];
  }
  if (step.kind === "vitest") {
    // The provider must be the repository's exact Vitest version; added only inside this run's clone.
    const add = {
      npm: `npm install --no-save --no-audit --no-fund @vitest/coverage-v8@"$VV"`,
      pnpm: `{ pnpm add -D @vitest/coverage-v8@"$VV" || pnpm add -D -w @vitest/coverage-v8@"$VV"; }`,
      yarn: `YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn add -D @vitest/coverage-v8@"$VV"`,
    }[env.packageManager as "npm" | "pnpm" | "yarn"] ?? `npm install --no-save --no-audit --no-fund @vitest/coverage-v8@"$VV"`;
    const has = `node -e 'const fs=require("fs"),p=require("path");let d=process.cwd();for(;;){const f=p.join(d,"node_modules/@vitest/coverage-v8/package.json");if(fs.existsSync(f))process.exit(JSON.parse(fs.readFileSync(f,"utf8")).version===process.argv[1]?0:1);const u=p.dirname(d);if(u===d)process.exit(1);d=u}' "$VV"`;
    return [
      `VV=$(node -p 'require("vitest/package.json").version') && echo "vitest $VV (v8)" > ${tool} && { ${has} || ${add} > ${installLog} 2>&1; } || ${error("could not install @vitest/coverage-v8 at the repository's Vitest version")}`,
      // `coverage.all` exists before Vitest 4 only (4 reports loaded files by default).
      `${step.command} --coverage.enabled=true --coverage.provider=v8 --coverage.reporter=json --coverage.reportsDirectory=${COVERAGE_DIR}/${tag} --coverage.exclude='**/node_modules/**'$([ "\${VV%%.*}" -lt 4 ] 2>/dev/null && echo ' --coverage.all=false') ${paths}`,
    ];
  }
  if (step.kind === "jest") {
    return [
      `echo "jest $(npx --no-install jest --version)" > ${tool}`,
      `${step.command} --coverage --coverageReporters=json --coverageDirectory=${COVERAGE_DIR}/${tag} --coveragePathIgnorePatterns=/node_modules/ --runTestsByPath ${paths}`,
    ];
  }
  // node --test under c8, installed outside the checkout: the segment's own path arguments are replaced by the proving files.
  const { tokens, node, paths: pathIndexes } = nodeTestArgs(step.command);
  const kept = tokens.filter((_t, i) => !pathIndexes.includes(i));
  const c8 = `${C8_PREFIX}/node_modules/.bin/c8 --reporter=json --report-dir=${COVERAGE_DIR}/${tag} --temp-directory=/tmp/hecate-c8-${tag} --allowExternal --exclude='**/node_modules/**'`;
  const command = [...kept.slice(0, node), c8, ...kept.slice(node)].join(" ");
  return [
    `{ [ -x ${C8_PREFIX}/node_modules/.bin/c8 ] || npm install --prefix ${C8_PREFIX} --no-save --no-audit --no-fund c8@${C8_VERSION} > ${installLog} 2>&1; } && echo "c8 ${C8_VERSION} (node $(node --version))" > ${tool} || ${error(`could not install c8 ${C8_VERSION}`)}`,
    `${command} ${paths}`,
  ];
}

/** The suite of a multi-suite environment a proving test file belongs to: same language, deepest package folder that holds it. */
export function suiteOfFile(suites: Environment[], file: string): number {
  const language: CoverageLanguage = file.endsWith(".py") ? "python" : "javascript";
  let best = -1;
  suites.forEach((suite, i) => {
    if (envLanguage(suite) !== language) return;
    const dir = suite.packageDir;
    if (dir && !file.startsWith(`${dir}/`)) return;
    if (best < 0 || dir.length > suites[best].packageDir.length) best = i;
  });
  return best;
}

export type MeasureInput = {
  row: TaskRow;
  /** The validated result: its proving ids, image and digest. */
  result: ValidationResult;
  env: Environment;
  /** The run plan of one suite (validateTask's suitePlan), labelled for a multi-suite row. */
  plan: (suite: Environment) => RunPlan;
  runner: SuiteRunner;
  /** Reads the post-fix tree (base + test_patch + patch). */
  read: ReadFile;
  log?: (line: string) => void;
};

/** The first non-empty line of an error, at most 200 characters. */
function errorLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "unknown error";
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

/**
 * Runs the coverage plan of every suite that has a proving test file and classifies the fix's
 * changed files. Never throws: any failure of a suite becomes a report that is not ok, and the
 * status says how much was measured.
 */
export async function measureFixCoverage(input: MeasureInput): Promise<FixCoverage> {
  const { row, result, env, runner } = input;
  const log = input.log ?? (() => {});
  const changed = changedLinesInPatch(row.patch);
  const proving = [...result.FAIL_TO_PASS, ...result.ABSENT_TO_PASS];
  const provingFiles = [...new Set(proving.map(fileOfTestId))];
  if (!runner.runCoverage) return unavailableCoverage("this runner cannot run coverage", changed.size);

  const suites = env.suites?.length ? env.suites : [env];
  const multi = suites.length > 1;
  const reports: ReportCoverage[] = [];
  for (const [index, suite] of suites.entries()) {
    const mine = provingFiles.filter((f) => suiteOfFile(suites, f) === index);
    if (!mine.length) continue;
    const language = envLanguage(suite);
    const where = suiteLabel({ language, packageDir: suite.packageDir });
    const relative = mine.map((f) => posix.relative(suite.packageDir || ".", f));
    const { steps, reports: tags } = coverageSteps(suite, relative);
    const label = (tag: string) => `${tag} in ${suite.packageDir || "."}`;
    if (!tags.length) {
      reports.push({ label: where, language, ok: false, reason: "no step of the test script runs the proving test files" });
      continue;
    }
    const base = input.plan(suite);
    // The first suite ran on the image the result pins; the digest makes this run use the same bytes.
    const image = index === 0 && result.image_digest?.startsWith(`${base.image}@`) ? result.image_digest : base.image;
    const plan: RunPlan = {
      ...base, image, testSteps: steps, isolatedCheckout: true, extraFiles: { [COVERAGERC_NAME]: COVERAGERC },
      ...(multi ? { label: where } : {}),
    };
    const started = Date.now();
    let run;
    try {
      run = await runner.runCoverage(plan);
    } catch (error) {
      for (const t of tags) reports.push({ label: label(t.tag), language, ok: false, reason: `coverage run failed: ${errorLine(error)}` });
      continue;
    } finally {
      log(`  coverage run${multi ? ` (${where})` : ""}: ${Math.round((Date.now() - started) / 1000)} s`);
    }
    for (const t of tags) {
      const fail = (reason: string) => reports.push({ label: label(t.tag), language, ok: false, reason });
      const error = run.files[`error-${t.tag}.txt`]?.trim();
      if (error) { fail(error); continue; }
      // The proving tests of this step must have passed in this run, or its coverage says nothing about them.
      const ids = proving.filter((id) => t.files.includes(posix.relative(suite.packageDir || ".", fileOfTestId(id))));
      if (!ids.some((id) => run.results[id] === "passed")) { fail("the proving tests did not pass in the coverage run"); continue; }
      const istanbul = run.files[`${t.tag}/coverage-final.json`];
      const coveragePy = run.files[`${t.tag}.json`];
      const tool = run.files[`tool-${t.tag}.txt`]?.trim() || t.tag;
      try {
        if (istanbul != null) {
          const files = parseIstanbulReport(istanbul, suite.packageDir, changed);
          const generated: string[] = [];
          for (const path of istanbulPaths(istanbul, suite.packageDir)) if (/\.[cm]?jsx?$/.test(path) && (await input.read(path)) == null) generated.push(path);
          reports.push({ label: label(t.tag), language, ok: true, tool, files, generated });
        } else if (coveragePy != null) {
          reports.push({ label: label(t.tag), language, ok: true, tool, files: parseCoveragePyReport(coveragePy, suite.packageDir), generated: [] });
        } else fail("no coverage report written");
      } catch (error) {
        fail(`unreadable coverage report: ${errorLine(error)}`);
      }
    }
  }

  const code = new Map<string, Set<number> | null>();
  for (const path of changed.keys()) {
    const source = await input.read(path).catch(() => null);
    code.set(path, source == null ? null : codeLines(path, source));
  }
  return classifyFixCoverage({ changed, code, reports });
}
