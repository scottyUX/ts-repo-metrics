// Decides how to install and test a student repository: which package holds the tests (students
// often keep them in `server/` or `apps/api/` inside a workspace), which package manager, which
// Node, and what the package's own `test` script does. Supported runners are Vitest, Jest, and
// Node's built-in `node --test`; a row whose test files are all Python runs pytest instead (see
// detectPythonEnvironment). Anything else is `env_unsupported` with a one-line detail so the batch
// lists it instead of guessing. A Postgres service in the CI job that runs the tests is started
// next to every run (see services.ts). Test files in more than one language or package form several
// suites, each detected the same way (detectSuites). Pure: reads files through the `read` callback,
// touches nothing.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Environment".

import { ciTestJob, installStepsFromJob, nodeMajorFromJob, serviceProvenance, servicesFromJob, type InstallStep, type Service } from "@/lib/cse115a/benchmark/validation/services";

export type Runner = "vitest" | "node-test" | "jest" | "pytest";

/** One line of the test phase, run from the package directory. Reports land in $REPORT_DIR. */
export type TestStep = { kind: Runner | "prep"; command: string };

export type Environment = {
  supported: true;
  runners: Runner[];
  packageManager: "npm" | "pnpm" | "yarn" | "pip" | "uv" | "poetry";
  /** Directory of the package.json (Python: the manifest) nearest the test files, "" for the repository root. */
  packageDir: string;
  /** Where `installCommand` runs: the workspace root when there is one, else `packageDir`. */
  installDir: string;
  installCommand: string;
  testSteps: TestStep[];
  /** Environment variables set in the container; placeholders so install hooks and configs load. */
  env: Record<string, string>;
  /** Dockerfile text that reproduces the environment, stored on the row as `image` provenance. */
  dockerfile: string;
  image: string;
  /** Python only: whether the repository's own manifests name pytest (the validator installs it either way). */
  pytestDeclared?: boolean;
  /** Database containers to start next to every run, from the repository's CI; [] (or unset) for none. */
  services?: Service[];
  /**
   * The installs CI runs before its tests, in order, run instead of `installCommand` in
   * `installDir`; [] (or unset) when CI has none the validator recognises. JavaScript only.
   */
  installSteps?: InstallStep[];
  /** Where the Node major came from: `.nvmrc`, `.node-version`, `engines.node`, `CI`, or `default`. JavaScript only. */
  nodeSource?: NodeSource;
  /**
   * Set only when the test files form more than one suite (one per language and package; see
   * detectSuites): every suite's environment, in order, the first of which this object's own fields
   * repeat. Absent for a single suite, whose environment is exactly what it was before suites.
   */
  suites?: Environment[];
};

export type NodeSource = ".nvmrc" | ".node-version" | "engines.node" | "CI" | "default";

/**
 * Placeholder variables for every run. CI makes tools non-interactive. DATABASE_URL lets a Prisma
 * or Drizzle config file load (they throw when it is unset); nothing listens there, so a test that
 * really needs a database still fails, honestly. A row with a CI Postgres service gets the real
 * URL instead (see withServices).
 */
export const CONTAINER_ENV: Record<string, string> = {
  CI: "true",
  DATABASE_URL: "postgresql://hecate:hecate@localhost:5432/hecate",
};

export type Unsupported = { supported: false; reason: "env_unsupported"; detail: string };

/** Reads a file at the base commit; null when it does not exist. */
export type FileReader = (path: string) => Promise<string | null>;

export type RepoProbe = {
  /** Repository-relative paths of the files the test patch writes. */
  testFiles: string[];
  read: FileReader;
  /** Repository-relative paths of the GitHub workflow files (`.github/workflows/*.yml`); none when unset. */
  workflowFiles?: string[];
  /**
   * Repository-relative paths of every package.json in the tree (untracked ones included, since the
   * patches are applied but not staged; node_modules excluded). Read only by the no-package fallback
   * (looseNodeTest); when unset that fallback is not tried.
   */
  packageJsonFiles?: string[];
};

