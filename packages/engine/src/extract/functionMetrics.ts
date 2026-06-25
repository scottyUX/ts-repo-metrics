/**
 * Function-level structural metrics extractor.
 *
 * For every function-like AST node in a file, computes line count, maximum
 * nesting depth, parameter count, cyclomatic complexity, Halstead metrics,
 * cognitive complexity, GRAD-AI MI (raw + normalized), and React component heuristic.
 */

import type { SyntaxNode } from "tree-sitter";
import {
  LONG_FUNCTION_THRESHOLD,
  FERREIRA_COMPONENT_SLOC_THRESHOLD,
  isJsxPath,
} from "../utils/constants.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";
import { SKIP, walkTree } from "../utils/astWalker.js";
import { median } from "../utils/math.js";
import { countCyclomaticBranchPoints } from "./complexity.js";
import { computeHalsteadForFunction } from "./halstead.js";
import { computeCognitiveComplexity } from "./cognitiveComplexity.js";
import { calculateMIGradAiRaw, normalizeMIGradAi } from "../utils/metrics.js";
import type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionMetricsResult,
} from "../types/report.js";

export type {
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionMetricsResult,
} from "../types/report.js";

export interface ExtractFunctionMetricsOptions {
  /** Relative path like `src/App.tsx` — used for `isReactComponent` when `.tsx`. */
  relativeFilePath?: string;
  profile?: LanguageProfile;
}

/**
 * Derive a human-readable name for a function node.
 */
function getFunctionName(node: SyntaxNode): string {
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

  return "(anonymous)";
}

function countParameters(node: SyntaxNode, profile: LanguageProfile): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  let count = 0;
  for (let i = 0; i < params.namedChildCount; i++) {
    const child = params.namedChild(i);
    if (!child) continue;
    if (profile.language === "python") {
      if (
        child.type === "identifier" ||
        child.type === "default_parameter" ||
        child.type === "typed_parameter" ||
        child.type === "typed_default_parameter" ||
        child.type === "list_splat_pattern" ||
        child.type === "dictionary_splat_pattern"
      ) {
        count++;
      }
    } else if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter" ||
      child.type === "rest_parameter" ||
      child.type === "identifier"
    ) {
      count++;
    }
  }
  return count;
}

function maxNesting(
  node: SyntaxNode,
  currentDepth: number,
  profile: LanguageProfile,
): number {
  const depth = profile.nestingNodeTypes.has(node.type)
    ? currentDepth + 1
    : currentDepth;

  let max = depth;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      const childMax = maxNesting(child, depth, profile);
      if (childMax > max) max = childMax;
    }
  }
  return max;
}

/** True if function subtree contains JSX (TSX/JSX), excluding nested functions. */
function functionBodyContainsJsx(
  fnNode: SyntaxNode,
  profile: LanguageProfile,
): boolean {
  let found = false;
  walkTree(fnNode, {
    enter(node) {
      if (node !== fnNode && profile.functionNodeTypes.has(node.type)) {
        return SKIP;
      }
      if (
        node.type === "jsx_element" ||
        node.type === "jsx_self_closing_element" ||
        node.type === "jsx_fragment"
      ) {
        found = true;
        return SKIP;
      }
      return undefined;
    },
  });
  return found;
}

function isPascalCaseComponentName(name: string): boolean {
  return name !== "(anonymous)" && /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function computeIsReactComponent(
  fnNode: SyntaxNode,
  relativeFilePath: string | undefined,
  name: string,
  profile: LanguageProfile,
): boolean {
  if (profile.language !== "ecmascript") return false;
  if (!relativeFilePath || !isJsxPath(relativeFilePath)) return false;
  return isPascalCaseComponentName(name) || functionBodyContainsJsx(fnNode, profile);
}

/**
 * Extract structural and Phase 2 metrics for every function in a syntax tree.
 */
export function extractFunctionMetrics(
  root: SyntaxNode,
  options?: ExtractFunctionMetricsOptions,
): FunctionMetricsResult {
  const relativeFilePath = options?.relativeFilePath;
  const profile = options?.profile ?? ECMASCRIPT_PROFILE;
  const functions: FunctionDetail[] = [];

  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        const lines = node.endPosition.row - node.startPosition.row + 1;
        const name = getFunctionName(node);
        const branches = countCyclomaticBranchPoints(node, profile);
        const cyclomaticComplexity = 1 + branches;
        const halstead = computeHalsteadForFunction(node, profile);
        const cognitiveComplexity = computeCognitiveComplexity(node, profile);
        const maintainabilityIndexGradAiRaw = calculateMIGradAiRaw(
          halstead.volume,
          cyclomaticComplexity,
          lines,
        );
        const maintainabilityIndexGradAiNorm = normalizeMIGradAi(
          maintainabilityIndexGradAiRaw,
        );

        const isReactComponent = computeIsReactComponent(
          node,
          relativeFilePath,
          name,
          profile,
        );
        const isMonolithic =
          isReactComponent && lines > FERREIRA_COMPONENT_SLOC_THRESHOLD;

        functions.push({
          name,
          type: node.type,
          startLine: node.startPosition.row + 1,
          lines,
          maxNestingDepth: maxNesting(node, 0, profile),
          parameterCount: countParameters(node, profile),
          cyclomaticComplexity,
          halstead,
          cognitiveComplexity,
          maintainabilityIndexGradAiRaw,
          maintainabilityIndexGradAiNorm,
          isReactComponent,
          isMonolithic,
        });
      }
    },
  });

  const lengths = functions.map((f) => f.lines).sort((a, b) => a - b);
  const totalFunctions = functions.length;
  const averageLength =
    totalFunctions > 0
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / totalFunctions) * 10) /
        10
      : 0;
  const maxNestingDepth = functions.reduce(
    (max, f) => Math.max(max, f.maxNestingDepth),
    0,
  );
  const longCount = functions.filter((f) => f.lines > LONG_FUNCTION_THRESHOLD)
    .length;
  const longFunctionPercentage =
    totalFunctions > 0
      ? Math.round((longCount / totalFunctions) * 1000) / 10
      : 0;

  return {
    functions,
    summary: {
      totalFunctions,
      averageLength,
      medianLength: median(lengths),
      maxNestingDepth,
      longFunctionPercentage,
    },
  };
}
