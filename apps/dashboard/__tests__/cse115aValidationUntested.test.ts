import { describe, expect, it } from "vitest";
import { rejectedWithoutRun, summarize, summaryMarkdown, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import type { Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { STAFF_REBUILT_FLAG } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import { FakeSuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { jsImportSpecifiers, untestedFiles } from "@/lib/cse115a/benchmark/validation/untestedFiles";
import { changedFilesInPatch, validateTask, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, managedFlags, mergeFlags, PROOF_OUTSIDE_FLAG, UNTESTED_FILES_FLAG, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";

/** An in-memory post-fix tree. */
const tree = (files: Record<string, string>) => async (path: string) => files[path] ?? null;

/** A minimal unified diff touching each path; `null` content marks a deletion. */
function patchOf(files: Record<string, "add" | "modify" | "delete">): string {
  return Object.entries(files).map(([path, kind]) => [
    `diff --git a/${path} b/${path}`,
    ...(kind === "add" ? ["new file mode 100644", "--- /dev/null", `+++ b/${path}`] : []),
    ...(kind === "modify" ? [`--- a/${path}`, `+++ b/${path}`] : []),
    ...(kind === "delete" ? ["deleted file mode 100644", `--- a/${path}`, "+++ /dev/null"] : []),
    "@@ -1 +1 @@",
    "+x",
  ].join("\n")).join("\n") + "\n";
}

describe("untestedFiles", () => {
  it("Bookworm shape: the back-end route is reached, the front-end files are not", async () => {
    const read = tree({
      "server/tests/books.test.ts": `import request from "supertest";\nimport router from "../routes/books";\n`,
      "server/routes/books.ts": `import { Router } from "express";\nimport { Book } from "../../shared/books";\n`,
      "shared/books.ts": "export type Book = { id: string };\n",
      "client/src/BookList.tsx": `import { fetchBooks } from "./api";\n`,
      "client/src/api.ts": "export const fetchBooks = () => fetch('/api/books');\n",
    });
    const result = await untestedFiles({
      changedFiles: ["server/routes/books.ts", "shared/books.ts", "client/src/BookList.tsx", "client/src/api.ts"],
      provingTestFiles: ["server/tests/books.test.ts"], read, packageDir: "server",
    });
    expect(result).toEqual(["client/src/BookList.tsx", "client/src/api.ts"]);
  });

  it("follows imports transitively", async () => {
    const read = tree({
      "t.test.ts": `import { a } from "./a";`,
      "a.ts": `export * from "./b";`,
      "b.ts": `const c = require("./c");`,
      "c.ts": "export const c = 1;",
    });
    expect(await untestedFiles({ changedFiles: ["a.ts", "b.ts", "c.ts"], provingTestFiles: ["t.test.ts"], read, packageDir: "" })).toEqual([]);
  });

  it("resolves a .js specifier to .ts, a directory to index.ts, and a tsconfig paths alias", async () => {
    const read = tree({
      "web/tsconfig.json": `{\n  // comments allowed\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/lib/*": ["src/lib/*"], }, },\n}`,
      "web/src/app.test.ts": `import { x } from "./util.js";\nimport "./components";\nimport { fmt } from "@/lib/format";\nconst lazy = await import("./lazy");`,
      "web/src/util.ts": "export const x = 1;",
      "web/src/components/index.ts": "export {};",
      "web/src/lib/format.ts": "export const fmt = 1;",
      "web/src/lazy.tsx": "export {};",
    });
    const changed = ["web/src/util.ts", "web/src/components/index.ts", "web/src/lib/format.ts", "web/src/lazy.tsx"];
    expect(await untestedFiles({ changedFiles: changed, provingTestFiles: ["web/src/app.test.ts"], read, packageDir: "web" })).toEqual([]);
  });

  it("ignores bare packages and imports that resolve to nothing, without throwing", async () => {
    const read = tree({ "t.test.ts": `import React from "react";\nimport { z } from "zod";\nimport "./missing";\nimport "../../outside";\nimport "@/nope";` });
    expect(await untestedFiles({ changedFiles: ["src/a.ts"], provingTestFiles: ["t.test.ts"], read, packageDir: "" })).toEqual(["src/a.ts"]);
  });

  it("an import inside a comment does not count; one after a string holding // does", async () => {
    const read = tree({
      "t.test.ts": `// import "./a";\n/* import "./b";\n require("./b") */\nconst url = "http://x"; import "./c";`,
      "a.ts": "", "b.ts": "", "c.ts": "",
    });
    expect(await untestedFiles({ changedFiles: ["a.ts", "b.ts", "c.ts"], provingTestFiles: ["t.test.ts"], read, packageDir: "" })).toEqual(["a.ts", "b.ts"]);
    expect(jsImportSpecifiers(`import type { T } from "./types";\nexport { a } from "./a";\nimport x, { y,\n z } from "./multi";`)).toEqual(["./types", "./multi", "./a"]);
  });

  it("Python: absolute and relative imports; an unimported module is untested", async () => {
    const read = tree({
      "tests/test_api.py": "from app.api import handler\n# import app.cli\n",
      "app/__init__.py": "",
      "app/api.py": "from .util import x\n\ndef handler():\n    return x\n",
      "app/util.py": "x = 1\n",
      "app/cli.py": "import sys\n",
    });
    expect(await untestedFiles({ changedFiles: ["app/api.py", "app/util.py", "app/cli.py", "app/__init__.py"], provingTestFiles: ["tests/test_api.py"], read, packageDir: "" }))
      .toEqual(["app/cli.py"]);
  });

  it("Python: a module next to the test, under packageDir, and a name imported as a submodule", async () => {
    const read = tree({
      "backend/tests/test_x.py": "import helpers\nfrom svc import (\n    models,\n)\n",
      "backend/tests/helpers.py": "",
      "backend/svc/__init__.py": "",
      "backend/svc/models.py": "",
    });
    expect(await untestedFiles({ changedFiles: ["backend/tests/helpers.py", "backend/svc/models.py"], provingTestFiles: ["backend/tests/test_x.py"], read, packageDir: "backend" }))
      .toEqual([]);
  });

  it("PocketWatch shape: an import of build output maps through outDir to rootDir", async () => {
    const read = tree({
      "package.json": "{}",
      "tsconfig.json": `{ "compilerOptions": { "outDir": "./dist", "rootDir": "./src" } }`,
      // A tests/ config without outDir is skipped: the lookup starts at the importer's package folder.
      "tests/tsconfig.json": `{ "extends": "../tsconfig.json" }`,
      "tests/x.test.mjs": `const { AuthController } = await import('../dist/auth/a.controller.js');`,
      "src/auth/a.controller.ts": `import { svc } from "./a.service.js";`,
      "src/auth/a.service.ts": "",
      "src/app.module.ts": "",
    });
    expect(await untestedFiles({ changedFiles: ["src/auth/a.controller.ts", "src/auth/a.service.ts", "src/app.module.ts"], provingTestFiles: ["tests/x.test.mjs"], read, packageDir: "" }))
      .toEqual(["src/app.module.ts"]);
  });

  it("outDir with no rootDir: the single top folder of include, else the config's folder", async () => {
    const files = {
      "api/package.json": "{}",
      "api/test/a.test.js": `require("../out/lib/a.js");`,
      "api/src/lib/a.ts": "",
      "api/lib/a.ts": "",
    };
    const run = (config: string) => untestedFiles({ changedFiles: ["api/src/lib/a.ts", "api/lib/a.ts"], provingTestFiles: ["api/test/a.test.js"], read: tree({ ...files, "api/tsconfig.json": config }), packageDir: "api" });
    expect(await run(`{ "compilerOptions": { "outDir": "out" }, "include": ["src/**/*"] }`)).toEqual(["api/lib/a.ts"]);
    expect(await run(`{ "compilerOptions": { "outDir": "out" }, "include": ["src", "test"] }`)).toEqual(["api/src/lib/a.ts"]);
  });

  it("no outDir declared: dist/ and build/ of the package folder map to src/", async () => {
    const read = tree({
      "server/package.json": "{}",
      "server/tests/a.test.mjs": `import "../dist/a.js";\nimport "../build/b/index.js";`,
      "server/src/a.ts": "",
      "server/src/b/index.ts": "",
    });
    expect(await untestedFiles({ changedFiles: ["server/src/a.ts", "server/src/b/index.ts"], provingTestFiles: ["server/tests/a.test.mjs"], read, packageDir: "server" })).toEqual([]);
  });

  it("an import into dist/ with no matching source is ignored", async () => {
    const read = tree({
      "package.json": "{}",
      "tsconfig.json": `{ "compilerOptions": { "outDir": "dist", "rootDir": "src" } }`,
      "tests/a.test.mjs": `import "../dist/generated/schema.js";\nimport "../dist/a.js";`,
      "src/a.ts": "",
    });
    expect(await untestedFiles({ changedFiles: ["src/a.ts", "src/other.ts"], provingTestFiles: ["tests/a.test.mjs"], read, packageDir: "" })).toEqual(["src/other.ts"]);
  });

  it("never lists non-code or declaration files", async () => {
    const read = tree({ "t.test.ts": "" });
    const changed = ["README.md", "src/styles.css", "package-lock.json", "src/types.d.ts", "src/a.ts"];
    expect(await untestedFiles({ changedFiles: changed, provingTestFiles: ["t.test.ts"], read, packageDir: "" })).toEqual(["src/a.ts"]);
  });

  it("a mixed task: a JS test does not reach a changed .py file", async () => {
    const read = tree({ "web/a.test.ts": `import "./a";`, "web/a.ts": "", "scripts/seed.py": "" });
    expect(await untestedFiles({ changedFiles: ["web/a.ts", "scripts/seed.py"], provingTestFiles: ["web/a.test.ts"], read, packageDir: "web" })).toEqual(["scripts/seed.py"]);
  });
});

describe("changedFilesInPatch", () => {
  it("leaves out deletions and lists renames by their new path", () => {
    const patch = patchOf({ "src/a.ts": "modify", "src/new.ts": "add", "src/gone.ts": "delete" }) + [
      "diff --git a/src/old.ts b/src/moved.ts",
      "similarity index 100%",
      "rename from src/old.ts",
      "rename to src/moved.ts",
      "diff --git a/src/before.ts b/src/after.ts",
      "similarity index 80%",
      "rename from src/before.ts",
      "rename to src/after.ts",
      "--- a/src/before.ts",
      "+++ b/src/after.ts",
      "@@ -1 +1 @@",
      "+y",
      "",
    ].join("\n");
    expect(changedFilesInPatch(patch)).toEqual(["src/a.ts", "src/new.ts", "src/moved.ts", "src/after.ts"]);
  });
});

const env: Environment = {
  supported: true, runners: ["vitest"], packageManager: "npm", packageDir: "", installDir: "", installCommand: "npm ci",
  testSteps: [{ kind: "vitest", command: "npx vitest run" }], env: { CI: "true" }, dockerfile: "FROM node:22-bookworm", image: "node:22-bookworm",
};

describe("validateTask: untested_files", () => {
  const row: TaskRow = {
    instance_id: "o__r-1", repo: "o/r", base_commit: "abc",
    patch: patchOf({ "src/sum.ts": "modify", "src/ui.tsx": "modify", "src/page.tsx": "modify", "src/old.ts": "delete", "src/sum.css": "modify" }),
    test_patch: patchOf({ "src/sum.test.ts": "add" }),
    FAIL_TO_PASS: [], PASS_TO_PASS: [],
  };
  const files = tree({ "src/sum.test.ts": `import { sum } from "./sum";`, "src/sum.ts": "", "src/ui.tsx": "", "src/page.tsx": "" });
  const passes = new FakeSuiteRunner({ r0: {}, r1: { "src/sum.test.ts::adds": "failed" }, r2: { "src/sum.test.ts::adds": "passed" } });
  let opened = 0;
  const withPostFixTree = <T,>(fn: (read: (p: string) => Promise<string | null>) => Promise<T>) => { opened++; return fn(files); };

  it("a validated result gets the sorted list; verdict, reason and detail are unchanged", async () => {
    const plain = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: passes });
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: passes, withPostFixTree });
    expect(result.untested_files).toEqual(["src/page.tsx", "src/ui.tsx"]);
    expect([result.validation_status, result.reason, result.detail]).toEqual([plain.validation_status, plain.reason, plain.detail]);
    expect(result.validation_status).toBe("validated");
    expect("untested_files" in plain).toBe(false);
  });

  it("a rejected result never has the field, and the tree is not opened", async () => {
    const before = opened;
    const fails = new FakeSuiteRunner({ r0: {}, r1: {}, r2: { "src/sum.test.ts::adds": "failed" } });
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: fails, withPostFixTree });
    expect(result.validation_status).toBe("rejected");
    expect("untested_files" in result).toBe(false);
    expect(opened).toBe(before);
  });

  it("no untested files: the field is absent", async () => {
    const covered = { ...row, patch: patchOf({ "src/sum.ts": "modify" }) };
    const result = await validateTask({ row: covered, repoDir: "/r", env, modified: new Set(), runner: passes, withPostFixTree });
    expect("untested_files" in result).toBe(false);
  });

  it("a read error becomes a note in detail and never rejects", async () => {
    const broken = async <T,>(fn: (read: (p: string) => Promise<string | null>) => Promise<T>) => fn(async () => { throw new Error("EIO: disk gone\nmore"); });
    const result = await validateTask({ row, repoDir: "/r", env, modified: new Set(), runner: passes, withPostFixTree: broken });
    expect(result.validation_status).toBe("validated");
    expect(result.detail).toBe("untested_files not computed: EIO: disk gone");
    expect("untested_files" in result).toBe(false);
  });
});

