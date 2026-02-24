/**
 * Tree-sitter parser wrapper for TypeScript and TSX.
 *
 * Provides a single function that accepts raw source code and a flavor flag
 * ("ts" or "tsx"), configures a Tree-sitter parser with the corresponding
 * grammar, and returns the concrete syntax tree (CST).
 */

import Parser from "tree-sitter";
import tsLang from "tree-sitter-typescript";

export type TsFlavor = "ts" | "tsx";

export function parseTypeScript(code: string, flavor: TsFlavor) {
  const parser = new Parser();
  parser.setLanguage(flavor === "tsx" ? tsLang.tsx : tsLang.typescript);
  return parser.parse(code);
}
