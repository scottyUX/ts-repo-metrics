/**
 * Flask and FastAPI route handlers.
 *
 * A handler is a decorated `def` whose decorator is a call like
 * `@app.get("/x")`, `@router.post("/x")`, `@app.route("/x")`, or
 * `@bp.route("/x", methods=["POST"])`. The first argument must be a string
 * path starting with `/` (or empty, for a router prefix), which keeps
 * `@mock.patch("pkg.mod")` and other decorators out.
 */

import type { SyntaxNode } from "tree-sitter";
import { walkTree, SKIP } from "../../utils/astWalker.js";
import { countCyclomaticBranchPoints } from "../complexity.js";
import { isAsyncFunction } from "../functionNodes.js";
import { PYTHON_PROFILE } from "../../utils/languageProfile.js";
import { LONG_FUNCTION_THRESHOLD } from "../../utils/constants.js";
import type { BackendMetrics, EndpointDetail } from "../../types/report.js";

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "options", "head"]);
const ROUTE_METHODS = new Set(["route", "api_route", "websocket"]);

/** Module-level calls that block the event loop inside `async def`. */
const BLOCKING_CALLS: Record<string, Set<string>> = {
  requests: new Set(["get", "post", "put", "delete", "patch", "head", "options", "request"]),
  httpx: new Set(["get", "post", "put", "delete", "patch", "head", "options", "request"]),
  time: new Set(["sleep"]),
  subprocess: new Set(["run", "call", "check_call", "check_output"]),
};

function stringValue(node: SyntaxNode | null | undefined): string | null {
  if (!node || node.type !== "string") return null;
  return node.namedChildren
    .filter((c) => c.type === "string_content")
    .map((c) => c.text)
    .join("");
}

interface RouteDecorator {
  methods: string[];
  path: string;
}

function parseRouteDecorator(decorator: SyntaxNode): RouteDecorator | null {
  const call = decorator.namedChild(0);
  if (call?.type !== "call") return null;
  const fn = call.childForFieldName("function");
  if (fn?.type !== "attribute") return null;
  const method = fn.childForFieldName("attribute")?.text ?? "";
  const receiver = fn.childForFieldName("object")?.text ?? "";
  if (receiver === "mock" || receiver.endsWith(".mock")) return null;
  if (!HTTP_METHODS.has(method) && !ROUTE_METHODS.has(method)) return null;

  const args = call.childForFieldName("arguments");
  const positional = args?.namedChildren.filter((a) => a.type !== "keyword_argument") ?? [];
  const routePath = stringValue(positional[0]);
  if (routePath === null || (routePath !== "" && !routePath.startsWith("/"))) return null;

  if (HTTP_METHODS.has(method)) return { methods: [method.toUpperCase()], path: routePath };
  if (method === "websocket") return { methods: ["WEBSOCKET"], path: routePath };

  const methodsArg = args?.namedChildren.find(
    (a) => a.type === "keyword_argument" && a.childForFieldName("name")?.text === "methods",
  );
  const listed = methodsArg?.childForFieldName("value")?.namedChildren
    .map((n) => stringValue(n))
    .filter((m): m is string => Boolean(m))
    .map((m) => m.toUpperCase());
  return { methods: listed && listed.length > 0 ? listed : ["ROUTE"], path: routePath };
}

function countBlockingCalls(fnNode: SyntaxNode): number {
  let count = 0;
  walkTree(fnNode, {
    enter(node) {
      if (node !== fnNode && PYTHON_PROFILE.functionNodeTypes.has(node.type)) return SKIP;
      if (node.type !== "call") return undefined;
      const fn = node.childForFieldName("function");
      if (fn?.type !== "attribute") return undefined;
      const receiver = fn.childForFieldName("object");
      const method = fn.childForFieldName("attribute")?.text ?? "";
      if (receiver?.type === "identifier" && BLOCKING_CALLS[receiver.text]?.has(method)) {
        count++;
      }
      return undefined;
    },
  });
  return count;
}

export function extractEndpoints(root: SyntaxNode, relativePath: string): EndpointDetail[] {
  const endpoints: EndpointDetail[] = [];
  walkTree(root, {
    enter(node) {
      if (node.type !== "decorated_definition") return;
      const fnNode = node.childForFieldName("definition");
      if (fnNode?.type !== "function_definition") return;
      const route = node.namedChildren
        .filter((c) => c.type === "decorator")
        .map(parseRouteDecorator)
        .find((r): r is RouteDecorator => r !== null);
      if (!route) return;
      const isAsync = isAsyncFunction(fnNode);
      endpoints.push({
        file: relativePath,
        handler: fnNode.childForFieldName("name")?.text ?? "(anonymous)",
        methods: route.methods,
        path: route.path,
        startLine: fnNode.startPosition.row + 1,
        lines: fnNode.endPosition.row - fnNode.startPosition.row + 1,
        cyclomaticComplexity: 1 + countCyclomaticBranchPoints(fnNode, PYTHON_PROFILE),
        isAsync,
        blockingCalls: isAsync ? countBlockingCalls(fnNode) : 0,
      });
    },
  });
  return endpoints.sort((a, b) => a.startLine - b.startLine);
}

export function summarizeEndpoints(endpoints: EndpointDetail[]): BackendMetrics | undefined {
  if (endpoints.length === 0) return undefined;
  const n = endpoints.length;
  const fatHandlers = endpoints.filter((e) => e.lines > LONG_FUNCTION_THRESHOLD).length;
  const cc = endpoints.map((e) => e.cyclomaticComplexity);
  const round3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    endpoints,
    summary: {
      endpointCount: n,
      asyncEndpoints: endpoints.filter((e) => e.isAsync).length,
      fatHandlers,
      fatHandlerShare: round3(fatHandlers / n),
      averageHandlerComplexity: Math.round((cc.reduce((a, b) => a + b, 0) / n) * 10) / 10,
      maxHandlerComplexity: Math.max(...cc),
      blockingCallsInAsync: endpoints.reduce((sum, e) => sum + e.blockingCalls, 0),
      asyncHandlersWithBlockingCalls: endpoints.filter((e) => e.blockingCalls > 0).length,
    },
  };
}
