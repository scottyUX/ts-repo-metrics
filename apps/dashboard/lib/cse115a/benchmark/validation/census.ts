// The repo census: for each row, what its repository needs to run — the detector's answer plus the
// signals the detector does not act on yet (databases, browsers, other test runners). No Docker; the
// script around it clones and reads files, this module decides and formats.

import type { Environment, Unsupported } from "@/lib/cse115a/benchmark/validation/environment";

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
  const otherRunners = [...has("jest", "mocha", "ava", "jasmine", "uvu", "tap")];
  return { database: [...new Set(database)], browser, otherRunners };
}

export type CensusEntry = {
  instance_id: string;
  repo: string;
  env: Environment | Unsupported;
  signals: Signals;
  note: string;
};

export function censusMarkdown(entries: CensusEntry[]): string {
  const lines = [
    "| instance_id | repo | package | manager | runners | Node image | workspace | database | browser | other runners | detector |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const e of entries) {
    const env = e.env;
    const cols = env.supported
      ? [env.packageDir || ".", env.packageManager, env.runners.join("+"), env.image, env.installDir === "" && env.packageDir ? "yes" : "no", "supported"]
      : ["", "", "", "", "", `unsupported: ${env.detail}`];
    lines.push(`| ${e.instance_id} | ${e.repo} | ${cols[0]} | ${cols[1]} | ${cols[2]} | ${cols[3]} | ${cols[4]} | ${e.signals.database.join(", ")} | ${e.signals.browser.join(", ")} | ${e.signals.otherRunners.join(", ")} | ${cols[5]}${e.note ? ` (${e.note})` : ""} |`);
  }
  const repos = new Map<string, CensusEntry>();
  for (const e of entries) if (!repos.has(e.repo)) repos.set(e.repo, e);
  const count = (pick: (e: CensusEntry) => boolean) => [...repos.values()].filter(pick).length;
  lines.push("", `${repos.size} repositories, ${entries.length} rows.`,
    `Need a database: ${count((e) => e.signals.database.length > 0)}. Browser tests: ${count((e) => e.signals.browser.length > 0)}. Other runners: ${count((e) => e.signals.otherRunners.length > 0)}. Detector unsupported: ${count((e) => !e.env.supported)}.`, "");
  return lines.join("\n");
}
