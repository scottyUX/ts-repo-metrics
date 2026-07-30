# TASK A — Does D4 generalize?

**Answer: no.** D4 is correct for *flat* else-if chains at any length, but it is
not the general rule. It diverges from SonarJS as soon as a chain is nested
inside another control structure, and again (in the opposite direction) when a
structure sits inside an `else` body.

No engine change was made. This directory is test-and-analysis only.

- Fixtures: [fixtures/d4_chains.ts](fixtures/d4_chains.ts)
- Side-by-side scores: [results_d4.md](results_d4.md) · raw: `raw_probe_output.txt`
- Spec hypothesis test: [spec_model.mjs](spec_model.mjs) · raw: `raw_spec_model_output.txt`

Baseline is the same `eslint-plugin-sonarjs@3.0.7` install already in
`research/validation`, `sonarjs/cognitive-complexity` at threshold 0, same
convention as `collect_baselines.mjs`. Engine read from `packages/engine/dist`.

## The three cases named in the task — all match

| # | fixture | shape | ours | sonarjs | |
|---|---|---|---|---|---|
| 1 | `chain2Link` | `if / else if / else` | 3 | 3 | match |
| 2 | `chain4Link` | `if / else if ×3 / else` | 5 | 5 | match |
| 3 | `chainNoTerminalElse` | `if / else if ×2`, no final else | 3 | 3 | match |

Taken alone this looks like clean generalization. It is not, for two reasons.

**Case 2 is the tuning target itself.** It is structurally identical to the
existing `elseIfChain` in `../fixtures/else_chains.ts` — the same `if` + 3
`else if` + terminal `else` scoring 5 that D4 was derived from. It cannot
provide evidence of generalization, only of non-regression.

**All three are flat chains at nesting depth 0.** D4's defect is depth-dependent
and is invisible at depth 0 by construction.

## Supplementary cases — 4 of 7 diverge

Added because the specified set could not distinguish "correct rule" from
"correct at depth 0". These probe nesting interaction and chain length.

| fixture | shape | ours | sonarjs | delta |
|---|---|---|---|---|
| `chain6Link` | `if / else if ×5 / else` | 7 | 7 | 0 |
| `chainPlainElse` | `if / else` | 2 | 2 | 0 |
| `elseIfContainingIf` | `if / else if { if }` | 4 | 4 | 0 |
| `chainNestedOneLevel` | chain nested 1 level inside an `if` | 6 | 5 | **+1** |
| `chainNestedTwoLevels` | chain nested 2 levels deep | 10 | 8 | **+2** |
| `chainElseContainingIf` | `if / else { if }` | 3 | 4 | **−1** |
| `elseContainingLoop` | `if / else { for { if } }` | 5 | 7 | **−2** |

Chain *length* generalizes fine (6 links still exact). Chain *depth* does not,
and the error grows with depth.

## What the actual rule is

SonarSource's spec keeps three things separate that the engine currently
conflates:

| | applies to |
|---|---|
| **B1** flat increment `+1` | `if`, `else if`, `else`, ternary, `switch`, loops, `catch` |
| **B3** nesting increment `+currentNesting` | `if`, ternary, `switch`, loops, `catch` — **not** `else if`, **not** `else` |
| **B2** nesting level | raised for the *bodies* of all of the above, including `else if` and `else` |

Plus one thing that is easy to get wrong and that I got wrong on the first pass:
**a chain does not deepen as it extends.** The body of an `else if` sits at the
same nesting level as the body of the chain's leading `if`, not one deeper.

### The two defects, precisely

Both live in [`cognitiveComplexity.ts:38-57`](../../../packages/engine/src/extract/cognitiveComplexity.ts#L38-L57).

**Defect 1 — `else if` wrongly receives a nesting increment (over-counts).**
An `else if` link is routed through the ordinary `if_statement` path, which
scores `controlDepth + 1`. Per B3 it should be a flat `+1`. At `controlDepth 0`
these coincide, which is exactly why every flat fixture passes. The error is
`controlDepth` per `else if` link, so it grows with both depth and chain length:
`chainNestedOneLevel` +1, `chainNestedTwoLevels` +2.

**Defect 2 — an `else` body is not nested (under-counts).**
The terminal-else branch calls `visit(child, controlDepth)`; `else_clause` is not
a `cognitiveControlType`, so its children are visited at that same depth. Per B2
the else body is one level deeper. Anything inside a terminal `else` is therefore
under-charged by one level, and it compounds through further nesting:
`chainElseContainingIf` −1, `elseContainingLoop` −2.

The two defects push in opposite directions, so on mixed real-world code they
partially mask each other in aggregate statistics — which is likely why corpus-level
cognitive agreement improved even though the rule is wrong.

### Hypothesis test, not curve-fitting

`spec_model.mjs` implements the B1/B2/B3 reading above as a standalone model
(not wired into the engine) and scores every fixture in **both** this directory
and the original `research/validation/fixtures/`:

```
current engine matches sonarjs on 18/24
spec model    matches sonarjs on 22/24
```

The model's 2 remaining misses are `h4_logicalOps` and `BoolLogical` — the
**separate, already-known logical-operator divergence** (B1 also increments for
sequences of binary logical operators, which I deliberately did not model). The
current engine misses those two identically, so they are not a D4 matter and
should not be folded into this decision.

On all 22 fixtures not involving logical operators, the spec model reproduces
SonarJS exactly, including the 4 the engine gets wrong. That is what supports the
diagnosis above being the real rule rather than another fixture fit.

My first draft of the model scored 21/24 — it put `else if` bodies one level too
deep and over-scored `elseIfContainingIf`. Correcting that is what produced the
"a chain does not deepen" clause. Noting this because it is the specific detail
most likely to be re-derived incorrectly.

## Stopping here

Per the task, no fix was attempted. The decision to make is whether to replace
D4 with the B1/B2/B3 separation above. Two things worth weighing:

1. It is a **rule replacement, not a patch** — D4's terminal-else `+1` is kept,
   but the `else if` path and the else-body descent both change. `spec_model.mjs`
   is effectively a working reference implementation to port.
2. It will **change existing cognitive-complexity numbers** in both directions —
   nested chains down, else-bodies up — so the self-analysis and cohort figures
   would need regenerating, and current cognitive agreement statistics would be
   stale. The logical-operator divergence is still open and would remain after
   this fix.
