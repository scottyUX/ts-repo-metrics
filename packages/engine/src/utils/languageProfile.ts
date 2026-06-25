/**
 * Language-specific Tree-sitter node classification for multi-language analysis.
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
  cognitiveControlTypes: ReadonlySet<string>;
  jumpTypes: ReadonlySet<string>;
}

const ECMASCRIPT_COGNITIVE_CONTROL = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "catch_clause",
  "ternary_expression",
]);

const ECMASCRIPT_JUMP_TYPES = new Set([
  "break_statement",
  "continue_statement",
  "throw_statement",
]);

const PYTHON_FUNCTION_NODE_TYPES = new Set([
  "function_definition",
  "lambda",
]);

const PYTHON_NESTING_NODE_TYPES = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "while_statement",
  "try_statement",
  "with_statement",
]);

const PYTHON_COMPLEXITY_BRANCH_TYPES = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "while_statement",
  "except_clause",
  "conditional_expression",
]);

const PYTHON_COGNITIVE_CONTROL = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "while_statement",
  "try_statement",
  "except_clause",
  "conditional_expression",
]);

const PYTHON_JUMP_TYPES = new Set([
  "break_statement",
  "continue_statement",
  "raise_statement",
]);

/** Default profile for TypeScript, TSX, JavaScript, and JSX. */
export const ECMASCRIPT_PROFILE: LanguageProfile = {
  language: "ecmascript",
  functionNodeTypes: FUNCTION_NODE_TYPES,
  nestingNodeTypes: NESTING_NODE_TYPES,
  complexityBranchTypes: COMPLEXITY_BRANCH_TYPES,
  cognitiveControlTypes: ECMASCRIPT_COGNITIVE_CONTROL,
  jumpTypes: ECMASCRIPT_JUMP_TYPES,
};

/** Profile for Python source files. */
export const PYTHON_PROFILE: LanguageProfile = {
  language: "python",
  functionNodeTypes: PYTHON_FUNCTION_NODE_TYPES,
  nestingNodeTypes: PYTHON_NESTING_NODE_TYPES,
  complexityBranchTypes: PYTHON_COMPLEXITY_BRANCH_TYPES,
  cognitiveControlTypes: PYTHON_COGNITIVE_CONTROL,
  jumpTypes: PYTHON_JUMP_TYPES,
};

/** Resolve the analysis profile for a discovered source file path. */
export function languageProfileForPath(filePath: string): LanguageProfile {
  return filePath.endsWith(".py") ? PYTHON_PROFILE : ECMASCRIPT_PROFILE;
}
