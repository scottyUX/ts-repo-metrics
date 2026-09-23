/**
 * Per-file React / TSX metrics extraction and merge.
 */

import type { SyntaxNode } from "tree-sitter";
import {
  FERREIRA_COMPONENT_SLOC_THRESHOLD,
  FERREIRA_HOOK_COUNT_THRESHOLD,
  JSX_NESTING_TAMPERE_THRESHOLD,
} from "../../utils/constants.js";
import { walkTree } from "../../utils/astWalker.js";
import type {
  ReactComponentMetrics,
  ReactMetricsReport,
} from "../../types/report.js";
import {
  getFunctionLikeName,
  maxJsxDepthInSubtree,
  nodeContainsJsx,
} from "./astReactUtils.js";
import { analyzeHookSafetyInFunction } from "./hookSafety.js";
import {
  collectParamBindingNames,
  countPropPassThroughEdges,
} from "./propDrilling.js";

function countHookCalls(body: SyntaxNode): number {
  let n = 0;
  walkTree(body, {
    enter(node) {
      if (node.type !== "call_expression") return;
      const fn = node.childForFieldName("function") ?? node.namedChild(0);
      if (!fn) return;
      let name: string | null = null;
      if (fn.type === "identifier") name = fn.text;
      else if (fn.type === "member_expression") {
        const prop = fn.childForFieldName("property");
        if (prop) name = prop.text;
      }
      if (name && name.startsWith("use") && name.length > 3) n++;
    },
  });
  return n;
}

function functionBody(node: SyntaxNode): SyntaxNode | null {
  return node.childForFieldName("body");
}

function lineCount(node: SyntaxNode): number {
  const a = node.startPosition.row;
  const b = node.endPosition.row;
  return b - a + 1;
}

function collectComponents(root: SyntaxNode, file: string): ReactComponentMetrics[] {
  const out: ReactComponentMetrics[] = [];

  const visitFunction = (fnNode: SyntaxNode) => {
    const body = functionBody(fnNode);
    if (!body) return;
    if (!nodeContainsJsx(body)) return;

    const name = getFunctionLikeName(fnNode);
    const lines = lineCount(fnNode);
    const hookCount = countHookCalls(body);
    const hooksPerSloc = lines > 0 ? hookCount / lines : 0;
    const maxJsx = maxJsxDepthInSubtree(body);
    const ferreira =
      hookCount > FERREIRA_HOOK_COUNT_THRESHOLD && lines > FERREIRA_COMPONENT_SLOC_THRESHOLD;
    const tampere = maxJsx > JSX_NESTING_TAMPERE_THRESHOLD;

    const params = fnNode.childForFieldName("parameters");
    const paramNames = collectParamBindingNames(params);
    const propDrillingEdges = countPropPassThroughEdges(body, paramNames);
    const hookSafety = analyzeHookSafetyInFunction(body);

    out.push({
      name,
      file,
      startLine: fnNode.startPosition.row + 1,
      lines,
      hookCount,
      hooksPerSloc: Math.round(hooksPerSloc * 1000) / 1000,
      ferreiraLackOfCohesion: ferreira,
      maxJsxDepth: maxJsx,
      tampereJsxDepthExceeded: tampere,
      propDrillingEdges,
      hookSafety,
    });
  };

  walkTree(root, {
    enter(node) {
      if (node.type === "function_declaration") {
        visitFunction(node);
      }
      if (node.type === "variable_declarator") {
        const init = node.childForFieldName("value");
        if (
          init &&
          (init.type === "arrow_function" ||
            init.type === "function_expression")
        ) {
          visitFunction(init);
        }
      }
    },
  });

  return out;
}

export function extractReactMetricsFromTsx(
  root: SyntaxNode,
  relativeFile: string,
): ReactComponentMetrics[] {
  return collectComponents(root, relativeFile);
}

export function mergeReactMetricsReports(
  perFile: ReactComponentMetrics[][],
  tsxFilesAnalyzed: number,
): ReactMetricsReport {
  const components = perFile.flat();
  let ferreiraLackOfCohesionCount = 0;
  let tampereJsxDepthExceededCount = 0;
  let totalPropDrillingEdges = 0;
  let totalConditionalHookCalls = 0;
  let totalAsyncUseEffect = 0;
  let totalMissingOrInvalidDepsArray = 0;
  let totalNonPrimitiveDepRisk = 0;
  let maxJsxDepthRepo = 0;

  for (const c of components) {
    if (c.ferreiraLackOfCohesion) ferreiraLackOfCohesionCount++;
    if (c.tampereJsxDepthExceeded) tampereJsxDepthExceededCount++;
    totalPropDrillingEdges += c.propDrillingEdges;
    totalConditionalHookCalls += c.hookSafety.conditionalHookCalls;
    totalAsyncUseEffect += c.hookSafety.asyncUseEffect;
    totalMissingOrInvalidDepsArray += c.hookSafety.missingOrInvalidDepsArray;
    totalNonPrimitiveDepRisk += c.hookSafety.nonPrimitiveDepRisk;
    if (c.maxJsxDepth > maxJsxDepthRepo) maxJsxDepthRepo = c.maxJsxDepth;
  }

  return {
    components,
    summary: {
      tsxFilesAnalyzed,
      componentsAnalyzed: components.length,
      ferreiraLackOfCohesionCount,
      tampereJsxDepthExceededCount,
      totalPropDrillingEdges,
      totalConditionalHookCalls,
      totalAsyncUseEffect,
      totalMissingOrInvalidDepsArray,
      totalNonPrimitiveDepRisk,
      maxJsxDepthRepo,
    },
  };
}
