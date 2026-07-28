/**
 * Baseline metric collection for the metric-validity study.
 *
 * Emits, for one repository, a JSON document containing:
 *   - `inventory`: the canonical function inventory (see below)
 *   - `tsComplex`:  cyclomatic complexity records   (ts-complex, TS compiler API)
 *   - `sonar`:      cognitive complexity records    (eslint-plugin-sonarjs)
 *   - `escomplex`:  Halstead records, raw + transpiled (typhonjs-escomplex)
 *
 * THE CANONICAL INVENTORY
 * -----------------------
 * The join needs a single, tool-independent answer to "which functions exist and
 * where". We build that from the typescript-eslint AST: a typed parse that is
 * independent of BOTH our engine's Tree-sitter CST and of each baseline's own
 * parser, so it does not privilege either side of any comparison. Every
 * function-like node becomes one inventory row with a canonical name, a start
 * line, and a structural category.
 *
 * Measurements from our engine and from the three baselines are attached to
 * inventory rows positionally in analyze.py. Records that fail to attach, and
 * inventory rows no tool reported, are both preserved as results.
 *
 * NOTHING HERE TUNES, FILTERS, OR WINDOWS ANY VALUE.
 *
 * Usage: node collect_baselines.mjs <repoPath> <repoName> <outFile.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Linter } from 'eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import escomplex from 'typhonjs-escomplex';
import * as babel from '@babel/core';

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ */
/*  ts-complex patch: carry node positions through its output keys      */
/* ------------------------------------------------------------------ */

/**
 * ts-complex keys its results by function NAME only, so results have no line
 * numbers and same-named functions overwrite each other. We swap out its name
 * utility for one that also emits the node position. Its complexity ALGORITHM
 * is untouched — only the shape of the output key changes.
 */
const nameUtilPath = require.resolve('ts-complex/lib/src/utilities/name.utility.js');
require(nameUtilPath);
require.cache[nameUtilPath].exports = (node) => {
  const ts = require('typescript');
  const { name, pos, end } = node;
  const n = name !== undefined && ts.isIdentifier(name) ? name.text : null;
  return JSON.stringify({ n, pos, end });
};
const tsComplex = require('ts-complex');
const ts = require('typescript');

/* ------------------------------------------------------------------ */
/*  File discovery — mirrors the engine's SOURCE/IGNORE patterns        */
/* ------------------------------------------------------------------ */

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', 'out', 'coverage', '.git',
]);

/**
 * All `.ts`/`.tsx` files under `root`, repo-relative, sorted.
 *
 * Dot-directories are skipped to match the engine, whose fast-glob discovery
 * runs with the default `dot: false`. This also keeps this study's own working
 * directories (`.corpus/`, `.work/`) out of the self-analysis of this repo.
 *
 * `.d.ts` files are excluded: they are declaration-only and contain no function
 * bodies for any tool to measure.
 */
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
        const rel = path.relative(root, abs);
        // This study's own directory is excluded from the corpus it measures:
        // fixtures/ contains deliberately pathological functions that exist only
        // to isolate divergence mechanisms, and counting them as ordinary corpus
        // code would bias every rate reported. analyze.py drops our engine's
        // records for the same paths.
        if (!rel.split(path.sep).join('/').startsWith('research/validation/')) {
          found.push(rel);
        }
      }
    }
  })(root);
  return found.sort();
}

/* ------------------------------------------------------------------ */
/*  Canonical function inventory (typescript-eslint AST)                */
/* ------------------------------------------------------------------ */

const FUNCTION_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/**
 * Canonical name for a function node, from its binding context.
 * Returns null when the function is genuinely anonymous.
 */