export const DEFAULT_NODE_MAJOR = 22;
/** Written into /patches by the runner; records `file::describe > test` → status for node --test. */
export const NODE_TEST_REPORTER_PATH = "/patches/reporter.mjs";

const LOCKFILES = ["bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"] as const;

type Pkg = Record<string, unknown>;

function parsePkg(text: string | null): Pkg | null | "invalid" {
  if (text == null) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? (value as Pkg) : "invalid";
  } catch {
    return "invalid";
  }
}

function hasDependency(pkg: Pkg, name: string): boolean {
  for (const key of ["dependencies", "devDependencies"]) {
    const deps = pkg[key];
    if (deps && typeof deps === "object" && name in (deps as Record<string, unknown>)) return true;
  }
  return false;
}

function unsupported(detail: string): Unsupported {
  return { supported: false, reason: "env_unsupported", detail };
}

function parentDirs(file: string): string[] {
  const parts = file.split("/").slice(0, -1);
  const dirs: string[] = [];
  for (let i = parts.length; i >= 0; i--) dirs.push(parts.slice(0, i).join("/"));
  return dirs;
}

const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** The nearest directory above `file` that has a package.json, or null. */
async function nearestPackageDir(file: string, read: FileReader): Promise<{ dir: string; pkg: Pkg } | null | Unsupported> {
  for (const dir of parentDirs(file)) {
    const pkg = parsePkg(await read(joinPath(dir, "package.json")));
    if (pkg === "invalid") return unsupported(`${joinPath(dir, "package.json")} is not valid JSON`);
    if (pkg) return { dir, pkg };
  }
  return null;
}

