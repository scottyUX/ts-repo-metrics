import { parseDiffFiles, isTestPath } from "@/lib/cse115a/diff";

// Static test IDs for tests added in a diff, used as unverified FAIL_TO_PASS.
// Jest/Vitest: `file::describe > it`. pytest: `file::test_name` or
// `file::Class::test_name`. A later Docker run replaces these with verified IDs.

type Line = { text: string; added: boolean };

/** Hunks of a file diff as new-file lines (context and added; removed lines dropped), with each hunk's header context. */
function hunks(fileText: string): Array<{ header: string; lines: Line[] }> {
  const result: Array<{ header: string; lines: Line[] }> = [];
  let current: { header: string; lines: Line[] } | null = null;
  for (const raw of fileText.split("\n")) {
    const header = raw.match(/^@@ [^@]* @@ ?(.*)$/);
    if (header) {
      current = { header: header[1] ?? "", lines: [] };
      result.push(current);
    } else if (current && (raw.startsWith("+") || raw.startsWith(" "))) {
      current.lines.push({ text: raw.slice(1), added: raw.startsWith("+") });
    }
  }
  return result;
}

const JS_DESCRIBE = /\b(?:describe|context|suite)(?:\.(?:only|skip|concurrent))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const JS_TEST = /\b(?:it|test)(?:\.(?:only|skip|concurrent|todo|failing))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

function braceDelta(text: string): number {
  const code = text.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "").replace(/\/\/.*$/, "");
  return (code.match(/\{/g)?.length ?? 0) - (code.match(/\}/g)?.length ?? 0);
}

export function extractJsTests(path: string, fileText: string): string[] {
  const ids: string[] = [];
  for (const hunk of hunks(fileText)) {
    // Brace depth restarts per hunk; describes opened before the hunk are not known.
    const stack: Array<{ name: string; depth: number }> = [];
    let depth = 0;
    for (const line of hunk.lines) {
      const describe = line.text.match(JS_DESCRIBE);
      const test = describe ? null : line.text.match(JS_TEST);
      if (describe) stack.push({ name: describe[2]!, depth });
      if (test && line.added) ids.push(`${path}::${[...stack.map((item) => item.name), test[2]!].join(" > ")}`);
      depth += braceDelta(line.text);
      while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    }
  }
  return ids;
}

const PY_CLASS = /^class\s+(Test\w*)\s*[(:]/;
const PY_TEST = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/;

export function extractPyTests(path: string, fileText: string): string[] {
  const ids: string[] = [];
  for (const hunk of hunks(fileText)) {
    let className = hunk.header.match(PY_CLASS)?.[1] ?? null;
    let methodIndent: number | null = null; // Set by the first method seen; deeper defs are nested helpers.
    for (const line of hunk.lines) {
      const cls = line.text.match(PY_CLASS);
      if (cls) { className = cls[1]!; methodIndent = null; continue; }
      if (/^\S/.test(line.text)) className = null;
      const def = line.text.match(/^(\s*)(?:async\s+)?def\s/);
      if (def && className && def[1]!.length > 0) methodIndent ??= def[1]!.length;
      const test = line.text.match(PY_TEST);
      if (!test || !line.added) continue;
      const indent = test[1]!.length;
      if (indent === 0) ids.push(`${path}::${test[2]}`);
      else if (className && indent === methodIndent) ids.push(`${path}::${className}::${test[2]}`);
    }
  }
  return ids;
}

/** Test IDs added by a diff, in file order, without duplicates. Deleted files contribute nothing. */
export function extractAddedTests(diff: string): string[] {
  const ids: string[] = [];
  for (const file of parseDiffFiles(diff)) {
    if (!isTestPath(file.path) || /^\+\+\+ \/dev\/null$/m.test(file.text)) continue;
    if (/\.py$/i.test(file.path)) ids.push(...extractPyTests(file.path, file.text));
    else if (/\.[cm]?[jt]sx?$/i.test(file.path)) ids.push(...extractJsTests(file.path, file.text));
  }
  return [...new Set(ids)];
}