function canonicalName(node, parent) {
  if (node.id && node.id.name) return node.id.name;
  if (!parent) return null;
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.id && parent.id.name ? parent.id.name : null;
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'Property':
    case 'TSAbstractMethodDefinition': {
      const k = parent.key;
      if (!k) return null;
      if (k.type === 'Identifier') return k.name;
      if (k.type === 'Literal') return String(k.value);
      return null;
    }
    case 'AssignmentExpression': {
      const l = parent.left;
      if (l && l.type === 'Identifier') return l.name;
      if (l && l.type === 'MemberExpression' && l.property && l.property.name) {
        return l.property.name;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Structural category, used to characterise unmatched functions.
 * Categories are checked most-specific first.
 */
function categorize(node, parent, grandparent, ancestorFnDepth, isTsx) {
  const isArrow = node.type === 'ArrowFunctionExpression';
  const isExpr = node.type === 'FunctionExpression';

  // IIFE: the function is the callee of a call expression.
  if (parent && parent.type === 'CallExpression' && parent.callee === node) return 'iife';
  if (
    parent &&
    (parent.type === 'UnaryExpression' || parent.type === 'AwaitExpression') &&
    grandparent &&
    grandparent.type === 'CallExpression'
  ) {
    return 'iife';
  }

  if (parent && (parent.type === 'MethodDefinition' || parent.type === 'TSAbstractMethodDefinition')) {
    return 'class_method';
  }
  if (parent && parent.type === 'PropertyDefinition') return 'class_property_fn';
  if (parent && parent.type === 'Property') return 'object_method';

  const boundToConst = parent && parent.type === 'VariableDeclarator';

  // Nested closure: any function-like node lexically inside another function
  // that is not itself a named declaration.
  if (ancestorFnDepth > 0 && !boundToConst && node.type !== 'FunctionDeclaration') {
    return isArrow ? 'nested_arrow_closure' : 'nested_function_expression';
  }

  if (boundToConst) {
    if (isArrow) return isTsx ? 'arrow_const_tsx' : 'arrow_const';
    return 'function_expression_const';
  }
  if (node.type === 'FunctionDeclaration') return 'function_declaration';
  if (isArrow) return 'arrow_argument';
  if (isExpr) return 'function_expression';
  return 'other';
}

/** True when the function body syntactically contains JSX. */
function containsJsx(node) {
  let found = false;
  (function walk(n) {
    if (found || !n || typeof n.type !== 'string') return;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(node.body);
  return found;
}

function buildInventory(ast, relPath) {
  const isTsx = relPath.endsWith('.tsx');
  const rows = [];
  (function walk(node, parent, grandparent, fnDepth) {
    if (!node || typeof node.type !== 'string') return;
    const isFn = FUNCTION_NODE_TYPES.has(node.type);
    if (isFn && node.body) {
      rows.push({
        file: relPath,
        name: canonicalName(node, parent),
        line: node.loc.start.line,
        endLine: node.loc.end.line,
        nodeType: node.type,
        category: categorize(node, parent, grandparent, fnDepth, isTsx),
        hasJsx: containsJsx(node),
        isTsx,
      });
    }
    const nextDepth = isFn ? fnDepth + 1 : fnDepth;
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const v = node[key];
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === 'string') walk(c, node, parent, nextDepth);
      } else if (v && typeof v === 'object' && typeof v.type === 'string') {
        walk(v, node, parent, nextDepth);
      }
    }
  })(ast, null, null, 0);
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Baseline 1 — ts-complex (cyclomatic, TypeScript compiler API)       */
/* ------------------------------------------------------------------ */

function runTsComplex(absPath, relPath) {
  const out = [];
  let result;
  try {
    result = tsComplex.calculateCyclomaticComplexity(absPath);
  } catch (e) {
    return { records: out, error: String(e.message) };
  }
  const text = fs.readFileSync(absPath, 'utf8');
  const src = ts.createSourceFile(absPath, text, ts.ScriptTarget.ES2015);
  for (const [key, value] of Object.entries(result)) {
    let parsed;
    try {
      parsed = JSON.parse(key);
    } catch {
      continue;
    }
    // `pos` includes leading trivia (comments/whitespace); skip it to reach the
    // token the author would call the start of the function.
    const start = ts.skipTrivia(text, parsed.pos);
    const line = src.getLineAndCharacterOfPosition(start).line + 1;
    out.push({ file: relPath, name: parsed.n, line, value });
  }
  return { records: out, error: null };
}

/* ------------------------------------------------------------------ */
/*  Baseline 2 — eslint-plugin-sonarjs (cognitive)                      */
/* ------------------------------------------------------------------ */

const linter = new Linter({ configType: 'flat' });
const COGNITIVE_RE = /Cognitive Complexity from (\d+) to the \d+ allowed/;

/**
 * The rule only reports functions ABOVE the threshold, so a threshold of 0
 * yields every function whose cognitive complexity is >= 1. Functions the rule
 * visited but did not report therefore have a score of exactly 0; analyze.py
 * records that inference explicitly rather than treating them as missing.
 */
function runSonar(code, relPath) {
  const virtual = 'probe' + path.extname(relPath);
  let msgs;
  try {
    msgs = linter.verify(
      code,
      [
        {
          files: ['**/*.{ts,tsx}'],
          plugins: { sonarjs },
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
              ecmaFeatures: { jsx: true },
            },
          },
          rules: { 'sonarjs/cognitive-complexity': ['error', 0] },
        },
      ],
      virtual,
    );
  } catch (e) {
    return { records: [], error: String(e.message) };
  }
  const records = [];
  let error = null;
  for (const m of msgs) {
    if (m.ruleId !== 'sonarjs/cognitive-complexity') {
      if (m.fatal) error = m.message;
      continue;
    }
    const hit = COGNITIVE_RE.exec(m.message);
    if (hit) records.push({ file: relPath, line: m.line, value: Number(hit[1]) });
  }
  return { records, error };
}

/* ------------------------------------------------------------------ */
/*  Baseline 3 — typhonjs-escomplex (Halstead volume)                   */
/* ------------------------------------------------------------------ */

const ANON_RE = /^<anon/;

function escomplexRecords(source, relPath, mode) {
  const out = [];
  let res;
  try {
    res = escomplex.analyzeModule(source);
  } catch (e) {
    return { records: out, error: String(e.message).slice(0, 200) };
  }
  // escomplex splits function reports: free functions land in `methods`, while
  // class methods live under `classes[].methods`. Both are collected.
  const push = (m, className) => {
    out.push({
      file: relPath,
      name: ANON_RE.test(m.name) ? null : m.name,
      className: className ?? null,
      line: m.lineStart,
      endLine: m.lineEnd,
      value: m.halstead.volume,
      mode,
    });
  };
  for (const m of res.methods) push(m, null);
  for (const c of res.classes ?? []) {
    for (const m of c.methods ?? []) push(m, c.name);
  }
  return { records: out, error: null };
}

/**
 * escomplex's parser (@typhonjs/babel-parser) accepts TypeScript and JSX
 * directly, so the primary pass needs no transpilation. We ALSO run a
 * Babel-transpiled pass so the size of the transpilation confound can be
 * measured rather than assumed.
 */
function runEscomplex(code, relPath, absPath) {
  const raw = escomplexRecords(code, relPath, 'raw');
  let transpiled = { records: [], error: 'not attempted' };
  try {
    const out = babel.transformSync(code, {
      filename: absPath,
      babelrc: false,
      configFile: false,
      retainLines: true,
      compact: false,
      presets: [
        ['@babel/preset-typescript', { isTSX: relPath.endsWith('.tsx'), allExtensions: true }],
        ['@babel/preset-react', {}],
      ],
    });
    transpiled = escomplexRecords(out.code, relPath, 'transpiled');
  } catch (e) {
    transpiled = { records: [], error: String(e.message).slice(0, 200) };
  }
  return { raw, transpiled };
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const [repoPath, repoName, outFile] = process.argv.slice(2);
  if (!repoPath || !repoName || !outFile) {
    console.error('Usage: node collect_baselines.mjs <repoPath> <repoName> <out.json>');
    process.exit(1);
  }
  const root = path.resolve(repoPath);
  const files = discover(root);

  const inventory = [];
  const tsComplexRecords = [];
  const sonarRecords = [];
  const escomplexRaw = [];
  const escomplexTranspiled = [];
  const errors = [];

  for (const rel of files) {
    const abs = path.join(root, rel);
    let code;
    try {
      code = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      errors.push({ file: rel, stage: 'read', message: String(e.message) });
      continue;
    }

    // Canonical inventory
    try {
      const { ast } = tseslint.parser.parseForESLint(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        loc: true,
        range: true,
      });
      inventory.push(...buildInventory(ast, rel));
    } catch (e) {
      errors.push({ file: rel, stage: 'inventory', message: String(e.message).slice(0, 200) });
    }

    const tc = runTsComplex(abs, rel);
    if (tc.error) errors.push({ file: rel, stage: 'ts-complex', message: tc.error });
    tsComplexRecords.push(...tc.records);

    const sn = runSonar(code, rel);
    if (sn.error) errors.push({ file: rel, stage: 'sonarjs', message: sn.error });
    sonarRecords.push(...sn.records);

    const ec = runEscomplex(code, rel, abs);
    if (ec.raw.error) errors.push({ file: rel, stage: 'escomplex-raw', message: ec.raw.error });
    if (ec.transpiled.error) {
      errors.push({ file: rel, stage: 'escomplex-transpiled', message: ec.transpiled.error });
    }
    escomplexRaw.push(...ec.raw.records);
    escomplexTranspiled.push(...ec.transpiled.records);
  }

  const payload = {
    repo: repoName,
    repoPath: root,
    fileCount: files.length,
    files,
    versions: {
      node: process.version,
      typescript: require('typescript/package.json').version,
      tsComplex: require('ts-complex/package.json').version,
      eslint: require('eslint/package.json').version,
      eslintPluginSonarjs: require('eslint-plugin-sonarjs/package.json').version,
      typescriptEslint: require('typescript-eslint/package.json').version,
      typhonjsEscomplex: require('typhonjs-escomplex/package.json').version,
      babelCore: require('@babel/core/package.json').version,
    },
    inventory,
    tsComplex: tsComplexRecords,
    sonar: sonarRecords,
    escomplexRaw,
    escomplexTranspiled,
    errors,
  };

  fs.writeFileSync(outFile, JSON.stringify(payload));
  console.error(
    `[${repoName}] files=${files.length} inventory=${inventory.length} ` +
      `ts-complex=${tsComplexRecords.length} sonar=${sonarRecords.length} ` +
      `escomplex=${escomplexRaw.length} errors=${errors.length}`,
  );
}

main();
