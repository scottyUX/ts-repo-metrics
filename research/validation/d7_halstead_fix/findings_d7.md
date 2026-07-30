# TASK B — D7 fixed: Halstead operand vocabulary is no longer compressed

The fix landed in `packages/engine/src/parsing/tokenScanner.ts` (the operand
collector) and nothing else. Distinct operand count **n2 rose 43.6%** corpus-wide.
Agreement with escomplex improved, but by less than the n2 change suggests, for a
reason worth reading before quoting any number: a **second, previously unrecorded
defect** was found and fixed in the same code, and it pushes volume the other way.

Evidence: `lexical_BEFORE.json` / `lexical_AFTER.json` (full `analyze.py` output
for the lexical family, both arms).

## What was actually wrong — three defects, not one

D7 described one. Measuring escomplex's real behaviour first (as instructed,
rather than assuming) turned up three.

| # | defect | effect |
|---|---|---|
| 1 | **All string literals collapsed to one operand** (`lit:string`) | n2 too low — the reported D7 |
| 2 | **All numeric literals collapsed to one operand** (`lit:number`) | n2 too low — *not* reported; numerics were **not** fine |
| 3 | **Every plain string counted twice** — the `string` node *and* its `string_fragment` child both emitted an operand | N2 too high |

Defect 2 is the one the task asked me to confirm rather than assume. It was
present and identical in form to the string bug.

Defect 3 was not in D7 at all and is the reason the improvement is smaller than
expected: it inflated N2, and volume is `(N1+N2)·log2(n1+n2)`. Fixing 1 and 2
raises `n2` (inside a log); fixing 3 lowers `N2` (a linear factor). They partly
cancel.

### escomplex's actual behaviour, measured

Probed directly rather than assumed:

```
distinctStrings  const a="alpha"; const b="beta"; const c="gamma";
  escomplex operands: ["a","\"alpha\"","b","\"beta\"","c","\"gamma\""]   n2=6
repeatedStrings  const a="same";  const b="same"; const c="same";
  escomplex operands: ["a","\"same\"","b","c"]                            n2=4
distinctNumbers  1, 2, 3   -> n2=6      repeatedNumbers  7, 7, 7 -> n2=4
templates  `hi ${x} there` -> operands include "hi ", " there"  (fragments, not the wrapper)
```

So operand identity is the literal **value**, for strings *and* numbers, and
template literals contribute one operand per *fragment* — not one for the whole
template. The fix matches all three behaviours.

## Corpus-wide component change (5 repos, 5,259 functions)

| | before | after | change |
|---|---|---|---|
| n1 (distinct operators) | 16,621 | 16,622 | +0.01% |
| N1 (total operators) | 40,212 | 40,225 | +0.03% |
| **n2 (distinct operands)** | **41,223** | **59,195** | **+43.60%** |
| **N2 (total operands)** | **131,924** | **113,893** | **−13.67%** |
| Halstead volume (sum) | 743,617 | 748,228 | +0.62% |
| MI_norm (sum) | 368,854 | 369,228 | +0.10% |

n1/N1 are unchanged — operators were not touched. (The 0.01–0.03% residual is an
artefact of the self-repo analysing its own modified `tokenScanner.ts`; see
"Caveats".)

## Lexical agreement vs escomplex — same format as the structural/cognitive results

"Exact agreement" uses the harness's established `VOLUME_REL_TOL = 0.01`
(within 1% relative), so these are comparable to the previously reported figures.

### Primary: Halstead volume, raw escomplex

| | n | exact | exact rate | Spearman ρ | mean diff (ours − base) | median diff | sd diff |
|---|---|---|---|---|---|---|---|
| **before** | 4,499 | 242 | **5.38%** | 0.8998 | −68.90 | −11.82 | 273.64 |
| **after** | 4,499 | 295 | **6.56%** | 0.9034 | −72.10 | −13.91 | 261.00 |
| change | — | +53 | **+1.18 pp** | +0.0036 | −3.20 | −2.09 | −12.64 |

### Secondary slices

| slice | exact rate before → after | ρ before → after | mean diff before → after |
|---|---|---|---|
| transpiled | 4.95% → **6.17%** | 0.9464 → 0.9474 | −159.43 → −162.62 |
| `.ts` only | 3.15% → **3.98%** | 0.9469 → 0.9501 | −105.86 → −107.27 |
| `.tsx` only | 7.06% → **8.50%** | 0.8710 → 0.8737 | −41.01 → −45.57 |

### Reading these honestly

- **Exact agreement improved in every slice** (+0.83 to +1.44 pp). Real, but the
  headline number moves 5.4% → 6.6%, not to anything near parity.
- **Spearman barely moved** (+0.004). It was already 0.90; the fix changes
  magnitudes, not ranks, so this is expected rather than disappointing.
- **Dispersion improved**: sd of the difference fell 273.6 → 261.0 (−4.6%),
  and −7.4% on the confound-free subset. Volumes cluster closer to escomplex.
- **Mean bias got slightly worse**, −68.90 → −72.10. We under-report volume
  relative to escomplex and now under-report marginally more. This is defect 3's
  doing: removing the double-count lowered N2 by 13.7%, which outweighed the n2
  gain inside the log. It is a *more correct* number that happens to sit slightly
  further from escomplex.

**The remaining gap is mostly not about operands.** Two convention differences
are still open and were deliberately left alone as out of scope:
- we count a function's own name as an operand (`id:f`), escomplex does not —
  worth a consistent +1 on n2 in the probe;
