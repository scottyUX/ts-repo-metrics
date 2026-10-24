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

/** Test folders: __tests__/, __mocks__/, test/, tests/, spec/, and helper folders like test-utils/ or testHelpers/. */
const TEST_DIR = /(^|\/)(__tests__|__mocks__|tests?|spec|tests?[-_]?(utils?|utilities|helpers?|support))\//i;
const JS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const PY_TEST_FILE = /(^|\/)(test_[^/]*\.py|[^/]*_test\.py|conftest\.py)$/i;
/**
 * JS/TS test helpers by name, in any folder: test-utils, testUtils, test_helpers, test-setup, test-support.
 * Only these helper words, so app code like test-card.tsx in a quiz app stays source.
 */
const JS_TEST_HELPER_FILE = /(^|\/)tests?[-_]?(utils?|utilities|helpers?|setup|support)\.[cm]?[jt]sx?$/i;
/** Test runner setup files: Create React App's `setupTests`, and `vitest.setup` / `jest.setup`. */
const JS_TEST_SETUP_FILE = /(^|\/)(setupTests|vitest\.setup|jest\.setup)\.[cm]?[jt]sx?$/i;

export function isTestPath(path: string): boolean {
  return JS_TEST_FILE.test(path) || JS_TEST_HELPER_FILE.test(path) || JS_TEST_SETUP_FILE.test(path)
    || PY_TEST_FILE.test(path) || TEST_DIR.test(path);
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