const baseRow = (id: string): TaskRow => ({ instance_id: id, repo: "o/r", base_commit: "c", patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] });
const validated: ValidationResult = {
  ...rejectedWithoutRun(baseRow("v-1"), "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["a::x"], PASS_TO_PASS: ["a::z"], image: "node:24-bookworm", eval_script: "set -e\n", log_parser: "vitest-json",
};
const untested = { ...validated, untested_files: ["client/src/BookList.tsx", "client/src/api.ts"] };

describe("untested_files write-back", () => {
  it("managedFlags adds the flag only when the list is non-empty", () => {
    expect(managedFlags(untested)).toEqual([UNTESTED_FILES_FLAG]);
    expect(managedFlags({ ...validated, untested_files: [] })).toEqual([]);
    expect(managedFlags(validated)).toEqual([]);
  });

  it("mergeFlags replaces an old untested_files flag and keeps flags the validator does not own", () => {
    expect(mergeFlags([STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG, "reviewer:ok"], [UNTESTED_FILES_FLAG])).toEqual([STAFF_REBUILT_FLAG, "reviewer:ok", UNTESTED_FILES_FLAG]);
    expect(mergeFlags([STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG], [])).toEqual([STAFF_REBUILT_FLAG]);
  });

  function fakeClient(initial: string[]) {
    const state = { flags: initial };
    const client: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async () => ({ data: [{ flags: state.flags }], error: null }) }; },
          update(values) { return { eq: async () => { if (table === "cse_benchmark_task_sources") state.flags = values.flags as string[]; return { error: null }; } }; },
        };
      },
    };
    return { client, state };
  }

  it("a second write-back with an empty list removes the flag; the output line counts the files", async () => {
    const { client, state } = fakeClient([STAFF_REBUILT_FLAG]);
    const lines = await applyWriteback(client, writebackPlan([untested]), () => "now");
    expect(state.flags).toEqual([STAFF_REBUILT_FLAG, UNTESTED_FILES_FLAG]);
    expect(lines[0]).toBe("v-1: validated, 1 F2P / 1 P2P written, detail: no coverage, flagged untested_files (2)");
    const again = await applyWriteback(client, writebackPlan([validated]), () => "now");
    expect(state.flags).toEqual([STAFF_REBUILT_FLAG]);
    expect(again[0]).not.toContain(UNTESTED_FILES_FLAG);
  });

  /** Applies writeback.sql's flags expression for one row to `existing`, the way Postgres would. */
  function sqlFlags(sql: string, id: string, existing: string[]): string[] {
    // Each piece starts with one source update; its first `where` is that update's row.
    const statement = sql.split("update public.cse_benchmark_task_sources").slice(1)
      .find((s) => /where instance_id = (\S+);/.exec(s)?.[1] === `$hecate$${id}$hecate$`)!;
    const line = statement.split("\n").find((l) => l.includes("flags = "))!;
    const where = /where (.*)\), null\)/.exec(line)![1];
    const prefixes = [...where.matchAll(/f not like '([^']*)%'/g)].map((m) => m[1]);
    const excluded = [...where.matchAll(/f <> '([^']*)'/g)].map((m) => m[1]);
    const kept = existing.filter((f) => !prefixes.some((p) => f.startsWith(p)) && !excluded.includes(f));
    const added = /\|\| array\[(.*)\],$/.exec(line)?.[1].split(", ").map((q) => q.replace(/^\$hecate\$|\$hecate\$$/g, "")) ?? [];
    return [...kept, ...added];
  }

  it("writeback.sql and the client path produce the same flags for the same results", async () => {
    const rebuilt: ValidationResult = {
      ...untested, instance_id: "b-1",
      rebuild: { rebuilt_from: "merge-parent", merge_commit: "m", original_base_commit: "o", original_patch_sha256: "h1", original_test_patch_sha256: "h2", base_commit: "p", patch: "p", test_patch: "t" },
    };
    const results: ValidationResult[] = [
      untested,
      { ...validated, instance_id: "v-2" },
      { ...rejectedWithoutRun(baseRow("r-1"), "no_fail_to_pass", ""), proof_outside_test_patch: ["x::y"] },
      rebuilt,
    ];
    const existing = ["no_test_patch", "validation_reason:stale", PROOF_OUTSIDE_FLAG, UNTESTED_FILES_FLAG, STAFF_REBUILT_FLAG];
    const sql = writebackSql(results);
    for (const op of writebackPlan(results)) {
      const { client, state } = fakeClient(existing);
      await applyWriteback(client, [op], () => "now");
      // Flags are a set; the SQL path re-appends the staff flag where the client keeps it in place.
      expect([...sqlFlags(sql, op.instance_id, existing)].sort()).toEqual([...state.flags].sort());
    }
    expect(sqlFlags(sql, "v-1", existing)).toContain(UNTESTED_FILES_FLAG);
    expect(sqlFlags(sql, "v-2", existing)).not.toContain(UNTESTED_FILES_FLAG);
  });
});

describe("summary: untested files", () => {
  it("shows the count next to a validated row and in the headline; the funnel is unchanged", () => {
    const summary = summarize([untested, validated]);
    const md = summaryMarkdown(summary);
    expect(md).toContain("| v-1 | validated | untested files: 2 |");
    expect(md.split("\n")[0]).toContain("; 1 flagged untested_files");
    expect(summary.funnel).toEqual(summarize([validated, validated]).funnel);
  });
});
