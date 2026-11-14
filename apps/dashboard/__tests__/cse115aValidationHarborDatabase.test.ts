// #383: Harbor tasks for rows whose tests run against Postgres. The CI service becomes a sidecar in
// environment/docker-compose.yaml (Harbor 0.25 merges it into each trial's Compose project), the
// CI schema step runs in tests/test.sh, and rows without services come out byte-identical.
// The fixtures in fixtures/harborDatabase/ are the built files; HECATE_RECORD_HARBOR_DATABASE=1 rewrites them.

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goldOnly } from "@/lib/cse115a/benchmark/validation/batchRun";
import type { Environment } from "@/lib/cse115a/benchmark/validation/environment";
import {
  buildHarborTask, harborEnvFrom, harborSkipReason, MULTI_SUITE_REASON, NO_SERVICE_DETAIL_REASON, serviceSkipReason, sidecarCompose, withServiceDetail,
  type HarborEnv, type HarborRow, type HarborService,
} from "@/lib/cse115a/benchmark/validation/harbor";
import type { HarborRunner } from "@/lib/cse115a/benchmark/validation/harborGold";
import type { ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const SHA = "4122f9a921e8471c7d4fd06551e1dadf79694787";
const SCHEMA = "(\n  cd server\n  pnpm db:push\n)";

/** The Bookworm shape: node --test in server/, two pnpm installs, a CI postgres:16 service named `postgres`. */
const service: HarborService = {
  name: "postgres", image: "postgres:16", alias: "postgres",
  env: { POSTGRES_USER: "bookworm", POSTGRES_PASSWORD: "bookworm", POSTGRES_DB: "bookworm_test" },
  schema_command: SCHEMA,
};
const recipe: HarborEnv = {
  image: "node:24-bookworm@sha256:8fa96264f302f58bbb13aa7339c541547b56975766ce956c875da149452a3e40",
  runners: ["node-test"], package_dir: "server",
  install_steps: [{ cwd: "", command: "corepack enable && pnpm install --frozen-lockfile" }, { cwd: "server", command: "corepack enable && pnpm install --frozen-lockfile" }],
  test_steps: [{ kind: "node-test", command: "REPORT=$REPORT_DIR/node-0.json node --test --test-reporter=/patches/reporter.mjs \"backend_tests/*.test.ts\"" }],
  env: { CI: "true", DATABASE_URL: "postgres://bookworm:bookworm@postgres:5432/bookworm_test" },
  services: [service], node_source: "CI",
};
const row: HarborRow = {
  instance_id: "JoKHerre__Bookworm-COL-02-T-1", repo: "JoKHerre/Bookworm", base_commit: SHA,
  patch: "diff --git a/server/src/books.ts b/server/src/books.ts\n", test_patch: "diff --git a/server/backend_tests/books.test.ts b/server/backend_tests/books.test.ts\n",
  FAIL_TO_PASS: ["backend_tests/books.test.ts::lists books"], PASS_TO_PASS: ["backend_tests/health.test.ts::ok"],
  problem_statement: "# COL-02-T-1\n\nList the books.", hints_text: "",
};
const bundle = { kind: "bundle", file: "repo.bundle" } as const;
const FIXTURES = join(__dirname, "fixtures", "harborDatabase");

/** Compares a built file with its fixture (or records it). */
function matchesFixture(name: string, text: string) {
  const file = join(FIXTURES, name);
  if (process.env.HECATE_RECORD_HARBOR_DATABASE === "1") {
    writeFileSync(file, text);
  }
  expect(text).toBe(readFileSync(file, "utf8"));
}

describe("1. a row with a Postgres service", () => {
  const files = buildHarborTask({ row, env: recipe, source: bundle, flakyCount: 0 });

  it("is exportable, and builds the Dockerfile, the sidecar, the test script and the instruction as recorded", () => {
    expect(harborSkipReason(recipe, row, bundle)).toBeNull();
    matchesFixture("Dockerfile", files.get("environment/Dockerfile")!);
    matchesFixture("docker-compose.yaml", files.get("environment/docker-compose.yaml")!);
    matchesFixture("test.sh", files.get("tests/test.sh")!);
    matchesFixture("instruction.md", files.get("instruction.md")!);
  });

  it("the sidecar is the CI service: image, variables, host name, healthy before main starts, no volume", () => {
    const compose = files.get("environment/docker-compose.yaml")!;
    expect(compose).toContain('  postgres:\n    image: "postgres:16"\n');
    expect(compose).toContain('      POSTGRES_DB: "bookworm_test"\n');
    expect(compose).toContain("  main:\n    depends_on:\n      postgres:\n        condition: service_healthy\n");
    expect(compose).toContain('test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "bookworm", "-d", "bookworm_test"]');
    // A fresh database per trial: no named volume, no bind mount.
    expect(compose).not.toMatch(/volumes:/);
    // DATABASE_URL in the agent's container is the CI value with the alias as host, as the validator set it.
    expect(files.get("environment/Dockerfile")).toContain("ENV DATABASE_URL=postgres://bookworm:bookworm@postgres:5432/bookworm_test");
  });

  it("test.sh runs the schema step from the repository root after the installs and before the tests", () => {
    const script = files.get("tests/test.sh")!;
    const schema = script.indexOf(`\ncd /app\nbash -eo pipefail -c '${SCHEMA}' || echo 'schema step failed' >&2\n`);
    expect(schema).toBeGreaterThan(-1);
    expect(schema).toBeGreaterThan(script.indexOf("cd /app/server && (corepack enable"));
    expect(schema).toBeLessThan(script.indexOf("node --test"));
  });

  it("Compose interpolation cannot change a variable: `$` is doubled", () => {
    const compose = sidecarCompose({ ...service, env: { POSTGRES_PASSWORD: "pa$word" } });
    expect(compose).toContain('POSTGRES_PASSWORD: "pa$$word"');
  });

  it("harborEnvFrom keeps the settings the sidecar needs, from the detected Service", () => {
    const env = {
      supported: true, image: "node:24-bookworm", runners: ["node-test"], packageDir: "server", installDir: "", installCommand: "pnpm install",
      testSteps: [], env: { CI: "true" }, dockerfile: "", nodeSource: "CI",
      services: [{ name: "postgres", alias: "db", image: "postgres:16", env: { POSTGRES_USER: "u" }, databaseUrl: "postgres://u@localhost:5432/u", containerDatabaseUrl: "postgres://u@db:5432/u", schemaCommand: "npm run migrate" }],
    } as unknown as Environment;
    expect(harborEnvFrom(env).services).toEqual([{ name: "postgres", image: "postgres:16", alias: "db", env: { POSTGRES_USER: "u" }, schema_command: "npm run migrate" }]);
  });
});

describe("2. services the sidecar cannot run stay skipped, with the reason", () => {
  it("an image that is not Postgres, more than one service, the alias `main`", () => {
    expect(serviceSkipReason([{ ...service, image: "mysql:8" }])).toBe('database service image "mysql:8" is not a postgres image; Harbor export supports Postgres (postgres or postgis/postgis) only');
    expect(serviceSkipReason([{ ...service, image: "bitnami/postgresql:16" }])).toMatch(/is not a postgres image/);
    expect(serviceSkipReason([service, { ...service, alias: "db2" }])).toBe("Harbor export supports one database service; this row has 2");
    expect(serviceSkipReason([{ ...service, alias: "main" }])).toMatch(/Harbor's own container name/);
    expect(harborSkipReason({ ...recipe, services: [{ ...service, image: "mysql:8" }] })).toMatch(/not a postgres image/);
    expect(() => buildHarborTask({ row, env: { ...recipe, services: [{ ...service, image: "mysql:8" }] }, source: bundle })).toThrow(/not a postgres image/);
    // Postgres by tag or by digest is supported.
    expect(serviceSkipReason([{ ...service, image: `postgres@sha256:${"a".repeat(64)}` }])).toBeNull();
    expect(serviceSkipReason([{ ...service, image: "postgres:16-alpine" }])).toBeNull();
  });

  it("a recipe stored before it kept the settings: skipped until withServiceDetail fills them from the result", () => {
    const legacy: HarborEnv = { ...recipe, services: [{ name: "postgres", image: "postgres:16" }] };
    expect(harborSkipReason(legacy)).toBe(NO_SERVICE_DETAIL_REASON);
    const recorded = [{ name: "postgres", image: "postgres:16", env: service.env!, database_url: recipe.env.DATABASE_URL, schema_command: SCHEMA }];
    const filled = withServiceDetail(legacy, recorded);
    expect(filled.services).toEqual([service]);
    expect(harborSkipReason(filled)).toBeNull();
    // Nothing to fill: the same object back.
    expect(withServiceDetail(recipe, recorded)).toBe(recipe);
    const plain: HarborEnv = { ...recipe, services: [] };
    expect(withServiceDetail(plain, recorded)).toBe(plain);
    // A record of a different image is not used.
    expect(withServiceDetail(legacy, [{ ...recorded[0], image: "postgres:15" }]).services).toEqual(legacy.services);
  });
});

describe("3. no schema command", () => {
  it("no schema step in test.sh and no schema block in the instruction", () => {
    const env: HarborEnv = { ...recipe, services: [{ ...service, schema_command: null }] };
    const files = buildHarborTask({ row, env, source: bundle });
    expect(files.get("tests/test.sh")).not.toContain("pipefail");
    expect(files.get("tests/test.sh")).not.toContain("schema");
    expect(files.get("instruction.md")).toContain("`DATABASE_URL` points to it.\n");
    expect(files.get("instruction.md")).not.toContain("```sh");
    expect(files.has("environment/docker-compose.yaml")).toBe(true);
  });
});

describe("4. rows without services", () => {
  it("have no compose file, no database section and no schema step (byte-identity: harborBundleTask.json in cse115aValidationHarbor.test.ts)", () => {
    const files = buildHarborTask({ row, env: { ...recipe, services: [], env: { CI: "true" } }, source: bundle });
    expect(files.has("environment/docker-compose.yaml")).toBe(false);
    expect(files.get("instruction.md")).not.toContain("## Database");
    expect(files.get("tests/test.sh")).not.toContain("schema");
  });
});

describe("5. multi-suite rows", () => {
  it("stay skipped with MULTI_SUITE_REASON, with or without a database", () => {
    const multi: HarborEnv = { ...recipe, suites: [recipe, { ...recipe, services: [], package_dir: "web" }] };
    expect(harborSkipReason(multi)).toBe(MULTI_SUITE_REASON);
    expect(harborSkipReason({ ...multi, services: [] })).toBe(MULTI_SUITE_REASON);
  });
});

describe("the gold-only pass on an older database result", () => {
  it("builds the sidecar task, runs both agents, and stores the settings in the result's recipe", async () => {
    const out = await mkdtemp(join(tmpdir(), "hecate-harbor-db-"));
    await mkdir(join(out, "results"), { recursive: true });
    await mkdir(join(out, "snapshots"), { recursive: true });
    await writeFile(join(out, "snapshots", "b.bundle"), "not a real bundle; the fake Harbor never reads it");
    const result = {
      instance_id: row.instance_id, validation_status: "validated", reason: null, detail: null,
      FAIL_TO_PASS: row.FAIL_TO_PASS, ABSENT_TO_PASS: [], PASS_TO_PASS: row.PASS_TO_PASS, FAIL_TO_FAIL: [], flaky: [], timings: {},
      regressions: [], regression_skips: [], skipped: [], judged_from_base: [], load_failures: [], modified_tests: [], unmatched_static_ids: [], proof_outside_test_patch: [],
      image: "node:24-bookworm", eval_script: "", log_parser: "node-test-json", package_dir: "server", test_files: [],
      snapshot_bundle: "snapshots/b.bundle",
      harbor_env: { ...recipe, services: [{ name: "postgres", image: "postgres:16" }] },
      services: [{ name: "postgres", image: "postgres:16", env: service.env!, database_url: recipe.env.DATABASE_URL, schema_command: SCHEMA }],
    } as unknown as ValidationResult;
    await writeFile(join(out, "results", `${row.instance_id}.json`), JSON.stringify(result, null, 2) + "\n");
    const job = (mean: number) => JSON.stringify({ stats: { n_errored_trials: 0, evals: { x: { n_errors: 0, metrics: [{ mean }], exception_stats: {} } } } });
    const seen: string[] = [];
    const harbor: HarborRunner = {
      version: async () => "0.25.0",
      run: async ({ taskDir, agent }) => {
        seen.push(await readFile(join(taskDir, "environment", "docker-compose.yaml"), "utf8"));
        return { resultJson: job(agent === "oracle" ? 1 : 0), output: "", error: null };
      },
    };
    const { checked } = await goldOnly({ rows: [row], out, harbor, now: () => new Date("2026-11-14T00:00:00Z") });
    expect(checked[0]!.harbor_gold).toMatchObject({ status: "passed", oracle: 1, nop: 0 });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(sidecarCompose(service));
    const stored = JSON.parse(await readFile(join(out, "results", `${row.instance_id}.json`), "utf8")) as ValidationResult;
    expect(stored.harbor_env!.services).toEqual([service]);
    expect(stored.harbor_env!.gold).toMatchObject({ status: "passed" });
    // Verdict and lists untouched.
    expect(stored.validation_status).toBe("validated");
    expect(stored.FAIL_TO_PASS).toEqual(row.FAIL_TO_PASS);
  });
});

