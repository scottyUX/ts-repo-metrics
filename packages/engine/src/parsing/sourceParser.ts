/**
 * Tree-sitter parser wrapper for TypeScript, TSX, JavaScript, and JSX.
 *
 * Selects the appropriate grammar by source flavor and returns the CST.
 */

import Parser from "tree-sitter";
import tsLang from "tree-sitter-typescript";
import jsLang from "tree-sitter-javascript";
import pyLang from "tree-sitter-python";

export type SourceFlavor = "ts" | "tsx" | "js" | "jsx" | "py";

export type TsFlavor = "ts" | "tsx";

/**
 * node-tree-sitter reads source through a fixed-size UTF-16 buffer whose default
 * is 32 * 1024 code units. Its chunked-read path does not work: any source at or
 * above 32,768 characters fails outright with `Invalid argument` rather than
 * being read in pieces, and the callback-based input form fails the same way
 * because it shares the same default buffer.
 *
 * The buffer size is ours to set, so we size it to the source. Anything smaller
 * silently loses whole files — see research/validation/findings.md (D9), where
 * four files and 197 functions vanished from every metric.
 */
function bufferSizeFor(code: string): number {
  return Math.max(32 * 1024, code.length + 1);
}

/**
 * Parse source code with the Tree-sitter grammar matching {@link SourceFlavor}.
 */
export function parseSource(code: string, flavor: SourceFlavor) {
  const parser = new Parser();
  switch (flavor) {
    case "tsx":
      parser.setLanguage(tsLang.tsx);
      break;
    case "ts":
      parser.setLanguage(tsLang.typescript);
      break;
    case "jsx":
      // tree-sitter-javascript has no JSX; TSX grammar parses JS+JSX.
      parser.setLanguage(tsLang.tsx);
      break;
    case "js":
      parser.setLanguage(jsLang);
      break;
    case "py":
      parser.setLanguage(pyLang);
      break;
  }
  return parser.parse(code, undefined, { bufferSize: bufferSizeFor(code) });
}

/** @deprecated Use {@link parseSource} with {@link sourceFlavorForPath}. */
export function parseTypeScript(code: string, flavor: TsFlavor) {
  return parseSource(code, flavor);
}
