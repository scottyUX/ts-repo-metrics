// The repo census: for each row, what its repository needs to run — the detector's answer plus the
// signals the detector does not act on yet (databases, browsers, other test runners). Python repos
// show their package manager (pip, uv, poetry), the Python image, and whether they declare pytest. No Docker; the
// script around it clones and reads files, this module decides and formats.

import { envLanguage, suiteLabel, type Environment, type Unsupported } from "@/lib/cse115a/benchmark/validation/environment";

export type CensusFiles = {
  /** package.json text of the package under test (or the root), null if none. */
  packageJson: string | null;
  /** Concatenated text of the repo's GitHub workflow files, "" if none. */
  workflows: string;
  /** Concatenated text of the test files the patch touches. */
  testSources: string;
};

export type Signals = { database: string[]; browser: string[]; otherRunners: string[] };

/** Names what the repository's tests probably need beyond Node: a database, a browser, another runner. */
export function signals(files: CensusFiles): Signals {
  const deps = new Set<string>();
  try {
    const pkg = JSON.parse(files.packageJson ?? "{}") as Record<string, Record<string, string>>;
    for (const key of ["dependencies", "devDependencies"]) for (const name of Object.keys(pkg[key] ?? {})) deps.add(name);
  } catch { /* unreadable package.json: no dependency signals */ }
  const has = (...names: string[]) => names.filter((n) => deps.has(n));
  const database = [
    ...has("pg", "postgres", "prisma", "@prisma/client", "drizzle-orm", "knex", "sequelize", "typeorm", "mongoose", "mongodb", "mysql2", "better-sqlite3", "ioredis", "redis"),
    ...(/\bservices:\s*\n\s+(postgres|mysql|redis|mongo)/i.test(files.workflows) ? ["ci-service"] : []),
    ...(/DATABASE_URL|TEST_DATABASE|bookworm_test|createConnection|new Pool\(/.test(files.testSources) ? ["tests-use-db"] : []),
  ];
  const browser = [...has("@playwright/test", "playwright", "cypress", "puppeteer", "selenium-webdriver", "jsdom", "happy-dom")];
  const otherRunners = [...has("mocha", "ava", "jasmine", "uvu", "tap")];
  return { database: [...new Set(database)], browser, otherRunners };
}

export type CensusEntry = {
  instance_id: string;
  repo: string;
  env: Environment | Unsupported;
  signals: Signals;
  note: string;
};

/** The environment's suites: itself for one, its `suites` for several. */
const suitesOf = (env: Environment): Environment[] => (env.suites && env.suites.length > 1 ? env.suites : [env]);

/**
 * "supported", plus for a Python repo whether its manifests name pytest (the validator installs it
 * regardless), and "postgres service (from CI)" when the runs get a database container. Tests that
 * span languages or packages are supported too, as several suites, which the note names.
 */
function supportedNote(env: Environment): string {
  const suites = suitesOf(env);
  const notes = ["supported"];
  if (suites.length > 1) notes.push(`${suites.length} suites: ${suites.map((s) => suiteLabel({ language: envLanguage(s), packageDir: s.packageDir })).join(", ")}`);
  const python = suites.find((s) => s.runners.includes("pytest"));
  if (python) notes.push(python.pytestDeclared ? "pytest declared" : "pytest not declared, installed by the validator");
  if (suites.some((s) => s.services?.length)) notes.push("postgres service (from CI)");
  return notes.join("; ");
}

/** A column for a supported row: one value per suite, joined with " / " when there are several. */
function column(env: Environment, pick: (suite: Environment) => string): string {
  return suitesOf(env).map(pick).join(" / ");
}

export function censusMarkdown(entries: CensusEntry[]): string {
  const lines = [
    "| instance_id | repo | package | manager | runners | image | workspace | database | browser | other runners | detector |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const e of entries) {
    const env = e.env;
    const cols = env.supported
      ? [
          column(env, (s) => s.packageDir || "."), column(env, (s) => s.packageManager), column(env, (s) => s.runners.join("+")), column(env, (s) => s.image),
          column(env, (s) => (s.installDir === "" && s.packageDir ? "yes" : "no")), supportedNote(env),
        ]
      : ["", "", "", "", "", `unsupported: ${env.detail}`];
    lines.push(`| ${e.instance_id} | ${e.repo} | ${cols[0]} | ${cols[1]} | ${cols[2]} | ${cols[3]} | ${cols[4]} | ${e.signals.database.join(", ")} | ${e.signals.browser.join(", ")} | ${e.signals.otherRunners.join(", ")} | ${cols[5]}${e.note ? ` (${e.note})` : ""} |`);
  }
  const repos = new Map<string, CensusEntry>();
  for (const e of entries) if (!repos.has(e.repo)) repos.set(e.repo, e);
  const count = (pick: (e: CensusEntry) => boolean) => [...repos.values()].filter(pick).length;
  lines.push("", `${repos.size} repositories, ${entries.length} rows.`,
    `Need a database: ${count((e) => e.signals.database.length > 0)}. Browser tests: ${count((e) => e.signals.browser.length > 0)}. Other runners: ${count((e) => e.signals.otherRunners.length > 0)}. Detector unsupported: ${count((e) => !e.env.supported)}. Python: ${count((e) => e.env.supported && suitesOf(e.env).some((s) => s.runners.includes("pytest")))}. More than one suite: ${count((e) => e.env.supported && suitesOf(e.env).length > 1)}.`, "");
  return lines.join("\n");
}
