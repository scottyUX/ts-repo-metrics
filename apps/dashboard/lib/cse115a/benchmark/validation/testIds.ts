// Test ids for the validation pass: reading a Vitest or Jest JSON report into RunResults, and finding
// pre-existing tests whose body the test patch changed (compareRuns's `modified` set).
// Ids are `file::describe > test` (pytest: `file::Class::test`), the same shape extractTests.ts produces statically, so the
// verified lists line up with the row's unverified FAIL_TO_PASS. Pure: no Docker, no files.

import ts from "typescript";
import type { RunResults, TestStatus } from "@/lib/cse115a/benchmark/validation/compareRuns";

/** The parts of Vitest's `--reporter=json` output the validator reads; Jest's `--json` has the same shape. */
export type VitestReport = {
  testResults: Array<{
    name: string;
    /** Vitest's per-file status; "failed" with no assertion results means the file did not load. */
    status?: string;
    message?: string;
    assertionResults: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
    }>;
  }>;
};

/**
 * Suffix of the pseudo-id a run reports when a test file failed to load (an import that does not
 * exist yet, a syntax error). `compareRuns` treats every test of that file as failed in that state
 * and never classifies the pseudo-id itself.
 */
export const LOAD_FAILURE_SUFFIX = "::(load)";
export const loadFailureId = (file: string) => `${file}${LOAD_FAILURE_SUFFIX}`;

/** Builds the id used everywhere in the validator. */
export function testId(file: string, ancestors: string[], title: string): string {
  return `${file}::${[...ancestors, title].join(" > ")}`;
}

/**
 * Turns one Vitest or Jest JSON report into test id -> status. `mountPrefix` is the directory the
 * repo was mounted at in the container (`/work/`); it is stripped so ids match repo-relative paths.
 * Vitest reports `passed`, `failed`, `skipped`, `pending` and `todo`; Jest adds `disabled` (a skip)
 * and `focused` (an `it.only` that ran and passed). Everything but passed, failed and focused is a skip.
 */
export function parseVitestReport(report: VitestReport, mountPrefix = "/work/"): RunResults {
  const results: RunResults = {};
  for (const fileResult of report.testResults) {
    const file = fileResult.name.startsWith(mountPrefix) ? fileResult.name.slice(mountPrefix.length) : fileResult.name;
    for (const test of fileResult.assertionResults) {
      results[testId(file, test.ancestorTitles, test.title)] = toStatus(test.status);
    }
    if (fileResult.status === "failed" && fileResult.assertionResults.length === 0) results[loadFailureId(file)] = "failed";
  }
  return results;
}

function toStatus(status: string): TestStatus {
  if (status === "passed" || status === "focused") return "passed";
  if (status === "failed") return "failed";
  return "skipped";
}

/** The {id: status} map our node --test reporter and pytest plugin write; ids carry absolute container paths. */
export function parseNodeTestReport(report: Record<string, string>, mountPrefix = "/work/"): RunResults {
  const results: RunResults = {};
  for (const [id, status] of Object.entries(report)) {
    const key = id.startsWith(mountPrefix) ? id.slice(mountPrefix.length) : id;
    results[key] = status === "failed" ? "failed" : status === "skipped" ? "skipped" : "passed";
  }
  return results;
}

/** Static ids (from the diff) that no run reported: a name the regex misread, or a test that never loaded. */
export function unmatchedStaticIds(staticIds: string[], runs: RunResults[]): string[] {
  const seen = new Set(runs.flatMap((run) => Object.keys(run)));
  return staticIds.filter((id) => !seen.has(id)).sort();
}

const SUITE_NAMES = new Set(["describe", "context", "suite"]);
const TEST_NAMES = new Set(["it", "test"]);

/** `describe(...)`, `it.skip(...)` etc.: the bare callee name, or null for anything else. */
function calleeName(node: ts.CallExpression): string | null {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) return callee.expression.text;
  return null;
}

function firstStringArg(node: ts.CallExpression): string | null {
  const arg = node.arguments[0];
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return null;
}

/**
 * Every test in a Jest/Vitest file with the source text of its call expression, keyed by id.
 * Nested describes become `a > b > test`. Tests whose name is not a plain string are skipped,
 * because their ids cannot be known statically.
 */
export function testBodies(file: string, source: string): Map<string, string> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bodies = new Map<string, string>();
  const walk = (node: ts.Node, ancestors: string[]) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const title = name ? firstStringArg(node) : null;
      if (name && title !== null && SUITE_NAMES.has(name)) {
        node.forEachChild((child) => walk(child, [...ancestors, title]));
        return;
      }
      if (name && title !== null && TEST_NAMES.has(name)) {
        bodies.set(testId(file, ancestors, title), node.getText(sf));
        return;
      }
    }
    node.forEachChild((child) => walk(child, ancestors));
  };
  walk(sf, []);
  return bodies;
}

/**
 * Ids of tests present in both versions of a file whose source text differs: the test patch
 * rewrote them, so their R0 result is about a different body. Whitespace-only changes count,
 * because the validator cannot tell a reformat from a semantic edit without running it.
 */
export function modifiedTests(file: string, baseSource: string, patchedSource: string): string[] {
  if (/\.py$/i.test(file)) return modifiedPythonTests(file, baseSource, patchedSource);
  const before = testBodies(file, baseSource);
  const after = testBodies(file, patchedSource);
  const changed: string[] = [];
  for (const [id, body] of before) {
    const next = after.get(id);
    if (next !== undefined && next !== body) changed.push(id);
  }
  return changed.sort();
}

