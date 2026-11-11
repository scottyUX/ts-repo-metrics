import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { censusMarkdown } from "@/lib/cse115a/benchmark/validation/census";
import { CONTAINER_ENV, detectEnvironment, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { harborSkipReason } from "@/lib/cse115a/benchmark/validation/harbor";
import {
  containerScript, DATABASE_READY_POLLS, DockerSuiteRunner, ExecError, SCHEMA_FAILED_EXIT, SCHEMA_LOG, schemaGuard, type ExecFn, type RunPlan,
} from "@/lib/cse115a/benchmark/validation/runner";
import { containerUrl, servicesFromWorkflows, type Service } from "@/lib/cse115a/benchmark/validation/services";
import { validateTask, type TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

/** JoKHerre/Bookworm's CI job `test`, as the brief describes it. */
const BOOKWORM_CI = `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm lint
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: bookworm
          POSTGRES_PASSWORD: bookworm
          POSTGRES_DB: bookworm_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://bookworm:bookworm@localhost:5432/bookworm_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm --dir server db:push
      - run: pnpm --dir server test
`;

const BOOKWORM_SERVICE: Service = {
  name: "postgres",
  alias: "postgres",
  image: "postgres:16",
  env: { POSTGRES_USER: "bookworm", POSTGRES_PASSWORD: "bookworm", POSTGRES_DB: "bookworm_test" },
  databaseUrl: "postgres://bookworm:bookworm@localhost:5432/bookworm_test",
  containerDatabaseUrl: "postgres://bookworm:bookworm@postgres:5432/bookworm_test",
  schemaCommand: "pnpm --dir server db:push",
};

const wf = (text: string) => [{ path: ".github/workflows/ci.yml", text }];

describe("servicesFromWorkflows", () => {
  it("reads Bookworm's test job: the postgres service, its DATABASE_URL, and the db:push step", () => {
    expect(servicesFromWorkflows(wf(BOOKWORM_CI), "server")).toEqual([BOOKWORM_SERVICE]);
  });

  it("finds nothing in a workflow with no services", () => {
    const ci = "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm test\n";
    expect(servicesFromWorkflows(wf(ci), "")).toEqual([]);
  });

  it("ignores a mysql service", () => {
    const ci = BOOKWORM_CI.replace("image: postgres:16", "image: mysql:8");
    expect(servicesFromWorkflows(wf(ci), "server")).toEqual([]);
  });

  it("takes DATABASE_URL from the test step's env over the job's, and maps a host port to the container port", () => {
    const ci = BOOKWORM_CI
      .replace("          - 5432:5432", "          - 5433:5432")
      .replace("    env:\n      DATABASE_URL: postgres://bookworm:bookworm@localhost:5432/bookworm_test\n", "")
      .replace("      - run: pnpm --dir server test\n", "      - run: pnpm --dir server test\n        env:\n          DATABASE_URL: postgresql://bookworm:bookworm@127.0.0.1:5433/bookworm_test?sslmode=disable\n");
    const [service] = servicesFromWorkflows(wf(ci), "server");
    expect(service.databaseUrl).toBe("postgresql://bookworm:bookworm@127.0.0.1:5433/bookworm_test?sslmode=disable");
    expect(service.containerDatabaseUrl).toBe("postgresql://bookworm:bookworm@postgres:5432/bookworm_test?sslmode=disable");
  });

  it("uses the job that runs the tests when only one of two does, even if the other has a postgres service", () => {
    const ci = `on: push
jobs:
  seed:
    runs-on: ubuntu-latest
    services:
      db:
        image: postgres:15
        env: { POSTGRES_PASSWORD: other }
    steps:
      - run: npm run seed
  unit:
    runs-on: ubuntu-latest
    services:
      pg:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: secret
    defaults:
      run:
        working-directory: api
    steps:
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm test
`;
    const [service] = servicesFromWorkflows(wf(ci), "api");
    expect(service.image).toBe("postgres:16-alpine");
    expect(service.alias).toBe("pg");
    expect(service.env).toEqual({ POSTGRES_PASSWORD: "secret" });
    // No DATABASE_URL in CI: built from the service's env, with the image's defaults for user and database.
    expect(service.databaseUrl).toBe("postgresql://postgres:secret@localhost:5432/postgres");
    expect(service.containerDatabaseUrl).toBe("postgresql://postgres:secret@pg:5432/postgres");
    expect(service.schemaCommand).toBe("(\n  cd api\n  npx prisma migrate deploy\n)");
  });

  it("returns [] when the job that runs the tests has no postgres service, and for unparseable YAML", () => {
    const ci = "on: push\njobs:\n  test:\n    steps:\n      - run: npm test\n  other:\n    services:\n      postgres:\n        image: postgres:16\n    steps:\n      - run: echo hi\n";
    expect(servicesFromWorkflows(wf(ci), "")).toEqual([]);
    expect(servicesFromWorkflows(wf("jobs: [unclosed"), "")).toEqual([]);
  });

  it("rewrites only a localhost host", () => {
    expect(containerUrl("postgres://u:p@localhost/db", "postgres")).toBe("postgres://u:p@postgres:5432/db");
    expect(containerUrl("postgres://u:p@postgres:5432/db", "postgres")).toBe("postgres://u:p@postgres:5432/db");
  });
});

const repo = (files: Record<string, string>) => async (path: string) => files[path] ?? null;
const BOOKWORM_FILES = {
  "package.json": JSON.stringify({ private: true }),
  "pnpm-workspace.yaml": "packages:\n  - server\n",
  "pnpm-lock.yaml": "",
  "server/package.json": JSON.stringify({ scripts: { test: "vitest run", "db:push": "drizzle-kit push" }, devDependencies: { vitest: "3" } }),
  ".github/workflows/ci.yml": BOOKWORM_CI,
};

describe("detectEnvironment with a CI postgres service", () => {
  it("attaches the service and replaces the placeholder DATABASE_URL", async () => {
    const env = (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(BOOKWORM_FILES), workflowFiles: [".github/workflows/ci.yml"] })) as Environment;
    expect(env.services).toEqual([BOOKWORM_SERVICE]);
    expect(env.env).toEqual({ CI: "true", DATABASE_URL: "postgres://bookworm:bookworm@postgres:5432/bookworm_test" });
    expect(env.dockerfile).toContain("ENV DATABASE_URL=postgres://bookworm:bookworm@postgres:5432/bookworm_test");
    expect(env.dockerfile).not.toContain(CONTAINER_ENV.DATABASE_URL);
    expect(env.dockerfile).toContain("# service postgres: docker run -e POSTGRES_USER=bookworm -e POSTGRES_PASSWORD=bookworm -e POSTGRES_DB=bookworm_test postgres:16");
  });

  it("leaves a repository without one exactly as before, with services: []", async () => {
    const files = { ...BOOKWORM_FILES, ".github/workflows/ci.yml": BOOKWORM_CI.replace("image: postgres:16", "image: mysql:8") };
    const withCi = (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(files), workflowFiles: [".github/workflows/ci.yml"] })) as Environment;
    const without = (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(files) })) as Environment;
    expect(withCi.services).toEqual([]);
    expect(withCi).toEqual(without);
    expect(withCi.env).toEqual(CONTAINER_ENV);
  });

  it("is listed as supported in the census and skipped by the Harbor export", async () => {
    const env = (await detectEnvironment({ testFiles: ["server/test/books.test.ts"], read: repo(BOOKWORM_FILES), workflowFiles: [".github/workflows/ci.yml"] })) as Environment;
    expect(harborSkipReason(env)).toBe("Harbor export for rows with a database service is not built yet");
    expect(harborSkipReason({ ...env, services: [] })).toBeNull();
    const md = censusMarkdown([{ instance_id: "b-1", repo: "JoKHerre/Bookworm", env, signals: { database: ["ci-service"], browser: [], otherRunners: [] }, note: "" }]);
    expect(md).toContain("| ci-service |  |  | supported; postgres service (from CI) |");
  });
});

