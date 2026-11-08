// Decides how to install and test a student repository: which package holds the tests (students
// often keep them in `server/` or `apps/api/` inside a workspace), which package manager, which
// Node, and what the package's own `test` script does. Supported runners are Vitest and Node's
// built-in `node --test`; anything else is `env_unsupported` with a one-line detail so the batch
// lists it instead of guessing. Pure: reads files through the `read` callback, touches nothing.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Environment".

export type Runner = "vitest" | "node-test";

/** One line of the test phase, run from the package directory. Reports land in $REPORT_DIR. */
export type TestStep = { kind: Runner | "prep"; command: string };

export type Environment = {
  supported: true;
  runners: Runner[];
  packageManager: "npm" | "pnpm" | "yarn";
  /** Directory of the package.json nearest the test files, "" for the repository root. */
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
};

/**
 * Placeholder variables for every run. CI makes tools non-interactive. DATABASE_URL lets a Prisma
 * or Drizzle config file load (they throw when it is unset); nothing listens there, so a test that
 * really needs a database still fails, honestly.
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

/**
 * Turns the package's `test` script into steps. `a && b && c` runs as three lines: a `vitest`
 * segment becomes our Vitest JSON command, a `node --test` segment gets our reporter, and anything
 * else (a build, a typecheck) runs as written so the tests see what they expect.
 */
export function stepsFromTestScript(script: string | null, hasVitest: boolean): TestStep[] {
  const isDefault = !script || /no test specified/.test(script);
  const segments = isDefault ? [] : script!.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
  const steps: TestStep[] = [];
  segments.forEach((segment, i) => {
    if (/\bvitest\b/.test(segment) && !/\bwatch\b/.test(segment)) {
      steps.push({ kind: "vitest", command: `npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-${i}.json --passWithNoTests` });
    } else if (/\bnode\b[^|;]*\s--test(\s|$)/.test(segment)) {
      const command = segment.replace(/\s--test(?=\s|$)/, ` --test --test-reporter=${NODE_TEST_REPORTER_PATH}`);
      steps.push({ kind: "node-test", command: `REPORT=$REPORT_DIR/node-${i}.json ${command}` });
    } else {
      steps.push({ kind: "prep", command: segment });
    }
  });
  if (!steps.some((s) => s.kind !== "prep") && hasVitest) {
    steps.push({ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" });
  }
  return steps;
}

/**
 * Works out the environment for the package that holds the test files. Looks at the nearest
 * package.json above each test file, the workspace root, the lockfiles, and the Node version.
 */
export async function detectEnvironment(probe: RepoProbe): Promise<Environment | Unsupported> {
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
  if (!found) {
    if (!rootPkg) return unsupported("no package.json above the test files or at the repository root");
    found = { dir: "", pkg: rootPkg };
  }
  const { dir: packageDir, pkg } = found;

  // Workspace root or single package?
  const workspaceRoot = Boolean(rootPkg && (rootPkg.workspaces || (await read("pnpm-workspace.yaml")) != null));
  const installDir = workspaceRoot ? "" : packageDir;

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
  const testSteps = stepsFromTestScript(testScript, hasDependency(pkg, "vitest"));
  const runners = [...new Set(testSteps.map((s) => s.kind).filter((k): k is Runner => k !== "prep"))];
  if (runners.length === 0) {
    const where = packageDir || "the repository root";
    if (hasDependency(pkg, "jest")) return unsupported(`jest in ${where}; only vitest and node --test are supported`);
    if (testScript && !/no test specified/.test(testScript)) return unsupported(`test script in ${where} uses neither vitest nor node --test: ${testScript}`);
    return unsupported(`no vitest dependency and no test script in ${where}`);
  }

  // Node version.
  const engines = (pkg.engines ?? rootPkg?.engines) as Record<string, unknown> | undefined;
  const major = nodeMajorFrom(await read(".nvmrc"), engines?.node) ?? DEFAULT_NODE_MAJOR;
  const image = `node:${major}-bookworm`;

  const dockerfile = [
    `FROM ${image}`, enable, "WORKDIR /work",
    ...Object.entries(CONTAINER_ENV).map(([k, v]) => `ENV ${k}=${v}`),
    `# cd ${installDir || "."} && ${installCommand}`,
    `# cd ${packageDir || "."}`,
    ...testSteps.map((s) => `# ${s.command}`),
  ].filter(Boolean).join("\n") + "\n";

  return { supported: true, runners, packageManager, packageDir, installDir, installCommand, testSteps, env: CONTAINER_ENV, dockerfile, image };
}