// ---------------------------------------------------------------------------------------------
// Python. No Python process and no parser dependency: tests are found by indentation, the way
// pytest's default collection names them. A `def test*` at the top level is `file::test`; one inside
// `class Test*` (nested classes too) is `file::Class::test`; a test inside a function is not collected.
// A body is the def line (and its decorators) up to the next statement at the same or lower indent.
// Triple-quoted strings, brackets and backslash continuations are tracked so their lines never
// count as indentation; a file where they do not balance, or that mixes tab and space indents, is
// unparseable.

export type PythonBodies = { bodies: Map<string, string>; parsed: boolean };

type Scope = { kind: "class" | "def"; name: string; indent: number; start: number; test: string | null };

const PY_HEADER = /^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/;

/** Every pytest-collected test in a Python file with its source text, keyed by id. */
export function pythonTestBodies(file: string, source: string): PythonBodies {
  const lines = source.split("\n");
  const bodies = new Map<string, string>();
  const stack: Scope[] = [];
  let parsed = true;
  let indentChar: string | null = null;
  let quote: string | null = null; // open string delimiter carried across lines
  let depth = 0;
  let continued = false;
  let lastCode = -1; // last physical line that belongs to a statement
  let decoratorStart: number | null = null;

  const close = (scope: Scope) => {
    if (scope.test) bodies.set(scope.test, lines.slice(scope.start, lastCode + 1).join("\n"));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const logicalStart = quote == null && depth === 0 && !continued;
    const trimmed = line.trim();
    if (logicalStart && trimmed && !trimmed.startsWith("#")) {
      const lead = line.slice(0, line.length - line.trimStart().length);
      for (const ch of lead) {
        indentChar ??= ch;
        if (ch !== indentChar) parsed = false;
      }
      const indent = lead.length;
      while (stack.length && stack[stack.length - 1].indent >= indent) close(stack.pop()!);
      if (trimmed.startsWith("@")) {
        decoratorStart ??= i;
      } else {
        const header = trimmed.match(PY_HEADER);
        if (header) {
          const [, kind, name] = header as unknown as [string, "def" | "class", string];
          const inDef = stack.some((s) => s.kind === "def");
          const classes = stack.map((s) => s.name);
          const collectable = !inDef && stack.every((s) => s.kind === "class" && s.name.startsWith("Test"));
          const test = kind === "def" && collectable && name.startsWith("test") ? [file, ...classes, name].join("::") : null;
          stack.push({ kind, name, indent, start: decoratorStart ?? i, test });
        }
        decoratorStart = null;
      }
    }
    // Scan the line for strings, comments, brackets and a trailing backslash.
    const code = quote != null || depth > 0 || continued || (trimmed !== "" && !trimmed.startsWith("#"));
    continued = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (quote != null) {
        if (ch === "\\") { j++; continue; }
        if (line.startsWith(quote, j)) { j += quote.length - 1; quote = null; }
        continue;
      }
      if (ch === "#") break;
      if (ch === "'" || ch === '"') {
        quote = line.startsWith(ch.repeat(3), j) ? ch.repeat(3) : ch;
        j += quote.length - 1;
      } else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) {
        depth--;
        if (depth < 0) { parsed = false; depth = 0; }
      } else if (ch === "\\" && j === line.length - 1) continued = true;
    }
    if (quote != null && quote.length === 1) {
      // A one-quote string only continues past the line end with a backslash.
      if (line.endsWith("\\")) continued = true;
      else { parsed = false; quote = null; }
    }
    if (code) lastCode = i;
  }
  if (quote != null || depth !== 0) parsed = false;
  while (stack.length) close(stack.pop()!);
  return { bodies, parsed };
}

/** Test ids by a plain line scan, for a file the indentation walk could not parse. */
function pythonTestIdsByScan(file: string, source: string): string[] {
  const ids: string[] = [];
  let className: string | null = null;
  for (const line of source.split("\n")) {
    const cls = line.match(/^class\s+(Test\w*)/);
    if (cls) { className = cls[1]; continue; }
    if (/^\S/.test(line) && !/^(#|@)/.test(line)) className = null;
    const def = line.match(/^(\s*)(?:async\s+)?def\s+(test\w*)/);
    if (!def) continue;
    if (def[1] === "") ids.push(`${file}::${def[2]}`);
    else if (className) ids.push(`${file}::${className}::${def[2]}`);
  }
  return ids;
}

/**
 * Pre-existing Python tests whose text the test patch changed. When either version cannot be
 * parsed, every test the base file has is treated as modified: those tests are then judged from
 * R1 alone, which never borrows R0 evidence for a body that may have changed.
 */
export function modifiedPythonTests(file: string, baseSource: string, patchedSource: string): string[] {
  const before = pythonTestBodies(file, baseSource);
  const after = pythonTestBodies(file, patchedSource);
  if (!before.parsed || !after.parsed) {
    return [...new Set([...before.bodies.keys(), ...(before.parsed ? [] : pythonTestIdsByScan(file, baseSource))])].sort();
  }
  const changed: string[] = [];
  for (const [id, body] of before.bodies) {
    const next = after.bodies.get(id);
    if (next !== undefined && next !== body) changed.push(id);
  }
  return changed.sort();
}