/** Node major from .nvmrc ("24", "v24.1.0") or engines.node (">=20", "^22.0.0"); null if unreadable. */
export function nodeMajorFrom(nvmrc: string | null, engines: unknown): number | null {
  const candidates = [nvmrc, typeof engines === "string" ? engines : null];
  for (const text of candidates) {
    const match = text?.match(/(\d{2})/);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Jest flags we drop from a script: watchers never exit, coverage and silence change nothing we read, and the rest are ours. */
const JEST_DROPPED_FLAG = /^--(watch|watchAll|coverage|silent|ci|json|outputFile|passWithNoTests)(=.*)?$/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * A `jest` segment as our Jest JSON command, or null when the segment does not run Jest. Keeps
 * leading `NAME=value` assignments (ESM projects need `NODE_OPTIONS=--experimental-vm-modules`)
 * and the arguments after `jest` (`--config`, test paths), minus the flags in JEST_DROPPED_FLAG.
 */
function jestCommand(segment: string, i: number): string | null {
  const tokens = segment.split(/\s+/);
  const at = tokens.findIndex((t) => t === "jest" || t.endsWith("/jest") || t.endsWith("/jest.js"));
  if (at < 0) return null;
  const env = tokens.slice(0, at).filter((t) => ENV_ASSIGNMENT.test(t));
  const args = tokens.slice(at + 1).filter((t) => !JEST_DROPPED_FLAG.test(t));
  return [...env, `npx jest --ci --json --outputFile=$REPORT_DIR/jest-${i}.json --passWithNoTests`, ...args].join(" ");
}

const DEFAULT_COMMANDS: Record<"vitest" | "jest", TestStep> = {
  vitest: { kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" },
  jest: { kind: "jest", command: "npx jest --ci --json --outputFile=$REPORT_DIR/jest-0.json --passWithNoTests" },
};

/**
 * Turns the package's `test` script into steps. `a && b && c` runs as three lines: a `vitest` or
 * `jest` segment becomes our JSON-reporting command, a `node --test` segment gets our reporter,
 * and anything else (a build, a typecheck) runs as written so the tests see what they expect.
 * `defaultRunner` (the package's vitest or jest dependency) runs when the script names no runner.
 */
export function stepsFromTestScript(script: string | null, defaultRunner: "vitest" | "jest" | null): TestStep[] {
  const isDefault = !script || /no test specified/.test(script);
  const segments = isDefault ? [] : script!.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
  const steps: TestStep[] = [];
  segments.forEach((segment, i) => {
    const jest = jestCommand(segment, i);
    if (/\bvitest\b/.test(segment) && !/\bwatch\b/.test(segment)) {
      steps.push({ kind: "vitest", command: `npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-${i}.json --passWithNoTests` });
    } else if (jest) {
      steps.push({ kind: "jest", command: jest });
    } else if (/\bnode\b[^|;]*\s--test(\s|$)/.test(segment)) {
      const command = segment.replace(/\s--test(?=\s|$)/, ` --test --test-reporter=${NODE_TEST_REPORTER_PATH}`);
      steps.push({ kind: "node-test", command: `REPORT=$REPORT_DIR/node-${i}.json ${command}` });
    } else {
      steps.push({ kind: "prep", command: segment });
    }
  });
  if (!steps.some((s) => s.kind !== "prep") && defaultRunner) steps.push({ ...DEFAULT_COMMANDS[defaultRunner] });
  return steps;
}

/**
 * Works out the environment for the package that holds the test files. Looks at the nearest
 * package.json above each test file, the workspace root, the lockfiles, and the Node version.
 */
export async function detectEnvironment(probe: RepoProbe): Promise<Environment | Unsupported> {
  const groups = await suiteGroups(probe);
  if ("supported" in groups) return groups;
  // One suite: the single-package detection, on every test file, exactly as before suites existed.
  if (groups.length <= 1) return detectOne(probe, testLanguage(probe.testFiles) === "python" ? "python" : "javascript");
  if (groups.length > MAX_SUITES) {
    return unsupported(`test files form ${groups.length} suites, more than ${MAX_SUITES}: ${groups.map(suiteLabel).join("; ")}`);
  }
  const suites: Environment[] = [];
  for (const group of groups) {
    const env = await detectOne({ ...probe, testFiles: group.files }, group.language);
    if (!env.supported) return unsupported(`suite ${suiteLabel(group)}: ${env.detail}`);
    suites.push(env);
  }
  return { ...suites[0], suites };
}

/** One suite's environment: the language's detector, then what CI says. */
async function detectOne(probe: RepoProbe, language: SuiteLanguage): Promise<Environment | Unsupported> {
  const env = language === "python" ? await detectPythonEnvironment(probe) : await detectNodeEnvironment(probe);
  return env.supported ? withCi(env, probe) : env;
}

/** The most suites a row may have; more is env_unsupported. */
export const MAX_SUITES = 4;

export type SuiteLanguage = "javascript" | "python";

/** A group of test files that run together: one language, one package. */
export type SuiteGroup = { language: SuiteLanguage; packageDir: string; files: string[] };

/** `python in backend`, `javascript in .` */
export function suiteLabel(suite: { language: SuiteLanguage; packageDir: string }): string {
  return `${suite.language} in ${suite.packageDir || "."}`;
}

/** The language of an Environment's suite. */
export function envLanguage(env: Environment): SuiteLanguage {
  return env.runners.includes("pytest") ? "python" : "javascript";
}

/**
 * Splits the test files into suites, one per (language, package), sorted by package directory and
 * then language. The package is what the single-suite detection finds for a file: the nearest
 * package.json for JavaScript and TypeScript, the nearest Python manifest for Python. A file with no
 * package above it joins the language's only package when there is exactly one, else the root
 * (as the single detection treats it). When the row has no Python test file, every test file counts
 * as JavaScript, fixtures included (as before); when it has both languages, files that are neither
 * (fixtures, snapshots) join no suite. An invalid package.json on the way is env_unsupported.
 */
export async function suiteGroups(probe: RepoProbe): Promise<SuiteGroup[] | Unsupported> {
  const { read } = probe;
  const python = probe.testFiles.filter((f) => PY_FILE.test(f));
  const js = python.length ? probe.testFiles.filter((f) => JS_FILE.test(f)) : probe.testFiles;
  const exists = async (dir: string, name: string) => (await read(joinPath(dir, name))) != null;
  const groups: SuiteGroup[] = [];

  const place = (language: SuiteLanguage, placed: Array<{ file: string; dir: string | null }>) => {
    const dirs = [...new Set(placed.map((p) => p.dir).filter((d): d is string => d != null))];
    const fallback = dirs.length === 1 ? dirs[0] : "";
    for (const { file, dir } of placed) {
      const packageDir = dir ?? fallback;
      let group = groups.find((g) => g.language === language && g.packageDir === packageDir);
      if (!group) groups.push((group = { language, packageDir, files: [] }));
      group.files.push(file);
    }
  };

  const jsPlaced: Array<{ file: string; dir: string | null }> = [];
  for (const file of js) {
    const nearest = await nearestPackageDir(file, read);
    if (nearest && "supported" in nearest) return nearest;
    jsPlaced.push({ file, dir: nearest ? nearest.dir : null });
  }
  place("javascript", jsPlaced);

  const pyPlaced: Array<{ file: string; dir: string | null }> = [];
  for (const file of python) {
    let dir: string | null = null;
    for (const candidate of parentDirs(file)) {
      if (await anyExists(candidate, PY_MANIFESTS, exists)) { dir = candidate; break; }
    }
    pyPlaced.push({ file, dir });
  }
  place("python", pyPlaced);

  return groups.sort((a, b) => a.packageDir.localeCompare(b.packageDir) || a.language.localeCompare(b.language));
}

/**
 * Applies what the CI job that runs the tests says. Its Postgres service: `services`, the real
 * DATABASE_URL in place of the placeholder, the service in the Dockerfile provenance. For
 * JavaScript, its install steps (every directory it installs in, in order) and, when no repository
 * file names a Node version, its setup-node version. Without CI, `services: []`, `installSteps: []`
 * and nothing else changes.
 */
export async function withCi(env: Environment, probe: RepoProbe): Promise<Environment> {
  const files = [];
  for (const path of probe.workflowFiles ?? []) {
    const text = await probe.read(path);
    if (text != null) files.push({ path, text });
  }
  const ci = ciTestJob(files, env.packageDir);
  const services = ci ? servicesFromJob(ci) : [];
  const js = !env.runners.includes("pytest");
  const installSteps = ci && js ? installStepsFromJob(ci) : [];
  const ciNode = ci && js && env.nodeSource === "default" ? nodeMajorFromJob(ci) : null;
  let out: Environment = { ...env, services, ...(js ? { installSteps } : {}) };
  if (ciNode != null) {
    const image = `node:${ciNode}-bookworm`;
    out = { ...out, image, nodeSource: "CI", dockerfile: out.dockerfile.replace(/^FROM .*$/m, `FROM ${image}`) };
  }
  if (installSteps.length) {
    const lines = installSteps.map((step) => `# cd ${step.cwd || "."} && ${step.command}`);
    out.dockerfile = out.dockerfile.replace(/^# cd .*\n/m, lines.join("\n") + "\n");
  }
  if (services.length) {
    out.env = { ...env.env, DATABASE_URL: services[0].containerDatabaseUrl };
    out.dockerfile = out.dockerfile.replace(/^ENV DATABASE_URL=.*$/m, `ENV DATABASE_URL=${out.env.DATABASE_URL}`)
      .replace(/^WORKDIR \/work$/m, (line) => [line, ...serviceProvenance(services)].join("\n"));
  }
  return out;
}

/**
 * What a run installs with: CI's install steps, else the detected single install. `cwd` is where
 * each command runs, `dir` the package it installs.
 */
export function installPlan(env: Environment): InstallStep[] {
  if (!env.installSteps?.length) return [{ dir: env.installDir, cwd: env.installDir, command: env.installCommand }];
  // The image has no pnpm or yarn until corepack provides them, as the single install does.
  const corepack = (command: string) => (/^(pnpm|yarn)\b/.test(command) ? `corepack enable && ${command}` : command);
  return env.installSteps.map((step) => ({ ...step, command: corepack(step.command) }));
}

/** The JavaScript half of detectEnvironment. */
async function detectNodeEnvironment(probe: RepoProbe): Promise<Environment | Unsupported> {
  const { read } = probe;
  const rootPkg = parsePkg(await read("package.json"));
  if (rootPkg === "invalid") return unsupported("package.json is not valid JSON");
  if (probe.testFiles.length === 0 && !rootPkg) return unsupported("no package.json at the repository root");

  // Which package do the tests belong to?
  let found: { dir: string; pkg: Pkg } | null = null;
  for (const file of probe.testFiles) {
    const nearest = await nearestPackageDir(file, read);
    if (nearest && "supported" in nearest) return nearest;
    if (!nearest) continue;
    if (found && found.dir !== nearest.dir) return unsupported(`test files span two packages: ${found.dir || "."} and ${nearest.dir || "."}`);
    found = nearest;
  }
  let loose: LooseNodeTest | null = null;
  if (!found) {
    if (!rootPkg) {
      const fallback = await looseNodeTest(probe);
      if ("supported" in fallback) return fallback;
      loose = fallback;
      found = { dir: "", pkg: fallback.pkg };
    } else {
      found = { dir: "", pkg: rootPkg };
    }
  }
  const { dir: packageDir, pkg } = found;

  // Workspace root or single package?
  const workspaceRoot = Boolean(rootPkg && (rootPkg.workspaces || (await read("pnpm-workspace.yaml")) != null));
  const installDir = loose ? loose.installDir : workspaceRoot ? "" : packageDir;

  // Package manager, from the lockfile at the install dir (falling back to the root).
  const lockfiles = new Set<string>();
  for (const dir of [...new Set([installDir, ""])]) {
    for (const name of LOCKFILES) if ((await read(joinPath(dir, name))) != null) lockfiles.add(name);
  }
  let packageManager: Environment["packageManager"];
  let installCommand: string;
  let enable = "";
  if (lockfiles.has("bun.lockb") || lockfiles.has("bun.lock")) return unsupported("bun lockfile; bun is not installed in the image");
  if (lockfiles.has("pnpm-lock.yaml")) { packageManager = "pnpm"; installCommand = "corepack enable && pnpm install --frozen-lockfile"; enable = "RUN corepack enable"; }
  else if (lockfiles.has("yarn.lock")) { packageManager = "yarn"; installCommand = "corepack enable && yarn install --immutable"; enable = "RUN corepack enable"; }
  else if (lockfiles.has("package-lock.json")) { packageManager = "npm"; installCommand = "npm ci"; }
  else { packageManager = "npm"; installCommand = "npm install"; }

  // Test steps from the package's own script.
  const scripts = (pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {}) as Record<string, unknown>;
  const testScript = typeof scripts.test === "string" ? scripts.test : null;
  const defaultRunner = hasDependency(pkg, "vitest") ? "vitest" : hasDependency(pkg, "jest") ? "jest" : null;
  const testSteps = loose ? loose.testSteps : stepsFromTestScript(testScript, defaultRunner);
  const runners = [...new Set(testSteps.map((s) => s.kind).filter((k): k is Runner => k !== "prep"))];
  if (runners.length === 0) {
    const where = packageDir || "the repository root";
    if (testScript && !/no test specified/.test(testScript)) return unsupported(`test script in ${where} uses none of vitest, jest, or node --test: ${testScript}`);
    return unsupported(`no vitest or jest dependency and no test script in ${where}`);
  }

  // Node version.
  const engines = (pkg.engines ?? rootPkg?.engines) as Record<string, unknown> | undefined;
  // Repository files first; CI's setup-node version is applied later (withCi) only when none says.
  let nodeSource: NodeSource = "default";
  let major = DEFAULT_NODE_MAJOR;
  for (const [source, text] of [[".nvmrc", await read(".nvmrc")], [".node-version", await read(".node-version")], ["engines.node", null]] as const) {
    const found = nodeMajorFrom(text, source === "engines.node" ? engines?.node : undefined);
    if (found != null) { major = found; nodeSource = source; break; }
  }
  const image = `node:${major}-bookworm`;

  const dockerfile = [
    `FROM ${image}`, enable, "WORKDIR /work",
    ...Object.entries(CONTAINER_ENV).map(([k, v]) => `ENV ${k}=${v}`),
    loose ? `# no package.json above the test files: node --test from the repository root, install in ${installDir || "."}` : "",
    `# cd ${installDir || "."} && ${installCommand}`,
    `# cd ${packageDir || "."}`,
    ...testSteps.map((s) => `# ${s.command}`),
  ].filter(Boolean).join("\n") + "\n";

  return { supported: true, runners, packageManager, packageDir, installDir, installCommand, testSteps, env: CONTAINER_ENV, dockerfile, image, nodeSource };
}

/** The no-package fallback's choice: the one package.json to install, and the node --test step run from the root. */
type LooseNodeTest = { installDir: string; pkg: Pkg; testSteps: TestStep[] };

const NODE_TEST_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(["'])node:test\1/;
/** `.test.mjs`, `.spec.ts`: an ending other test files in the same folder share. */
const COMPOUND_TEST_ENDING = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const NO_PACKAGE = "no package.json above the test files or at the repository root";

/**
 * Test files with no package.json above them and none at the root (jjacobhw/roomie: `tests/*.test.mjs`
 * at the root, importing `node:test` and `../backend/expenses.ts`, with the only package.json in
 * `backend/`). When a test file imports `node:test` and the repository has exactly one package.json,
 * the tests run with `node --test` from the root and the install happens in that package's folder.
 * The paths are one unquoted glob per folder and compound ending (`tests/*.test.mjs`), so the folder's
 * older tests run too and the shell expands it (node --test reads globs itself only from Node 21),
 * and a plain-ending file's own path. Otherwise env_unsupported, saying which condition failed.
 */
async function looseNodeTest(probe: RepoProbe): Promise<LooseNodeTest | Unsupported> {
  if (!probe.packageJsonFiles) return unsupported(NO_PACKAGE);
  const code: string[] = [];
  let importsNodeTest = false;
  for (const file of probe.testFiles.filter((f) => JS_FILE.test(f))) {
    const text = await probe.read(file);
    if (text == null) continue;
    code.push(file);
    if (NODE_TEST_IMPORT.test(text)) importsNodeTest = true;
  }
  if (!importsNodeTest) return unsupported(NO_PACKAGE);

  const manifests = [...new Set(probe.packageJsonFiles)].sort();
  if (manifests.length === 0) return unsupported("no package.json in the repository");
  if (manifests.length > 1) return unsupported(`no package.json above the test files, and ${manifests.length} packages to choose from: ${manifests.join(", ")}`);
  const pkg = parsePkg(await probe.read(manifests[0]));
  if (pkg === "invalid") return unsupported(`${manifests[0]} is not valid JSON`);
  if (pkg == null) return unsupported("no package.json in the repository");

  const paths: string[] = [];
  for (const file of code) {
    const slash = file.lastIndexOf("/");
    const ending = file.slice(slash + 1).match(COMPOUND_TEST_ENDING)?.[0];
    const path = ending ? `${slash < 0 ? "" : file.slice(0, slash + 1)}*${ending}` : file;
    if (!paths.includes(path)) paths.push(path);
  }
  const command = `REPORT=$REPORT_DIR/node-0.json node --test --test-reporter=${NODE_TEST_REPORTER_PATH} ${paths.join(" ")}`;
  const slash = manifests[0].lastIndexOf("/");
  return { installDir: slash < 0 ? "" : manifests[0].slice(0, slash), pkg, testSteps: [{ kind: "node-test", command }] };
}

// ---------------------------------------------------------------------------------------------
// Python. Chosen when every test file the patch writes that is code is .py; the JS path above is
// unchanged. Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Environment".

const JS_FILE = /\.[cm]?[jt]sx?$/i;
const PY_FILE = /\.py$/i;

/** Which runner family the row's test files belong to. Non-code files (fixtures, snapshots) do not count. */
export function testLanguage(testFiles: string[]): "javascript" | "python" | "mixed" {
  const python = testFiles.some((f) => PY_FILE.test(f));
  const js = testFiles.some((f) => JS_FILE.test(f));
  if (python && js) return "mixed";
  return python ? "python" : "javascript";
}

/** Files that mark a Python package directory, nearest first. */
const PY_MANIFESTS = ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"] as const;
/** Extra requirement files installed after requirements.txt when present. */
const PY_EXTRA_REQUIREMENTS = ["requirements-dev.txt", "requirements-test.txt", "dev-requirements.txt"] as const;

export const DEFAULT_PYTHON = "3.12";
/** Oldest Python the image is built from: pytest 8 needs 3.9, and `requires-python = ">=3.7"` templates are common. */
export const MIN_PYTHON_MINOR = 9;
/** Written into /patches by the runner and loaded with `-p`; records `file::Class::test` → status. */
export const PYTEST_REPORTER_FILE = "/patches/hecate_pytest_reporter.py";
/** Where uv puts the project's environment: outside the mounted checkout, so every run starts clean. */
const UV_ENVIRONMENT = "/opt/venv";

/**
 * Container variables for Python runs. Poetry installs into the image's Python instead of a venv,
 * and uv into /opt/venv, so nothing a run installs survives in the host checkout; no .pyc files
 * are written into it either.
 */
export const PYTHON_ENV: Record<string, string> = {
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  PIP_ROOT_USER_ACTION: "ignore",
  PYTHONDONTWRITEBYTECODE: "1",
  POETRY_VIRTUALENVS_CREATE: "false",
  UV_PROJECT_ENVIRONMENT: UV_ENVIRONMENT,
  UV_LINK_MODE: "copy",
};

/**
 * `major.minor` from .python-version ("3.11.4", "3.11"), else the lowest minor `requires-python`
 * allows (">=3.10,<4" → 3.10), raised to MIN_PYTHON_MINOR; null when neither says.
 */
export function pythonVersionFrom(pythonVersion: string | null, pyproject: string | null): string | null {
  const pinned = pythonVersion?.match(/^\s*(\d+)\.(\d+)/m);
  if (pinned) return `${pinned[1]}.${pinned[2]}`;
  const spec = pyproject?.match(/^\s*requires-python\s*=\s*["']([^"']+)["']/m)?.[1];
  if (!spec) return null;
  let lowest: [number, number] | null = null;
  for (const clause of spec.split(",")) {
    const m = clause.trim().match(/^(>=|>|~=|===?|\^|~)?\s*(\d+)(?:\.(\d+))?/);
    if (!m) continue; // `<4`, `!=3.9.*`: upper bounds and exclusions say nothing about the lowest
    const v: [number, number] = [Number(m[2]), Number(m[3] ?? 0)];
    if (!lowest || v[0] > lowest[0] || (v[0] === lowest[0] && v[1] > lowest[1])) lowest = v;
  }
  if (!lowest) return null;
  if (lowest[0] === 3 && lowest[1] < MIN_PYTHON_MINOR) lowest = [3, MIN_PYTHON_MINOR];
  return `${lowest[0]}.${lowest[1]}`;
}

/** The pytest command; `runPrefix` is `uv run --no-sync ` or `poetry run ` when the manager owns the environment. */
export function pytestCommand(runPrefix = ""): string {
  const plugin = PYTEST_REPORTER_FILE.split("/").pop()!.replace(/\.py$/, "");
  const dir = PYTEST_REPORTER_FILE.slice(0, PYTEST_REPORTER_FILE.lastIndexOf("/"));
  // --continue-on-collection-errors: without it one file that cannot import stops pytest before any
  // test runs, and every other test in the suite would be absent from that state.
  return `PYTHONPATH=${dir} REPORT=$REPORT_DIR/pytest-0.json ${runPrefix}python -m pytest -p ${plugin} -p no:cacheprovider --continue-on-collection-errors`;
}

/**
 * Environment for a row whose test files are Python. The package directory is the nearest one above
 * the test files with a pyproject.toml, requirements.txt, setup.py or setup.cfg, else the root. The
 * install follows the first of uv.lock, poetry.lock, requirements files, an installable
 * pyproject.toml or setup.py, and always ends by installing pytest. The whole suite runs; no file selectors.
 */
export async function detectPythonEnvironment(probe: RepoProbe): Promise<Environment | Unsupported> {
  const { read } = probe;
  const exists = async (dir: string, name: string) => (await read(joinPath(dir, name))) != null;

  let packageDir: string | null = null;
  for (const file of probe.testFiles.filter((f) => PY_FILE.test(f))) {
    let nearest: string | null = null;
    for (const dir of parentDirs(file)) {
      if (await anyExists(dir, PY_MANIFESTS, exists)) { nearest = dir; break; }
    }
    if (nearest == null) continue;
    if (packageDir != null && packageDir !== nearest) return unsupported(`test files span two packages: ${packageDir || "."} and ${nearest || "."}`);
    packageDir = nearest;
  }
  packageDir ??= "";

  // Lockfiles are looked for in the package and then at the root (a uv or Poetry workspace).
  const lockDir = async (name: string) => ((await exists(packageDir!, name)) ? packageDir! : (await exists("", name)) ? "" : null);
  const uvDir = await lockDir("uv.lock");
  const poetryDir = uvDir == null ? await lockDir("poetry.lock") : null;
  const pyproject = await read(joinPath(packageDir, "pyproject.toml"));

  let packageManager: Environment["packageManager"] = "pip";
  let installDir = packageDir;
  let install: string[];
  let runPrefix = "";
  if (uvDir != null) {
    packageManager = "uv"; installDir = uvDir; runPrefix = "uv run --no-sync ";
    install = ["pip install uv", "uv sync --frozen", `uv pip install --python ${UV_ENVIRONMENT}/bin/python pytest`];
  } else if (poetryDir != null) {
    // --no-root: student projects are rarely laid out as an installable package, and Poetry 2 fails
    // the install when the root cannot be built; pytest runs from the package dir, which is on sys.path.
    packageManager = "poetry"; installDir = poetryDir; runPrefix = "poetry run ";
    install = ["pip install poetry", "poetry install --no-interaction --no-root", "pip install pytest"];
  } else {
    const requirements: string[] = [];
    if (await exists(packageDir, "requirements.txt")) {
      requirements.push("requirements.txt");
      for (const name of PY_EXTRA_REQUIREMENTS) if (await exists(packageDir, name)) requirements.push(name);
    }
    // A pyproject.toml that only configures tools (`[tool.pytest.ini_options]`) is not installable.
    const installable = (pyproject != null && /^\[(project|build-system)\]/m.test(pyproject)) || (await exists(packageDir, "setup.py"));
    if (requirements.length) install = [`pip install ${requirements.map((r) => `-r ${r}`).join(" ")}`];
    else if (installable) install = ["pip install -e ."];
    else install = [];
    install.push("pip install pytest");
  }
  const installCommand = install.join(" && ");

  const version = pythonVersionFrom(
    (await read(joinPath(packageDir, ".python-version"))) ?? (await read(".python-version")),
    pyproject,
  ) ?? DEFAULT_PYTHON;
  const image = `python:${version}-bookworm`;

  const manifests = await Promise.all([...PY_MANIFESTS, ...PY_EXTRA_REQUIREMENTS].map((n) => read(joinPath(packageDir!, n))));
  const pytestDeclared = manifests.some((text) => text != null && /\bpytest\b/i.test(text));

  const testSteps: TestStep[] = [{ kind: "pytest", command: pytestCommand(runPrefix) }];
  const env = { ...CONTAINER_ENV, ...PYTHON_ENV };
  const dockerfile = [
    `FROM ${image}`, "WORKDIR /work",
    ...Object.entries(env).map(([k, v]) => `ENV ${k}=${v}`),
    `# cd ${installDir || "."} && ${installCommand}`,
    `# cd ${packageDir || "."}`,
    ...testSteps.map((s) => `# ${s.command}`),
  ].join("\n") + "\n";

  return { supported: true, runners: ["pytest"], packageManager, packageDir, installDir, installCommand, testSteps, env, dockerfile, image, pytestDeclared };
}

async function anyExists(dir: string, names: readonly string[], exists: (dir: string, name: string) => Promise<boolean>): Promise<boolean> {
  for (const name of names) if (await exists(dir, name)) return true;
  return false;
}
