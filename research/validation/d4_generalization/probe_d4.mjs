/**
 * D4 generalization probe.
 *
 * Scores every fixture function with (a) our engine and (b) eslint-plugin-sonarjs,
 * independently, and tabulates them side by side.
 *
 * Reuses the eslint-plugin-sonarjs install already in research/validation
 * (same package instance as the original cognitive validation), and reads the
 * engine from packages/engine/dist. It does NOT modify the engine.
 *
 * Usage: node probe_d4.mjs [outFile.md]
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

const engine = await import(
  path.join(ROOT, 'packages/engine/dist/extract/functionMetrics.js')
);
const parser = await import(
  path.join(ROOT, 'packages/engine/dist/parsing/sourceParser.js')
);

const FIXTURE_DIR = path.join(HERE, 'fixtures');
const files = fs.readdirSync(FIXTURE_DIR).filter((f) => /\.tsx?$/.test(f));

// ---------------------------------------------------------------------------
// Baseline: eslint-plugin-sonarjs cognitive-complexity at threshold 0.
// At threshold 0 every function reports, so a function ABSENT from the results
// scored exactly 0 -- same convention probe_fixtures.mjs uses.
// ---------------------------------------------------------------------------
function sonarScores(code, filename) {
  const linter = new Linter({ configType: 'flat' });
  // Config must be an ARRAY with a `files` glob, and the linted filename must
  // match it -- exactly the shape collect_baselines.mjs uses. Passing a bare
  // config object instead silently yields zero messages for every function.
  const virtual = 'probe' + path.extname(filename);
  const results = linter.verify(
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

  const byLine = new Map();
  let fatal = null;
  for (const m of results) {
    if (m.ruleId !== 'sonarjs/cognitive-complexity') {
      if (m.fatal) fatal = m.message;
      continue;
    }
    // "Refactor this function to reduce its Cognitive Complexity from 13 to the 0 allowed."
    const match = /Cognitive Complexity from (\d+) to the \d+ allowed/.exec(m.message);
    if (match) byLine.set(m.line, Number(match[1]));
  }
  if (fatal) throw new Error(`sonarjs parse failure on ${filename}: ${fatal}`);
  if (byLine.size === 0) {
    throw new Error(
      `sonarjs produced no cognitive-complexity findings for ${filename}. ` +
        `Refusing to report that as "all zeros" -- it means the rule did not run.`,
    );
  }
  return byLine;
}

// ---------------------------------------------------------------------------
// Ours: engine's own function metrics.
// ---------------------------------------------------------------------------
function ourScores(code, filename) {
  const tree = parser.parseSource(code, filename.endsWith('.tsx') ? 'tsx' : 'ts');
  const res = engine.extractFunctionMetrics(tree.rootNode, {
    relativeFilePath: filename,
  });
  const byLine = new Map();
  for (const fn of res.functions) {
    byLine.set(fn.startLine, { name: fn.name, cog: fn.cognitiveComplexity });
  }
  return byLine;
}

const rows = [];
for (const f of files) {
  const abs = path.join(FIXTURE_DIR, f);
  const code = fs.readFileSync(abs, 'utf8');
  const sonar = sonarScores(code, f);
  const ours = ourScores(code, f);

  for (const [line, info] of [...ours.entries()].sort((a, b) => a[0] - b[0])) {
    // sonarjs anchors a function's finding at the function keyword line; our
    // engine uses the same 1-based start line. Absent => 0.
    const s = sonar.has(line) ? sonar.get(line) : 0;
    rows.push({
      file: f,
      line,
      name: info.name ?? '@anon',
      ours: info.cog,
      sonar: s,
      delta: info.cog - s,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('file:line  function                     ours  sonarjs  delta');
console.log('-'.repeat(66));
for (const r of rows) {
  const flag = r.delta === 0 ? '' : `  <-- DIVERGES by ${r.delta > 0 ? '+' : ''}${r.delta}`;
  console.log(
    `${pad(r.file + ':' + r.line, 20)} ${pad(r.name, 26)} ${pad(r.ours, 5)} ${pad(r.sonar, 8)} ${pad(r.delta, 5)}${flag}`,
  );
}
const diverging = rows.filter((r) => r.delta !== 0);
console.log('-'.repeat(66));
console.log(`${rows.length} functions; ${rows.length - diverging.length} match, ${diverging.length} diverge`);

const outFile = process.argv[2];
if (outFile) {
  let md = '<!-- generated by probe_d4.mjs; do not edit by hand -->\n\n';
  md += '| fixture function | chain shape | ours | sonarjs | delta |\n|---|---|---|---|---|\n';
  const SHAPE = {
    chain2Link: 'if / else if / else',
    chain4Link: 'if / else if x3 / else (= the D4 tuning target)',
    chainNoTerminalElse: 'if / else if x2, NO terminal else',
    chainNestedOneLevel: 'chain nested 1 level inside an if',
    chainNestedTwoLevels: 'chain nested 2 levels deep',
    chain6Link: 'if / else if x5 / else',
    chainPlainElse: 'if / else',
    chainElseContainingIf: 'if / else { if }',
    elseIfContainingIf: 'if / else if { if }',
    elseContainingLoop: 'if / else { for { if } }',
  };
  for (const r of rows) {
    md += `| \`${r.name}\` (${r.file}:${r.line}) | ${SHAPE[r.name] ?? '—'} | ${r.ours} | ${r.sonar} | ${r.delta === 0 ? '0' : `**${r.delta > 0 ? '+' : ''}${r.delta}**`} |\n`;
  }
  md += `\n${rows.length} functions; **${rows.length - diverging.length} match, ${diverging.length} diverge**.\n`;
  fs.writeFileSync(outFile, md);
  console.log(`\nwrote ${outFile}`);
}
