# Setup — exact commands and versions

Everything needed to reproduce the logs in [raw/](raw/). Observations live in
[evidence_table.md](evidence_table.md); unresolved items in
[ambiguities.md](ambiguities.md).

**Nothing in `packages/engine` or elsewhere in the ts-repo-metrics codebase was
touched.** This directory only runs third-party tools against sample repos and
records the results.

## Environment

| | |
|---|---|
| OS | macOS 26.5.1, arm64 |
| Node | v24.12.0 |
| npm | 11.6.2 |
| git | 2.50.1 (Apple Git-155) |
| Run date | 2026-07-29 (logs stamped UTC 2026-07-30T01:2x) |

## Tool versions

Read from each installed package's own `package.json`; license read from the package's
own license file too (full dump: `raw/LICENSES.txt`).

| Tool | Version | License (declared / shipped) | Source of install |
|---|---|---|---|
| eslint | 9.39.5 | MIT / MIT | reused from `research/validation` |
| typescript-eslint | 8.65.0 | MIT / MIT | reused from `research/validation` |
| eslint-plugin-sonarjs | 3.0.7 | `LGPL-3.0-only` / **SONAR Source-Available v1.0** ⚠ | reused from `research/validation` |
| ts-complex | 1.0.0 (exact pin) | MIT / MIT (`LICENCE.md`) | reused from `research/validation` |
| typhonjs-escomplex | 0.1.0 | MPL-2.0 / MPL-2.0 | reused from `research/validation` |
| typescript | 5.9.3 (forced via `overrides`) | Apache-2.0 / Apache-2.0 | reused from `research/validation` |
| @babel/core, preset-typescript, preset-react | 7.29.7 | — | reused from `research/validation` |
| **jscpd** | **4.2.5** | MIT / MIT | **newly installed here** |

⚠ The sonarjs license mismatch is real and unresolved — see ambiguities #1.

## Install

Only jscpd was installed. The other four tools were **reused** from
`research/validation/node_modules` rather than reinstalled, so this comparison runs
against byte-identical package instances to the earlier cognitive-complexity
validation.

```bash
cd research/related_work_comparison
npm install                     # installs jscpd@4.2.5 only (see package.json)
```

Reuse is via symlinks into the validation install — same instances, not copies:

```bash
V=../validation/node_modules
for p in eslint typescript-eslint eslint-plugin-sonarjs ts-complex \
         typhonjs-escomplex typescript @typescript-eslint; do
  ln -sfn "../$V/$p" "node_modules/$p"
done

# @babel is a scope directory that npm already created for jscpd's deps, so link
# the individual packages INSIDE it -- linking the whole scope dir nests a broken
# node_modules/@babel/@babel symlink and Babel then resolves from the repo root.
for p in core preset-typescript preset-react; do
  ln -sfn "../../../validation/node_modules/@babel/$p" "node_modules/@babel/$p"
done
```

Verify the reuse actually took effect (this is worth checking — see Gotchas):

```bash
node -e "for (const p of ['eslint','typescript-eslint','eslint-plugin-sonarjs',\
'ts-complex','typhonjs-escomplex','typescript','jscpd']) \
console.log(p, require('./node_modules/'+p+'/package.json').version)"

node -e "console.log(require.resolve('@babel/preset-react'))"
# must print a path under research/validation/node_modules
```

### The ts-complex TypeScript pin

`ts-complex@1.0.0` declares `typescript: ^2.8.3` — about seven majors stale. The
validation install forces one TS version for everything:

```json
{ "overrides": { "typescript": "5.9.3" } }
```

Without it, ts-complex and `tsutils@2.29.0` land on different TS versions, `SyntaxKind`
numbering skews, and ts-complex detects almost no functions. **The issue did not
resurface here** — 423 functions across 92 files, 0 errors
(`raw/ts-complex-escomplex/TS_PINNING_check.txt`). There is no vendored TS inside the
package; it uses the hoisted one. Caveat: the pin fixes function detection but may not
fix Halstead operator classification — ambiguities #4.

## Corpus

Reused from `research/validation/corpus.json` at the same pinned commits (the
`research/cohort_regen/` directory referenced in the task does not exist yet, so this
is the documented fallback). `.corpus/` is gitignored, so re-create with:

```bash
cd research/validation && node prepare_corpus.mjs
```

