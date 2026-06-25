/**
 * Tree-sitter parser wrapper for TypeScript, TSX, JavaScript, and JSX.
 *
 * Selects the appropriate grammar by source flavor and returns the CST.
 */

import Parser from "tree-sitter";
import tsLang from "tree-sitter-typescript";
import jsLang from "tree-sitter-javascript";

export type SourceFlavor = "ts" | "tsx" | "js" | "jsx";

export type TsFlavor = "ts" | "tsx";

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
  }
  return parser.parse(code);
}

/** @deprecated Use {@link parseSource} with {@link sourceFlavorForPath}. */
export function parseTypeScript(code: string, flavor: TsFlavor) {
  return parseSource(code, flavor);
}
