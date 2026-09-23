/**
 * Language-specific Tree-sitter node sets.
 * Cyclomatic complexity is not comparable across languages: JavaScript counts
 * `else_clause` and Python does not.
 */

import {
  COMPLEXITY_BRANCH_TYPES,
  FUNCTION_NODE_TYPES,
  NESTING_NODE_TYPES,
} from "./constants.js";

export type SourceLanguage = "ecmascript" | "python";

export interface LanguageProfile {
  language: SourceLanguage;
  functionNodeTypes: ReadonlySet<string>;
  nestingNodeTypes: ReadonlySet<string>;
  complexityBranchTypes: ReadonlySet<string>;
}

const PYTHON_FUNCTION_NODE_TYPES = new Set([
  "function_definition",
  "lambda",
]);

/** `elif_clause` and `case_clause` are children of the statement that already nests. */
const PYTHON_NESTING_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "while_statement",
  "try_statement",
  "with_statement",
  "match_statement",
]);

/**
 * Statement-level McCabe points. `with_statement`, `assert`, and comprehension
 * `for_in_clause` / `if_clause` are not branches. This does not match radon.
 */
const PYTHON_COMPLEXITY_BRANCH_TYPES = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "while_statement",
  "except_clause",
  "conditional_expression",
  "case_clause",
]);

export const ECMASCRIPT_PROFILE: LanguageProfile = {
  language: "ecmascript",
  functionNodeTypes: FUNCTION_NODE_TYPES,
  nestingNodeTypes: NESTING_NODE_TYPES,
  complexityBranchTypes: COMPLEXITY_BRANCH_TYPES,
};

export const PYTHON_PROFILE: LanguageProfile = {
  language: "python",
  functionNodeTypes: PYTHON_FUNCTION_NODE_TYPES,
  nestingNodeTypes: PYTHON_NESTING_NODE_TYPES,
  complexityBranchTypes: PYTHON_COMPLEXITY_BRANCH_TYPES,
};

export function languageProfileForPath(filePath: string): LanguageProfile {
  return filePath.endsWith(".py") ? PYTHON_PROFILE : ECMASCRIPT_PROFILE;
}
