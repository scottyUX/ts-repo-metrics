/**
 * Python cognitive complexity and Halstead metrics.
 *
 * Each follows one reference tool exactly so the numbers can be validated
 * against it (research/validation/python/):
 *
 * - Cognitive complexity follows complexipy (SonarSource's spec as applied to
 *   Python). Rules were derived shape by shape against complexipy 8.0.1.
 * - Halstead follows radon 6.0.1's HalsteadVisitor. radon counts far fewer
 *   operators and operands than the TS/JS scanner, so Python Halstead values
 *   are not comparable to TS/JS values.
 *
 * Both tools roll nested `def`s, lambdas, and nested classes into the
 * enclosing function, and both read only the function body (no decorators,
 * no default arguments). A nested function still gets its own score here,
 * computed over its own body.
 */

import type { SyntaxNode } from "tree-sitter";
import { halsteadFromAtoms } from "../halstead.js";
import type { HalsteadMetrics } from "../../types/report.js";

const COMPREHENSIONS = new Set([
  "list_comprehension",
  "set_comprehension",
  "dictionary_comprehension",
  "generator_expression",
]);

function unwrapParens(node: SyntaxNode): SyntaxNode {
  let n = node;
  while (n.type === "parenthesized_expression" && n.namedChildCount === 1) {
    n = n.namedChild(0)!;
  }
  return n;
}

/** Nearest ancestor that is not a parenthesized expression. */
function parentThroughParens(node: SyntaxNode): SyntaxNode | null {
  let p = node.parent;
  while (p && p.type === "parenthesized_expression") p = p.parent;
  return p;
}

function booleanOp(node: SyntaxNode): string {
  return node.childForFieldName("operator")?.text ?? "";
}

function functionBody(fnNode: SyntaxNode): SyntaxNode | null {
  return fnNode.childForFieldName("body");
}

/* ------------------------------------------------------------------ */
/*  Cognitive complexity (complexipy rules)                            */
/* ------------------------------------------------------------------ */

/**
 * complexipy's rules, as observed:
 * - +1 plus nesting: `if`, conditional expression, `for`, `while`, `except`,
 *   `match`, and each comprehension `for` clause.
 * - +1 flat: `elif`, `else` (of an `if`), comprehension `if` clauses, and each
 *   run of one boolean operator (`a and b and c` is 1, `a and b or c` is 2;
 *   parentheses are looked through, so `a or (b or c)` is 1).
 * - +1 once when the function calls itself by bare name.
 * - Nesting rises for the bodies of `if`/`elif`/`else`, loops, `match` cases,
 *   `except` bodies, conditional expressions, comprehensions, and lambdas. It
 *   does not rise for `with`, the `try` body, loop `else`, `try` `else`, or
 *   `finally`.
 * - A nested `def` raises nesting by one only when it is a direct statement of
 *   a function body, and not when that enclosing function is a decorator
 *   (its body is exactly a `def` and a `return`). A `def` inside an `if` or a
 *   loop, or a method of a nested class, does not raise nesting.
 *
 * complexipy does not look inside some expressions: keyword-argument values,
 * `await`, a call's callee, `*`/`**` unpacking, arithmetic and unary operands,
 * `not`, subscripts, and (except for nested `and`/`or`) boolean operands. So `g(x=1 if a else 2)` and
 * `sum(x for x in a) - 1` score 0 there. Sonar's spec counts those structures
 * wherever they appear, so they are counted here; the gap is reported as a
 * divergence in the validation. complexipy also adds 1 when `not` sits beside
 * mixed `and`/`or` groups (`(a or b) and not c` is 3 there, 2 by the spec);
 * the spec's count is used.
 * - `break`, `continue`, `raise`, `return`, `assert`, and `with` add nothing.
 */
export interface PythonCognitiveOptions {
  /**
   * Validation only: skip the expressions complexipy does not look inside,
   * to measure how much of the disagreement with complexipy that gap explains.
   */
  emulateComplexipyGaps?: boolean;
}

/** A function body of exactly a (possibly decorated) `def` and a `return`. */
function isDecoratorShaped(fnNode: SyntaxNode): boolean {
  const statements = fnNode.childForFieldName("body")?.namedChildren.filter((c) => c.type !== "comment") ?? [];
  if (statements.length !== 2) return false;
  const [first, second] = statements;
  const isDef =
    first?.type === "function_definition" ||
    (first?.type === "decorated_definition" && first.childForFieldName("definition")?.type === "function_definition");
  return isDef && second?.type === "return_statement";
}

/** True when a nested `def` raises nesting: it sits directly in a non-decorator function body. */
function nestedDefRaisesNesting(defNode: SyntaxNode): boolean {
  let container = defNode.parent;
  if (container?.type === "decorated_definition") container = container.parent;
  const enclosing = container?.type === "block" ? container.parent : null;
  return enclosing?.type === "function_definition" && !isDecoratorShaped(enclosing);
}

