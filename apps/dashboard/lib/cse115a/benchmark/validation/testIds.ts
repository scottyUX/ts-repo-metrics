// Test ids for the validation pass: reading a Vitest JSON report into RunResults, and finding
// pre-existing tests whose body the test patch changed (compareRuns's `modified` set).
// Ids are `file::describe > test`, the same shape extractTests.ts produces statically, so the
// verified lists line up with the row's unverified FAIL_TO_PASS. Pure: no Docker, no files.

import ts from "typescript";
import type { RunResults, TestStatus } from "@/lib/cse115a/benchmark/validation/compareRuns";

/** The parts of Vitest's `--reporter=json` output the validator reads. */
export type VitestReport = {
  testResults: Array<{
    name: string;
    assertionResults: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
    }>;
  }>;
};

/** Builds the id used everywhere in the validator. */
export function testId(file: string, ancestors: string[], title: string): string {
  return `${file}::${[...ancestors, title].join(" > ")}`;
}

/**
 * Turns one Vitest JSON report into test id -> status. `mountPrefix` is the directory the repo
 * was mounted at in the container (`/work/`); it is stripped so ids match repo-relative paths.
 * Vitest reports `passed`, `failed`, `skipped`, `pending` and `todo`; the last three are skips.
 */
export function parseVitestReport(report: VitestReport, mountPrefix = "/work/"): RunResults {
  const results: RunResults = {};
  for (const fileResult of report.testResults) {
    const file = fileResult.name.startsWith(mountPrefix) ? fileResult.name.slice(mountPrefix.length) : fileResult.name;
    for (const test of fileResult.assertionResults) {
      results[testId(file, test.ancestorTitles, test.title)] = toStatus(test.status);
    }
  }
  return results;
}

function toStatus(status: string): TestStatus {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  return "skipped";
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
  const before = testBodies(file, baseSource);
  const after = testBodies(file, patchedSource);
  const changed: string[] = [];
  for (const [id, body] of before) {
    const next = after.get(id);
    if (next !== undefined && next !== body) changed.push(id);
  }
  return changed.sort();
}
