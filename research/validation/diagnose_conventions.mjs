/**
 * Convention-attribution diagnostic.
 *
 * For each function, counts the specific syntactic constructs where our engine's
 * counting rules are known to differ from the baselines', so the divergence
 * measured in analyze.py can be ATTRIBUTED rather than guessed at:
 *
 *   else_clauses        our cyclomatic counts `else_clause`; McCabe/ts-complex do not
 *   empty_case_clauses  our cyclomatic counts every `switch_case`; ts-complex counts
 *                       only cases that carry statements (fall-through groups)
 *   unlabeled_jumps     our cognitive adds +1 per break/continue/throw at depth > 0;
 *                       Sonar increments only for jumps to a LABEL
 *   logical_sequences   Sonar adds +1 per run of like `&&`/`||` operators;
 *                       our cognitive has no logical-operator increment
 *   nested_fn_expr      `function_expression` nodes, which our engine does not
 *                       recognise as functions at all
 *
 * Reads the engine's parser but changes nothing. Emits JSON keyed by file:line.
 *
 * Usage: node diagnose_conventions.mjs <repoPath> <out.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loaded straight from the built engine so the diagnostic sees exactly the
// parse the engine sees, including its failures.
const ENGINE_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../packages/engine/dist/parsing/sourceParser.js',
);
const { parseSource } = await import(ENGINE_DIST);

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'out', 'coverage', '.git']);

function discover(root) {
  const found = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(abs);
      } else if (e.isFile() && /\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        found.push(path.relative(root, abs));
      }
    }
  })(root);
  return found.sort();
}

// Mirrors the engine's own sets; duplicated here so the diagnostic never writes
// to packages/engine.
const FUNCTION_NODE_TYPES = new Set([
  'function_declaration', 'generator_function_declaration', 'method_definition',
  'arrow_function', 'function', 'generator_function',
]);
const CONTROL_TYPES = new Set([
  'if_statement', 'for_statement', 'for_in_statement', 'while_statement',
  'do_statement', 'switch_statement', 'catch_clause', 'ternary_expression',
]);

/** Count constructs inside `fn`, not descending into nested functions. */
function countConstructs(fn) {
  const c = {
    else_clauses: 0,
    empty_case_clauses: 0,
    nonempty_case_clauses: 0,
    unlabeled_jumps: 0,
    logical_sequences: 0,
    nested_fn_expr: 0,
    switch_statements: 0,
  };
  const seenLogicalRoot = new Set();

  (function visit(node, depth, inNested) {
    if (node !== fn && FUNCTION_NODE_TYPES.has(node.type)) return;
    if (node !== fn && node.type === 'function_expression') {
      // Invisible to the engine, so it is NOT skipped: its contents leak into
      // the enclosing function's score. Count it, then keep descending exactly
      // as the engine would.
      c.nested_fn_expr += 1;
    }

    if (node.type === 'else_clause') c.else_clauses += 1;
    if (node.type === 'switch_statement') c.switch_statements += 1;
    if (node.type === 'switch_case') {
      const body = node.childForFieldName('body');
      let statements = 0;
      for (let i = 0; i < node.namedChildCount; i++) {
        const ch = node.namedChild(i);
        if (ch && ch !== node.childForFieldName('value')) statements += 1;
      }
      if (statements === 0 || (body && body.namedChildCount === 0)) c.empty_case_clauses += 1;
      else c.nonempty_case_clauses += 1;
    }

    const isControl = CONTROL_TYPES.has(node.type);
    const nextDepth = isControl ? depth + 1 : depth;

    if ((node.type === 'break_statement' || node.type === 'continue_statement' ||
         node.type === 'throw_statement') && depth > 0) {
      // A label makes it a jump Sonar also counts.
      const hasLabel = node.namedChildCount > 0 &&
        node.namedChild(0) && node.namedChild(0).type === 'statement_identifier';
      if (!hasLabel) c.unlabeled_jumps += 1;
    }

    // One increment per RUN of like logical operators, matching Sonar.
    if (node.type === 'binary_expression') {
      const op = node.childForFieldName('operator');
      const t = op ? op.text : '';
      if (t === '&&' || t === '||') {
        const parent = node.parent;
        const parentOp =
          parent && parent.type === 'binary_expression'
            ? (parent.childForFieldName('operator') || {}).text
            : null;
        if (parentOp !== t && !seenLogicalRoot.has(node.id)) {
          seenLogicalRoot.add(node.id);
          c.logical_sequences += 1;
        }
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const ch = node.namedChild(i);
      if (ch) visit(ch, nextDepth, inNested);
    }
  })(fn, 0, false);

  return c;
}

function main() {
  const [repoPath, outFile] = process.argv.slice(2);
  const root = path.resolve(repoPath);
  const out = {};
  let parseFailures = 0;

  for (const rel of discover(root)) {
    let code;
    try {
      code = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    let tree;
    try {
      tree = parseSource(code, rel.endsWith('.tsx') ? 'tsx' : 'ts');
    } catch {
      // The engine hits the same failure and skips the file entirely.
      parseFailures += 1;
      continue;
    }
    (function walk(node) {
      if (FUNCTION_NODE_TYPES.has(node.type)) {
        out[`${rel}:${node.startPosition.row + 1}`] = countConstructs(node);
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        const ch = node.namedChild(i);
        if (ch) walk(ch);
      }
    })(tree.rootNode);
  }

  fs.writeFileSync(outFile, JSON.stringify({ counts: out, parseFailures }));
  console.error(`    [diagnose] ${path.basename(root)} functions=${Object.keys(out).length} parseFailures=${parseFailures}`);
}

main();
