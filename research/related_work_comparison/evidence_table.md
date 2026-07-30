# Related-work evidence table — OBSERVATIONS ONLY

**This file records what was observed when each tool was run. It deliberately does
not contain capability verdicts.** Cells state what the tool did, plus a pointer to
the raw log that proves it. Anything that did not resolve cleanly to yes/no is
marked ⚠ and written up in [ambiguities.md](ambiguities.md) for a human to decide.

Do not paste these cells into the paper's Table 1 as-is. Table 1 requires the
human interpretation step that this file intentionally stops short of.

- Install commands and versions: [setup.md](setup.md)
- Raw logs: [raw/](raw/)
- Run date: 2026-07-29 (UTC 2026-07-30T01:2x)

## Corpus

Three CSE 115A repos from `research/validation/corpus.json`, reused at their pinned
commits so this lines up with the earlier cognitive-complexity validation. All three
mix plain `.ts` with `.tsx`/React, which is what makes the React column testable.
`cse115a-Memori__Memori` was excluded: 103 `.ts` files and **zero** `.tsx`.

| Repo | commit | `.ts` | `.tsx` | stack |
|---|---|---|---|---|
| `Colin-Posat__SlugFound` | `c8556ef` | 42 | 50 | Next.js + React |
| `MikeyZv__SlugMarket` | `0bd29d7` | 13 | 56 | Next.js + React |
| `Brinqa-CRQ-2026__VulnContext-Desktop` | `a3f75c2` | 89 | 82 | Electron + React |

SonarJS is split into two rows because the tier distinction is real and confirmed by
the plugin's own shipped README (`raw/sonarjs-eslint-plugin/TIER_evidence_readme.txt`).
**The SonarQube Server/Cloud row was not executed** — no scanner binary, no container
runtime, no server/token on this machine
(`raw/sonarjs-eslint-plugin/SONARQUBE_tier_not_run.txt`). Its cells are `NOT OBSERVED`,
never inferred.

---

