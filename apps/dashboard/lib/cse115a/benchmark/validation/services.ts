// Reads the GitHub workflow job that runs a repository's tests for what the validator should copy:
// the database its tests run against (only Postgres for now), the directories it installs
// dependencies in, and the Node version it sets up. Pure: takes the workflow texts, returns facts;
// the detector and the runner act on them.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Environment".

import { parse } from "yaml";

/** A database container started next to every test run, taken from the repository's CI. */
export type Service = {
  name: "postgres";
  /** The service's key in the workflow (`postgres`, `db`); the test container reaches it by this host name. */
  alias: string;
  image: string;
  /** The service container's environment, as CI sets it (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB). */
  env: Record<string, string>;
  /** DATABASE_URL as CI gives it, or built from `env` when CI sets none; host localhost, as CI sees it. */
  databaseUrl: string;
  /** DATABASE_URL inside the test container: `databaseUrl` with the host replaced by `alias`. */
  containerDatabaseUrl: string;
  /** The steps between install and test that create the schema, as written, run from the repo root; null when none. */
  schemaCommand: string | null;
};

export type WorkflowFile = { path: string; text: string };

type Step = { run?: unknown; uses?: unknown; with?: unknown; env?: unknown; "working-directory"?: unknown };
type Job = { services?: unknown; env?: unknown; steps?: unknown; defaults?: { run?: { "working-directory"?: unknown } } };

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null);

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(v)) return out;
  for (const [k, value] of Object.entries(v)) {
    const s = str(value);
    if (s != null) out[k] = s;
  }
  return out;
}

/** `./server/` → `server`; `.` → "". */
const normDir = (dir: string) => dir.trim().replace(/^\.\/?/, "").replace(/\/+$/, "");

/**
 * A line that runs a test suite: `npm test`, `pnpm --dir server test`, `yarn run test:unit`,
 * `npx vitest run`, `jest`, `pytest`, `python -m pytest`, `node --test`.
 */
const TEST_LINE = /(^|[\s;&|(])((npm|pnpm|yarn|bun)(\s+(--dir|-C|--prefix|--filter|--cwd|--workspace|-w)[\s=]\S+)*\s+(run\s+)?test(:[\w:-]+)?(?=\s|$|;|&|\|)|(npx\s+)?(vitest|jest)(?=\s|$)|(python3?\s+-m\s+)?pytest(?=\s|$)|node\s+.*--test(?=\s|$))/;

/** A line that creates or migrates the schema. */
const SCHEMA_LINE = /db:push|\bmigrate\b|prisma\s+migrate\s+deploy|prisma\s+db\s+push|drizzle-kit\s+push|knex\s+migrate/;

/** The directory a test line targets: `--dir server`, `-C server`, `--prefix server`, `cd server &&`; null when it names none. */
function lineTarget(line: string): string | null {
  const m = line.match(/(?:--dir|-C|--prefix|--cwd|--workspace)[\s=](\S+)/) ?? line.match(/\bcd\s+(\S+?)\s*(?:&&|;|$)/);
  return m ? normDir(m[1]) : null;
}

type TestStep = { index: number; line: string; dir: string };

/** Each step of the job that runs tests, with the directory it runs them in. */
function testSteps(job: Job): TestStep[] {
  const steps = Array.isArray(job.steps) ? (job.steps as Step[]) : [];
  const jobDir = normDir(str(job.defaults?.run?.["working-directory"]) ?? "");
  const found: TestStep[] = [];
  steps.forEach((step, index) => {
    const run = str(step?.run);
    if (!run) return;
    const line = run.split("\n").find((l) => TEST_LINE.test(l));
    if (!line) return;
    const wd = normDir(str(step["working-directory"]) ?? jobDir);
    const target = lineTarget(line);
    found.push({ index, line, dir: target == null ? wd : wd ? `${wd}/${target}` : target });
  });
  return found;
}

/** `${{ env.NAME }}` resolved from `env`; any other expression is left as written. */
function resolveEnv(value: string, env: Record<string, string>): string {
  return value.replace(/\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name: string) => env[name] ?? whole);
}