const plan: RunPlan = {
  repoDir: "/tmp/repo",
  baseCommit: "abc123",
  patch: "diff --git a/server/src/a.ts b/server/src/a.ts\n",
  testPatch: "diff --git a/server/test/a.test.ts b/server/test/a.test.ts\n",
  installDir: "",
  installCommand: "corepack enable && pnpm install --frozen-lockfile",
  packageDir: "server",
  testSteps: ["npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests"],
  env: { CI: "true", DATABASE_URL: BOOKWORM_SERVICE.containerDatabaseUrl },
  image: "node:22-bookworm",
  services: [BOOKWORM_SERVICE],
};

describe("containerScript with a service", () => {
  it("records the service, then runs install → schema (guarded, from the root) → test steps", () => {
    const script = containerScript(plan, "r1");
    expect(script.startsWith("# service postgres: docker run -e POSTGRES_USER=bookworm -e POSTGRES_PASSWORD=bookworm -e POSTGRES_DB=bookworm_test postgres:16, on the run's own network as host postgres\n# DATABASE_URL=postgres://bookworm:bookworm@postgres:5432/bookworm_test\n# schema: pnpm --dir server db:push\nset -e\n")).toBe(true);
    expect(script).toContain(`cat /patches/install.log\ncd /work\nif ! bash -eo pipefail -c 'pnpm --dir server db:push' > ${SCHEMA_LOG} 2>&1; then\n`);
    expect(script.indexOf("pnpm install")).toBeLessThan(script.indexOf("db:push' >"));
    expect(script.indexOf("db:push' >")).toBeLessThan(script.indexOf("cd /work/server"));
    expect(script).toContain("npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests || true");
  });

  it("is unchanged for a plan without services", () => {
    const { services: _s, ...plain } = plan;
    void _s;
    expect(containerScript({ ...plain, services: [] }, "r2")).toBe(containerScript(plain, "r2"));
    expect(containerScript(plain, "r2").startsWith("set -e\n")).toBe(true);
  });
});

