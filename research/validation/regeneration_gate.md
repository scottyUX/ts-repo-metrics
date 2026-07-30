> # ✅ GATE SATISFIED — both blockers fixed, regeneration done
>
> Bug 1 (jscpd ignore globs) and Bug 2 (batch-mode silent skip) both landed, and
> the single combined regeneration described below has been run under
> `analyzer_version` 0.2.0.
>
> **Results: [`../../FINAL_NUMBERS.md`](../../FINAL_NUMBERS.md).**
> This file is kept as the record of why regeneration was deferred and what the
> gate required.

# Regeneration gate check — 2026-07-29, at analyzer_version 0.2.0

Regeneration of the self-analysis, the six-repo cohort, and Figure 3 was
**deferred**. The precondition — the jscpd `node_modules` exclusion (Bug 1) and
the batch-mode silent-skip (Bug 2) — **has not landed in this working tree**.
Regenerating now would produce numbers that need regenerating again once those
land, which is the outcome the instruction was written to avoid.

Both bugs were flagged as out of scope by the session that found them:
[`research/cohort_regen/findings.md`](../cohort_regen/findings.md) §"Flagged:
jscpd duplication detection degrades silently" and §"Flagged, out of scope: batch
mode cannot analyze five of the six".

## Bug 1 — jscpd `node_modules` exclusion: NOT FIXED

`packages/engine/src/collect/duplication.ts:65` still passes bare directory names:

```ts
"--ignore", "node_modules,dist,build,.next,out,coverage",
```

jscpd's `--ignore` takes **glob** patterns, so bare names do not match. Verified
on a synthetic tree (2 real sources, one top-level `node_modules/topdep/t.ts`,
one nested `pkg/node_modules/dep/d.ts`), using `jscpd --debug`, which lists the
selected file set without running detection:

| `--ignore` value | files jscpd walked |
|---|---|
| `node_modules,dist,build` (what the engine sends) | **4** — includes `node_modules/topdep/t.ts` **and** `pkg/node_modules/dep/d.ts` |
| `**/node_modules/**` | **2** — only `src/s1.ts`, `src/s2.ts` |

Worth noting this is **worse than findings.md recorded**: that write-up concluded
the bare pattern "fails to match at a nested path". In fact it excludes neither
nested **nor top-level** `node_modules` — the top-level directory is walked too.
The 10,487-files-scanned figure in findings.md is consistent with this.

`duplication.ts:97` also still swallows every failure (`catch { return null }`)
with nothing logged, so the documented 4-minute OOM abort (exit 134) is still
indistinguishable from "jscpd is not installed".

## Bug 2 — batch-mode silent skip: NOT FIXED

`src/batch/batchAnalyze.ts:104-107` still gates on a root `package.json`:

```ts
if (!(await isRepo(dir))) {
  console.error(`Skipping ${name}: no package.json`);
  continue;
}
```

and line 122 still writes `summary.csv` from whatever survived, so a partial run
is still presented as a complete batch result. Five of the six cohort repos
(CsLife, Lens, VeriFi, alexandria, wayfinder) are Python or plain-JS and have no
root `package.json`, so they are still excluded.

## History check

No commit has touched either file since the bugs were flagged. Most recent
commits to them are old feature work:

```
a40aa45 Add Python static analysis support.          (duplication.ts)
5221747 Add batch mode for analyzing multiple repositories (#9)  (batchAnalyze.ts)
```

## What regeneration is waiting on

When Bug 1 and Bug 2 land, one single pass under `0.2.0` should cover:

- the six-repo cohort table and `summary.csv`
- self-analysis (`report.json`, `reports/`, `research/cohort_regen/reports/`)
- Figure 3 timing data (`timing_data.csv`, `figure3_analysis_time_vs_loc.*`)
- `data/analyses_rows.csv`
- `research/datasets/samples/{pre,post}_ai/`
- the lexical **and** cognitive sections of `research/validation/`

Everything in that list is now **triply** stale: D7 (Halstead volume → MI), the
D4 replacement (cognitive complexity), and the pending duplication fix. Note the
cohort was last regenerated in `0ff89a1` under `0.1.0`, before any of the three.
