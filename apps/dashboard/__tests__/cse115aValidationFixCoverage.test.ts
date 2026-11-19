// #288: fix_coverage, the coverage run of a validated row's proving tests, and untested_files derived
// from it. The reports under fixtures/coverage/ are real tool output, captured from small repositories
// in the validator's images (node:20/22/24-bookworm, python:3.12-bookworm): Jest 29.7.0, Vitest 3.2.4
// with @vitest/coverage-v8, c8 10.1.3 over `node --test` (plain JavaScript; TypeScript run by Node 24
// with its types stripped; tsc build output with and without source maps), and coverage.py 7 over
// pytest with the module under test loaded by a conftest.py fixture. No test needs Docker.
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rejectedWithoutRun, summarize, summaryMarkdown, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { batchRun, fixCoverageBatchRow, fixCoverageOnly } from "@/lib/cse115a/benchmark/validation/batchRun";
import { COVERAGE_DIR, coverageSteps, globRegex, measureFixCoverage, nodeTestRuns, suiteOfFile } from "@/lib/cse115a/benchmark/validation/coverageRun";
import type { Environment } from "@/lib/cse115a/benchmark/validation/environment";
import {
  changedLinesInPatch, classifyFixCoverage, codeLines, compactRanges, coverageCell, deriveUntested, parseCoveragePyReport, parseIstanbulReport,
  repoPath, unavailableCoverage, withFixCoverage, type FixCoverage, type LineCounts, type ReportCoverage,
} from "@/lib/cse115a/benchmark/validation/fixCoverage";
import { run } from "@/lib/cse115a/benchmark/validation/runRow";
import { ExecError, FakeSuiteRunner, InstallError, containerScript, type CoverageRun, type RunPlan } from "@/lib/cse115a/benchmark/validation/runner";
import { isCodeFile, untestedFiles } from "@/lib/cse115a/benchmark/validation/untestedFiles";
import { changedFilesInPatch, suitePlan, type TaskRow, type ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, managedFlags, UNTESTED_FILES_FLAG, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "coverage", name), "utf8");
const tree = (files: Record<string, string>) => async (path: string) => files[path] ?? null;
const counts = (m: Map<string, LineCounts>) => Object.fromEntries([...m].map(([path, lines]) => [path, Object.fromEntries(lines)]));
const lines = (entries: Array<[number, number]>): LineCounts => new Map(entries);
/** A usable report of one language over the given files. */
const report = (files: Record<string, Array<[number, number]>>, language: "javascript" | "python" = "javascript", generated: string[] = []): Extract<ReportCoverage, { ok: true }> =>
  ({ label: "vitest-0 in .", language, ok: true, tool: "vitest 4.1.12 (v8)", files: new Map(Object.entries(files).map(([p, e]) => [p, lines(e)])), generated });

// ---------------------------------------------------------------------------------------------
// 1. Changed lines

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,5 @@",
  " line1",
  "-old2",
  "+new2",
  "+added3",
  " line4",
  " line5",
  "@@ -10,3 +11,3 @@ function f() {",
  " ctx11",
  "-old",
  "+new12",
  " ctx13",
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "index 0000000..3333333",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,3 @@",
  "+a",
  "++++ not a header",
  "+c",
  "diff --git a/src/old.ts b/src/moved.ts",
  "similarity index 80%",
  "rename from src/old.ts",
  "rename to src/moved.ts",
  "index 4444444..5555555 100644",
  "--- a/src/old.ts",
  "+++ b/src/moved.ts",
  "@@ -5,2 +5,3 @@",
  " keep5",
  "+ins6",
  " keep7",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "deleted file mode 100644",
  "index 6666666..0000000",
  "--- a/src/gone.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-x",
  "-y",
  "diff --git a/src/pure.ts b/src/pure2.ts",
  "similarity index 100%",
  "rename from src/pure.ts",
  "rename to src/pure2.ts",
  "diff --git a/README.md b/README.md",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1 +1 @@",
  "-a",
  "+b",
  "diff --git a/src/del.ts b/src/del.ts",
  "--- a/src/del.ts",
  "+++ b/src/del.ts",
  "@@ -1,3 +1,2 @@",
  " a",
  "-b",
  " c",
  "",
].join("\n");

describe("changedLinesInPatch", () => {
  it("post-fix line numbers of added and modified lines, per changed code file", () => {
    expect(Object.fromEntries(changedLinesInPatch(PATCH))).toEqual({
      // Two hunks: a modification and an addition, then a modification after the first hunk shifted lines by one.
      "src/a.ts": [2, 3, 12],
      // A new file; an added line that starts with "+++" is content, not a header.
      "src/new.ts": [1, 2, 3],
      // A rename with edits: its new path and new line numbers.
      "src/moved.ts": [6],
      // A pure rename and a deletion-only edit are listed with no lines.
      "src/pure2.ts": [],
      "src/del.ts": [],
    });
  });

  it("lists exactly the files changedFilesInPatch and isCodeFile give (deleted and non-code files left out)", () => {
    expect([...changedLinesInPatch(PATCH).keys()].sort()).toEqual(changedFilesInPatch(PATCH).filter(isCodeFile).sort());
  });
});

