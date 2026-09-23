/**
 * Tree-sitter parser wrapper for TypeScript and TSX.
 *
 * Provides a single function that accepts raw source code and a flavor flag.
 * Pass "ts" only for `.ts` files. Pass "tsx" for `.tsx`, `.js`, `.jsx`,
 * `.mjs`, and `.cjs`: the TypeScript grammar treats JSX in a `.js` file as
 * a type argument and returns a single ERROR node.
 */

import Parser from "tree-sitter";
import tsLang from "tree-sitter-typescript";

export type TsFlavor = "ts" | "tsx";

export function parseTypeScript(code: string, flavor: TsFlavor) {
  const parser = new Parser();
  parser.setLanguage(flavor === "tsx" ? tsLang.tsx : tsLang.typescript);
  // node-tree-sitter's default buffer is 32 KiB; a longer string throws
  // "Invalid argument". The buffer must be larger than the string length.
  return parser.parse(code, undefined, { bufferSize: code.length + 1 });
}
