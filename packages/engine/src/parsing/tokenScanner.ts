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
        case "string_fragment":
        case "template_string":
        case "template_substitution":
          addOperand("lit:string");
          break;
        case "number":
        case "regex":
          addOperand(`lit:${node.type}`);
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
