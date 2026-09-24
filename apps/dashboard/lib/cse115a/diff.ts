// Splits a unified git diff into source changes (`patch`) and test changes
// (`test_patch`), the way SWE-bench separates a fix from its tests.

export type DiffFile = { path: string; text: string };

/** Splits `git diff` output into one chunk per file, keyed by the new path. */
export function parseDiffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const starts = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  for (let index = 0; index < starts.length; index++) {
    const match = starts[index]!;
    const end = index + 1 < starts.length ? starts[index + 1]!.index : diff.length;
    const text = diff.slice(match.index, end);
    const path = text.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? match[2]!;
    files.push({ path: path === "/dev/null" ? match[1]! : path, text: text.endsWith("\n") ? text : `${text}\n` });
  }
  return files;
}

const TEST_DIR = /(^|\/)(__tests__|tests?|spec)\//i;
const JS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const PY_TEST_FILE = /(^|\/)(test_[^/]*\.py|[^/]*_test\.py|conftest\.py)$/i;

export function isTestPath(path: string): boolean {
  return JS_TEST_FILE.test(path) || PY_TEST_FILE.test(path) || TEST_DIR.test(path);
}

export type SplitPatch = { patch: string; testPatch: string; sourceFiles: string[]; testFiles: string[] };

export function splitPatch(diff: string): SplitPatch {
  const files = parseDiffFiles(diff);
  const tests = files.filter((file) => isTestPath(file.path));
  const sources = files.filter((file) => !isTestPath(file.path));
  return {
    patch: sources.map((file) => file.text).join(""),
    testPatch: tests.map((file) => file.text).join(""),
    sourceFiles: sources.map((file) => file.path),
    testFiles: tests.map((file) => file.path),
  };
}