| Repo | commit | `.ts` | `.tsx` |
|---|---|---|---|
| `Colin-Posat__SlugFound` | `c8556ef` | 42 | 50 |
| `MikeyZv__SlugMarket` | `0bd29d7` | 13 | 56 |
| `Brinqa-CRQ-2026__VulnContext-Desktop` | `a3f75c2` | 89 | 82 |

`cse115a-Memori__Memori` was excluded — 103 `.ts` files, zero `.tsx`, so it cannot
test the React column.

**These clones are shallow (`depth=1`).** That silently degrades git-dependent
features — see ambiguities #5.

## Reproducing each tool

`$RWC` = this directory (absolute). `$CORPUS` = `research/validation/.corpus`.

Call the ESLint binary **by absolute path**, not via `npx` — see Gotchas.

### 1. ESLint + typescript-eslint

```bash
cd "$CORPUS/<repo>"
node "$RWC/node_modules/eslint/bin/eslint.js" --no-config-lookup \
  --config "$RWC/configs/eslint.baseline.config.mjs" \
  '**/*.ts' '**/*.tsx' --format stylish   # and again with --format json
```

Config: `configs/eslint.baseline.config.mjs`. `complexity` and `max-depth` are set to
threshold **1**, not 0 — the rule schema rejects 0 (`Value 0 should be >= 1`), and 1
makes every function report. `ecmaFeatures.jsx: true` is required for `.tsx`. No React
plugin is installed, deliberately: the question is what typescript-eslint knows alone.

### 2. SonarJS — free tier

```bash
cd "$CORPUS/<repo>"
node "$RWC/node_modules/eslint/bin/eslint.js" --no-config-lookup \
  --config "$RWC/configs/eslint.sonarjs.config.mjs" \
  '**/*.ts' '**/*.tsx' --format stylish   # and --format json

# React/hook rule subset, run separately:
node "$RWC/node_modules/eslint/bin/eslint.js" --no-config-lookup \
  --config "$RWC/configs/eslint.sonarjs.react.config.mjs" '**/*.ts' '**/*.tsx'
```

`sonarjs/cognitive-complexity` is set to threshold **0** (this rule does accept 0) so
every function reports its score. Non-type-aware on purpose: type-aware linting needs
each repo's `node_modules` installed, which would break reproducibility. 61 of 269
rules are therefore not exercised — ambiguities #7.

Rule-surface and tier evidence:

```bash
node --input-type=module -e "import s from 'eslint-plugin-sonarjs'; \
console.log(Object.keys(s.rules).length)"          # -> 269
```

**SonarQube Server/Cloud was NOT run** — no scanner, no docker, no token
(`raw/sonarjs-eslint-plugin/SONARQUBE_tier_not_run.txt`). Ambiguities #6.

### 3. jscpd

```bash
cd "$CORPUS/<repo>"
node "$RWC/node_modules/jscpd/bin/jscpd" . \
  --format "typescript,tsx,javascript,jsx" \
  --reporters console,json --output "$RWC/raw/jscpd/<repo>" \
  --min-lines 5 --min-tokens 50 \
  --ignore "**/node_modules/**,**/dist/**,**/build/**,**/.next/**" --noTips
```

Git-history test (`--blame`), the differential that proves git use:

```bash
# arm A: the shallow pinned checkout
cd "$CORPUS/Colin-Posat__SlugFound" && node "$RWC/node_modules/jscpd/bin/jscpd" . --blame \
  --format typescript,tsx --reporters console,json --output "$RWC/raw/jscpd/..._blame_shallow" ...

# arm B: full history, SAME commit, cloned into the session scratchpad
git clone https://github.com/Colin-Posat/SlugFound.git SlugFound_full
cd SlugFound_full && git checkout c8556ef8e1d1e661c57f1deebc6e20706a323740
node "$RWC/node_modules/jscpd/bin/jscpd" . --blame ... --output "$RWC/raw/jscpd/..._blame_fullhistory"
```

Arm B was cloned into the session scratchpad, **not** into `.corpus`, so the pinned
checkouts the validation study depends on were left untouched. Result: 314 blamed
lines both arms; 1 rev/1 author shallow vs 12 revs/5 authors full.

Batch test: `cd "$CORPUS" && jscpd Colin-Posat__SlugFound MikeyZv__SlugMarket --format tsx ...`

### 4. ts-complex + typhonjs-escomplex

Neither ships a CLI (no `bin` in either `package.json`), so `run_tool4.mjs` is the
driver — that absence is itself one of the recorded observations.

