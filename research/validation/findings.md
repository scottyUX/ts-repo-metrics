# Metric-validity evaluation: our engine vs three independent baselines

> **Update:** Five of the defects below — D9, D1, D3 (and the D4 component
> needed to hit its stated target), D5, and D10 — have since been fixed in
> `packages/engine`. This document is preserved as written, describing the
> engine as it stood at commit `1f250c1e` (see [`pre_fix_baseline/`](pre_fix_baseline/)
> for the frozen outputs from that state). For the fixes and the before/after
> numbers, see [`POST_FIX_COMPARISON.md`](POST_FIX_COMPARISON.md) and
> [`post_fix/`](post_fix/). D2, D6, D7, and D8 remain open.

Structural, cognitive and lexical complexity as computed by `packages/engine`,
measured against one independent tool per family over 4,570 functions in five
TypeScript repositories.

**Nothing in `packages/engine` was modified.** No measurement was dropped,
filtered, windowed or trimmed, and no threshold was tuned. Every divergence
below is reported as found, and every unpaired function is preserved in
`unmatched.csv`. Suspected bugs are written up and left in place.

Reproduce with `research/validation/run_validation.sh`.

## Contents

- [Provenance](#provenance)
- [Baseline viability](#baseline-viability-the-pre-flight-check)
- [Corpus](#corpus)
- [The join](#the-join)
- [Join rates and unmatched functions](#join-rates-and-unmatched-functions)
- [Results by family](#results-by-family)
- [Divergence mechanisms, isolated](#divergence-mechanisms-isolated)
- [Hypotheses](#hypotheses-for-each-divergence-pattern)
- [Limitations](#limitations)

## Provenance

| item | value |
|---|---|
| engine `analyzer_version` | `0.0.0` |
| engine git SHA | `1f250c1e6f570ff97950730bc3bee3fb62dd7de6` |
| branch | `version-ai-usage-csv-uploads-change` |
| engine invocation | `npm run dev -- analyze <path>` (CLI, per the documented setup) |
| node | v24.12.0 |
| ts-complex | 1.0.0 (with TypeScript 5.9.3 — see below) |
| eslint / eslint-plugin-sonarjs | 9.39.5 / 3.0.7 |
| typescript-eslint | 8.65.0 |
| typhonjs-escomplex | 0.1.0 |
| @babel/core | 7.29.7 |

One deviation from the documented setup: `cd packages/engine && npm install`
**fails** with `ERESOLVE`, because `tree-sitter-python@0.23.6` requires
`tree-sitter@^0.22.1` while the package pins `^0.21.1`. This is pre-existing and
unrelated to this study. The engine's dependencies resolve from the root install,
and `npm run build` succeeds, so the pipeline installs with `--legacy-peer-deps`
and continues. The build used here is the one `npm run build` produced.

## Baseline viability (the pre-flight check)

All three baselines were verified on `.ts` and `.tsx` before any measurement was
taken. All three passed, but two needed work, and one of those is a finding in
its own right.

**ts-complex silently mis-measures modern TypeScript out of the box.** It vendors
TypeScript **2.9.2** as a nested dependency while `tsutils` — which it uses for
`isFunctionWithBody` — binds to the top-level TypeScript. `SyntaxKind` is a
numeric enum whose values shifted between those versions
(`FunctionDeclaration` 233 → 263, `ArrowFunction` 192 → 220, …), so the function
detector silently fails. On a two-function `.ts` fixture it found one function
and named it wrong; on `.tsx` it found **zero**, with no error. Pinning a single
TypeScript version (`overrides: { "typescript": "5.9.3" }` in
`research/validation/package.json`) fixes it: the same fixtures then yield 2 and
1 functions with correct names and lines.

Anyone else using `ts-complex` as a TypeScript baseline should check this. An
unpinned install produces near-empty results that look like clean data.

Two smaller adaptations, both leaving the baselines' algorithms untouched:

- **ts-complex** keys its output by function *name* only, so results carry no
  line numbers and same-named functions overwrite each other. Its name utility is
  swapped for one that also emits the node position. The complexity computation
  is not touched.
- **eslint-plugin-sonarjs** reports only functions *above* the configured
  threshold. Run at threshold `0`, it reports every function scoring ≥ 1; a
  function it visited but did not report therefore scores exactly 0. Those rows
  are marked `sonar_source=inferred_zero` in `paired_measurements.csv` so the
  inference can be discounted. It is well behaved: of 3,179 inferred zeros,
  3,173 also score 0 in our engine, and only **2 rows in 4,373** (0.05%) show our
  engine at ≥ 3 against an inferred zero.

**The transpilation confound for the lexical family did not materialise.**
typhonjs-escomplex parses TypeScript and TSX natively via
`@typhonjs/babel-parser`, so no transpilation is required. The pipeline runs a
Babel-transpiled pass anyway, purely to measure what transpiling would have cost:
it roughly doubles the divergence (mean signed difference −152.9 transpiled vs
−73.1 raw). The raw parse is used throughout; the transpiled numbers are in
`paired_measurements.csv` and `stats_tables.md`. This family is still the weakest
of the three, but for a different reason — see [D7](#d7).

## Corpus

Five TypeScript repositories: this one plus four CSE 115A repositories already
referenced in `research/datasets/manifest_sprint1.csv`. Only `.ts`/`.tsx` files
are in scope (excluding `.d.ts`, which have no function bodies), because
`ts-complex` cannot read `.js`/`.py` at all. Our engine's `.js`/`.jsx`/`.py`
results are out of scope, not filtered out of a comparison they were eligible for.

| repo | commit | `.ts`/`.tsx` files | functions (inventory) |
|---|---|---|---|
| ts-repo-metrics | `1f250c1e6f` | 340 | 2,107 |
| Colin-Posat/SlugFound | `c8556ef8e1` | 92 | 423 |
| MikeyZv/SlugMarket | `0bd29d7e29` | 69 | 793 |
| Brinqa-CRQ-2026/VulnContext-Desktop | `a3f75c2ed9` | 171 | 1,041 |
| cse115a-Memori/Memori | `5cb9df5e8a` | 103 | 206 |
| **total** | | **775** | **4,570** |

This study's own directory (`research/validation/`) is excluded from the
self-analysis: `fixtures/` contains deliberately pathological functions written
to isolate divergence mechanisms, and counting them as ordinary corpus code would
bias every rate reported.

## The join

The join is built **once**, in `analyze.py`, and reused by all three families, so
every row of `paired_measurements.csv` is the same function across all six
measurements.

Key: **(repo, repo-relative file path, function name, start line)**.

Because the four tools disagree about function *naming* even when they agree
about function *identity*, measurements are anchored to a **canonical function
inventory** built from the typescript-eslint AST — a typed parse independent of
both our Tree-sitter CST and each baseline's own parser, so it privileges neither
side. Each tool's records are then attached to inventory rows one-to-one.

Two documented tolerances on the key:

1. **Line tolerance of ±2.** Tools anchor a function at different tokens
   (sonarjs at the identifier or `=>`, our engine at the first token of the node).
   **In the event this tolerance was never used**: all 4,373 of our engine's
   matches, all 4,570 ts-complex matches, all 4,481 escomplex matches and all
   1,238 sonarjs matches landed at line offset **0**. The join is exact.
2. **Name comparison is skipped when either side reports an anonymous
   function.** ts-complex and escomplex do not resolve `const f = () => {}` to
   `f`; our engine does. Requiring name equality there would report a naming
   convention as a disagreement about identity. Where both sides *do* supply a
   name, **agreement is 100%** (ours 1,676/1,676; ts-complex 1,522/1,522;
   escomplex 1,451/1,451). Combined with the exact line match, this is good
   evidence the join pairs genuinely corresponding functions rather than
   manufacturing pairs.

## Join rates and unmatched functions

| tool | records reported | paired to inventory | join rate |
|---|---|---|---|
| ours | 4,373 | 4,373 | **95.7%** |
| ts-complex | 4,570 | 4,570 | **100.0%** |
| eslint-plugin-sonarjs | 1,243 | 1,238 | **27.1%** |
| typhonjs-escomplex | 4,481 | 4,481 | **98.1%** |

Usable pairs per family: structural 4,373 · cognitive 4,373 · lexical 4,284.

The sonarjs rate is an artefact of its reporting contract, not a disagreement
about what a function is: the 3,332 unreported functions are unreported precisely
because they score 0. Read the rate as "27.1% of functions in this corpus have
non-zero cognitive complexity".

ts-complex's 100% is expected rather than suspicious — it and the inventory both
derive from the TypeScript compiler's AST, so they enumerate the same nodes.

### What went unpaired, by category

`unmatched.csv` has all 3,623 rows with a `reason` column. Summary:

| missed by | category | count |
|---|---|---|
| **ours** (197, all in ts-repo-metrics) | function_declaration | 104 |
| | nested_arrow_closure | 86 |
| | arrow_const_tsx | 6 |
| | iife | 1 |
| **escomplex** (89) | object_method | 60 |
| | function_declaration | 15 |
| | nested_arrow_closure | 10 |
| | arrow_const / class_method | 4 |
| **sonarjs** (3,332) | all categories — scored 0, below report threshold | 3,332 |
| **stray records** | sonarjs messages with no inventory function in range | 5 |

Our engine's 197 misses are **not** spread across categories or repos — they are
all four files, and they are the subject of [D9](#d9). escomplex's misses are
dominated by object-literal methods (`{ handler() {} }`), which it does not
enumerate in either `methods` or `classes[].methods`.

## Results by family

Full tables, including percentile distributions and all top-15 disagreement
excerpts, are in [`stats_tables.md`](stats_tables.md). Plots are in `plots/`.

| | structural (vs ts-complex) | cognitive (vs sonarjs) | lexical (vs escomplex) |
|---|---|---|---|
| paired functions | 4,373 | 4,373 | 4,284 |
| exact agreement | **98.2%** | **91.8%** | **5.4%** (within 1%) |
| Spearman ρ | **0.9968** | **0.9767** | **0.9143** |
| mean signed diff | +0.027 | −0.043 | −73.08 |
| median signed diff | 0.000 | 0.000 | −12.64 |
| modal diff | 0 (98.2% of pairs) | 0 (91.8%) | — |
| Bland-Altman bias | +0.027 | −0.043 | −73.08 |
| 95% limits of agreement | [−0.578, +0.633] | [−1.309, +1.223] | [−616.7, +470.5] |

**The headline agreement rates are inflated by trivial functions**, and should
not be quoted without this line. Around 71% of the corpus consists of small
callbacks that every tool scores identically at 1 (cyclomatic) or 0 (cognitive).
Restricting to functions where *either* tool reports something
non-trivial — a disclosure, not a filter; the headline figures above stand as
computed over everything:

| | n | exact agreement | Spearman ρ | 95% LoA |
|---|---|---|---|---|
| structural, max ≥ 2 | 1,257 | 93.8% | 0.9878 | [−1.02, +1.21] |
| cognitive, max ≥ 1 | 1,200 | **70.3%** | 0.9296 | [−2.56, +2.25] |
| cognitive, sonarjs-reported rows only | 1,194 | 70.6% | 0.9390 | [−2.54, +2.21] |

Cognitive complexity agrees exactly on only **70%** of non-trivial functions.

**A near-zero mean is not agreement here.** The cognitive bias of −0.043 is the
sum of four mechanisms pulling in opposite directions ([D3](#d3)–[D6](#d6)) that
happen to roughly cancel in aggregate. The limits of agreement, ±2.5 points, are
the honest summary: for an individual function our cognitive score can differ
from Sonar's by several points in either direction.

### Lexical, split

| subset | n | exact (1%) | Spearman ρ | mean diff |
|---|---|---|---|---|
| all | 4,284 | 5.4% | 0.9143 | −73.08 |
| `.ts` only | 1,917 | 3.2% | 0.9468 | −106.03 |
| `.tsx` only | 2,367 | 7.2% | 0.8912 | −46.40 |
| all, Babel-transpiled escomplex | 4,309 | 5.0% | 0.9469 | −152.93 |

Our Halstead volume is systematically **lower** than escomplex's, roughly
proportionally — the scatter plot shows a fan below the `y = x` line. Rank order
is largely preserved (ρ = 0.91), so rankings built on this metric are more
trustworthy than its absolute values, which are not comparable to published
Halstead figures.

## Divergence mechanisms, isolated

Rather than infer mechanisms from corpus aggregates, each is isolated in a
hand-written fixture under `fixtures/` and run through all four tools by
`probe_fixtures.mjs`. The generated table is
[`fixture_table.md`](fixture_table.md); the key rows:

| fixture | cyc ours | cyc ts-complex | cog ours | cog sonarjs | isolates |
|---|---|---|---|---|---|
| `h1_else` | **3** | 2 | **1** | 2 | one `else` |
| `h2_emptyCaseFallthrough` | **4** | 2 | 1 | 1 | 2 empty fall-through `case`s |
| `h3_switchBreaks` | 4 | 4 | **4** | 1 | 3 unlabeled `break`s |
| `h4_logicalOps` | 4 | 4 | **1** | 2 | one `a && b && c` run |
| `h5_nestedFn` | **2** | 1 | **1** | 0 | a nested `function` expression |
| `inner` (inside `h5`) | **absent** | 2 | **absent** | 1 | " |
| `h6_plain` | 1 | 1 | 0 | 0 | no control flow at all (vol 33.0 vs 53.2) |
| `elseIfChain` | **9** | 5 | **10** | 5 | 3 `else if` + 1 `else` |
| `BoolLogical` | 6 | 6 | **0** | 2 | 4 logical runs, no control flow |
| `deepNesting` | 5 | 5 | 10 | 10 | 3 levels of nesting — **agrees exactly** |

### Corpus-level attribution

`diagnose_conventions.mjs` counts the relevant constructs per function, so the
mechanisms can be tested against the corpus rather than asserted:

| model | disagreeing pairs | predicted exactly | variance explained |
|---|---|---|---|
| structural: `else_clause` + empty fall-through `case` | 78 | **72 / 78 = 92.3%** | **93.3%** |
| cognitive: unlabeled jumps − logical runs − `else` | 357 | 229 / 357 = 64.1% | **−83.8%** |

The structural divergence is essentially *solved*: two counting conventions
predict 92% of all disagreements exactly. The cognitive model deliberately fails
— negative variance explained means it is worse than predicting no difference —
because the largest cognitive divergences come from the *nesting escalation* in
[D3](#d3), which is multiplicative in chain length and cannot be captured by an
additive term.

## Hypotheses for each divergence pattern

Each is labelled **(a)** explainable consequence of parser or convention
differences, or **(b)** likely bug in our engine. **No action was taken on any
of them.**

### D1 — `else` counted as a cyclomatic decision point · **(b)**
<a id="d1"></a>
`COMPLEXITY_BRANCH_TYPES` in `packages/engine/src/utils/constants.ts:112`
includes `else_clause`. McCabe's definition counts *decision points* — nodes with
a predicate. An `else` has no predicate; it is the fall-through of a decision
already counted. ts-complex, SonarQube and the standard formulation all exclude
it. Fixture `h1_else`: ours 3, ts-complex 2. Labelled (b) rather than (a) because
this is not two defensible conventions — it inflates the metric above the
definition the paper cites. Cheap to check, but out of scope for this pass.

### D2 — every `case` counted, including empty fall-through · **(a)**
<a id="d2"></a>
We count every `switch_case`; ts-complex counts only cases carrying statements
(`node.statements.length > 0`). For `case "a": case "b": case "c": return 1;` we
add 3, it adds 1. Both conventions are defensible — a fall-through label is
arguably a distinct entry path — and SonarQube counts each label as we do. Real,
documented convention difference. Fixture `h2`: ours 4, ts-complex 2.

Together D1 and D2 account for 92.3% of all structural disagreements exactly.

### D3 — `else if` treated as an extra nesting level · **(b)**
<a id="d3"></a>
The single largest cognitive divergence. `computeCognitiveComplexity` recurses
into an `if_statement`'s children at `controlDepth + 1`; in Tree-sitter an
`else if` is an `if_statement` nested inside an `else_clause`, so each link in a
chain is scored one level deeper. Sonar's specification is explicit that
`else if` receives **+1 with no nesting increment**. Fixture `elseIfChain`
(3 × `else if` + `else`): ours **10** (1+2+3+4), Sonar **5** (1+1+1+1+1). The
error grows quadratically with chain length, so long dispatch chains — common in
this corpus — are heavily inflated. Visible in the top-15 table:
`frameworkDetection.ts:31` (16 vs 6), `sortable-item-domain.ts:39` (15 vs 5),
`loc.ts:27` (17 vs 10).

### D4 — plain `else` receives no cognitive increment · **(b)**
<a id="d4"></a>
`ECMASCRIPT_COGNITIVE_CONTROL` (`languageProfile.ts:22`) has no `else_clause`
entry, so a plain `else` scores 0; Sonar gives +1. Fixture `plainElse`: ours 1,
Sonar 2. Same specification as D3 and in the opposite direction, which is part of
why the aggregate bias looks small.

### D5 — unlabeled `break`/`continue`/`throw` counted as jumps · **(b)**
<a id="d5"></a>
`jumpTypes` awards +1 to any `break`, `continue` or `throw` at nesting depth > 0.
Sonar increments only for jumps **to a label**; an ordinary `break` ending a
`switch` case is not a cognitive jump. Fixture `h3_switchBreaks`: ours 4
(1 switch + 3 breaks), Sonar 1. This inflates every switch-heavy function by
roughly its case count — the top cognitive divergence,
`tokenScanner.ts:62 enter` (ours 42 vs 26), is exactly this shape.

### D6 — no logical-operator increment · **(b)**
<a id="d6"></a>
Sonar adds +1 per sequence of like `&&`/`||` operators; our implementation has no
such rule. Fixture `BoolLogical`: 4 logical runs, ours **0**, Sonar 2. Note
Sonar's rule is more context-dependent than "one per run" — in
`logical_ops.tsx:1` three `&&` inside JSX yield 0 from *both* tools — which is
why the additive attribution model above over-predicts this term. The absence of
the increment is nonetheless a clear departure from the specification the code
comment claims ("Sonar-inspired").

D3 and D5 inflate; D4 and D6 deflate. They partly cancel, producing a misleading
aggregate bias of −0.043 against limits of agreement of ±2.5.

### D7 — Halstead operator/operand vocabulary is much sparser · **(a)**, with one **(b)** component
<a id="d7"></a>
`collectHalsteadAtoms` (`parsing/tokenScanner.ts`) counts a deliberately narrow
set: control keywords, binary/unary/update operators, member and subscript
access, spread, identifiers and literals. It does **not** count assignment
operators, call expressions, object/array construction, punctuation or keywords
as operators, nor property identifiers as operands. escomplex counts all
punctuation and keyword tokens as operators and all identifiers and literals as
operands. Fixture `h6_plain` has no control flow at all and still diverges
(33.0 vs 53.2), which isolates this cleanly from any control-flow convention.

Halstead has no canonical tokenization for TypeScript, so a narrower operator set
is a legitimate design choice — **(a)**. One component is harder to defend:
every string literal is collapsed to the single operand `lit:string`, so a
function using fifty distinct strings contributes **one** to n₂. Since
volume = N·log₂(n₁+n₂), this systematically compresses volume for string-heavy
code, which is why the worst divergences are test files
(`BusinessServiceDetailPage.test.tsx:114`, ours 2,985 vs 10,209). That collapsing
looks like an oversight rather than a convention — **(b)** — but it is
entangled with the (a) component and I have not tried to separate their
contributions.

Consequence: our Halstead volume is not comparable in absolute terms to published
Halstead figures or to escomplex's. Rank correlation is preserved (ρ = 0.91), so
relative comparisons within our own corpus remain usable. Anything downstream
that consumes absolute volume — including `maintainabilityIndexGradAi`, which
feeds volume into an MI formula with published constants — inherits this.

### D8 — `.tsx` is the weaker half of the lexical comparison · **(a)**
<a id="d8"></a>
Rank correlation is 0.947 on `.ts` but 0.891 on `.tsx`. escomplex's traits were
written for JavaScript and treat JSX nodes thinly; a Babel-transpiled `.tsx` file
(JSX → `React.createElement` calls) yields a very different volume from the same
file parsed raw (68.1 vs 18.1 on a one-component fixture). Neither number is
"right" — JSX has no agreed Halstead treatment. Parser-difference, not a bug.

### D9 — files ≥ 32,768 characters fail to parse and are silently skipped · **(b), highest severity**
<a id="d9"></a>
The single most consequential finding, and not a metric disagreement at all.
`parseSource` (`packages/engine/src/parsing/sourceParser.ts:19`) calls
`parser.parse(code)` with a plain string. node-tree-sitter@0.21 throws
`Invalid argument` for any source of **32,768 characters or more** — binary
search puts the boundary exactly at 2¹⁵: 32,767 parses, 32,768 throws. The
pipeline catches this and logs `Skipping <file>: parse error Invalid argument`,
then continues, so the run reports success.

In this repo that silently removed **4 files and 197 functions — 9.3% of the
repo's functions — from every metric**, structural, cognitive and lexical alike:

| file | chars | functions lost |
|---|---|---|
| `apps/dashboard/components/results/rq/DocReviewTab.tsx` | 65,174 | 76 |
| `apps/dashboard/components/results/rq/metricHelpContent.tsx` | 39,055 | 54 |
| `apps/dashboard/components/results/rq/AIMaturityTab.tsx` | 43,382 | 48 |
| `apps/dashboard/components/docs/DocsSections.tsx` | 44,015 | 19 |

Also affected: `agent_stats/ai_usage_stats.py`. This accounts for **all 197** of
our engine's unmatched functions — the other four repos have no file that large
and lose nothing. The bias is not random: the largest files are exactly the ones
most likely to be complex, so every repo-level aggregate (mean complexity,
`longFunctionPercentage`, `maxNestingDepth`, the p90 distribution metrics) is
computed on a sample that has dropped its heaviest members. Confirmed against
the engine's own build, both with and without `packages/engine/node_modules`
present, so it is not an artefact of this study's install.

The tree-sitter API takes a callback-based input for exactly this case, but
fixing it is out of scope for this pass as instructed.

### D10 — `function_expression` is not recognised as a function · **(b), latent**
<a id="d10"></a>
`FUNCTION_NODE_TYPES` (`constants.ts:59`) lists `"function"`, the node type from
older tree-sitter-javascript grammars. tree-sitter-typescript 0.23 — the pinned
version — emits **`function_expression`**. So `const f = function () {}` and
`xs.map(function inner(x) {})` are invisible to the engine, with two effects:
they never appear in any metric, and because the walkers skip only *recognised*
function nodes, their bodies are counted into the **enclosing** function's score.
Fixture `h5_nestedFn` shows both: `inner` is absent from our output entirely,
while its parent's cyclomatic complexity is 2 instead of 1 and its cognitive
score 1 instead of 0.

**Zero occurrences in this corpus** — across 4,570 functions the engine emitted
only `arrow_function` (2,951), `function_declaration` (1,356) and
`method_definition` (66), and the diagnostic found no `function_expression` nodes
inside any matched function. Modern TypeScript and React code uses arrows. So
this is a real defect with no measured impact here; it would begin to matter on
older or more JavaScript-flavoured corpora, which is precisely what the pre-AI
2018–2021 cohort in `manifest_sprint1.csv` is.

## Limitations

1. **The inventory is an arbiter.** Pairing is anchored to a typescript-eslint
   parse. It is independent of all four tools, but any function it fails to see
   is invisible to the whole study. It found 4,570 functions where ts-complex
   found 4,570 and escomplex 4,481, so it is not obviously under-counting.
2. **sonarjs zeros are inferred, not observed** (3,179 of 4,373 rows). Validated
   at 99.94% consistency against our engine, and `sonar_source` lets any claim be
   recomputed on reported rows only — where exact agreement is 70.6%, essentially
   the same as the 70.3% non-trivial figure.
3. **One baseline per family.** Disagreement localises a difference between two
   tools; it does not by itself establish which is correct. The (b) labels rest
   on published specifications (McCabe; Sonar's cognitive-complexity paper), not
   on the baseline being right by construction.
4. **Corpus skew.** 46% of functions come from this repository, and it is the
   only one exhibiting D9. The four student repos are React/TypeScript apps of
   similar vintage and style; results may not transfer to the pre-AI JavaScript
   cohort.
5. **Halstead exactness is a threshold, not an equality.** "Exact" for the
   lexical family means within 1% relative difference; float equality would be
   meaningless.
6. **`.d.ts`, `.js`, `.jsx` and `.py` are out of scope**, so this study says
   nothing about the engine's Python profile, which has its own distinct
   `COMPLEXITY_BRANCH_TYPES` and `cognitiveControlTypes` sets and has not been
   validated against anything.

## Files

| file | contents |
|---|---|
| `run_validation.sh` | end-to-end driver: build, corpus, four tools, join, stats, plots |
| `collect_baselines.mjs` | canonical inventory + the three baselines |
| `diagnose_conventions.mjs` | per-function counts of divergence-relevant constructs |
| `probe_fixtures.mjs` | runs every tool over `fixtures/`, writes `fixture_table.md` |
| `analyze.py` | the single shared join, statistics, plots |
| `paired_measurements.csv` | 4,570 rows — one per function, all six measurements |
| `unmatched.csv` | 3,623 rows — every unpaired function, categorised, with reason |
| `stats_tables.md` | full statistics and all top-15 disagreements with excerpts |
| `fixture_table.md` | each divergence mechanism isolated |
| `summary.json` | every number above, machine-readable |
| `plots/` | three scatter plots, each with a `y = x` reference line |
