# Post-fix comparison: five defects fixed

`research/validation/findings.md` documented ten divergence patterns between our
engine and three independent baselines, without acting on any of them. This
follow-up implements the five the user selected — D9, D1, D3 (plus the
D4 component needed to hit its stated target — see below), D5, and D10 — plus an
unrelated build blocker (the `tree-sitter-python` ERESOLVE conflict), and re-runs
the identical validation pipeline (same corpus, same tools, same join logic in
`analyze.py`) to measure the effect.

- **Before**: [`pre_fix_baseline/`](pre_fix_baseline/) — engine at `1f250c1e`
- **After**: [`post_fix/`](post_fix/) — engine with the five fixes applied
  (uncommitted at run time; see the commit this file ships in for the final SHA)

D2, D6, D7, D8 are **unchanged** — out of scope for this pass, exactly as
instructed.

## What changed, per fix

| fix | file(s) | change |
|---|---|---|
| **D9** — 32,768-char parser cliff | `parsing/sourceParser.ts` | node-tree-sitter reads through a fixed UTF-16 buffer (default 32×1024 units); `parser.parse()` accepts a `bufferSize` option we control. Confirmed with a binary search and a direct `bufferSize` override (`hasError: false` at any size once sized correctly) that this was **case (b)**, a limit we set, not a hard native limit. `parseSource` now sizes the buffer to `code.length + 1`. |
| | `pipeline/analyzeRepo.ts` | Any *remaining* parse failure now logs a named reason (`file_too_large_for_parser (<n> chars)` or `parse_error: <message>`) instead of a generic "parse error" — the loss is visible if it ever recurs, not just an incremented count. |
| **D1** — bare `else` as a decision point | `utils/constants.ts` | Removed `else_clause` from `COMPLEXITY_BRANCH_TYPES`. `else if` is unaffected — it still counts via the nested `if_statement`. |
| **D3** (+D4) — else-if chain nesting escalation | `extract/cognitiveComplexity.ts` | `else_clause` children are visited at the *same* control depth as their `if`, not depth+1, removing the 1+2+3+4… escalation. **This alone was not enough to hit the stated target of 5** for the 3-link chain fixture: an escalation-only fix reaches 4, because a terminal (non-"else if") `else` scored 0. Sonar's spec gives `if`, `else if`, *and* a terminal `else` each a flat +1 — this is D4 from the original findings, not on the requested list. Hitting "Sonar's count of 5" for that fixture requires it, so it's included here; flagging explicitly since it was implied by the acceptance number rather than named directly. |
| **D5** — unlabeled `break` as a jump | `extract/cognitiveComplexity.ts` | An unlabeled `break_statement` (no leading `statement_identifier` child) no longer scores. Labeled `break` is unchanged. `continue` and `throw` are unchanged — the fix is scoped to `break` only, as specified. |
| **D10** — `function_expression` unrecognised | `utils/constants.ts` | Added `"function_expression"` to `FUNCTION_NODE_TYPES` alongside the existing `"function"`. |
| **ERESOLVE** | `packages/engine/package.json` | `tree-sitter-python` pinned to the exact version `0.23.4`, the highest 0.23.x release whose peer range (`^0.21.1`) is compatible with the pinned `tree-sitter@^0.21.1` — no major bump, same grammar line as the `^0.23.6` it replaces. `npm install` now succeeds with no flags. |