## 1. Parses `.tsx` without erroring?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **Yes.** 0 parse errors across all 3 repos; 188 `.tsx` files linted (50/56/82). Needs `parserOptions.ecmaFeatures.jsx = true`. | `raw/eslint/*.stylish.txt` (`grep -c "Parsing error"` = 0); `raw/ABSENCE_CHECK.txt` §Tool 1 |
| SonarJS — free plugin | **Yes.** 0 fatal messages; cognitive complexity reported inside `.tsx` (79/117/120 findings). | `raw/sonarjs-eslint-plugin/*.json`; `raw/ABSENCE_CHECK.txt` §Tool 2 |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` — tier not runnable here. | `raw/sonarjs-eslint-plugin/SONARQUBE_tier_not_run.txt` |
| jscpd | **Yes.** `tsx` is a first-class format in `--list`; 188 `.tsx` files analysed, exit 0. | `raw/jscpd/*.console.txt` (per-format `tsx` rows) |
| ts-complex | **Yes**, with the TS pin in place. 0 errors on 188 `.tsx`; functions detected in `.tsx` (254 in SlugFound alone). ⚠ only *with* the pin — see ambiguities #4. | `raw/ts-complex-escomplex/*.console.txt`; `raw/ts-complex-escomplex/TS_PINNING_check.txt` |
| escomplex (typhonjs) | **Yes**, on raw source — its bundled parser accepts TS+JSX directly, 0 errors, no transpile needed. Babel-transpiled path also 0 errors. | `raw/ts-complex-escomplex/*.console.txt` ("escomplex RAW errored: 0 / N") |

## 2. Per-function, or only per-file/per-project?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **Per-function**, with `line`/`column`/`endLine` and the function name in the message: `Function 'ForgotPasswordPage' has a complexity of 4`. Also names the kind (`Async function`, `Arrow function`). | `raw/eslint/MikeyZv__SlugMarket.json`; excerpt in `raw/ABSENCE_CHECK.txt` |
| SonarJS — free plugin | **Per-function**, `line`/`column`/`endLine` per finding: `create-form.tsx:28:25 Refactor this function to reduce its Cognitive Complexity from 13`. Does *not* name the function. | `raw/sonarjs-eslint-plugin/Colin-Posat__SlugFound.json` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` | — |
| jscpd | **Neither — per clone-pair.** Unit is a duplicated *fragment*: `{format, lines, tokens, firstFile:{name,start,end}, secondFile:{...}}`. No function/method/symbol key anywhere in the schema. Aggregates are per-format and per-corpus. | `raw/ABSENCE_CHECK.txt` §Tool 3 (`/function\|method\|symbol/ -> []`) |
| ts-complex | **Mixed within one tool.** `calculateCyclomaticComplexity` and `calculateHalstead` are per-function; `calculateMaintainability` is **file-level only** (`{averageMaintainability, minMaintainability}`). ⚠ Per-function keys carry **no line numbers**: named functions key by name, anonymous ones key by a stringified char-offset blob `{"pos":518,"end":695}` — 67–85% of keys are offset-style in this React corpus. See ambiguities #3. | `raw/ABSENCE_CHECK.txt` §Tool 4; `raw/ts-complex-escomplex/*.tool4.json` |
| escomplex (typhonjs) | **Per-function + per-file + per-project.** Methods carry `name` (or `<anon method-N>`) and a real `line`; 418/793/… methods with line numbers. Plus file `aggregate` and an `analyzeProject` mode. | `raw/ABSENCE_CHECK.txt` §Tool 4 ("methods carrying a line number") |

## 3. Halstead volume / metrics?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **No.** No Halstead/volume/operand key in any emitted message across 3 repos. | `raw/ABSENCE_CHECK.txt` §Tool 1 (`/halstead\|volume\|operand/ -> []`) |
| SonarJS — free plugin | **No.** Same schema-level check, empty. No Halstead rule among the 269 exposed rules. | `raw/ABSENCE_CHECK.txt` §Tool 2; `raw/sonarjs-eslint-plugin/rule_surface.txt` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` | — |
| jscpd | **No.** Absent from schema; jscpd's numbers are lines/tokens/percentages. | `raw/ABSENCE_CHECK.txt` §Tool 3 |
| ts-complex | **Yes — fullest of the four.** `calculateHalstead` returns `length, vocabulary, volume, difficulty, effort, time, bugsDelivered, operands{total,unique,_unique}, operators{total,unique,_unique}`. ⚠ `operators._unique` are raw numeric `ts.SyntaxKind` ids, and under the pinned TS 5.9.3 some decode to *type* keywords (`StringKeyword`, `UnknownKeyword`) — implausible as operators. See ambiguities #4. | `raw/ABSENCE_CHECK.txt` §Tool 4; `raw/ts-complex-escomplex/TS_PINNING_check.txt` §4 |
| escomplex (typhonjs) | **Yes.** Halstead per method and per file aggregate, e.g. file `halsteadVolume=2186.998`, method volumes `85.952`, `93.209`. Note some methods report volume `0`. | `raw/ts-complex-escomplex/*.tool4.json` (`escomplex_raw.methods[].halsteadVolume`) |

## 4. Cognitive complexity (as distinct from cyclomatic)?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **No cognitive; cyclomatic only.** Core `complexity` rule is cyclomatic. No `/cognitive/` key or rule in output. | `raw/ABSENCE_CHECK.txt` §Tool 1 (`/cognitive/ -> []`) |
| SonarJS — free plugin | **Yes.** `sonarjs/cognitive-complexity` fired 133/132/203 times. Ships *both* `cognitive-complexity` and `cyclomatic-complexity` as separate rules. ⚠ Score exists only as an integer inside the English message; no numeric field. | `raw/sonarjs-eslint-plugin/*.stylish.txt`; `raw/sonarjs-eslint-plugin/rule_surface.txt` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` | — |
| jscpd | **No.** Neither cognitive nor cyclomatic — out of scope for a clone detector. | `raw/ABSENCE_CHECK.txt` §Tool 3 (`/cognitive\|cyclomatic/ -> []`) |
| ts-complex | **No cognitive; cyclomatic only.** No `/cognitive/` field anywhere in output. | `raw/ABSENCE_CHECK.txt` §Tool 4 ("any /cognitive/ field anywhere? -> NO") |
| escomplex (typhonjs) | **No cognitive; cyclomatic only** (`cyclomatic`, `cyclomaticDensity`). | `raw/ABSENCE_CHECK.txt` §Tool 4 |

## 5. Anything React/hook/component-specific?

Checked at schema level on purpose: the corpus *is* React, so words like "component"
and "hook" appear in thousands of echoed file paths. Those are not measurements.

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **No React-specific analysis of its own.** React components are reported as ordinary functions (`Function 'SignInPage' has a complexity of 5`). ⚠ Two React-ish rule IDs *do* appear in the logs — `react-hooks/exhaustive-deps`, `@next/next/no-img-element` — but every one is the message `"Definition for rule ... was not found"`, triggered by the repos' own inline `eslint-disable` comments for plugins not installed. 18/2/0 such errors. Not analysis. (React support in this ecosystem lives in separate plugins not installed here.) | `raw/ABSENCE_CHECK.txt` §Tool 1 ("genuine findings" vs "rule definition not found"); `raw/eslint/Colin-Posat__SlugFound.json` |
| SonarJS — free plugin | **Partial — capability present, silent on this corpus.** Exactly 3 React/hook-aware rules exist: `jsx-no-leaked-render`, `no-hook-setter-in-body`, `no-useless-react-setstate`. Run explicitly against all 3 repos they executed cleanly and produced **0 findings**. So: rules exist and ran; corpus did not trigger them. These are *defect* rules, not React *metrics*. ⚠ presence-vs-demonstration split → ambiguities #2. | `raw/sonarjs-eslint-plugin/rule_surface.txt`; `raw/sonarjs-eslint-plugin/*.react-rules.txt` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` for execution. Shipped README documents 6 React Sonar rules (S6440, S6441, S6477, S6478, S6479, S6481) as delegated to `eslint-plugin-react`/`react-hooks` and **not** in the free plugin — evidence the tiers differ on React, but not evidence of what the server tier outputs. | `raw/sonarjs-eslint-plugin/TIER_evidence_readme.txt` |
| jscpd | **No.** No React/component concept; `tsx` is only a tokenizer format choice. Clones are line ranges. | `raw/jscpd/*/jscpd-report.json` schema |
| ts-complex | **No.** No react/hook/jsx/component field anywhere. | `raw/ABSENCE_CHECK.txt` §Tool 4 |
| escomplex (typhonjs) | **No.** Components appear as `<anon method-N>` — JSX is parsed but carries no component semantics. | `raw/ts-complex-escomplex/*.tool4.json` |

## 6. Uses or reports git history?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **No.** No commit/author/blame/git key in any message. | `raw/ABSENCE_CHECK.txt` §Tool 1 |
| SonarJS — free plugin | **No.** Same, empty. | `raw/ABSENCE_CHECK.txt` §Tool 2 |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED`. (SCM/new-code features are commonly attributed to this tier; not tested → do not fill in.) | — |
| jscpd | **Yes — the only one of the four.** `-b, --blame` = *"blame authors of duplications (get information about authors from git)"*. With `--blame`, each clone gains `blame: {line: {author, date, line, rev}}`. **Proved by differential test:** same repo, same commit, 314 blamed lines both times — shallow clone → 1 rev / 1 author; full-history clone → **12 revs / 5 authors**. Without `--blame` the key is absent entirely. Separately, `-g/--gitignore` reads `.gitignore` (a config file, not history). | `raw/jscpd/Colin-Posat__SlugFound__blame_shallow/` vs `raw/jscpd/Colin-Posat__SlugFound__blame_fullhistory/`; summary in `raw/ABSENCE_CHECK.txt` §Tool 3 |
| ts-complex | **No.** No git-ish field anywhere. | `raw/ABSENCE_CHECK.txt` §Tool 4 |
| escomplex (typhonjs) | **No.** Operates on source text/AST only. | `raw/ABSENCE_CHECK.txt` §Tool 4 |

## 7. Batch / multi-repo mode, or external scripting needed?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **Multi-path, not multi-repo.** One invocation did lint 2 repos (50 + 56 `.tsx`) — but only when run from a common ancestor dir. Run from elsewhere it hard-fails: *"all of the files matching the glob pattern are ignored … If the file is ignored because it is located outside of the base path"* (exit 2). Output is one flat array with no per-repo grouping field, so cohort attribution needs external scripting. | `raw/BATCH_MODE_TEST.txt` §Tool 1 |
| SonarJS — free plugin | Same as ESLint — it *is* an ESLint run. | `raw/BATCH_MODE_TEST.txt` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` (server-side project model untested). | — |
| jscpd | **Yes, native `<path ...>`.** One invocation over 2 repos: 64 clones, correctly attributed 54 + 10. Controlled check (identical `--format tsx` both arms) shows pooled == separate per-repo counts, and 0 cross-repo clones. But `statistics.total` is **pooled across the corpus**, so per-repo numbers still need external splitting. | `raw/BATCH_MODE_TEST.txt` §Tool 3 + pooling test |
| ts-complex | **No CLI at all** — no `bin` in package.json; library only (`calculateCyclomaticComplexity`, `calculateHalstead`, `calculateMaintainability`), one file path per call. All batching is external scripting; `run_tool4.mjs` in this directory *is* that scripting. | `raw/LICENSES.txt`; `run_tool4.mjs` |
| escomplex (typhonjs) | **No CLI**, but has an in-library batch: `analyzeProject(modules)` returns cross-module project metrics (`adjacencyList`, `firstOrderDensity`, `changeCost`, `coreSize`). Scope is one project, not a cohort. | `raw/ABSENCE_CHECK.txt` §Tool 4 ("escomplex project mode") |

## 8. Output format — machine-readable or human-only?

| Tool | Observed | Evidence |
|---|---|---|
| ESLint + typescript-eslint | **Both.** `--format json` gives a stable array of `{filePath, messages[{ruleId, severity, line, column, endLine, message, …}]}`; `stylish` is the human view. ⚠ The *metric value* is not a field — `complexity of 4` must be regex-extracted from the message string. No JSON Schema shipped. | `raw/eslint/*.json` vs `*.stylish.txt`; `raw/ABSENCE_CHECK.txt` §Tool 1 |
| SonarJS — free plugin | **Both**, same ESLint envelope. ⚠ Same prose problem, and message keys are a strict subset (no `data`/`fix`), so the cognitive score is *only* recoverable from English text. | `raw/sonarjs-eslint-plugin/*.json` |
| SonarJS — SonarQube/Cloud | `NOT OBSERVED` | — |
| jscpd | **Both, and the most structured.** `--reporters json` → `{statistics:{formats,total}, duplicates:[…]}` with numeric `lines`/`tokens`/percentages as real fields, plus `startLoc`/`endLoc`. Console reporter is a table. Also offers html/xml/csv/markdown reporters. No JSON Schema shipped. | `raw/jscpd/*/jscpd-report.json` |
| ts-complex | **Neither by itself — returns JS objects**, no serialization and no CLI, so "output format" is whatever the caller writes. Values are typed numbers (good), but ⚠ object *keys* are function names or stringified `{"pos":…,"end":…}` blobs, which are awkward to join against anything. | `raw/ts-complex-escomplex/*.tool4.json` |
| escomplex (typhonjs) | **Returns JS objects**, no CLI. Report objects are well-structured and typed (`aggregate.halstead.volume`, `methods[].lineStart`, project metrics) and serialize cleanly to JSON. | `raw/ts-complex-escomplex/*.tool4.json` |

## 9. License (read from the package itself)

Every value below came from the installed package's own `package.json` plus its
shipped license file — not from docs or memory. Full dump: `raw/LICENSES.txt`.

| Tool | package.json `license` | shipped file | Observed |
|---|---|---|---|
| ESLint 9.39.5 | `MIT` | `LICENSE` — "Copyright OpenJS Foundation…" | MIT, consistent |
| typescript-eslint 8.65.0 | `MIT` | `LICENSE` — "MIT License" | MIT, consistent |
| eslint-plugin-sonarjs 3.0.7 | `LGPL-3.0-only` | `LICENSE` — **"SONAR Source-Available License v1.0"** | ⚠ **The two disagree.** Declared SPDX is LGPL-3.0-only; the shipped text is Sonar's source-available license, which is not OSI-approved and carries a "Competing" restriction. Needs a human/licensing call → ambiguities #1 |
| jscpd 4.2.5 | `MIT` | `LICENSE` — "The MIT License (MIT)" | MIT, consistent |
| ts-complex 1.0.0 | `MIT` | `LICENCE.md` (British spelling) — "MIT License" | MIT, consistent |
| typhonjs-escomplex 0.1.0 | `MPL-2.0` | `LICENSE` — "Mozilla Public License Version 2.0" | MPL-2.0, consistent (weak copyleft — reciprocal per-file) |
| SonarQube Server/Cloud | `NOT OBSERVED` | — | Not installed; server-tier licensing not inspected |

---

## Cross-cutting observations

1. **No tool reports both Halstead and cognitive complexity.** Halstead comes only
   from ts-complex/escomplex; cognitive only from SonarJS. Getting both means
   running two tools and joining their output.
2. **That join is harder than it looks.** SonarJS locates findings by
   `line`/`column` with no function name; ts-complex keys by function name or char
   offset with no line. escomplex is the only one giving both a name and a line.
   This is why `research/validation` had to patch ts-complex's `name.utility` to
   carry positions — that patch was **not** applied here (see setup.md).
3. **Metric values hide in prose in both ESLint-based tools.** Neither the
   cyclomatic nor the cognitive score is a numeric JSON field; both require
   regex-extracting an integer from an English sentence.
4. **The corpus is shallow-cloned (`depth=1`)**, which silently degrades the one
   git-dependent feature found (jscpd `--blame`: 1 author instead of 5). Any future
   git-based comparison needs full clones. → ambiguities #5.
