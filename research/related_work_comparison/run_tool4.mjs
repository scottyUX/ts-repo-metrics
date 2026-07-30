/**
 * Tool 4 probe: ts-complex 1.0.0 + typhonjs-escomplex 0.1.0.
 *
 * Neither ships a CLI (no `bin` in either package.json), so this script IS the
 * "command line" for them -- which is itself one of the observations being
 * recorded (see evidence_table.md, batch-mode column).
 *
 * Deliberately runs both libraries UNPATCHED. research/validation patched
 * ts-complex's name.utility to carry line numbers through its output; that
 * patch is NOT applied here, because the question for the related-work table
 * is what the tool reports out of the box.
 *
 * Usage: node run_tool4.mjs <abs-repo-path> <repo-label> <out-dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { relative, join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const tsComplex = require('ts-complex');
const escomplex = require('typhonjs-escomplex');
const babel = require('@babel/core');

// Babel resolves preset NAMES relative to the file being transformed. The
// corpus lives under the ts-repo-metrics tree, so a bare '@babel/preset-react'
// resolves up into the root node_modules (where it does not exist) instead of
// the validation install. Resolve to absolute paths here so the preset lookup
// is independent of where the source file sits.
const PRESET_TS = require.resolve('@babel/preset-typescript');
const PRESET_REACT = require.resolve('@babel/preset-react');

const [repoPath, label, outDir] = process.argv.slice(2);
if (!repoPath || !label || !outDir) {
  console.error('usage: node run_tool4.mjs <abs-repo-path> <repo-label> <out-dir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// File list from git so we honour the repo's own tracked-file set.
const files = execFileSync('git', ['-C', repoPath, 'ls-files', '*.ts', '*.tsx'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && !f.endsWith('.d.ts') && !f.includes('node_modules/'));

const versions = {
  tsComplex: require('ts-complex/package.json').version,
  tsComplexDeclaredTsRange: require('ts-complex/package.json').dependencies.typescript,
  typescriptActuallyResolved: require('typescript/package.json').version,
  typhonjsEscomplex: require('typhonjs-escomplex/package.json').version,
  babelCore: require('@babel/core/package.json').version,
  node: process.version,
};

const out = {
  tool: 'ts-complex + typhonjs-escomplex',
  repo: label,
  runAtUtc: new Date().toISOString(),
  versions,
  fileCount: files.length,
  tsxFileCount: files.filter((f) => f.endsWith('.tsx')).length,
  perFile: [],
  errors: [],
};

for (const rel of files) {
  const abs = join(repoPath, rel);
  const isTsx = extname(rel) === '.tsx';
  const rec = { file: rel, isTsx };

  // ---- ts-complex: three separate calls, each takes a FILE PATH ----
  for (const [key, fn] of [
    ['cyclomatic', 'calculateCyclomaticComplexity'],
    ['halstead', 'calculateHalstead'],
    ['maintainability', 'calculateMaintainability'],
  ]) {
    try {
      rec['tsComplex_' + key] = tsComplex[fn](abs);
    } catch (e) {
      rec['tsComplex_' + key] = { __error: String(e.message || e).slice(0, 300) };
      out.errors.push({ file: rel, stage: 'ts-complex:' + key, message: String(e.message || e).slice(0, 300) });
    }
  }

  // ---- escomplex: raw source, then babel-transpiled ----
  const code = readFileSync(abs, 'utf8');
  try {
    const r = escomplex.analyzeModule(code);
    rec.escomplex_raw = {
      aggregateCyclomatic: r.aggregate?.cyclomatic,
      aggregateHalsteadVolume: r.aggregate?.halstead?.volume,
      maintainability: r.maintainability,
      methodCount: r.methods?.length,
      methods: r.methods?.map((m) => ({
        name: m.name, line: m.lineStart, cyclomatic: m.cyclomatic,
        halsteadVolume: m.halstead?.volume, params: m.params,
      })),
    };
  } catch (e) {
    rec.escomplex_raw = { __error: String(e.message || e).slice(0, 300) };
    out.errors.push({ file: rel, stage: 'escomplex:raw', message: String(e.message || e).slice(0, 300) });
  }

  try {
    const t = babel.transformSync(code, {
      filename: abs, babelrc: false, configFile: false, compact: false,
      presets: [
        [PRESET_TS, { isTSX: isTsx, allExtensions: true }],
        [PRESET_REACT, {}],
      ],
    });
    const r = escomplex.analyzeModule(t.code);
    rec.escomplex_transpiled = {
      aggregateCyclomatic: r.aggregate?.cyclomatic,
      aggregateHalsteadVolume: r.aggregate?.halstead?.volume,
      maintainability: r.maintainability,
      methodCount: r.methods?.length,
    };
  } catch (e) {
    rec.escomplex_transpiled = { __error: String(e.message || e).slice(0, 300) };
    out.errors.push({ file: rel, stage: 'escomplex:transpiled', message: String(e.message || e).slice(0, 300) });
  }

  out.perFile.push(rec);
}

// ---- escomplex project mode (batch across modules of one repo) ----
try {
  const modules = out.perFile.slice(0, 25).map((r) => ({
    srcPath: r.file, code: readFileSync(join(repoPath, r.file), 'utf8'),
  }));
  const proj = escomplex.analyzeProject(modules, { skipCalculation: false });
  out.escomplexProjectMode = {
    attempted: true, moduleCount: modules.length,
    topLevelKeys: Object.keys(proj),
    projectMetrics: {
      adjacencyListLen: proj.adjacencyList?.length,
      firstOrderDensity: proj.firstOrderDensity,
      changeCost: proj.changeCost,
      coreSize: proj.coreSize,
      loc: proj.loc, cyclomatic: proj.cyclomatic, maintainability: proj.maintainability,
    },
  };
} catch (e) {
  out.escomplexProjectMode = { attempted: true, __error: String(e.message || e).slice(0, 500) };
}

writeFileSync(join(outDir, label + '.tool4.json'), JSON.stringify(out, null, 1));

// ---- console summary (also captured to the .txt log) ----
const tsxRecs = out.perFile.filter((r) => r.isTsx);
const errBy = {};
for (const e of out.errors) errBy[e.stage] = (errBy[e.stage] || 0) + 1;
console.log('repo:', label, '| files:', out.fileCount, '(tsx:', out.tsxFileCount + ')');
console.log('versions:', JSON.stringify(versions));
console.log('errors by stage:', JSON.stringify(errBy));
console.log('.tsx files where ts-complex cyclomatic errored:',
  tsxRecs.filter((r) => r.tsComplex_cyclomatic?.__error).length, '/', tsxRecs.length);
console.log('.tsx files where escomplex RAW errored:',
  tsxRecs.filter((r) => r.escomplex_raw?.__error).length, '/', tsxRecs.length);
console.log('.tsx files where escomplex TRANSPILED errored:',
  tsxRecs.filter((r) => r.escomplex_transpiled?.__error).length, '/', tsxRecs.length);
console.log('escomplex project mode:', JSON.stringify(out.escomplexProjectMode).slice(0, 400));