Nothing else in `packages/engine` changed — no metric definition outside this
list was touched, D7's Halstead vocabulary is untouched, and
`analyze.py`/`diagnose_conventions.mjs` (the attribution-model tooling) are
untouched. See [confirmation](#confirmation-of-scope) below.

## Regression tests added

All in `packages/engine/__tests__/`, all passing alongside the full existing
suite (140/140, see [Test results](#test-results)):

- **`sourceParser.test.ts`** (new file) — parses sources at, one past, and well
  past the 32,768-character boundary; confirms a function *after* that boundary
  in a large `.tsx` file is still found.
- **`complexity.test.ts`** — bare `else` no longer adds a decision point; each
  `else if` condition still does.
- **`cognitiveComplexity.test.ts`** — terminal `else` scores a flat +1 (not
  nested); a 4-link else-if chain scores 5, matching Sonar; unlabeled `break`
  scores 0; labeled `break` still scores; unlabeled `continue` is confirmed
  **unchanged** (still scores), documenting that D5 was deliberately scoped to
  `break` only.
- **`functionCount.test.ts`** — `const x = function () {}` and a named function
  expression callback are now counted as `function_expression`.

## Test results

```
 Test Files  28 passed (28)
      Tests  140 passed (140)
```

135 pre-existing tests pass unchanged. One pre-existing test
(`adds structural penalty for break inside loop`) encoded the D5 bug directly —
an **unlabeled** `break` inside a `while` — and was corrected to assert the new,
correct behavior rather than left to fail; see the entry in
`cognitiveComplexity.test.ts`. One snapshot was updated for the new, purely
additive `function_expression: 0` key that now appears in every file's
`functionsByType` breakdown (D10) — not a change to any computed value.

## Pre/post comparison

Same corpus (5 repos, same pinned commits), same three baselines, same join
(`analyze.py`, unmodified). Full numbers in `pre_fix_baseline/summary.json` and
`post_fix/summary.json`.

### Join rates

| tool | pre: paired / rate | post: paired / rate |
|---|---|---|
| inventory (typescript-eslint) | 4,570 functions | **4,588 functions** (+18, from the 4 previously-skipped D9 files) |
| **ours** | 4,373 / **95.7%** | **4,588 / 100.0%** |
| ts-complex | 4,570 / 100.0% | 4,588 / 100.0% |
| sonarjs | 1,238 / 27.1% | 1,241 / 27.0% (unchanged in character — reporting-threshold artefact, see findings.md) |
| escomplex | 4,481 / 98.1% | 4,499 / 98.1% |

Our engine's join rate going to exactly 100% is D9 fully resolved: every file in
scope now parses, so every inventory function has an `ours` measurement.

### Structural (cyclomatic) vs ts-complex

| | pre | post |
|---|---|---|
| n | 4,373 | 4,588 |
| exact agreement | 98.2% | **99.8%** |
| Spearman ρ | 0.9968 | 0.9972 |
| mean signed diff | +0.027 | **+0.003** |
| Bland-Altman bias | +0.027 | **+0.003** |
| 95% limits of agreement | [−0.578, +0.633] | **[−0.356, +0.362]** |
| non-trivial subset (max ≥ 2), exact | 93.8% (n=1,257) | **99.3%** (n=1,305) |

D1 alone (D2, empty fall-through `case`, is untouched) took the non-trivial
subset from 93.8% to 99.3% and roughly halved the limits of agreement.

### Cognitive vs eslint-plugin-sonarjs

| | pre | post |
|---|---|---|
| n | 4,373 | 4,588 |
| exact agreement | 91.8% | 92.3% |
| Spearman ρ | 0.9767 | 0.9770 |
| mean signed diff | −0.043 | −0.060 |
| Bland-Altman bias | −0.043 | −0.060 |
| 95% limits of agreement | [−1.309, +1.223] | **[−1.043, +0.922]** |
| non-trivial subset (max ≥ 1), exact | 70.3% (n=1,200) | 71.6% (n=1,247) |

The limits of agreement tightened by about 25%, but exact agreement on
non-trivial functions moved only modestly (70.3% → 71.6%). This is expected:
D2 (empty fall-through case) and D6 (missing logical-operator increment) are
explicitly out of scope for this pass and remain live sources of cognitive
divergence — see `findings.md` D2/D6 for what is still there.

**The attribution model in `stats_tables.md`/`analyze.py` is now stale for the
structural family** (disagreeing-pairs-predicted-exactly drops to 22%, from
92.3% pre-fix) — expected and not a new problem: its predictor formula counts
`else_clause` occurrences, which is precisely the convention the engine no
longer follows after D1. The script itself is untouched, per instructions; its
formula simply no longer describes the (now-fixed) engine. It was left as-is
rather than updated, since editing it would touch analysis tooling explicitly
marked out of scope.

### Lexical (Halstead volume) vs typhonjs-escomplex — D7 untouched, included for completeness

| | pre | post |
|---|---|---|
| n | 4,284 | 4,499 |
| exact agreement (within 1%) | 5.4% | 5.4% |
| Spearman ρ | 0.9143 | 0.8998 |
| mean signed diff | −73.08 | −68.84 |
| 95% limits of agreement | [−616.7, +470.5] | [−604.3, +466.6] |

Essentially unchanged, as expected — none of the five fixes touch Halstead
token collection (D7, untouched by design). The small movement is entirely from
the 215 additional functions the D9 fix added to the corpus.

## Confirmation of scope

```
$ git diff --stat packages/engine/src packages/engine/package.json
 packages/engine/package.json                       |  2 +-
 packages/engine/src/extract/cognitiveComplexity.ts | 45 ++++++++++++++++++++-
 packages/engine/src/parsing/sourceParser.ts        | 17 ++++++-
 packages/engine/src/pipeline/analyzeRepo.ts        | 12 +++++-
 packages/engine/src/utils/constants.ts             | 11 +++++-
 5 files changed, 81 insertions(+), 6 deletions(-)
```

Five source files plus `package.json`, matching the five fixes plus the
ERESOLVE fix exactly. No other file under `packages/engine/src` changed. D7
(Halstead vocabulary), the attribution-model script, and every metric not named
in this pass are untouched.
