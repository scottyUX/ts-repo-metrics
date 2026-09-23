/**
 * Silent failure patterns in Python `except` clauses.
 *
 * Mirrors the JS extractor: an `except` whose body does nothing (`pass`,
 * `...`, `continue`) is `empty_catch`; one whose body only prints or logs is
 * `console_only_catch`. Anything else in the body, including `raise`, is
 * treated as handling. Runs on every Python file, not only React scope.
 */

import type { SyntaxNode } from "tree-sitter";
import { walkTree } from "../../utils/astWalker.js";
import type { SilentFailureEvent } from "../../types/report.js";

const NO_OP_STATEMENTS = new Set(["pass_statement", "continue_statement"]);

const LOG_METHODS = new Set([
  "debug",
  "info",
  "warning",
  "warn",
  "error",
  "exception",
  "critical",
  "log",
]);

/** Receivers treated as loggers: `logging`, `logger`, `log`, `_logger`, `self.logger`, … */
const LOGGER_NAME_RE = /^_?(logging|logger|log|LOGGER|LOG)$/;

function isEllipsisStatement(node: SyntaxNode): boolean {
  return node.type === "expression_statement" && node.namedChild(0)?.type === "ellipsis";
}

function isLoggingCall(node: SyntaxNode): boolean {
  if (node.type !== "call") return false;
  const fn = node.childForFieldName("function");
  if (!fn) return false;
  if (fn.type === "identifier") return fn.text === "print";
  if (fn.type !== "attribute") return false;
  const method = fn.childForFieldName("attribute")?.text ?? "";
  const receiver = fn.childForFieldName("object");
  if (!receiver) return false;
  const receiverName =
    receiver.type === "attribute"
      ? receiver.childForFieldName("attribute")?.text ?? ""
      : receiver.text;
  if (receiverName === "traceback" && method === "print_exc") return true;
  return LOGGER_NAME_RE.test(receiverName) && LOG_METHODS.has(method);
}

function exceptBlock(clause: SyntaxNode): SyntaxNode | null {
  return clause.namedChildren.find((c) => c.type === "block") ?? null;
}

function classify(block: SyntaxNode | null): SilentFailureEvent["kind"] | null {
  const statements = block?.namedChildren.filter((c) => c.type !== "comment") ?? [];
  if (statements.every((s) => NO_OP_STATEMENTS.has(s.type) || isEllipsisStatement(s))) {
    return "empty_catch";
  }
  let logged = false;
  for (const s of statements) {
    if (NO_OP_STATEMENTS.has(s.type)) continue;
    if (s.type === "expression_statement" && isLoggingCall(s.namedChild(0) ?? s)) {
      logged = true;
      continue;
    }
    return null;
  }
  return logged ? "console_only_catch" : null;
}

export function extractPythonSilentFailures(
  root: SyntaxNode,
  relativePath: string,
): SilentFailureEvent[] {
  const events: SilentFailureEvent[] = [];
  walkTree(root, {
    enter(node) {
      if (node.type !== "except_clause") return;
      const kind = classify(exceptBlock(node));
      if (kind) {
        events.push({ file: relativePath, line: node.startPosition.row + 1, kind });
      }
    },
  });
  return events.sort((a, b) => a.line - b.line);
}