/** Host port → container port from a service's `ports:` (`5433:5432`, `"5432:5432"`). */
function portMap(ports: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(ports)) return map;
  for (const p of ports) {
    const m = str(p)?.match(/^(?:[\d.]+:)?(\d+):(\d+)(?:\/tcp)?$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

/**
 * `postgres://u:p@localhost:5433/db` → `postgres://u:p@<alias>:<container port>/db`. Only a
 * localhost or 127.0.0.1 host is replaced; any other host (a job that runs in a container already
 * uses the service key) is kept.
 */
export function containerUrl(url: string, alias: string, ports: Map<string, string> = new Map()): string {
  return url.replace(/(\/\/(?:[^@/]*@)?)(localhost|127\.0\.0\.1)(?::(\d+))?(?=[/?#]|$)/, (_m, prefix: string, _host: string, port?: string) =>
    `${prefix}${alias}:${port ? (ports.get(port) ?? port) : "5432"}`);
}

/** The first job that runs the package's tests: when several do, the one aimed at `packageDir`, then one with a Postgres service. */
function pickJob(jobs: Job[], packageDir: string): { job: Job; test: TestStep } | null {
  const candidates = jobs.map((job) => ({ job, tests: testSteps(job) })).filter((c) => c.tests.length > 0);
  if (candidates.length === 0) return null;
  const aimed = candidates.filter((c) => c.tests.some((t) => t.dir === packageDir));
  const pool = aimed.length ? aimed : candidates;
  const withPg = pool.find((c) => postgresEntry(c.job) != null) ?? pool[0];
  const test = withPg.tests.find((t) => t.dir === packageDir) ?? withPg.tests[0];
  return { job: withPg.job, test };
}

function postgresEntry(job: Job): [string, Record<string, unknown>] | null {
  if (!isObject(job.services)) return null;
  for (const [key, value] of Object.entries(job.services)) {
    const image = isObject(value) ? str(value.image) : str(value);
    if (image && /^postgres(:|@|$)/.test(image.trim())) return [key, isObject(value) ? value : { image }];
  }
  return null;
}

/** The schema steps before the test step, as written; a step with its own directory runs in a subshell there. */
function schemaCommand(job: Job, test: TestStep): string | null {
  const steps = Array.isArray(job.steps) ? (job.steps as Step[]) : [];
  const jobDir = normDir(str(job.defaults?.run?.["working-directory"]) ?? "");
  const parts: string[] = [];
  for (let i = 0; i <= test.index; i++) {
    const run = str(steps[i]?.run)?.trim();
    if (!run) continue;
    let command: string;
    if (i < test.index) {
      if (!SCHEMA_LINE.test(run)) continue;
      command = run;
    } else {
      // The test step itself: schema lines written before the test line in the same `run:` block.
      const lines = run.split("\n");
      const before = lines.slice(0, lines.findIndex((l) => l === test.line || l.includes(test.line.trim()))).filter((l) => SCHEMA_LINE.test(l));
      if (!before.length) continue;
      command = before.join("\n");
    }
    const wd = normDir(str(steps[i]["working-directory"]) ?? jobDir);
    parts.push(wd ? `(\n  cd ${wd}\n  ${command.split("\n").join("\n  ")}\n)` : command);
  }
  return parts.length ? parts.join("\n") : null;
}

/** The CI job that runs the package's tests, with the step that runs them; null when there is none. */
export type CiJob = { job: Job; test: TestStep; workflowEnv: Record<string, string> };

/** Finds the job that runs the tests of `packageDir` ("" root); unparseable workflows are skipped. */
export function ciTestJob(files: WorkflowFile[], packageDir: string): CiJob | null {
  const jobs: Array<Job & { workflowEnv: Record<string, string> }> = [];
  for (const file of files) {
    let doc: unknown;
    try {
      doc = parse(file.text);
    } catch {
      continue;
    }
    if (!isObject(doc) || !isObject(doc.jobs)) continue;
    const workflowEnv = stringMap(doc.env);
    for (const job of Object.values(doc.jobs)) if (isObject(job)) jobs.push({ ...(job as Job), workflowEnv });
  }
  const picked = pickJob(jobs, normDir(packageDir));
  if (!picked) return null;
  return { ...picked, workflowEnv: (picked.job as { workflowEnv: Record<string, string> }).workflowEnv };
}

/**
 * The Postgres service of the CI job that runs the package's tests, or [] when that job has none,
 * no job runs tests, or a workflow cannot be parsed. `packageDir` is the package under test ("" root).
 */
export function servicesFromWorkflows(files: WorkflowFile[], packageDir: string): Service[] {
  const ci = ciTestJob(files, packageDir);
  return ci ? servicesFromJob(ci) : [];
}

export function servicesFromJob({ job, test, workflowEnv }: CiJob): Service[] {
  const entry = postgresEntry(job);
  if (!entry) return [];
  const [alias, svc] = entry;
  const image = str(svc.image)!.trim();
  if (image.includes("${{")) return [];

  const jobEnv = { ...workflowEnv, ...stringMap(job.env) };
  const env = Object.fromEntries(Object.entries(stringMap(svc.env)).map(([k, v]) => [k, resolveEnv(v, jobEnv)]));
  const steps = Array.isArray(job.steps) ? (job.steps as Step[]) : [];
  const stepEnv = stringMap(steps[test.index]?.env);
  const ciUrl = stepEnv.DATABASE_URL ?? jobEnv.DATABASE_URL;
  const resolved = ciUrl == null ? null : resolveEnv(ciUrl, jobEnv);
  const user = env.POSTGRES_USER ?? "postgres";
  const databaseUrl = resolved && !resolved.includes("${{")
    ? resolved
    : `postgresql://${user}:${env.POSTGRES_PASSWORD ?? ""}@localhost:5432/${env.POSTGRES_DB ?? user}`;
  return [{
    name: "postgres",
    alias,
    image,
    env,
    databaseUrl,
    containerDatabaseUrl: containerUrl(databaseUrl, alias, portMap(svc.ports)),
    schemaCommand: schemaCommand(job, test),
  }];
}

/** Comment lines that say how a run's database was set up; for eval_script and the Dockerfile provenance. */
export function serviceProvenance(services: Service[]): string[] {
  return services.flatMap((s) => [
    `# service ${s.alias}: docker run ${Object.entries(s.env).map(([k, v]) => `-e ${k}=${v} `).join("")}${s.image}, on the run's own network as host ${s.alias}`,
    `# DATABASE_URL=${s.containerDatabaseUrl}`,
    ...(s.schemaCommand ? [`# schema: ${s.schemaCommand.split("\n").join("\n#   ")}`] : []),
  ]);
}

/**
 * One dependency install CI runs before the tests: `cwd`, where the command runs ("" root); `dir`,
 * the package it installs (differs from `cwd` for `npm ci --prefix server`); the command as written.
 */
export type InstallStep = { dir: string; cwd: string; command: string };

const INSTALL_VERB = /^(npm\s+(ci|install|i)|pnpm\s+(install|i)|yarn\s+install|yarn)(?=\s|$)/;
const DIR_FLAGS = new Set(["--prefix", "--dir", "-C", "--cwd"]);
const VALUE_FLAGS = new Set(["--filter", "--registry", "--network-timeout", "--loglevel"]);

/**
 * `pnpm install --frozen-lockfile` → its directory relative to the step's ("" when it names none);
 * null when the segment is not a project install: another command, a global install (`npm i -g
 * pnpm`), or one that names packages (`npm install left-pad`).
 */
function installTarget(segment: string): string | null {
  const verb = segment.match(INSTALL_VERB);
  if (!verb) return null;
  const tokens = segment.slice(verb[0].length).trim().split(/\s+/).filter(Boolean);
  let dir = "";
  for (let i = 0; i < tokens.length; i++) {
    const [flag, inline] = tokens[i].split("=", 2);
    if (flag === "-g" || flag === "--global") return null;
    if (DIR_FLAGS.has(flag)) { dir = normDir(inline ?? tokens[++i] ?? ""); continue; }
    if (VALUE_FLAGS.has(flag)) { if (inline == null) i++; continue; }
    if (!flag.startsWith("-")) return null;
  }
  return dir;
}

/**
 * Every dependency install the job runs before its test step, in order, with its directory: the
 * step's `working-directory` (or the job's `defaults.run.working-directory`), plus a `cd dir &&`
 * before it on the same line and a `--prefix`/`--dir`/`-C` flag. [] when the job has none.
 */
export function installStepsFromJob({ job, test }: CiJob): InstallStep[] {
  const steps = Array.isArray(job.steps) ? (job.steps as Step[]) : [];
  const jobDir = normDir(str(job.defaults?.run?.["working-directory"]) ?? "");
  const found: InstallStep[] = [];
  for (let i = 0; i < test.index; i++) {
    const run = str(steps[i]?.run);
    if (!run) continue;
    const stepDir = normDir(str(steps[i]["working-directory"]) ?? jobDir);
    for (const line of run.split("\n")) {
      let dir = stepDir;
      for (const raw of line.split(/\s*&&\s*/)) {
        const segment = raw.trim();
        const cd = segment.match(/^cd\s+(\S+)$/);
        if (cd) { dir = joinDir(dir, normDir(cd[1])); continue; }
        const target = installTarget(segment);
        if (target != null) found.push({ dir: joinDir(dir, target), cwd: dir, command: segment });
      }
    }
  }
  return found;
}

const joinDir = (a: string, b: string) => (a && b ? `${a}/${b}` : a || b);

/**
 * The Node major `actions/setup-node` sets up in the job (`24`, `"24.x"`, `"v22.11.0"`); null for
 * none, or for a value that is not a version (`${{ matrix.node }}`, `lts/*`, `node-version-file`).
 */
export function nodeMajorFromJob({ job, test }: CiJob): number | null {
  const steps = Array.isArray(job.steps) ? (job.steps as Step[]) : [];
  for (let i = 0; i < test.index; i++) {
    const uses = str(steps[i]?.uses);
    if (!uses || !/^actions\/setup-node(@|$)/.test(uses) || !isObject(steps[i].with)) continue;
    const version = str((steps[i].with as Record<string, unknown>)["node-version"])?.trim();
    const m = version?.match(/^v?(\d+)(?:\.(?:\d+|x))*$/);
    if (m) return Number(m[1]);
  }
  return null;
}
