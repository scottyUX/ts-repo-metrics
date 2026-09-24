#!/usr/bin/env bash
# Reproduce the Python lexical-metric validation.
# Needs: python3, node, and a built engine (npm run build --prefix packages/engine).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HERE/.work}"
mkdir -p "$WORK/repos" "$WORK/out"
[ -d "$WORK/venv" ] || { python3 -m venv "$WORK/venv"; "$WORK/venv/bin/pip" install -q -r "$HERE/requirements.txt"; }
names=()
while IFS=$'\t' read -r name url commit; do
  names+=("$name")
  if [ ! -d "$WORK/repos/$name" ]; then
    git clone -q "$url" "$WORK/repos/$name"
  fi
  git -C "$WORK/repos/$name" checkout -q "$commit"
  node "$HERE/engine.mjs" "$WORK/repos/$name" "$WORK/out/$name.list" "$WORK/out/$name.engine.json"
  "$WORK/venv/bin/python" "$HERE/baselines.py" "$WORK/repos/$name" "$WORK/out/$name.list" "$WORK/out/$name.base.json"
done < <(node -e 'for (const r of require(process.argv[1])) console.log([r.name, r.url, r.commit].join("\t"))' "$HERE/corpus.json")
"$WORK/venv/bin/python" "$HERE/compare.py" "$WORK/out" "${names[@]}" | tee "$HERE/results.txt"