- operator counting differs substantially (probe: our n1=2 vs escomplex n1=4 on
  the same snippet). Since volume is `(N1+N2)·log2(n1+n2)`, operator convention
  is likely the dominant residual term now, not operands.

## Caveats on these numbers

1. **Self-repo confound (small).** The corpus includes `ts-repo-metrics` itself,
   analysed at whatever is checked out — and the file I changed,
   `tokenScanner.ts`, is part of that corpus. Its baseline was recomputed on the
   fixed source, while the BEFORE arm ran against the reverted source, so a
   handful of functions in that one file differ for reasons other than the fix.
   That is the whole explanation for the 0.01–0.03% n1/N1 drift.

   Re-running on the **4 pinned external repos only**, which are byte-identical
   in both arms, gives the same picture:

   | | n | exact | rate | ρ | mean diff | sd diff |
   |---|---|---|---|---|---|---|
   | before | 2,428 | 125 | 5.15% | 0.9098 | −69.55 | 265.17 |
   | after | 2,428 | 163 | **6.71%** | 0.9125 | −72.20 | **245.63** |

   Same direction, slightly larger improvement, dispersion −7.4%. Conclusions do
   not depend on the self repo. (Counts here use strict equality rather than the
   1% tolerance, so they are not directly comparable to the tables above — only
   the before/after contrast within this table is.)

2. **The published 5.4% figure was computed at self-commit `fb69e73`**; the
   corpus self-repo has moved since. The BEFORE arm above (5.38%) is a fresh
   re-measurement on current source, not a copy of the published number — they
   agree to 0.01 pp, which is a decent consistency check on the harness.

3. **The Python operand path was fixed the same way but is unvalidated.** It had
   defects 1 and 2 identically (`lit:string`, `lit:integer`). escomplex is
   JS-only, so there is no baseline for Python in this harness. Flagged rather
   than left knowingly wrong; revert that hunk if you would rather it stay
   unchanged until a Python baseline exists.

## Scope

`git diff HEAD` touched exactly two files:

```
packages/engine/src/parsing/tokenScanner.ts        (+30 −4)
packages/engine/__tests__/__snapshots__/snapshot.test.ts.snap
```

No parser, complexity/cognitive, smells, or other extractor was modified —
verified by diff, and by the snapshot delta containing **only** `n2`, `N2`,
`volume`, `difficulty`, `effort`, `maintainabilityIndexGradAiRaw/Norm`. `n1` and
`N1` do not appear in the snapshot diff at all.

One scope note: the operand-counting logic lives in `src/parsing/tokenScanner.ts`.
That is `collectHalsteadAtoms`, the Halstead atom collector — not the parser
(`sourceParser.ts` / `tsParser.ts`), which was not touched. Flagging because the
directory name reads like the excluded "parser".

Tests: **283 passed / 283** at the repo root (55 files); engine 140/140. The one
snapshot was updated deliberately — its diff is the intended metric change.

---

# STALE NUMBERS — do not quote these until regenerated

Halstead volume changed, so **every derived figure changed**: `difficulty`,
`effort`, and both `maintainabilityIndexGradAiRaw` / `Norm` — Equation 1 in the
planned paper. Per the task these were **not** regenerated here.

**Most urgent:** commit `0ff89a1` ("Regenerate cohort and self-analysis numbers
under analyzer_version 0.1.0") landed *during* this work. Those numbers were
regenerated **before** this fix and are already stale. The `0.1.0` version bump
in `6041167` was made to mark a metric discontinuity — this fix is a second
discontinuity on top of it, and both currently share the version `0.1.0`.
Consider another bump so the two are distinguishable.

### Stale engine outputs (contain computed volume / MI values)

| artifact | what it is |
|---|---|
| `research/cohort_regen/reports/*.json` | the six-repo cohort — CsLife, Lens, SlugSync, VeriFi, alexandria, wayfinder |
| `research/cohort_regen/reports/self_ts-repo-metrics.json` | self-analysis |
| `research/cohort_regen/batch_output/SlugSync.json` | batch-mode output |
| `report.json`, `reports/ts-repo-metrics.json` | root self-analysis reports |
| `data/analyses_rows.csv` | dashboard data (85 MB) |
| `research/datasets/samples/post_ai/*.json` (4), `pre_ai/*.json` (4) | pre/post-AI sample reports |

### Stale validation outputs (lexical family only)

`research/validation/`: `summary.json`, `findings.md`, `stats_tables.md`,
`paired_measurements.csv`, `fixture_table.md`, `plots/lexical_halstead_volume.png`,
plus `post_fix/` and `pre_fix_baseline/`.

Their **structural and cognitive** sections are unaffected — this fix does not
touch cyclomatic or cognitive complexity. Only the lexical/Halstead numbers and
anything MI-derived need regenerating.

### NOT stale

`docs/SCHEMA.md`, `docs/METRICS_CONCEPTS.md`, `docs/ARCHITECTURE.md`, `README.md`
describe formulas and field names and embed no computed values. Dashboard code
under `apps/dashboard/` reads these fields but stores none.

### Also still open (unrelated to this fix)

Task A found D4 does not generalize; cognitive complexity has two known defects
awaiting a decision. If both that fix and this one land, cognitive **and** lexical
numbers move, so a single regeneration pass covering both would be cheaper than
two.