```bash
node run_tool4.mjs "$CORPUS/<repo>" "<repo-label>" "$RWC/raw/ts-complex-escomplex"
```

Runs both libraries **unpatched**. `research/validation` patched
`ts-complex/lib/src/utilities/name.utility.js` to carry line numbers through its
output; that patch is *not* applied here, because the table should describe stock
behavior. Consequence: function keys are names or `{"pos":…,"end":…}` blobs with no
line numbers — ambiguities #3.

escomplex is run twice per file: on raw source (its bundled parser accepts TS+JSX
directly) and on Babel-transpiled output, to check whether transpilation is needed.
It is not — both paths give 0 errors.

### Post-processing

```bash
node absence_check.mjs   # -> raw/ABSENCE_CHECK.txt
```

This is schema-level on purpose. A plain `grep -i react raw/` returns hundreds of hits
that are just echoed file paths from a React corpus and prove nothing about
measurement; the first version of this check produced exactly that false positive
(`/rev/` also matched `ReviewsSection.tsx`). `absence_check.mjs` inspects emitted rule
IDs, JSON key names, and metric field names instead, and uses exact key matching for
git fields.

## Gotchas hit while producing these logs

Recorded because each one silently produces wrong evidence:

1. **`npx eslint` resolves the wrong ESLint.** From this directory `npx` picked up the
   root `ts-repo-metrics/node_modules/eslint` instead of the validation install.
   Always invoke `node "$RWC/node_modules/eslint/bin/eslint.js"`.
2. **ESLint 9 refuses files outside the config's base path.** Passing
   `../validation/.corpus/<repo>/**/*.ts` from here fails with *"all of the files
   matching the glob pattern are ignored … located outside of the base path"* (exit 2).
   Fix: `cd` into the repo and pass an absolute `--config`. This is also the real
   finding behind the batch-mode column.
3. **`complexity: 0` is schema-invalid** (`Value 0 should be >= 1`) though
   `sonarjs/cognitive-complexity: 0` is fine. Thresholds differ per rule.
4. **Linking the whole `@babel` scope dir breaks Babel.** `node_modules/@babel`
   already existed for jscpd's deps, so `ln -sfn ... node_modules/@babel` nested a
   symlink at `node_modules/@babel/@babel`; Babel then resolved `@babel/core` from the
   repo root, where `preset-react` is missing, and **every** transpile failed with
   `Cannot find module '@babel/preset-react'`. Link individual packages inside the
   scope dir.
5. **Babel resolves preset names relative to the file being transformed.** The corpus
   lives under the ts-repo-metrics tree, so bare `'@babel/preset-react'` resolved up
   into the root `node_modules`. `run_tool4.mjs` passes `require.resolve`d absolute
   preset paths.
6. **"No error" ≠ "found something".** ts-complex returning 0 errors on `.tsx` did not
   by itself show it detected functions; that needed a separate count (254 in `.tsx`).
   The documented pin failure mode is exactly "no errors, almost no functions".

## Files

```
related_work_comparison/
├── setup.md                 # this file
├── evidence_table.md        # observations, one row per tool per capability
├── ambiguities.md           # 7 unresolved items needing a human call
├── package.json             # jscpd only; documents what is reused vs installed
├── configs/
│   ├── eslint.baseline.config.mjs      # tool 1
│   ├── eslint.sonarjs.config.mjs       # tool 2, cognitive complexity
│   └── eslint.sonarjs.react.config.mjs # tool 2, React/hook rule subset
├── run_tool4.mjs            # driver for ts-complex + escomplex (neither has a CLI)
├── absence_check.mjs        # schema-level capability/absence check
└── raw/                     # one log per tool per repo, verbatim
    ├── ABSENCE_CHECK.txt  BATCH_MODE_TEST.txt  LICENSES.txt
    ├── eslint/                  <repo>.stylish.txt, <repo>.json
    ├── sonarjs-eslint-plugin/   <repo>.stylish.txt, <repo>.json,
    │                            <repo>.react-rules.txt, rule_surface.txt,
    │                            TIER_evidence_readme.txt, LICENSE_evidence.txt,
    │                            SONARQUBE_tier_not_run.txt
    ├── jscpd/                   <repo>.console.txt, <repo>/jscpd-report.json,
    │                            blame_shallow vs blame_fullhistory, batch/solo tests
    └── ts-complex-escomplex/    <repo>.console.txt, <repo>.tool4.json,
                                 TS_PINNING_check.txt
```

`node_modules/` here is gitignored; the raw logs are committed.