export function computePythonCognitiveComplexity(
  fnNode: SyntaxNode,
  options?: PythonCognitiveOptions,
): number {
  const emulateGaps = options?.emulateComplexipyGaps ?? false;
  const body = functionBody(fnNode);
  if (!body) return 0;
  const name = fnNode.childForFieldName("name")?.text;
  let score = 0;
  let recursive = false;

  function visitAll(nodes: (SyntaxNode | null)[], nesting: number): void {
    for (const n of nodes) if (n) visit(n, nesting);
  }

  function visitChildren(node: SyntaxNode, nesting: number): void {
    visitAll(node.namedChildren, nesting);
  }

  function visit(node: SyntaxNode, nesting: number): void {
    switch (node.type) {
      case "if_statement": {
        score += 1 + nesting;
        visitAll([node.childForFieldName("condition")], nesting);
        visitAll([node.childForFieldName("consequence")], nesting + 1);
        for (const alt of node.childrenForFieldName("alternative")) {
          score += 1;
          if (alt.type === "elif_clause") {
            visitAll([alt.childForFieldName("condition")], nesting);
          }
          visitAll([alt.childForFieldName("consequence") ?? alt.childForFieldName("body")], nesting + 1);
        }
        return;
      }
      case "for_statement":
      case "while_statement": {
        score += 1 + nesting;
        const loopBodyId = node.childForFieldName("body")?.id;
        for (const child of node.namedChildren) {
          if (child.type === "else_clause") visitAll([child.childForFieldName("body")], nesting);
          else if (child.id === loopBodyId) visit(child, nesting + 1);
          else visit(child, nesting);
        }
        return;
      }
      case "try_statement": {
        for (const child of node.namedChildren) {
          if (child.type === "block") {
            visit(child, nesting);
          } else if (child.type === "except_clause" || child.type === "except_group_clause") {
            score += 1 + nesting;
            for (const c of child.namedChildren) visit(c, c.type === "block" ? nesting + 1 : nesting);
          } else if (child.type === "else_clause") {
            visitAll([child.childForFieldName("body")], nesting);
          } else {
            // finally_clause
            visitChildren(child, nesting);
          }
        }
        return;
      }
      case "match_statement": {
        score += 1 + nesting;
        visitAll([node.childForFieldName("subject")], nesting);
        const cases = node.childForFieldName("body");
        for (const c of cases?.namedChildren ?? []) visitChildren(c, nesting + 1);
        return;
      }
      case "conditional_expression": {
        score += 1 + nesting;
        visitChildren(node, nesting + 1);
        return;
      }
      case "boolean_operator": {
        const parent = parentThroughParens(node);
        if (!(parent?.type === "boolean_operator" && booleanOp(parent) === booleanOp(node))) {
          score += 1;
        }
        if (emulateGaps) {
          for (const side of ["left", "right"]) {
            const operand = node.childForFieldName(side);
            if (operand && unwrapParens(operand).type === "boolean_operator") visit(unwrapParens(operand), nesting);
          }
          return;
        }
        visitChildren(node, nesting);
        return;
      }
      case "binary_operator":
      case "unary_operator":
      case "not_operator":
      case "subscript": {
        if (emulateGaps) return;
        visitChildren(node, nesting);
        return;
      }
      case "lambda": {
        visitChildren(node, nesting + 1);
        return;
      }
      case "keyword_argument":
      case "await": {
        if (emulateGaps) return;
        visitChildren(node, nesting);
        return;
      }
      case "call": {
        const fn = node.childForFieldName("function");
        if (name && fn?.type === "identifier" && fn.text === name) recursive = true;
        if (emulateGaps) {
          visitAll([node.childForFieldName("arguments")], nesting);
          return;
        }
        visitChildren(node, nesting);
        return;
      }
      case "list_splat":
      case "dictionary_splat": {
        if (emulateGaps) return;
        visitChildren(node, nesting);
        return;
      }
      default:
        if (COMPREHENSIONS.has(node.type)) {
          for (const child of node.namedChildren) {
            if (child.type === "for_in_clause") score += 1 + nesting;
            else if (child.type === "if_clause") score += 1;
            visit(child, nesting + 1);
          }
          return;
        }
        if (node.type === "decorated_definition") {
          visitAll([node.childForFieldName("definition")], nesting);
          return;
        }
        if (node.type === "function_definition") {
          visitAll([node.childForFieldName("body")], nestedDefRaisesNesting(node) ? nesting + 1 : nesting);
          return;
        }
        if (node.type === "class_definition") {
          visitAll([node.childForFieldName("body")], nesting);
          return;
        }
        visitChildren(node, nesting);
    }
  }

  visit(body, 0);
  return score + (recursive ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  Halstead (radon rules)                                             */
/* ------------------------------------------------------------------ */

function parsePythonNumber(text: string): number | null {
  const t = text.replace(/_/g, "").toLowerCase();
  if (/j$/.test(t)) return null;
  if (/^0[box]/.test(t)) return Number(t);
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** String literal value, or null for an f-string with interpolation. */
function stringValue(node: SyntaxNode): string | null {
  if (node.namedChildren.some((c) => c.type === "interpolation")) return null;
  const start = node.namedChildren.find((c) => c.type === "string_start")?.text.toLowerCase() ?? "";
  const body = node.namedChildren
    .filter((c) => c.type === "string_content" || c.type === "escape_sequence")
    .map((c) => c.text)
    .join("");
  return (start.includes("b") ? "bytes:" : "str:") + body;
}

/**
 * radon's operand identity: a name by its id, an attribute by its attribute
 * name only, a constant by its value, and any other expression as a distinct
 * object per occurrence. Keys are raw values, so the name `x`, the attribute
 * `.x`, and the string "x" are one operand, and `True == 1`, as in Python.
 */
function operandKey(raw: SyntaxNode, context: string): string {
  const node = unwrapParens(raw);
  const value = (() => {
    switch (node.type) {
      case "identifier":
        return `str:${node.text}`;
      case "attribute":
        return `str:${node.childForFieldName("attribute")?.text ?? node.text}`;
      case "integer":
      case "float": {
        const n = parsePythonNumber(node.text);
        return n === null ? null : `num:${n}`;
      }
      case "true":
        return "num:1";
      case "false":
        return "num:0";
      case "none":
        return "none";
      case "ellipsis":
        return "ellipsis";
      case "string":
        return stringValue(node);
      case "concatenated_string": {
        const parts = node.namedChildren.map(stringValue);
        return parts.some((p) => p === null) ? null : parts.join("");
      }
      default:
        return null;
    }
  })();
  return `${context}|${value ?? `obj:${node.id}`}`;
}

/** radon names `+=` after its operator, so `a += 1` and `a + b` share `+`. */
function augmentedOperatorName(text: string): string {
  return text.endsWith("=") ? text.slice(0, -1) : text;
}

export function computePythonHalstead(fnNode: SyntaxNode): HalsteadMetrics {
  const operators: string[] = [];
  const operands: string[] = [];
  const body = functionBody(fnNode);
  const rootContext = fnNode.childForFieldName("name")?.text ?? "(lambda)";

  function visit(node: SyntaxNode, context: string): void {
    switch (node.type) {
      case "binary_operator": {
        operators.push(node.childForFieldName("operator")?.text ?? "?");
        for (const side of ["left", "right"]) {
          const operand = node.childForFieldName(side);
          if (operand) operands.push(operandKey(operand, context));
        }
        break;
      }
      case "unary_operator":
      case "not_operator": {
        operators.push(node.type === "not_operator" ? "not" : `u${node.childForFieldName("operator")?.text ?? "?"}`);
        const arg = node.childForFieldName("argument") ?? node.namedChild(0);
        if (arg) operands.push(operandKey(arg, context));
        break;
      }
      case "boolean_operator": {
        // Python's AST folds an unparenthesized `a and b and c` into one BoolOp.
        const op = booleanOp(node);
        const parent = node.parent;
        if (parent?.type === "boolean_operator" && booleanOp(parent) === op) break;
        operators.push(op);
        const values: SyntaxNode[] = [];
        const collect = (n: SyntaxNode) => {
          if (n.type === "boolean_operator" && booleanOp(n) === op) {
            for (const side of ["left", "right"]) {
              const s = n.childForFieldName(side);
              if (s) collect(s);
            }
          } else {
            values.push(n);
          }
        };
        collect(node);
        for (const v of values) operands.push(operandKey(v, context));
        break;
      }
      case "comparison_operator": {
        for (const op of node.childrenForFieldName("operators")) operators.push(op.text);
        for (const operand of node.namedChildren) {
          if (operand.type === "line_continuation" || operand.type === "comment") continue;
          operands.push(operandKey(operand, context));
        }
        break;
      }
      case "augmented_assignment": {
        operators.push(augmentedOperatorName(node.childForFieldName("operator")?.text ?? "?"));
        for (const side of ["left", "right"]) {
          const operand = node.childForFieldName(side);
          if (operand) operands.push(operandKey(operand, context));
        }
        break;
      }
      case "decorated_definition": {
        const def = node.childForFieldName("definition");
        if (def) visit(def, context);
        return;
      }
      case "function_definition": {
        const inner = node.childForFieldName("body");
        if (inner) visit(inner, node.childForFieldName("name")?.text ?? context);
        return;
      }
      default:
        break;
    }
    for (const child of node.namedChildren) visit(child, context);
  }

  if (body) visit(body, rootContext);
  return halsteadFromAtoms({ operators, operands });
}