describe("codeLines", () => {
  it("TypeScript: comments, blank lines, interfaces, lone braces and annotations-only lines are not code", () => {
    // The file Node 24 ran with its types stripped (c8-strip-types-coverage-final.json is its coverage).
    expect([...codeLines("src/lib.ts", fixture("c8-strip-types-lib.ts.txt"))].sort((a, b) => a - b)).toEqual([6, 7, 9, 12, 14, 15]);
    const source = [
      "import type { T } from './t';", // 1 type-only import
      "import { a, type B } from './a';", // 2 code
      "type X = { y: number };", // 3
      "export function f(", // 4 code
      "  p: string,", // 5 code (the parameter)
      "): T {", // 6 brackets and a return type only
      "  const s = `line", // 7 code
      "  inside a template`;", // 8 code (the template spans it)
      "  return s as unknown as T;", // 9 code
      "}", // 10
      "declare const g: number;", // 11 ambient
      "function h(a: string): void;", // 12 overload signature
      "function h(a: string) { return a; }", // 13 code
      "class C implements T {", // 14 code (class C)
      "  private x: number = 1;", // 15 code
      "}", // 16
    ].join("\n");
    expect([...codeLines("src/x.ts", source)].sort((a, b) => a - b)).toEqual([2, 4, 5, 7, 8, 9, 13, 14, 15]);
  });

  it("Python and Vue by text: blank and comment lines are not code", () => {
    expect([...codeLines("app/m.py", "# c\n\ndef f():\n    # inner\n    return 1\n")]).toEqual([3, 5]);
    expect([...codeLines("src/A.vue", "<template>\n  <!-- c -->\n  <p>{{ x }}</p>\n</template>\n\n")]).toEqual([1, 3, 4]);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Report parsers, against real output

describe("report parsers", () => {
  it("coverage.py JSON: executed lines count 1, missing 0; paths relative to the package folder", () => {
    expect(counts(parseCoveragePyReport(fixture("coveragepy.json"), "server"))).toEqual({
      "server/app/__init__.py": {},
      "server/app/greet.py": { 1: 1, 3: 1, 6: 1, 7: 0 },
      "server/tests/conftest.py": { 1: 1, 2: 1, 4: 1, 5: 1, 6: 1 },
      "server/tests/test_greet.py": { 1: 1, 2: 1 },
    });
  });

  it("Jest (babel, Istanbul JSON): statements, function bodies, and the never-called function in a loaded file", () => {
    const parsed = counts(parseIstanbulReport(fixture("jest-coverage-final.json"), ""));
    expect(Object.keys(parsed)).toEqual(["src/app.js", "src/components/Button.js", "src/components/Card.js", "src/components/index.js"]);
    // Card is loaded through index.js; its function (lines 1-3) never runs.
    expect(parsed["src/components/Card.js"]).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1 });
    // routes.b's body (line 6) never runs; routes.a's does.
    expect(parsed["src/app.js"]).toMatchObject({ 3: 1, 6: 0 });
  });

  it("Vitest 3 (v8 provider, Istanbul JSON): a TypeScript file's statements, the interface absent", () => {
    expect(counts(parseIstanbulReport(fixture("vitest-coverage-final.json"), ""))).toEqual({
      "src/lib.ts": { 6: 1, 7: 1, 8: 1, 10: 1, 11: 0, 12: 0, 13: 0 },
    });
  });

  it("c8 over node --test: every line of a loaded file, the test file too; dist/ remapped through source maps", () => {
    expect(counts(parseIstanbulReport(fixture("c8-coverage-final.json"), ""))).toEqual({
      "src/math.js": { 1: 1, 2: 1, 3: 1 },
      "test/math.test.js": { 1: 1, 2: 1, 3: 1, 4: 1 },
    });
    expect(Object.keys(counts(parseIstanbulReport(fixture("c8-dist-sourcemap-true-coverage-final.json"), "")))).toEqual(["src/greet.ts", "tests/greet.test.mjs"]);
    expect(Object.keys(counts(parseIstanbulReport(fixture("c8-dist-sourcemap-false-coverage-final.json"), "")))).toEqual(["dist/greet.js", "tests/greet.test.mjs"]);
  });

  it("`wanted` limits parsing to the changed files and lines", () => {
    const wanted = new Map([["src/components/Card.js", [2]]]);
    expect(counts(parseIstanbulReport(fixture("jest-coverage-final.json"), "", wanted))).toEqual({ "src/components/Card.js": { 2: 0 } });
  });

  it("repoPath: the /work mount, the package folder, and paths it must drop", () => {
    expect(repoPath("/work/apps/api/src/a.ts", "apps/api")).toBe("apps/api/src/a.ts");
    expect(repoPath("app/m.py", "server")).toBe("server/app/m.py");
    expect(repoPath("file:///work/src/a.ts", "")).toBe("src/a.ts");
    expect(repoPath("/work/node_modules/x/index.js", "")).toBeNull();
    expect(repoPath("/usr/lib/python3/os.py", "")).toBeNull();
    expect(repoPath("../outside.py", "")).toBeNull();
  });

  it("a malformed report throws (the run turns that into a failed report)", () => {
    expect(() => parseIstanbulReport("{", "")).toThrow();
    expect(() => parseCoveragePyReport(JSON.stringify({ meta: {} }), "")).toThrow("no files");
  });
});

// ---------------------------------------------------------------------------------------------
// 3, 4. Classification and merging

describe("classifyFixCoverage", () => {
  const code = (entries: Record<string, number[] | null>) => new Map(Object.entries(entries).map(([p, l]) => [p, l ? new Set(l) : null]));

  it("run, not_run (absent), not_run (loaded, nothing covered); non-code lines never count; ranges compact and sorted", () => {
    const changed = new Map([["src/run.ts", [1, 2, 3, 4, 5, 9, 10, 11, 12, 20]], ["src/absent.ts", [1]], ["src/zero.ts", [3, 4]]]);
    const result = classifyFixCoverage({
      changed,
      // Line 5 of run.ts is a comment: the tool calls it executed and uncovered, and it does not count.
      code: code({ "src/run.ts": [1, 2, 3, 4, 9, 10, 11, 12, 20], "src/absent.ts": [1], "src/zero.ts": [3, 4] }),
      reports: [report({
        "src/run.ts": [[1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [9, 0], [10, 1], [11, 0], [12, 0], [20, 0]],
        "src/zero.ts": [[3, 0], [4, 0], [7, 1]],
      })],
    });
    expect(result.files).toEqual([
      { path: "src/absent.ts", state: "not_run", changed_lines: 1, executable: null, covered: null, uncovered: null },
      { path: "src/run.ts", state: "run", changed_lines: 10, executable: 9, covered: 2, uncovered: "2-4,9,11-12,20" },
      { path: "src/zero.ts", state: "not_run", changed_lines: 2, executable: 2, covered: 0, uncovered: "3-4" },
    ]);
    expect(result).toMatchObject({ status: "measured", tools: ["vitest 4.1.12 (v8)"], files_changed: 3, files_run: 1, files_not_run: 2, files_not_measured: 0, lines_executable: 9, lines_covered: 2 });
    expect(result.reason).toBeUndefined();
  });

  it("real c8 output for a type-stripped TypeScript file: the comment, interface and braces Node reports are left out", () => {
    const file = fixture("c8-strip-types-lib.ts.txt");
    const changed = new Map([["src/lib.ts", Array.from({ length: 16 }, (_v, i) => i + 1)]]);
    const result = classifyFixCoverage({
      changed, code: new Map([["src/lib.ts", codeLines("src/lib.ts", file)]]),
      reports: [{ ...report({}), tool: "c8 10.1.3 (node v24.22.2)", files: parseIstanbulReport(fixture("c8-strip-types-coverage-final.json"), "", changed) }],
    });
    // 16 changed lines; 6 are code: 6, 7, 9 (area, run) and 12, 14, 15 (unused: its declaration line runs at load, its body never).
    expect(result.files).toEqual([{ path: "src/lib.ts", state: "run", changed_lines: 16, executable: 6, covered: 4, uncovered: "14-15" }]);
  });

  it("merges reports: a line covered in either is covered; a .py file with only JavaScript reports is not_run", () => {
    const result = classifyFixCoverage({
      changed: new Map([["src/a.ts", [1, 2, 3]], ["app/m.py", [1]]]),
      code: code({ "src/a.ts": null, "app/m.py": null }),
      reports: [report({ "src/a.ts": [[1, 1], [2, 0], [3, 0]] }), { ...report({ "src/a.ts": [[1, 0], [2, 3]] }), label: "node-2 in .", tool: "c8 10.1.3 (node v24.22.2)" }],
    });
    expect(result.files).toEqual([
      { path: "app/m.py", state: "not_run", changed_lines: 1, executable: null, covered: null, uncovered: null },
      { path: "src/a.ts", state: "run", changed_lines: 3, executable: 3, covered: 2, uncovered: "3" },
    ]);
    expect(result.tools).toEqual(["vitest 4.1.12 (v8)", "c8 10.1.3 (node v24.22.2)"]);
  });

  it("not_measured: loaded but no changed line executable; a failed report of its language; unmapped build output; an absent .vue file (nothing changed is code: no_code)", () => {
    const result = classifyFixCoverage({
      changed: new Map([
        ["shared/types.ts", [3, 4]], ["app/m.py", [5]], ["src/b.ts", [2]], ["src/greet.ts", [1, 2]], ["src/App.vue", [3]], ["src/pure.ts", []],
      ]),
      code: code({ "shared/types.ts": [], "app/m.py": [5], "src/b.ts": [2], "src/greet.ts": [1, 2], "src/App.vue": [3], "src/pure.ts": [] }),
      reports: [
        report({ "app/m.py": [[4, 1]] }, "python"),
        { label: "jest-1 in .", language: "javascript", ok: false, reason: "could not install c8 10.1.3" },
        report({ "dist/greet.js": [[1, 1]] }, "javascript", ["dist/greet.js"]),
      ],
    });
    expect(Object.fromEntries(result.files.map((f) => [f.path, f.state]))).toEqual({
      "app/m.py": "not_measured", "shared/types.ts": "no_code", "src/App.vue": "not_measured", "src/b.ts": "not_measured", "src/greet.ts": "not_measured", "src/pure.ts": "no_code",
    });
    expect(result.files.find((f) => f.path === "app/m.py")).toMatchObject({ executable: 0, covered: 0 });
    expect(result.status).toBe("partial");
    expect(result.reason).toBe("jest-1 in .: could not install c8 10.1.3; 4 file(s) not measured");
    expect(result).toMatchObject({ files_changed: 4, files_not_measured: 4, files_no_code: 2 });
  });

  describe("no_code: changed lines, none of them run-time code", () => {
    /** Changed lines from a real patch, code lines from the post-fix source, as measureFixCoverage does. */
    const classify = (patch: string, sources: Record<string, string>, reports: ReportCoverage[] = [report({ "src/a.ts": [[1, 1]] })]) => {
      const changed = changedLinesInPatch(patch);
      const codeMap = new Map([...changed.keys()].map((p) => [p, p in sources ? codeLines(p, sources[p]) : null]));
      return classifyFixCoverage({ changed, code: codeMap, reports });
    };
    const runFile = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n";
    const runSource = { "src/a.ts": "export const a = 2;\n" };
    const interfaceOnly = "diff --git a/shared/ratings.ts b/shared/ratings.ts\n--- a/shared/ratings.ts\n+++ b/shared/ratings.ts\n@@ -1 +1,5 @@\n export const MAX = 5;\n+export interface Rating {\n+  stars: number;\n+  note?: string;\n+}\n";
    const interfaceSource = "export const MAX = 5;\nexport interface Rating {\n  stars: number;\n  note?: string;\n}\n";
    const commentOnly = "diff --git a/backend/texting.ts b/backend/texting.ts\n--- a/backend/texting.ts\n+++ b/backend/texting.ts\n@@ -1,2 +1,3 @@\n /**\n+ * POST /messages/:inviteCode\n  * Create a new message.\n";
    const commentSource = "/**\n * POST /messages/:inviteCode\n * Create a new message.\n */\nexport function send() { return 1; }\n";
    const deletionsOnly = "diff --git a/src/old.ts b/src/old.ts\n--- a/src/old.ts\n+++ b/src/old.ts\n@@ -1,2 +1 @@\n export const keep = 1;\n-export const gone = 2;\n";
    const pureRename = "diff --git a/src/x.ts b/src/y.ts\nsimilarity index 100%\nrename from src/x.ts\nrename to src/y.ts\n";

    it("an interface, only comments, only deletions, a pure rename: no_code, with 0 / 0 / \"\"", () => {
      const result = classify(runFile + interfaceOnly + commentOnly + deletionsOnly + pureRename, {
        ...runSource, "shared/ratings.ts": interfaceSource, "backend/texting.ts": commentSource, "src/old.ts": "export const keep = 1;\n", "src/y.ts": "export const y = 1;\n",
      });
      expect(Object.fromEntries(result.files.map((f) => [f.path, f.state]))).toEqual({
        "backend/texting.ts": "no_code", "shared/ratings.ts": "no_code", "src/a.ts": "run", "src/old.ts": "no_code", "src/y.ts": "no_code",
      });
      for (const f of result.files.filter((x) => x.state === "no_code")) expect(f).toMatchObject({ executable: 0, covered: 0, uncovered: "" });
      expect(result.files.find((f) => f.path === "shared/ratings.ts")?.changed_lines).toBe(4);
    });

    it("one runnable changed line among type lines is not no_code: classified as before", () => {
      const patch = "diff --git a/src/t.ts b/src/t.ts\n--- a/src/t.ts\n+++ b/src/t.ts\n@@ -0,0 +1,6 @@\n+export interface A {\n+  x: number;\n+  y: string;\n+}\n+export type B = A[];\n+export const DEFAULT: B = [];\n";
      const source = { "src/t.ts": "export interface A {\n  x: number;\n  y: string;\n}\nexport type B = A[];\nexport const DEFAULT: B = [];\n" };
      expect(classify(patch, source, [report({ "src/t.ts": [[6, 1]] })]).files[0]).toMatchObject({ state: "run", executable: 1, covered: 1 });
      expect(classify(patch, source, [report({})]).files[0]).toMatchObject({ state: "not_run", executable: null });
    });

    it("one run file and one no_code file: measured, and the counts leave the no_code file out", () => {
      const result = classify(runFile + interfaceOnly, { ...runSource, "shared/ratings.ts": interfaceSource });
      expect(result).toMatchObject({ status: "measured", files_changed: 1, files_run: 1, files_not_run: 0, files_not_measured: 0, files_no_code: 1, lines_executable: 1, lines_covered: 1 });
      expect(result.reason).toBeUndefined();
      expect(coverageCell(result)).toBe("1/1 files, 1/1 lines");
    });

    it("one run file and one file not measured for another reason: still partial", () => {
      const vue = "diff --git a/src/App.vue b/src/App.vue\n--- a/src/App.vue\n+++ b/src/App.vue\n@@ -1 +1 @@\n-<p>a</p>\n+<p>b</p>\n";
      const result = classify(runFile + vue, { ...runSource, "src/App.vue": "<p>b</p>\n" });
      expect(result).toMatchObject({ status: "partial", reason: "1 file(s) not measured", files_changed: 2, files_run: 1, files_not_measured: 1, files_no_code: 0 });
    });

    it("every changed code file no_code: measured with zero files changed, whatever the reports, and nothing untested", () => {
      for (const reports of [[report({})], [], [{ label: "node-0 in .", language: "javascript" as const, ok: false as const, reason: "timed out" }]]) {
        const result = classify(interfaceOnly + commentOnly, { "shared/ratings.ts": interfaceSource, "backend/texting.ts": commentSource }, reports);
        expect(result).toMatchObject({ status: "measured", files_changed: 0, files_run: 0, files_not_run: 0, files_not_measured: 0, files_no_code: 2, lines_executable: 0, lines_covered: 0 });
        expect(result.reason).toBeUndefined();
        // The import rule flags both files; it is not consulted for no_code ones.
        const after = withFixCoverage({ ...validated, untested_files: ["backend/texting.ts"] }, result, ["backend/texting.ts", "shared/ratings.ts"]);
        expect(after.untested_files).toBeUndefined();
        expect(after.untested_files_source).toBe("coverage");
      }
    });

    it("the roomie US-3-T-2 shape: a run file plus a comment-only file the import rule flags → measured, nothing untested", () => {
      const result = classify(runFile + commentOnly, { ...runSource, "backend/texting.ts": commentSource });
      expect(result.status).toBe("measured");
      expect(deriveUntested(result, ["backend/texting.ts"])).toEqual({ untested: [], source: "coverage" });
    });
  });

  it("each not_measured rule is needed: without the failed report, src/b.ts is plainly not_run", () => {
    const result = classifyFixCoverage({ changed: new Map([["src/b.ts", [2]]]), code: code({ "src/b.ts": [2] }), reports: [report({})] });
    expect(result.files[0].state).toBe("not_run");
  });

  it("real build output: mapped through source maps it is credited to src/; without them the source file is not_measured", () => {
    const changed = new Map([["src/greet.ts", [1, 2, 5, 6]]]);
    const codeMap = new Map([["src/greet.ts", new Set([1, 2, 5, 6])]]);
    const mapped = classifyFixCoverage({ changed, code: codeMap, reports: [{ ...report({}), files: parseIstanbulReport(fixture("c8-dist-sourcemap-true-coverage-final.json"), "", changed) }] });
    expect(mapped.files[0]).toMatchObject({ state: "run", executable: 4, covered: 3, uncovered: "6" });
    const unmapped = classifyFixCoverage({
      changed, code: codeMap,
      reports: [{ ...report({}), files: parseIstanbulReport(fixture("c8-dist-sourcemap-false-coverage-final.json"), "", changed), generated: ["dist/greet.js"] }],
    });
    expect(unmapped.files[0]).toMatchObject({ state: "not_measured", executable: null });
  });

  it("unavailable when every report failed, or there was nothing to run", () => {
    const failed = classifyFixCoverage({
      changed: new Map([["src/a.ts", [1]]]), code: new Map(),
      reports: [{ label: "vitest-0 in .", language: "javascript", ok: false, reason: "coverage run failed: timed out" }],
    });
    expect(failed).toEqual({ ...unavailableCoverage("vitest-0 in .: coverage run failed: timed out", 1) });
    expect(failed.files).toEqual([]);
    expect(classifyFixCoverage({ changed: new Map(), code: new Map(), reports: [] })).toMatchObject({ status: "unavailable", reason: "no proving test file to run" });
  });

  it("compactRanges sorts, deduplicates and joins runs", () => {
    expect(compactRanges([40, 12, 13, 14, 15, 13, 7])).toBe("7,12-15,40");
    expect(compactRanges([])).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------
// 5. untested_files

describe("deriveUntested", () => {
  const coverage = (files: Array<[string, "run" | "not_run" | "not_measured"]>, status: FixCoverage["status"] = "measured"): FixCoverage => ({
    ...unavailableCoverage("x"), status, files: files.map(([path, state]) => ({ path, state, changed_lines: 1, executable: null, covered: null, uncovered: null })),
  });

  it("measured: the not_run files, source coverage", () => {
    expect(deriveUntested(coverage([["a.ts", "run"], ["b.ts", "not_run"]]), ["a.ts"])).toEqual({ untested: ["b.ts"], source: "coverage" });
  });

  it("partial: a not_measured file the import rule clears stays out; one it flags is listed; source mixed", () => {
    const cov = coverage([["a.ts", "not_run"], ["m1.vue", "not_measured"], ["m2.vue", "not_measured"]], "partial");
    expect(deriveUntested(cov, ["m2.vue"])).toEqual({ untested: ["a.ts", "m2.vue"], source: "mixed" });
    expect(deriveUntested(cov, [])).toEqual({ untested: ["a.ts"], source: "mixed" });
  });

  it("unavailable or not run: exactly the import rule's list", () => {
    expect(deriveUntested(unavailableCoverage("x"), ["b.ts", "a.ts"])).toEqual({ untested: ["a.ts", "b.ts"], source: "imports" });
    expect(deriveUntested(undefined, [])).toEqual({ untested: [], source: "imports" });
  });

  it("withFixCoverage: only fix_coverage, untested_files and untested_files_source change; an empty list is removed", () => {
    const before = { ...validated, untested_files: ["src/b.ts"] };
    const after = withFixCoverage(before, coverage([["src/b.ts", "run"]]), ["src/b.ts"]);
    expect(after.untested_files).toBeUndefined();
    expect(after.untested_files_source).toBe("coverage");
    const { fix_coverage, untested_files_source, untested_files, ...rest } = after;
    void fix_coverage; void untested_files_source; void untested_files;
    const { untested_files: _old, ...beforeRest } = before;
    void _old;
    expect(rest).toEqual(beforeRest);
  });

  it("withFixCoverage with no import rule (tree unreadable): unavailable keeps the list and source as they were", () => {
    const before = { ...validated, untested_files: ["src/b.ts"] };
    expect(withFixCoverage(before, unavailableCoverage("x"), null)).toMatchObject({ untested_files: ["src/b.ts"], untested_files_source: "imports" });
  });
});

// ---------------------------------------------------------------------------------------------
// 6. The six probe cases: the import rule's answer, then coverage's

describe("the probe cases: coverage reports that reflect what ran", () => {
  /** The import rule's list, and the coverage-derived one, for one case. */
  async function both(files: Record<string, string>, changed: Record<string, number[]>, provingTestFiles: string[], reports: ReportCoverage[], packageDir = "") {
    const read = tree(files);
    const importRule = await untestedFiles({ changedFiles: Object.keys(changed), provingTestFiles, read, packageDir });
    const cov = classifyFixCoverage({
      changed: new Map(Object.entries(changed)),
      code: new Map(Object.entries(changed).map(([p]) => [p, files[p] ? codeLines(p, files[p]) : null])),
      reports,
    });
    return { importRule, coverage: deriveUntested(cov, importRule).untested };
  }

  it("Express: the test imports the whole app and calls one of the two changed routes: missed, now flagged", async () => {
    const files = {
      "test/api.test.ts": `import app from "../src/app";\nimport request from "supertest";\n`,
      "src/app.ts": `import express from "express";\nimport a from "./routes/a";\nimport b from "./routes/b";\nconst app = express();\napp.use(a);\napp.use(b);\nexport default app;\n`,
      "src/routes/a.ts": `import { Router } from "express";\nconst r = Router();\nr.get("/a", (_q, res) => {\n  res.json({ a: 2 });\n});\nexport default r;\n`,
      "src/routes/b.ts": `import { Router } from "express";\nconst r = Router();\nr.get("/b", (_q, res) => {\n  res.json({ b: 2 });\n});\nexport default r;\n`,
    };
    const result = await both(files, { "src/routes/a.ts": [4], "src/routes/b.ts": [4] }, ["test/api.test.ts"],
      [report({ "src/routes/a.ts": [[1, 1], [2, 1], [3, 1], [4, 1]], "src/routes/b.ts": [[1, 1], [2, 1], [3, 1], [4, 0]] })]);
    expect(result).toEqual({ importRule: [], coverage: ["src/routes/b.ts"] });
  });

  it("a folder's index.ts re-exports two components; the test renders one: missed, now flagged", async () => {
    const files = {
      "src/components/ui.test.tsx": `import { Button } from ".";\n`,
      "src/components/index.ts": `export * from "./Button";\nexport * from "./Card";\n`,
      "src/components/Button.tsx": `export function Button() {\n  return <button>ok</button>;\n}\n`,
      "src/components/Card.tsx": `export function Card() {\n  return <div>card</div>;\n}\n`,
    };
    const result = await both(files, { "src/components/Button.tsx": [2], "src/components/Card.tsx": [2] }, ["src/components/ui.test.tsx"],
      [report({ "src/components/Button.tsx": [[1, 1], [2, 1]], "src/components/Card.tsx": [[1, 0], [2, 0]] })]);
    expect(result).toEqual({ importRule: [], coverage: ["src/components/Card.tsx"] });
  });

  it("pytest: a conftest.py fixture imports the changed module (real coverage.py output): false alarm, now cleared", async () => {
    const files = {
      "server/tests/test_greet.py": `def test_greet(greeter):\n    assert greeter("a") == "hello a"\n`,
      "server/tests/conftest.py": `import pytest\nfrom app import greet\n`,
      "server/app/__init__.py": "",
      "server/app/greet.py": `def greet(name):\n    # say hello\n    return f"hello {name}"\n\n\ndef shout(name):\n    return greet(name).upper()\n`,
    };
    const reports: ReportCoverage[] = [{ ...report({}, "python"), tool: "coverage.py 7.17.2", files: parseCoveragePyReport(fixture("coveragepy.json"), "server") }];
    const result = await both(files, { "server/app/greet.py": [1, 2, 3, 6, 7] }, ["server/tests/test_greet.py"], reports, "server");
    expect(result).toEqual({ importRule: ["server/app/greet.py"], coverage: [] });
  });

  it("an @/ alias defined only in vite.config.ts: false alarm, now cleared", async () => {
    const files = {
      "vite.config.ts": `export default { resolve: { alias: { "@": "/src" } } };\n`,
      "src/lib/format.test.ts": `import { fmt } from "@/lib/format";\n`,
      "src/lib/format.ts": `export const fmt = (n: number) => n.toFixed(2);\n`,
    };
    const result = await both(files, { "src/lib/format.ts": [1] }, ["src/lib/format.test.ts"], [report({ "src/lib/format.ts": [[1, 1]] })]);
    expect(result).toEqual({ importRule: ["src/lib/format.ts"], coverage: [] });
  });

  it("a changed file loaded by a Vitest setupFiles entry: false alarm, now cleared", async () => {
    const files = {
      "vitest.config.ts": `export default { test: { setupFiles: ["./test/setup-db.ts"] } };\n`,
      "test/books.test.ts": `import { expect, it } from "vitest";\n`,
      "test/setup-db.ts": `beforeAll(async () => {\n  await migrate();\n});\n`,
    };
    const result = await both(files, { "test/setup-db.ts": [2] }, ["test/books.test.ts"], [report({ "test/setup-db.ts": [[1, 1], [2, 1]] })]);
    expect(result).toEqual({ importRule: ["test/setup-db.ts"], coverage: [] });
  });

  it("a Next.js API route the test calls over HTTP: false alarm, now cleared", async () => {
    const files = {
      "tests/hello.test.ts": `const res = await fetch("http://localhost:3000/api/hello");\n`,
      "app/api/hello/route.ts": `export async function GET() {\n  return Response.json({ hi: 2 });\n}\n`,
    };
    const result = await both(files, { "app/api/hello/route.ts": [2] }, ["tests/hello.test.ts"], [report({ "app/api/hello/route.ts": [[1, 1], [2, 1]] })]);
    expect(result).toEqual({ importRule: ["app/api/hello/route.ts"], coverage: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// The coverage steps

const nodeEnv = (testSteps: Environment["testSteps"], extra: Partial<Environment> = {}): Environment => ({
  supported: true, runners: [...new Set(testSteps.map((s) => s.kind).filter((k) => k !== "prep"))] as Environment["runners"],
  packageManager: "pnpm", packageDir: "apps/api", installDir: "", installCommand: "corepack enable && pnpm install --frozen-lockfile",
  testSteps, env: { CI: "true" }, dockerfile: "FROM node:24-bookworm\n", image: "node:24-bookworm", nodeSource: ".nvmrc", services: [], installSteps: [], ...extra,
});
const POCKETWATCH_STEPS: Environment["testSteps"] = [
  { kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" },
  { kind: "prep", command: "pnpm build" },
  { kind: "node-test", command: "REPORT=$REPORT_DIR/node-2.json node --test --test-reporter=/patches/reporter.mjs tests/*.test.mjs" },
];

describe("coverageSteps", () => {
  it("PocketWatch: a node --test proving file runs under c8 with only that file; the Vitest step is dropped, the build kept", () => {
    const { steps, reports } = coverageSteps(nodeEnv(POCKETWATCH_STEPS), ["tests/session-cleanup.test.mjs"]);
    expect(reports).toEqual([{ tag: "node-2", kind: "node-test", files: ["tests/session-cleanup.test.mjs"] }]);
    expect(steps[0]).toBe(`mkdir -p ${COVERAGE_DIR}`);
    expect(steps[1]).toBe("pnpm build");
    expect(steps[2]).toContain("npm install --prefix /tmp/hecate-c8 --no-save --no-audit --no-fund c8@10.1.3");
    expect(steps[3]).toBe(`REPORT=$REPORT_DIR/node-2.json /tmp/hecate-c8/node_modules/.bin/c8 --reporter=json --report-dir=${COVERAGE_DIR}/node-2 --temp-directory=/tmp/hecate-c8-node-2 --allowExternal --exclude='**/node_modules/**' node --test --test-reporter=/patches/reporter.mjs 'tests/session-cleanup.test.mjs'`);
    expect(steps).toHaveLength(4);
  });

  it("PocketWatch: a Vitest proving file runs in the Vitest step with the provider at the repository's version; steps after it are dropped", () => {
    const { steps, reports } = coverageSteps(nodeEnv(POCKETWATCH_STEPS), ["src/auth/auth.service.spec.ts"]);
    expect(reports).toEqual([{ tag: "vitest-0", kind: "vitest", files: ["src/auth/auth.service.spec.ts"] }]);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toContain(`pnpm add -D @vitest/coverage-v8@"$VV"`);
    expect(steps[2]).toContain("--coverage.enabled=true --coverage.provider=v8 --coverage.reporter=json --coverage.reportsDirectory=$REPORT_DIR/coverage/vitest-0");
    expect(steps[2]).toContain(`--coverage.all=false') 'src/auth/auth.service.spec.ts'`);
  });

  it("Jest: its own --coverage, json reporter, only the proving paths", () => {
    const env = nodeEnv([{ kind: "jest", command: "npx jest --ci --json --outputFile=$REPORT_DIR/jest-0.json --passWithNoTests" }], { packageManager: "npm", packageDir: "" });
    const { steps } = coverageSteps(env, ["test/ui.test.js"]);
    expect(steps[2]).toBe(`npx jest --ci --json --outputFile=$REPORT_DIR/jest-0.json --passWithNoTests --coverage --coverageReporters=json --coverageDirectory=${COVERAGE_DIR}/jest-0 --coveragePathIgnorePatterns=/node_modules/ --runTestsByPath 'test/ui.test.js'`);
  });

  it("pytest: coverage.py installed the way pytest is, run with the run prefix and our rcfile", () => {
    const env: Environment = {
      ...nodeEnv([{ kind: "pytest", command: "PYTHONPATH=/patches REPORT=$REPORT_DIR/pytest-0.json uv run --no-sync python -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors" }]),
      runners: ["pytest"], packageManager: "uv", packageDir: "server",
    };
    const { steps } = coverageSteps(env, ["tests/test_prefs.py"]);
    expect(steps[1]).toContain("uv pip install --python /opt/venv/bin/python coverage");
    expect(steps[2]).toBe("PYTHONPATH=/patches REPORT=$REPORT_DIR/pytest-0.json uv run --no-sync python -m coverage run --rcfile=/patches/hecate_coveragerc -m pytest -p hecate_pytest_reporter -p no:cacheprovider --continue-on-collection-errors 'tests/test_prefs.py'");
    expect(steps[3]).toBe(`uv run --no-sync python -m coverage json --rcfile=/patches/hecate_coveragerc -q -o ${COVERAGE_DIR}/pytest-0.json`);
  });

  it("node --test path arguments: files, folders, globs, Node's defaults; flag values are not paths", () => {
    expect(nodeTestRuns(["tests/*.test.mjs"], "tests/a.test.mjs")).toBe(true);
    expect(nodeTestRuns(["\"backend_tests/*.test.ts\""], "backend_tests/ratings.test.ts")).toBe(true);
    expect(nodeTestRuns(["test/"], "test/unit/a.js")).toBe(true);
    expect(nodeTestRuns(["src/**/*.test.{js,ts}"], "src/x/y.test.ts")).toBe(true);
    expect(nodeTestRuns(["tests/*.test.mjs"], "src/a.spec.ts")).toBe(false);
    expect(nodeTestRuns([], "src/a.test.js")).toBe(true);
    expect(nodeTestRuns([], "src/a.spec.js")).toBe(false);
    expect(globRegex("**/*.test.ts").test("a.test.ts")).toBe(true);
    const { steps } = coverageSteps(nodeEnv([{ kind: "node-test", command: "REPORT=$REPORT_DIR/node-0.json node --import tsx --test --test-reporter=/patches/reporter.mjs test/" }]), ["test/a.test.ts"]);
    expect(steps[2]).toMatch(/ node --import tsx --test --test-reporter=\/patches\/reporter\.mjs 'test\/a\.test\.ts'$/);
  });

  it("suiteOfFile: same language, the deepest package folder holding the file", () => {
    const suites = [nodeEnv([], { packageDir: "" }), { ...nodeEnv([], { packageDir: "backend" }), runners: ["pytest"] as Environment["runners"] }, nodeEnv([], { packageDir: "web" })];
    expect(suiteOfFile(suites, "backend/tests/test_a.py")).toBe(1);
    expect(suiteOfFile(suites, "web/src/a.test.ts")).toBe(2);
    expect(suiteOfFile(suites, "tools/a.test.ts")).toBe(0);
  });

  it("the coverage plan runs in a clone made inside the container, from a read-only mount", () => {
    const plan: RunPlan = { repoDir: "/r", baseCommit: "abc", patch: "", testPatch: "", installDir: "", installCommand: "npm ci", packageDir: "", testSteps: ["true"], isolatedCheckout: true };
    expect(containerScript(plan, "r2")).toContain("set -e\ngit config --global --add safe.directory '*'\ngit clone -q --shared --no-checkout /src /work\ncd /work\ngit checkout -q -f abc\n");
    expect(containerScript({ ...plan, isolatedCheckout: undefined }, "r2")).not.toContain("/src");
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Failures: unavailable, with a reason; the verdict untouched

const ROW: TaskRow = {
  instance_id: "Team__App-T-1", repo: "team/app", base_commit: "28e92a1c0ffee0000000000000000000000000ab",
  patch: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n",
  test_patch: "diff --git a/src/a.test.ts b/src/a.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/a.test.ts\n@@ -0,0 +1 @@\n+test\n",
  FAIL_TO_PASS: [], PASS_TO_PASS: [],
};
const validated: ValidationResult = {
  ...rejectedWithoutRun(ROW, "env_error", ""), validation_status: "validated", reason: null as unknown as ValidationResult["reason"], detail: "a detail",
  image: "node:22-bookworm", package_dir: "", log_parser: "vitest-json", FAIL_TO_PASS: ["src/a.test.ts::adds"], PASS_TO_PASS: ["src/b.test.ts::keeps"],
  timings: { r0a: 1000 },
};
const VITEST_ENV = nodeEnv([{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }], { packageManager: "npm", packageDir: "", image: "node:22-bookworm" });
const ISTANBUL_A = JSON.stringify({ "/work/src/a.ts": { path: "/work/src/a.ts", statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } } }, s: { 0: 1 } } });
const GOOD_RUN: CoverageRun = { results: { "src/a.test.ts::adds": "passed" }, files: { "tool-vitest-0.txt": "vitest 4.1.12 (v8)\n", "vitest-0/coverage-final.json": ISTANBUL_A } };

describe("measureFixCoverage", () => {
  const measure = (runner: FakeSuiteRunner) => measureFixCoverage({
    row: ROW, result: validated, env: VITEST_ENV, runner, read: tree({ "src/a.ts": "export const a = 2;\n" }),
    plan: (suite) => suitePlan({ row: ROW, repoDir: "/repo" }, suite),
  });

  it("a good run: measured, through one isolated coverage plan with only the proving file", async () => {
    const runner = new FakeSuiteRunner({}, GOOD_RUN);
    expect(await measure(runner)).toMatchObject({ status: "measured", tools: ["vitest 4.1.12 (v8)"], files_run: 1, lines_covered: 1, lines_executable: 1 });
    expect(runner.calls).toEqual([]);
    expect(runner.coveragePlans).toHaveLength(1);
    expect(runner.coveragePlans[0]).toMatchObject({ isolatedCheckout: true, image: "node:22-bookworm", extraFiles: { hecate_coveragerc: expect.stringContaining("data_file = /tmp/hecate.coverage") } });
    expect(runner.coveragePlans[0].testSteps.at(-1)).toMatch(/ 'src\/a\.test\.ts'$/);
  });

  it("uses the result's image digest for the run", async () => {
    const runner = new FakeSuiteRunner({}, GOOD_RUN);
    await measureFixCoverage({
      row: ROW, result: { ...validated, image_digest: "node:22-bookworm@sha256:abc" }, env: VITEST_ENV, runner, read: tree({}),
      plan: (suite) => suitePlan({ row: ROW, repoDir: "/repo" }, suite),
    });
    expect(runner.coveragePlans[0].image).toBe("node:22-bookworm@sha256:abc");
  });

  const failures: Array<[string, CoverageRun | Error, string]> = [
    ["the install of the coverage tool", { results: GOOD_RUN.results, files: { "error-vitest-0.txt": "could not install @vitest/coverage-v8 at the repository's Vitest version\n" } }, "vitest-0 in .: could not install @vitest/coverage-v8 at the repository's Vitest version"],
    ["the repository's install", new InstallError("install failed in coverage: npm ERR! 404"), "vitest-0 in .: coverage run failed: install failed in coverage: npm ERR! 404"],
    ["a timeout", new ExecError("docker timed out after 900000 ms\nlast output", true), "vitest-0 in .: coverage run failed: docker timed out after 900000 ms"],
    ["a crash", new ExecError("docker run exited 137:\nKilled", false, 137), "vitest-0 in .: coverage run failed: docker run exited 137:"],
    ["an unreadable report", { ...GOOD_RUN, files: { "vitest-0/coverage-final.json": "{not json" } }, "vitest-0 in .: unreadable coverage report:"],
    ["no report", { results: GOOD_RUN.results, files: {} }, "vitest-0 in .: no coverage report written"],
    ["proving tests that did not pass", { ...GOOD_RUN, results: { "src/a.test.ts::adds": "failed" } }, "vitest-0 in .: the proving tests did not pass in the coverage run"],
  ];
  for (const [what, outcome, reason] of failures) {
    it(`${what}: unavailable with the reason; verdict, reason, detail and test lists untouched`, async () => {
      const coverage = await measure(new FakeSuiteRunner({}, outcome));
      expect(coverage.status).toBe("unavailable");
      expect(coverage.reason?.startsWith(reason)).toBe(true);
      const after = withFixCoverage({ ...validated, untested_files: ["src/z.ts"] }, coverage, ["src/z.ts"]);
      expect(after).toMatchObject({ validation_status: "validated", reason: null, detail: "a detail", FAIL_TO_PASS: validated.FAIL_TO_PASS, PASS_TO_PASS: validated.PASS_TO_PASS, untested_files: ["src/z.ts"], untested_files_source: "imports" });
    });
  }

  it("a runner without coverage support: unavailable", async () => {
    const runner = { runSuite: async () => ({}) };
    const coverage = await measureFixCoverage({ row: ROW, result: validated, env: VITEST_ENV, runner, read: tree({}), plan: (s) => suitePlan({ row: ROW, repoDir: "/r" }, s) });
    expect(coverage).toMatchObject({ status: "unavailable", reason: "this runner cannot run coverage" });
  });

  it("two suites: one per suite with a proving file; a failed one makes the result partial", async () => {
    const py: Environment = {
      ...nodeEnv([{ kind: "pytest", command: "PYTHONPATH=/patches REPORT=$REPORT_DIR/pytest-0.json python -m pytest -p hecate_pytest_reporter" }]),
      runners: ["pytest"], packageManager: "pip", packageDir: "backend", image: "python:3.12-bookworm",
    };
    const env: Environment = { ...VITEST_ENV, suites: [py, VITEST_ENV] };
    const row: TaskRow = { ...ROW, patch: ROW.patch + "diff --git a/backend/app/m.py b/backend/app/m.py\n--- a/backend/app/m.py\n+++ b/backend/app/m.py\n@@ -1 +1 @@\n-x = 1\n+x = 2\n" };
    const result = { ...validated, FAIL_TO_PASS: ["src/a.test.ts::adds", "backend/tests/test_m.py::test_x"] };
    const runner = new FakeSuiteRunner({}, (plan) => (plan.label === "python in backend" ? new InstallError("install failed in coverage (python in backend): pip") : GOOD_RUN));
    const coverage = await measureFixCoverage({ row, result, env, runner, read: tree({ "src/a.ts": "export const a = 2;\n", "backend/app/m.py": "x = 2\n" }), plan: (s) => suitePlan({ row, repoDir: "/r" }, s) });
    expect(runner.coveragePlans.map((p) => p.label)).toEqual(["python in backend", "javascript in ."]);
    expect(coverage).toMatchObject({ status: "partial", files_run: 1, files_not_measured: 1 });
    expect(coverage.reason).toContain("pytest-0 in backend: coverage run failed: install failed in coverage (python in backend): pip");
    expect(coverage.files.map((f) => [f.path, f.state])).toEqual([["backend/app/m.py", "not_measured"], ["src/a.ts", "run"]]);
  });
});

// ---------------------------------------------------------------------------------------------
// 8. --fix-coverage-only, with real git and a fake runner

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
let scratch = "";
let out = "";
let row: TaskRow;
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-fixcov-test-"));
  out = join(scratch, "batch");
  const repo = join(out, "repos", "team__app");
  await mkdir(join(repo, "src"), { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "app", scripts: { test: "vitest run" }, devDependencies: { vitest: "^4.0.0" } }) + "\n");
  await writeFile(join(repo, "package-lock.json"), "{}\n");
  await writeFile(join(repo, "src", "a.ts"), "export const a = 1;\n");
  await writeFile(join(repo, "src", "b.ts"), "export const b = 1;\n");
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  const base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  row = {
    ...ROW, base_commit: base,
    patch: ROW.patch + "diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-export const b = 1;\n+export const b = 2;\n",
    test_patch: "diff --git a/src/a.test.ts b/src/a.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/a.test.ts\n@@ -0,0 +1 @@\n+import { a } from \"./a\";\n",
  };
  await mkdir(join(out, "results"), { recursive: true });
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

describe("--fix-coverage-only (fixCoverageOnly)", () => {
  it("updates only fix_coverage, untested_files and untested_files_source of validated results; never runs the three states; skips the rest", async () => {
    const results = join(out, "results");
    const good = { ...validated, untested_files: ["src/b.ts"], harbor_gold: { status: "passed" as const, oracle: 1, nop: 0, reason: null, checked_at: "2026-11-11T10:00:00.000Z" } };
    const goodText = JSON.stringify(good, null, 2) + "\n";
    const rejected = JSON.stringify({ ...rejectedWithoutRun({ ...ROW, instance_id: "Team__App-T-2" }, "no_fail_to_pass", "x") }, null, 2) + "\n";
    const crashed = JSON.stringify({ ...rejectedWithoutRun({ ...ROW, instance_id: "Team__App-T-3" }, "env_error", "docker died") }, null, 2) + "\n";
    await writeFile(join(results, `${row.instance_id}.json`), goodText);
    await writeFile(join(results, "Team__App-T-2.json"), rejected);
    await writeFile(join(results, "Team__App-T-3.json"), crashed);

    const runner = new FakeSuiteRunner({}, GOOD_RUN);
    const logs: string[] = [];
    const ctx = batchRun({ out, snapshots: false, timeoutSeconds: 60, log: (l) => logs.push(l), runner });
    const rows = [row, { ...row, instance_id: "Team__App-T-2" }, { ...row, instance_id: "Team__App-T-3" }, { ...row, instance_id: "Team__App-T-4" }];
    const { measured, summary } = await fixCoverageOnly(ctx, rows);

    expect(runner.calls).toEqual([]);
    expect(runner.coveragePlans).toHaveLength(1);
    expect(measured.map((r) => r.instance_id)).toEqual([row.instance_id]);
    expect(await readFile(join(results, "Team__App-T-2.json"), "utf8")).toBe(rejected);
    expect(await readFile(join(results, "Team__App-T-3.json"), "utf8")).toBe(crashed);
    expect(logs).toEqual(expect.arrayContaining([
      "[2/4] Team__App-T-2: rejected (no_fail_to_pass), skipping",
      "[3/4] Team__App-T-3: rejected (env_error), skipping",
      "[4/4] Team__App-T-4: no result in the batch, skipping",
      "  fix coverage measured: 1/2 files, 1/1 lines",
    ]));

    const after = JSON.parse(await readFile(join(results, `${row.instance_id}.json`), "utf8")) as ValidationResult;
    const { fix_coverage, untested_files, untested_files_source, ...rest } = after;
    const { untested_files: _before, ...goodRest } = good;
    void _before;
    expect(rest).toEqual(goodRest);
    // src/b.ts was never loaded (the report has only src/a.ts): still untested, now from coverage.
    expect(untested_files).toEqual(["src/b.ts"]);
    expect(untested_files_source).toBe("coverage");
    expect(fix_coverage?.files.map((f) => [f.path, f.state])).toEqual([["src/a.ts", "run"], ["src/b.ts", "not_run"]]);
    // Key order kept: the existing keys where they were, the new ones at the end.
    expect(Object.keys(after).slice(0, Object.keys(good).length)).toEqual(Object.keys(good));

    expect(summary.rows.find((r) => r.instance_id === row.instance_id)?.coverage).toBe("1/2 files, 1/1 lines");
    expect(await readFile(join(out, "summary.md"), "utf8")).toContain("| 1/2 files, 1/1 lines |");
  });

  it("no checkout (no clone, no bundle): unavailable with the clone error, nothing else changed", async () => {
    const ctx = batchRun({ out: join(scratch, "empty"), snapshots: false, timeoutSeconds: 60, log: () => {}, runner: new FakeSuiteRunner({}, GOOD_RUN), git: { clone: async () => { throw new Error("clone failed: repository not found"); } } });
    const before = { ...validated, untested_files: ["src/z.ts"] };
    const after = await fixCoverageBatchRow(ctx, row, before, join(scratch, "empty", "logs"));
    expect(after.fix_coverage).toMatchObject({ status: "unavailable", reason: "no checkout: clone failed: repository not found" });
    expect(after).toMatchObject({ untested_files: ["src/z.ts"], untested_files_source: "imports", detail: "a detail" });
  });
});

// ---------------------------------------------------------------------------------------------
// 9. Write-back, 10. summary

describe("write-back from a coverage-derived list", () => {
  const measured: FixCoverage = { ...unavailableCoverage("x"), status: "measured", reason: undefined };
  const flagged = withFixCoverage({ ...validated, instance_id: "v-1" }, { ...measured, files: [{ path: "src/b.ts", state: "not_run", changed_lines: 1, executable: null, covered: null, uncovered: null }] }, []);
  const cleared = withFixCoverage({ ...validated, instance_id: "v-2", untested_files: ["src/b.ts"] }, { ...measured, files: [{ path: "src/b.ts", state: "run", changed_lines: 1, executable: 1, covered: 1, uncovered: "" }] }, ["src/b.ts"]);

  it("the flag is added for a non-empty list and removed for an empty one, the same in SQL and through the client", async () => {
    expect(managedFlags(flagged)).toEqual([UNTESTED_FILES_FLAG]);
    expect(managedFlags(cleared)).toEqual([]);
    const sql = writebackSql([flagged, cleared]);
    const [v1, v2] = sql.split("-- v-2:");
    expect(v1).toContain(`|| array[$hecate$${UNTESTED_FILES_FLAG}$hecate$]`);
    expect(v2).toContain(`and f <> '${UNTESTED_FILES_FLAG}'`);
    expect(v2).not.toContain(`array[$hecate$${UNTESTED_FILES_FLAG}`);

    const updates: Record<string, unknown> = {};
    const fake: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async () => ({ data: [{ flags: ["no_test_patch", UNTESTED_FILES_FLAG] }], error: null }) }; },
          update(values) { return { eq: async (_c: string, id: string) => { if (table === "cse_benchmark_task_sources") updates[id] = values.flags; return { error: null }; } }; },
        };
      },
    };
    const lines = await applyWriteback(fake, writebackPlan([flagged, cleared]), () => "2026-11-12T00:00:00Z");
    expect(updates).toEqual({ "v-1": ["no_test_patch", UNTESTED_FILES_FLAG], "v-2": ["no_test_patch"] });
    expect(lines[0]).toContain(`flagged ${UNTESTED_FILES_FLAG} (1)`);
  });
});

describe("summary", () => {
  it("a coverage column and a headline count; empty cells without a coverage run", () => {
    const partial: FixCoverage = { ...unavailableCoverage("x"), status: "partial", reason: "1 file(s) not measured", files_run: 3, files_changed: 5, lines_covered: 41, lines_executable: 60 };
    const results = [
      { ...validated, instance_id: "a", fix_coverage: { ...partial, status: "measured" as const } },
      { ...validated, instance_id: "b", fix_coverage: partial },
      { ...validated, instance_id: "c", fix_coverage: unavailableCoverage("timed out") },
      { ...validated, instance_id: "d" },
      rejectedWithoutRun({ ...ROW, instance_id: "e" }, "no_test_patch", ""),
    ];
    const summary = summarize(results);
    expect(summary.rows.map((r) => r.coverage)).toEqual(["3/5 files, 41/60 lines", "partial: 3/5 files, 41/60 lines", "unavailable", "", ""]);
    expect(summary.fixCoverage).toEqual({ measured: 1, partial: 1, unavailable: 1 });
    const md = summaryMarkdown(summary);
    expect(md.split("\n")[0]).toMatch(/; fix coverage: 1 measured, 1 partial, 1 unavailable$/);
    expect(md).toContain("| gold | coverage |");
    expect(md).toContain("| a | validated |  | 1 | 0 | 1 | 0 | 0 | 0 | 1 |  | 3/5 files, 41/60 lines |");
    expect(coverageCell(undefined)).toBe("");
    // The funnel is unchanged.
    expect(summary.funnel.at(-1)).toEqual({ stage: "validated", reached: 4, dropped: 0 });
  });

  it("no headline count when no row had a coverage run", () => {
    expect(summaryMarkdown(summarize([validated])).split("\n")[0]).toBe("1 validated, 0 rejected of 1");
  });
});
