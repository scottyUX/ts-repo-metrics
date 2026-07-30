/**
 * A standalone model of SonarSource's cognitive-complexity spec, used to TEST a
 * hypothesis about the real rule. This is analysis only -- it does not touch and
 * is not wired into packages/engine.
 *
 * The spec (Campbell, "Cognitive Complexity: A new way of measuring
 * understandability") separates three things our engine currently conflates:
 *
 *   B1  flat increment   +1 for if, else if, else, ternary, switch, loops, catch
 *   B3  nesting increment  +currentNesting, applied ONLY to: if, ternary, switch,
 *                          loops, catch -- NOT to `else if` and NOT to `else`
 *   B2  nesting level    raised by if, else if, else, ternary, switch, loops,
 *                        catch, and nested functions -- so the BODY of an
 *                        `else if`/`else` is one level deeper
 *
 * If this model reproduces SonarJS on every fixture, the hypothesis about what
 * our engine gets wrong is supported by the spec rather than by curve-fitting.
 *
 * Usage: node spec_model.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALIDATION = path.resolve(HERE, '..');
const ROOT = path.resolve(VALIDATION, '../..');
const require = createRequire(path.join(VALIDATION, 'noop.cjs'));

const { Linter } = require('eslint');
const sonarjs = require('eslint-plugin-sonarjs');
const tseslint = require('typescript-eslint');
const parser = await import(path.join(ROOT, 'packages/engine/dist/parsing/sourceParser.js'));
const engine = await import(path.join(ROOT, 'packages/engine/dist/extract/functionMetrics.js'));

const FUNCTION_TYPES = new Set([
  'function_declaration', 'function_expression', 'arrow_function',
  'method_definition', 'generator_function', 'generator_function_declaration',
]);

// B3: takes a nesting increment. Note the absence of else/else-if.
const NESTING_INCREMENT_TYPES = new Set([
  'if_statement', 'for_statement', 'for_in_statement', 'while_statement',
  'do_statement', 'switch_statement', 'catch_clause', 'ternary_expression',
]);

const isElseIfLink = (n) =>
  n.namedChildCount === 1 && n.namedChild(0)?.type === 'if_statement';

/**
 * Model score for one function subtree.
 *
 * `nesting` is the B2 nesting level. `asElseIfLink` marks an if_statement that
 * is the `if` of an `else if` -- it still gets its flat +1 but, per B3, no
 * nesting increment.
 */
function specScore(fnNode) {
  let score = 0;

  function visit(node, nesting, asElseIfLink = false) {
    if (node !== fnNode && FUNCTION_TYPES.has(node.type)) return;

    if (NESTING_INCREMENT_TYPES.has(node.type)) {
      // B1 flat +1, plus B3 nesting increment -- except for an `else if` link,
      // which per spec takes the flat +1 only.
      score += 1 + (asElseIfLink ? 0 : nesting);

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;

        if (child.type === 'else_clause') {
          if (isElseIfLink(child)) {
            // `else if`: flat +1 (asElseIfLink suppresses the B3 increment).
            // Pass `nesting` UNCHANGED, not nesting+1: the link's body ends up
            // at nesting+1 via the generic child descent below, i.e. the SAME
            // level as the leading `if`'s body. A chain does not deepen as it
            // extends. (Passing nesting+1 here puts the body one level too deep
            // and over-scores `if`s inside an `else if` body.)
            visit(child.namedChild(0), nesting, true);
          } else {
            // terminal `else`: B1 flat +1, no nesting increment (B3), but it
            // DOES raise the nesting level for its body (B2).
            score += 1;
            visit(child, nesting + 1);
          }
          continue;
        }
        // B2: the body of this structure is one level deeper.
        visit(child, nesting + 1);
      }
      return;
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, nesting, false);
    }
  }

  visit(fnNode, 0);
  return score;
}

function sonarScores(code, ext) {
  const linter = new Linter({ configType: 'flat' });
  const msgs = linter.verify(code, [{
    files: ['**/*.{ts,tsx}'],
    plugins: { sonarjs },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: { 'sonarjs/cognitive-complexity': ['error', 0] },
  }], 'probe' + ext);
  const byLine = new Map();
  for (const m of msgs) {
    if (m.ruleId !== 'sonarjs/cognitive-complexity') continue;
    const hit = /Cognitive Complexity from (\d+) to the \d+ allowed/.exec(m.message);
    if (hit) byLine.set(m.line, Number(hit[1]));
  }
  return byLine;
}

const dirs = [path.join(HERE, 'fixtures'), path.join(VALIDATION, 'fixtures')];
const rows = [];
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    const ext = path.extname(f);
    const sonar = sonarScores(code, ext);
    const tree = parser.parseSource(code, ext === '.tsx' ? 'tsx' : 'ts');
    const ours = engine.extractFunctionMetrics(tree.rootNode, { relativeFilePath: f });

    // Re-walk to reach the same function nodes the engine reported.
    const fnNodes = [];
    (function walk(n) {
      if (FUNCTION_TYPES.has(n.type)) fnNodes.push(n);
      for (let i = 0; i < n.namedChildCount; i++) walk(n.namedChild(i));
    })(tree.rootNode);

    for (const fn of ours.functions) {
      const node = fnNodes.find((n) => n.startPosition.row + 1 === fn.startLine);
      if (!node) continue;
      rows.push({
        label: `${path.basename(dir)}/${f}:${fn.startLine} ${fn.name ?? '@anon'}`,
        engine: fn.cognitiveComplexity,
        model: specScore(node),
        sonar: sonar.get(fn.startLine) ?? 0,
      });
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('fixture function', 48), 'engine  model  sonar   engineOK modelOK');
console.log('-'.repeat(86));
let eOK = 0, mOK = 0;
for (const r of rows) {
  const e = r.engine === r.sonar, m = r.model === r.sonar;
  if (e) eOK++;
  if (m) mOK++;
  console.log(pad(r.label, 48), pad(r.engine, 7), pad(r.model, 6), pad(r.sonar, 7),
    pad(e ? 'ok' : 'MISMATCH', 8), m ? 'ok' : 'MISMATCH');
}
console.log('-'.repeat(86));
console.log(`current engine matches sonarjs on ${eOK}/${rows.length}`);
console.log(`spec model    matches sonarjs on ${mOK}/${rows.length}`);
