/**
 * Halstead-style operator/operand collection from a function subtree.
 */

import type { SyntaxNode } from "tree-sitter";
import { SKIP, walkTree } from "../utils/astWalker.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";

export interface HalsteadAtomLists {
  operators: string[];
  operands: string[];
}

const CONTROL_OP: Record<string, string> = {
  if_statement: "ctrl:if",
  else_clause: "ctrl:else",
  for_statement: "ctrl:for",
  for_in_statement: "ctrl:for_in",
  while_statement: "ctrl:while",
  do_statement: "ctrl:do",
  switch_statement: "ctrl:switch",
  switch_case: "ctrl:case",
  switch_default: "ctrl:default",
  catch_clause: "ctrl:catch",
  try_statement: "ctrl:try",
  ternary_expression: "ctrl:ternary",
  return_statement: "stmt:return",
  throw_statement: "stmt:throw",
  break_statement: "stmt:break",
  continue_statement: "stmt:continue",
  await_expression: "expr:await",
  yield_expression: "expr:yield",
  new_expression: "expr:new",
  delete_expression: "expr:delete",
  import_statement: "mod:import",
  export_statement: "mod:export",
  elif_clause: "ctrl:elif",
  except_clause: "ctrl:except",
  with_statement: "ctrl:with",
  conditional_expression: "ctrl:conditional",
  raise_statement: "stmt:raise",
};

export function collectHalsteadAtoms(
  fnNode: SyntaxNode,
  profile: LanguageProfile = ECMASCRIPT_PROFILE,
): HalsteadAtomLists {
  const operators: string[] = [];
  const operands: string[] = [];

  const addOp = (key: string) => {
    operators.push(key);
  };
  const addOperand = (key: string) => {
    operands.push(key);
  };

  walkTree(fnNode, {
    enter(node) {
      if (node !== fnNode && profile.functionNodeTypes.has(node.type)) {
        return SKIP;
      }

      if (profile.language === "ecmascript" && node.type === "arrow_function") {
        addOp("op:=>");
      }

      const ctrl = CONTROL_OP[node.type];
      if (ctrl) {
        addOp(ctrl);
      }

      if (profile.language === "python") {
        switch (node.type) {
          case "boolean_operator":
            addOp(`op:${node.text.includes("and") ? "and" : "or"}`);
            break;
          case "identifier":
            addOperand(`id:${node.text}`);
            break;
          case "integer":
          case "float":
            addOperand(`lit:${node.type}`);
            break;
          case "true":
          case "false":
          case "none":
            addOperand(`lit:${node.type}`);
            break;
          // NOTE: Python literals deliberately still collapse by KIND, not by
          // value — the same defect that was fixed on the ECMAScript path
          // below. escomplex is JS-only, so there is no baseline to validate a
          // Python change against, and Python is out of scope for this paper.
          // Left unchanged on purpose; do not "fix" without a baseline.
          case "string":
            addOperand("lit:string");
            break;
          default:
            break;
        }
        return undefined;
      }

      switch (node.type) {
        case "binary_expression": {
          const op = node.childForFieldName("operator");
          if (op) {
            const t = op.text;
            if (t === "??") addOp("op:??");
            else addOp(`op:${t}`);
          }
          break;
        }
        case "unary_expression": {
          const op = node.childForFieldName("operator");
          if (op) addOp(`uop:${op.text}`);
          break;
        }
        case "update_expression": {
          const op = node.childForFieldName("operator");
          if (op) addOp(`upd:${op.text}`);
          break;
        }
        case "member_expression": {
          addOp("op:.");
          if (node.childForFieldName("optional_chain")) addOp("op:?.");
          break;
        }
        case "subscript_expression": {
          addOp("op:[]");
          if (node.childForFieldName("optional_chain")) addOp("op:?.");
          break;
        }
        case "spread_element":
          addOp("op:...");
          break;
        case "identifier":
          addOperand(`id:${node.text}`);
          break;
        case "private_property_identifier":
          addOperand(`id:#${node.text}`);
          break;
        case "string":
          // Halstead operand identity is the literal VALUE, not the literal
          // kind. Collapsing every string to one atom compressed n2 (distinct
          // operands) and therefore Halstead volume. escomplex, the baseline
          // research/validation compares against, keys operands by value:
          // "alpha"/"beta" are two operands, "same" repeated is one.
          addOperand(`lit:str:${node.text}`);
          break;
        case "string_fragment":
          // A plain string's fragment is already counted by the `string` case
          // above; emitting here as well double-counted every string literal in
          // N2. Inside a template literal there is no enclosing `string` node,
          // and escomplex counts each fragment as its own operand, so that is
          // the only case that emits here.
          if (node.parent?.type === "template_string") {
            addOperand(`lit:str:${node.text}`);
          }
          break;
        case "template_string":
          // No operand for the wrapper itself: escomplex emits operands for the
          // fragments and for the substituted expressions, not for the template.
          break;
        case "template_substitution":
          // The substituted expression is walked and counted on its own.
          break;
        case "number":
          addOperand(`lit:num:${node.text}`);
          break;
        case "regex":
          addOperand(`lit:re:${node.text}`);
          break;
        case "true":
        case "false":
        case "null":
        case "undefined":
          addOperand(`lit:${node.type}`);
          break;
        case "this":
        case "super":
          addOperand(node.type);
          break;
        default:
          break;
      }

      return undefined;
    },
  });

  return { operators, operands };
}