const run = promisify(execFile);

describe("schemaGuard (real bash)", () => {
  it("stops at the first failing line of a multi-line schema command with SCHEMA_FAILED_EXIT", async () => {
    const script = ["set -e", schemaGuard("echo migrating\nsh -c 'echo \"error: relation \\\"books\\\" already exists\"; exit 1'\necho not-reached").split(SCHEMA_LOG).join("/dev/null"), "echo after"].join("\n");
    const error = await run("bash", ["-c", script]).then(() => null, (e: { code: number; stdout: string }) => e);
    expect(error?.code).toBe(SCHEMA_FAILED_EXIT);
    expect(error?.stdout).not.toContain("after");
  });

  it("quotes a command with single quotes in it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hecate-schema-"));
    try {
      const { stdout } = await run("bash", ["-c", ["set -e", schemaGuard("echo \"it's ok\" && echo 'and '\\''this'\\'' too'").split(SCHEMA_LOG).join(join(dir, "schema.log"))].join("\n")]);
      expect(stdout).toBe("it's ok\nand 'this' too\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

type Behaviour = {
  /** pg_isready fails this many times before it answers. */
  pgFailures?: number;
  /** What the test container's `docker run` does; default: succeeds. */
  test?: (patchesDir: string, tryNumber: number) => Promise<string>;
};

/** A fake `exec` that records every docker command and plays the given behaviour. */
function fakeDocker(behaviour: Behaviour = {}) {
  const calls: string[][] = [];
  let pgFailures = behaviour.pgFailures ?? 0;
  let tries = 0;
  const exec: ExecFn = async (command, args) => {
    expect(command).toBe("docker");
    calls.push(args);
    if (args[0] === "exec") {
      if (pgFailures-- > 0) throw new ExecError("docker exec exited 2:\n/var/run/postgresql:5432 - no response", false, 2);
      return "accepting connections";
    }
    if (args[0] === "logs") return "database system is ready to accept connections";
    if (args[0] === "run" && args[1] === "--rm") {
      tries++;
      const patches = args[args.indexOf(`${plan.repoDir}:/work`) + 2].split(":")[0];
      return behaviour.test ? behaviour.test(patches, tries) : "ok";
    }
    return "";
  };
  return { exec, calls };
}

const runner = (exec: ExecFn) => new DockerSuiteRunner(undefined, undefined, { exec, sleep: async () => {}, runId: () => "x1" });
const short = (calls: string[][]) => calls.map((a) => (a[0] === "run" && a[1] === "--rm" ? "run --rm (test)" : a.slice(0, 2).join(" ")));

describe("DockerSuiteRunner with a postgres service (fake exec)", () => {
  it("creates the network, starts the database, waits for it, runs the tests on the network, then tears down", async () => {
    const docker = fakeDocker({ pgFailures: 2 });
    await runner(docker.exec).runSuite(plan, "r0", 1);
    expect(short(docker.calls)).toEqual(["network create", "run -d", "exec hecate-pg-r0a-x1", "exec hecate-pg-r0a-x1", "exec hecate-pg-r0a-x1", "run --rm (test)", "rm -f", "network rm"]);
    expect(docker.calls[0]).toEqual(["network", "create", "hecate-r0a-x1"]);
    expect(docker.calls[1]).toEqual([
      "run", "-d", "--name", "hecate-pg-r0a-x1", "--network", "hecate-r0a-x1", "--network-alias", "postgres",
      "-e", "POSTGRES_USER=bookworm", "-e", "POSTGRES_PASSWORD=bookworm", "-e", "POSTGRES_DB=bookworm_test", "postgres:16",
    ]);
    expect(docker.calls[2]).toEqual(["exec", "hecate-pg-r0a-x1", "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "bookworm", "-d", "bookworm_test"]);
    const test = docker.calls[5];
    expect(test.slice(0, 6)).toEqual(["run", "--rm", "--name", "hecate-run-r0a-x1", "--network", "hecate-r0a-x1"]);
    expect(test).toContain("DATABASE_URL=postgres://bookworm:bookworm@postgres:5432/bookworm_test");
    expect(test.filter((a) => a.startsWith("DATABASE_URL="))).toHaveLength(1);
    expect(docker.calls[6]).toEqual(["rm", "-f", "hecate-run-r0a-x1", "hecate-pg-r0a-x1"]);
    expect(docker.calls[7]).toEqual(["network", "rm", "hecate-r0a-x1"]);
  });

  it("tears down when the test steps fail (the run itself still succeeds)", async () => {
    const docker = fakeDocker({ test: async () => "FAIL server/test/a.test.ts\n" });
    await expect(runner(docker.exec).runSuite(plan, "r1", 1)).resolves.toEqual({});
    expect(short(docker.calls).slice(-2)).toEqual(["rm -f", "network rm"]);
  });

  it("turns a schema failure into a SchemaError with the error line, tearing down after each try", async () => {
    const docker = fakeDocker({
      test: async (patches) => {
        await writeFile(join(patches, "schema.log"), "> drizzle-kit push\nerror: password authentication failed for user \"bookworm\"\n");
        throw new ExecError(`docker run exited ${SCHEMA_FAILED_EXIT}:\n[hecate] schema step failed`, false, SCHEMA_FAILED_EXIT);
      },
    });
    const error = await runner(docker.exec).runSuite(plan, "r2", 3).catch((e: Error) => e);
    expect(error?.constructor.name).toBe("SchemaError");
    expect(error?.message).toBe("schema step failed in r2c: error: password authentication failed for user \"bookworm\"");
    // One retry, each a fresh database and network, each torn down; the database log is read on failure.
    expect(short(docker.calls)).toEqual([
      "network create", "run -d", "exec hecate-pg-r2c-x1", "run --rm (test)", "logs hecate-pg-r2c-x1", "rm -f", "network rm",
      "network create", "run -d", "exec hecate-pg-r2c-x1", "run --rm (test)", "logs hecate-pg-r2c-x1", "rm -f", "network rm",
    ]);
  });

  it("tears down on a timeout without retrying, and kills the test container by name", async () => {
    const docker = fakeDocker({ test: async () => { throw new ExecError("docker timed out after 900000 ms", true); } });
    const error = await runner(docker.exec).runSuite(plan, "r1", 2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExecError);
    expect((error as ExecError).timedOut).toBe(true);
    expect((error as ExecError).message).toContain("--- database log ---\ndatabase system is ready to accept connections");
    expect(short(docker.calls)).toEqual(["network create", "run -d", "exec hecate-pg-r1b-x1", "run --rm (test)", "logs hecate-pg-r1b-x1", "rm -f", "network rm"]);
    expect(docker.calls.at(-2)).toEqual(["rm", "-f", "hecate-run-r1b-x1", "hecate-pg-r1b-x1"]);
  });

  it("fails as DatabaseStartError when pg_isready never answers, and still tears down", async () => {
    const docker = fakeDocker({ pgFailures: Infinity });
    const error = await runner(docker.exec).runSuite(plan, "r0", 1).catch((e: Error) => e);
    expect(error?.constructor.name).toBe("DatabaseStartError");
    expect(error?.message).toBe("database did not start in r0a");
    expect(docker.calls.filter((a) => a[0] === "exec")).toHaveLength(2 * DATABASE_READY_POLLS);
    expect(docker.calls.some((a) => a[1] === "--rm")).toBe(false);
    expect(docker.calls.filter((a) => a[0] === "rm")).toHaveLength(2);
    expect(docker.calls.filter((a) => a[0] === "network" && a[1] === "rm")).toHaveLength(2);
  });

  it("runs a row without services with the docker command it had before plus --name, then removes the container by name", async () => {
    const docker = fakeDocker();
    const { services: _s, ...plain } = plan;
    void _s;
    await runner(docker.exec).runSuite({ ...plain, env: { CI: "true", DATABASE_URL: CONTAINER_ENV.DATABASE_URL } }, "r0", 1);
    expect(docker.calls).toHaveLength(2);
    const patches = docker.calls[0][docker.calls[0].indexOf("/tmp/repo:/work") + 2];
    expect(docker.calls[0]).toEqual([
      "run", "--rm", "--name", "hecate-run-r0a-x1",
      "-e", "CI=true", "-e", `DATABASE_URL=${CONTAINER_ENV.DATABASE_URL}`,
      "-v", "/tmp/repo:/work",
      "-v", patches,
      "-w", "/work",
      "node:22-bookworm", "bash", "/patches/run.sh",
    ]);
    expect(patches).toMatch(/hecate-validate-.*:\/patches$/);
    expect(docker.calls[1]).toEqual(["rm", "-f", "hecate-run-r0a-x1"]);
  });

  it("removes the test container of a timed-out run without services, and does not retry", async () => {
    const docker = fakeDocker({ test: async () => { throw new ExecError("docker timed out after 900000 ms", true); } });
    const { services: _s, ...plain } = plan;
    void _s;
    const error = await runner(docker.exec).runSuite(plain, "r1", 2).catch((e: unknown) => e);
    expect((error as ExecError).timedOut).toBe(true);
    expect(short(docker.calls)).toEqual(["run --rm (test)", "rm -f"]);
    expect(docker.calls[0].slice(0, 4)).toEqual(["run", "--rm", "--name", "hecate-run-r1b-x1"]);
    expect(docker.calls[1]).toEqual(["rm", "-f", "hecate-run-r1b-x1"]);
  });
});

describe("validateTask with a database service", () => {
  const row: TaskRow = { instance_id: "JoKHerre__Bookworm-1", repo: "JoKHerre/Bookworm", base_commit: "abc123", patch: plan.patch, test_patch: plan.testPatch, FAIL_TO_PASS: [], PASS_TO_PASS: [] };
  const env = { supported: true, runners: ["vitest"], packageManager: "pnpm", packageDir: "server", installDir: "", installCommand: plan.installCommand, testSteps: [{ kind: "vitest", command: plan.testSteps[0] }], env: plan.env!, dockerfile: "", image: "node:22-bookworm", services: [BOOKWORM_SERVICE] } as Environment;

  it("records the service on the result and in eval_script", async () => {
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner: runner(fakeDocker().exec) });
    expect(result.services).toEqual([{ name: "postgres", image: "postgres:16", env: BOOKWORM_SERVICE.env, database_url: BOOKWORM_SERVICE.containerDatabaseUrl, schema_command: "pnpm --dir server db:push" }]);
    expect(result.eval_script).toContain("# service postgres: docker run -e POSTGRES_USER=bookworm");
    expect(result.eval_script).toContain("bash -eo pipefail -c 'pnpm --dir server db:push'");
  });

  it("is env_error with the error line when the schema step fails", async () => {
    const docker = fakeDocker({
      test: async (patches) => {
        await writeFile(join(patches, "schema.log"), "Error: connect ECONNREFUSED postgres:5432\n");
        throw new ExecError("exited 98", false, SCHEMA_FAILED_EXIT);
      },
    });
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner: runner(docker.exec) });
    expect(result.reason).toBe("env_error");
    expect(result.validation_status).toBe("rejected");
    expect(result.detail).toBe("schema step failed in r0a: Error: connect ECONNREFUSED postgres:5432");
    expect(result.services).toHaveLength(1);
  });

  it("is env_error when the database never becomes ready", async () => {
    const result = await validateTask({ row, repoDir: "/tmp/repo", env, modified: new Set(), runner: runner(fakeDocker({ pgFailures: Infinity }).exec) });
    expect(result.reason).toBe("env_error");
    expect(result.detail).toBe("database did not start in r0a");
  });
});
