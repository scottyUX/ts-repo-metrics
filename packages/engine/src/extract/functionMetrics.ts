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
} from "../utils/constants.js";
import { SKIP, walkTree } from "../utils/astWalker.js";
import { median } from "../utils/math.js";
import {
  ECMASCRIPT_PROFILE,
  type LanguageProfile,
} from "../utils/languageProfile.js";
import { countCyclomaticBranchPoints } from "./complexity.js";
import {
  countParameters,
  countTypedParameters,
  getFunctionName,
  hasReturnAnnotation,
} from "./functionNodes.js";
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

const JSX_NODE_TYPES = new Set([
  "jsx_element",
  "jsx_self_closing_element",
  "jsx_fragment",
]);

export interface ExtractFunctionMetricsOptions {
  /** Relative path like `src/App.tsx`. */
  relativeFilePath?: string;
  /**
   * True for `.jsx` / `.tsx`, or when the file tree contains JSX.
   * Computed once per file by the caller. A `.tsx` file with no JSX is still in scope.
   */
  inReactScope?: boolean;
  /** Defaults to the ECMAScript profile. Python leaves Halstead, MI, and cognitive null. */
  languageProfile?: LanguageProfile;
}

/**
 * File is in the React pass when its extension is JSX/TSX or its tree contains JSX.
 * One walk for non-JSX extensions. Call once per file and reuse the boolean.
 */
export function computeInReactScope(
  relativeFilePath: string,
  root: SyntaxNode,
): boolean {
  if (relativeFilePath.endsWith(".jsx") || relativeFilePath.endsWith(".tsx")) {
    return true;
  }
  if (
    relativeFilePath.endsWith(".ts") ||
    relativeFilePath.endsWith(".py") ||
    relativeFilePath.endsWith(".ipynb")
  ) {
    return false;
  }
  let found = false;
  walkTree(root, {
    enter(node) {
      if (JSX_NODE_TYPES.has(node.type)) {
        found = true;
        return SKIP;
      }
      return undefined;
    },
  });
  return found;
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

/** True if function subtree contains JSX (TSX), excluding nested functions. */
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
  name: string,
  inReactScope: boolean,
  profile: LanguageProfile,
): boolean {
  if (!inReactScope) return false;
  return functionBodyContainsJsx(fnNode, profile) || isPascalCaseComponentName(name);
}

/**
 * Extract structural and Phase 2 metrics for every function in a syntax tree.
 */
export function extractFunctionMetrics(
  root: SyntaxNode,
  options?: ExtractFunctionMetricsOptions,
): FunctionMetricsResult {
  const inReactScope = options?.inReactScope ?? false;
  const profile = options?.languageProfile ?? ECMASCRIPT_PROFILE;
  const functions: FunctionDetail[] = [];

  walkTree(root, {
    enter(node) {
      if (profile.functionNodeTypes.has(node.type)) {
        const lines = node.endPosition.row - node.startPosition.row + 1;
        const name = getFunctionName(node);
        const branches = countCyclomaticBranchPoints(node, profile);
        const cyclomaticComplexity = 1 + branches;
        const lexical = profile.language === "python"
          ? null
          : {
              halstead: computeHalsteadForFunction(node),
              cognitiveComplexity: computeCognitiveComplexity(node),
            };
        const maintainabilityIndexGradAiRaw = lexical
          ? calculateMIGradAiRaw(
              lexical.halstead.volume,
              cyclomaticComplexity,
              lines,
            )
          : null;
        const maintainabilityIndexGradAiNorm = lexical
          ? normalizeMIGradAi(maintainabilityIndexGradAiRaw ?? 0)
          : null;

        const isReactComponent = computeIsReactComponent(
          node,
          name,
          inReactScope,
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
          halstead: lexical?.halstead ?? null,
          cognitiveComplexity: lexical?.cognitiveComplexity ?? null,
          maintainabilityIndexGradAiRaw,
          maintainabilityIndexGradAiNorm,
          isReactComponent,
          isMonolithic,
          ...(node.type === "function_definition"
            ? {
                typedParameterCount: countTypedParameters(node),
                hasReturnAnnotation: hasReturnAnnotation(node),
              }
            : {}),
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
