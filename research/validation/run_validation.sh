#!/usr/bin/env bash
#
# Metric-validity evaluation: our engine vs three independent baselines.
#
#   structural  cyclomatic complexity  vs ts-complex            (TS compiler API)
#   cognitive   cognitive complexity   vs eslint-plugin-sonarjs (typed ESLint AST)
#   lexical     Halstead volume        vs typhonjs-escomplex    (babel-parser)
#
# End to end: builds the engine, fetches the corpus, runs our engine and all
# three baselines, builds the join once, then writes CSVs, plots and findings.
#
# Usage:  research/validation/run_validation.sh
#
# This script only READS the engine. It never modifies packages/engine, never
# filters or windows measurements, and never tunes a threshold.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CORPUS_DIR="${CORPUS_DIR:-$HERE/.corpus}"
WORK_DIR="${WORK_DIR:-$HERE/.work}"

mkdir -p "$CORPUS_DIR" "$WORK_DIR"

echo "=== 1/5  Building the engine ==="
cd "$ROOT"
npm install --silent
# packages/engine has a pre-existing peer-dependency conflict (tree-sitter-python
# wants tree-sitter ^0.22 while the project pins ^0.21), so a bare `npm install`
# there fails with ERESOLVE. Its dependencies resolve from the root install; the
# build below is what actually matters.
( cd packages/engine && npm install --silent --legacy-peer-deps || true )
( cd packages/engine && npm run build )

ENGINE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
ENGINE_VERSION="$(node -p "require('$ROOT/packages/engine/package.json').version")"
echo "    engine analyzer_version=$ENGINE_VERSION  git=$ENGINE_SHA"

echo "=== 2/5  Installing baseline tools ==="
cd "$HERE"
npm install --silent

echo "=== 3/5  Preparing corpus ==="
node "$HERE/prepare_corpus.mjs" "$HERE/corpus.json" "$CORPUS_DIR" "$ROOT" \
  > "$WORK_DIR/corpus_resolved.json"
cat "$WORK_DIR/corpus_resolved.json" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    for (const r of JSON.parse(s)) console.log(`    ${r.name}  ${r.commit.slice(0,10)}  ${r.path}`);
  });'

echo "=== 4/5  Running our engine and the three baselines ==="
node -e '
  const fs=require("fs"); const {execFileSync}=require("child_process");
  const repos=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const work=process.argv[2], root=process.argv[3], here=process.argv[4];
  for (const r of repos) {
    console.error(`    [ours]      ${r.name}`);
    execFileSync("npx",["tsx","src/cli.ts","analyze",r.path,"--output",`${work}/ours_${r.name}.json`],
      {cwd:root, stdio:["ignore","ignore","inherit"], maxBuffer:1<<30});
    console.error(`    [baselines] ${r.name}`);
    execFileSync("node",[`${here}/collect_baselines.mjs`,r.path,r.name,`${work}/base_${r.name}.json`],
      {cwd:here, stdio:["ignore","ignore","inherit"], maxBuffer:1<<30});
    execFileSync("node",[`${here}/diagnose_conventions.mjs`,r.path,`${work}/diag_${r.name}.json`],
      {cwd:here, stdio:["ignore","ignore","inherit"], maxBuffer:1<<30});
  }
' "$WORK_DIR/corpus_resolved.json" "$WORK_DIR" "$ROOT" "$HERE"

echo "=== 5/6  Isolating each divergence mechanism on hand-written fixtures ==="
npx --prefix "$ROOT" tsx "$ROOT/src/cli.ts" analyze "$HERE/fixtures" \
  --output "$WORK_DIR/ours_fixtures.json" 2>/dev/null
node "$HERE/collect_baselines.mjs" "$HERE/fixtures" fixtures "$WORK_DIR/base_fixtures.json"
node "$HERE/diagnose_conventions.mjs" "$HERE/fixtures" "$WORK_DIR/diag_fixtures.json"
node "$HERE/probe_fixtures.mjs" "$HERE/fixtures" "$WORK_DIR/ours_fixtures.json" \
  "$WORK_DIR/base_fixtures.json" "$WORK_DIR/diag_fixtures.json" "$HERE/fixture_table.md"

echo "=== 6/6  Join, statistics, plots, findings ==="
python3 "$HERE/analyze.py" \
  --work "$WORK_DIR" \
  --corpus "$WORK_DIR/corpus_resolved.json" \
  --out "$HERE" \
  --engine-sha "$ENGINE_SHA" \
  --engine-version "$ENGINE_VERSION"

echo
echo "Done. Outputs in $HERE:"
echo "  paired_measurements.csv  unmatched.csv  findings.md"
echo "  plots/structural_cyclomatic.png  plots/cognitive.png  plots/lexical_halstead_volume.png"
