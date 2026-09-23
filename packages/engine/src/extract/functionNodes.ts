/**
 * Shared function-node helpers. Lives outside functionMetrics.ts and
 * complexity.ts so those modules do not import each other.
 */

import type { SyntaxNode } from "tree-sitter";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";

const JS_PARAM_TYPES = new Set([
  "required_parameter",
  "optional_parameter",
  "rest_parameter",
  "identifier",
]);

const PY_PARAM_TYPES = new Set([
  "identifier",
  "typed_parameter",
  "default_parameter",
  "typed_default_parameter",
  "list_splat_pattern",
  "dictionary_splat_pattern",
]);

/**
 * Name a function node. Assignment `left` is used only when it is an identifier,
 * so `f = lambda x: x` is `f` and `self.f = lambda` or `c, d = lambda` stay anonymous.
 */
export function getFunctionName(node: SyntaxNode): string {
  const nameChild = node.childForFieldName("name");
  if (nameChild) return nameChild.text;

  if (node.parent?.type === "variable_declarator") {
    const id = node.parent.childForFieldName("name");
    if (id) return id.text;
  }

  if (node.parent?.type === "pair") {
    const key = node.parent.childForFieldName("key");
    if (key) return key.text;
  }

  if (node.parent?.type === "assignment") {
    const left = node.parent.childForFieldName("left");
    if (left?.type === "identifier") return left.text;
  }

  return "(anonymous)";
}

/**
 * A method is a function_definition whose parent block's parent is class_definition,
 * or a decorated_definition sitting directly in that class body block.
 * `if X: def m(self)` inside a class is not a method.
 */
export function isPythonMethod(node: SyntaxNode): boolean {
  if (node.type !== "function_definition") return false;
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "block" && parent.parent?.type === "class_definition") {
    return true;
  }
  if (
    parent.type === "decorated_definition" &&
    parent.parent?.type === "block" &&
    parent.parent.parent?.type === "class_definition"
  ) {
    return true;
  }
  return false;
}

function pythonParameterName(child: SyntaxNode): string | null {
  if (child.type === "identifier") return child.text;
  if (
    child.type === "default_parameter" ||
    child.type === "typed_default_parameter"
  ) {
    return child.childForFieldName("name")?.text ?? null;
  }
  if (child.type === "typed_parameter") {
    const first = child.namedChild(0);
    return first?.type === "identifier" ? first.text : null;
  }
  return null;
}

export function countParameters(
  node: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;

  if (profile.language !== "python") {
    let count = 0;
    for (let i = 0; i < params.namedChildCount; i++) {
      const child = params.namedChild(i);
      if (child && JS_PARAM_TYPES.has(child.type)) count++;
    }
    return count;
  }

  return pythonCountedParameters(node).length;
}

/**
 * Python parameters that count toward `parameterCount`: real parameters, minus
 * a leading `self` / `cls` on a method.
 */
function pythonCountedParameters(node: SyntaxNode): SyntaxNode[] {
  const params = node.childForFieldName("parameters");
  if (!params) return [];
  const method = isPythonMethod(node);
  const out: SyntaxNode[] = [];
  let first = true;
  for (let i = 0; i < params.namedChildCount; i++) {
    const child = params.namedChild(i);
    if (!child || !PY_PARAM_TYPES.has(child.type)) continue;
    const isReceiver =
      first &&
      method &&
      (pythonParameterName(child) === "self" ||
        pythonParameterName(child) === "cls");
    first = false;
    if (isReceiver) continue;
    out.push(child);
  }
  return out;
}

/** Counted Python parameters that carry an annotation (`x: int`, `x: int = 1`, `*a: str`). */
export function countTypedParameters(node: SyntaxNode): number {
  return pythonCountedParameters(node).filter(
    (p) => p.type === "typed_parameter" || p.type === "typed_default_parameter",
  ).length;
}

/** True for a Python `def` with a `-> T` annotation. */
export function hasReturnAnnotation(node: SyntaxNode): boolean {
  return node.type === "function_definition" && node.childForFieldName("return_type") !== null;
}

/** True for `async def`. */
export function isAsyncFunction(node: SyntaxNode): boolean {
  return node.type === "function_definition" && node.child(0)?.type === "async";
}
