# Ambiguities — items that did NOT resolve to a clean yes/no

Each entry is something I could not honestly reduce to a single table cell. For each
one: what was observed, why it is ambiguous, and what a human has to decide. **None
of these are resolved below on purpose.**

Ordered by how much they could distort Table 1 if guessed wrong.

---

## #1 — eslint-plugin-sonarjs declares one license and ships another

**Observed.** `node_modules/eslint-plugin-sonarjs/package.json` → `"license": "LGPL-3.0-only"`.
The file it actually ships, `LICENSE`, begins `SONAR Source-Available License v1.0`
(dated 2024-11-13). Evidence: `raw/LICENSES.txt`,
`raw/sonarjs-eslint-plugin/LICENSE_evidence.txt`.

The shipped text is not an OSI-approved open-source license and contains a
`"Competing"` definition broad enough to be worth reading directly:

> "Competing" means marketing a product or service as a substitute for the
> functionality or value of SonarQube. A product or service may compete regardless
> of how it is designed or deployed … even if it is provided free of charge.

**Why ambiguous.** Two authoritative sources inside the same package disagree, and
they disagree in a direction that matters: LGPL-3.0-only is permissive for research
use, while a source-available license with an anti-competition clause is not
obviously so. The SPDX field may be stale metadata, or the LICENSE file may be the
operative terms — I cannot tell which governs from the artifact alone. Version 3.0.7
sits after the Nov-2024 relicensing date, which weakly suggests the LICENSE file is
current and the SPDX field is stale, but that is inference, not observation.

**Human call needed.**
1. Which license does the paper report for SonarJS? (Options: the declared SPDX, the
   shipped file, or both-with-a-footnote.)
2. Does a tool-comparison paper about a repo-metrics product count as "Competing"?
   That is a legal question, not a measurement one.
3. Worth checking the upstream SonarJS repo and npm page for a third answer.

---

## #2 — SonarJS free tier: React rules exist but produced zero findings

**Observed.** The plugin exposes exactly 3 React/hook-aware rules —
`jsx-no-leaked-render`, `no-hook-setter-in-body`, `no-useless-react-setstate`
(`raw/sonarjs-eslint-plugin/rule_surface.txt`). Run explicitly against all 3 repos
(188 `.tsx` files) they executed without error and returned **0 findings**
(`raw/sonarjs-eslint-plugin/*.react-rules.txt`).

**Why ambiguous.** "Has React support" and "demonstrated React support" diverge here.
The capability is real and I proved it loads and runs; the corpus simply never
triggered it. Writing "no" misrepresents the tool; writing "yes" implies a
demonstration I do not have. A further distinction that may matter more for a
metrics paper: these are **defect rules, not metrics** — they emit
violation/no-violation, never a per-component number. So even a firing rule would not
give a React *metric* column.

**Human call needed.** Does the React column mean "ships React-aware rules"
(→ partial/yes), "produced React findings on our corpus" (→ no), or "emits a
React/component-level metric" (→ no for every tool tested)? The column definition
decides three different answers. If the intent is the first, consider a deliberately
crafted trigger file rather than relying on student code.

---

## #3 — ts-complex is per-function for two metrics and per-file for the third

**Observed.** Same library, three entry points, two different granularities:
- `calculateCyclomaticComplexity` → per function
- `calculateHalstead` → per function
- `calculateMaintainability` → **file-level only**: `{averageMaintainability, minMaintainability}`

And the per-function keys carry no line numbers. Named functions key by bare name;
anonymous ones key by a stringified offset blob, e.g.
`{"pos":518,"end":695}`. In this React corpus the anonymous form dominates:
**283 offset-keyed vs 140 named** in SlugFound, **676 vs 116** in SlugMarket
(`raw/ABSENCE_CHECK.txt` §Tool 4).

**Why ambiguous.** A single "per-function / per-file" cell cannot be right for all
three metrics. And "per-function" overstates the usability: with 67–85% of keys being
char-offset blobs and no line numbers, results are per-function in principle but hard
to join to source locations in practice. `research/validation` hit exactly this and
patched `ts-complex/lib/src/utilities/name.utility.js` to carry positions through —
**that patch was deliberately not applied here**, so these logs show stock behavior.

**Human call needed.** Either split the granularity column per metric, or add a
footnote that ts-complex's per-function identity is name/offset-based with no line
numbers and needed patching for the validation study. Also decide whether the table
should describe stock or patched ts-complex — they differ.

---

## #4 — ts-complex Halstead runs under the TS pin, but operator identity looks wrong

**Observed.** `ts-complex@1.0.0` declares `typescript: ^2.8.3`. The validation
install forces `overrides: {"typescript": "5.9.3"}`, and 5.9.3 is what resolves at
runtime; there is no vendored TS inside the package
(`raw/ts-complex-escomplex/TS_PINNING_check.txt`).

The known failure mode **did not resurface**: 423 functions detected across 92 files,
0 errors. Halstead volumes are populated and non-degenerate.

But `operators._unique` are raw numeric `ts.SyntaxKind` ids, and decoding one real
sample `[39, 64, 154, 159]` against the resolved TS 5.9.3 yields:
`["EqualsGreaterThanToken", "FirstAssignment", "StringKeyword", "UnknownKeyword"]`.
The first two are plausible operators; `StringKeyword` and `UnknownKeyword` are
**type** keywords and implausible as Halstead operators.

**Why ambiguous.** This is consistent with ts-complex having hard-coded SyntaxKind
numbers from the TS 2.x era, where those integers denoted different syntax. The pin
fixes *function detection* without necessarily fixing *operator classification*. So
"does it compute Halstead?" is yes by output, but the fidelity of `difficulty`,
`effort`, `bugsDelivered` — all derived from operator/operand counts — is unverified.
Volume depends on vocabulary and length, so it may be less affected than difficulty;
I did not test that separation.

**Human call needed.**
1. Is ts-complex Halstead trustworthy enough to cite as a baseline, or should
   escomplex be the Halstead reference instead? (escomplex derives operators from its
   own parser, not TS SyntaxKind numbers.)
2. Worth a targeted check: run ts-complex on a hand-written fixture with known
   operator counts and compare. Cheap, and would settle this.
3. If it is cited, the TS-version dependency belongs in a footnote — the numbers are
   a function of the pinned TS version, not of ts-complex alone.

---

## #5 — The corpus is shallow-cloned, which degrades every git-dependent measurement

**Observed.** All `research/validation/.corpus` checkouts report
`git rev-parse --is-shallow-repository` → `true`, 1 reachable commit. Re-cloning
`SlugFound` with full history at the *same* pinned commit and re-running
`jscpd --blame`: identical 314 blamed lines, but **1 rev / 1 author (shallow) vs 12
revs / 5 authors (full)**. On the shallow clone every line is attributed to the graft
boundary commit `^c8556ef`.

**Why ambiguous.** jscpd's git capability is a clear "yes" (evidence is solid). What
is *not* clear is whether any tool's git-derived output should be characterized from
this corpus at all — a shallow clone makes a working feature look degenerate without
erroring, which is the dangerous kind of wrong. If SonarQube's SCM/new-code features
are ever tested, the same trap applies and would silently under-report.

**Human call needed.** Decide whether the corpus should be re-cloned with full
history before any git-history column is finalized. Note this also affects the
`research/validation` numbers if anything there is history-sensitive. The full-history
clone I made lives in the session scratchpad and is not committed — the pinned
`.corpus` checkouts were left untouched.

---

## #6 — SonarQube Server/Cloud tier was not executed at all

**Observed.** No `sonar-scanner` binary, no `docker`, `SONAR_TOKEN` unset
(`raw/sonarjs-eslint-plugin/SONARQUBE_tier_not_run.txt`). The tier distinction is
nonetheless confirmed real by the plugin's own shipped README:

> "This ESLint plugin does not contain all the rules from the SonarQube JS/TS
> analyzer. Aside of the rules available here, SonarQube uses rules from other ESLint
> plugins…"

and the README's own table lists Sonar rules absent from the plugin, including six
React ones (S6440, S6441, S6477, S6478, S6479, S6481) delegated to
`eslint-plugin-react`/`react-hooks` (`raw/sonarjs-eslint-plugin/TIER_evidence_readme.txt`).
Free-tier surface measured: **269 rules, 61 of which declare `requiresTypeChecking`**.

**Why ambiguous.** I can prove the tiers differ, and I can quantify the free tier
exactly. I have **zero** first-hand observation of what SonarQube Server/Cloud
outputs — granularity, JSON schema, git/SCM integration, per-component React metrics
are all unmeasured. Secondary sources would be needed, which is a different evidence
class from every other cell in the table.

**Human call needed.**
1. Keep SonarQube as its own row with cells marked "not evaluated", or drop the row
   and scope the paper's claim to the free plugin? Silently merging the tiers would
   misdescribe both.
2. If the row stays, does the paper permit doc-sourced cells? If so they must be
   visually distinguished from run-verified ones.
3. If it must be run: needs a SonarQube instance (Docker or Cloud) plus a token.

---

## #7 — Minor: 61 type-aware Sonar rules were never exercised

**Observed.** 61 of 269 free-plugin rules declare `requiresTypeChecking`
(`raw/sonarjs-eslint-plugin/rule_surface.txt`). All runs here used non-type-aware
parsing (no `parserOptions.project`) because the corpus repos' `node_modules` are not
installed — a deliberate tradeoff for reproducibility, recorded in setup.md.

**Why ambiguous.** `sonarjs/cognitive-complexity` is not type-aware, so the cognitive
column is unaffected. But "what SonarJS free tier can detect" is understated by
roughly 23% of its rule surface. Does not change any metric cell in the current
table; would matter if the comparison ever widens to defect-detection breadth.

**Human call needed.** Probably none for Table 1 — noted so it is not mistaken for a
complete rule-surface evaluation later. If it ever matters, it requires
`npm install` in each corpus repo and a `tsconfig` per repo.

---

## Things that were checked and did NOT turn out ambiguous

Recorded so nobody re-litigates them:

- **jscpd `--blame` genuinely reads git history.** Differential shallow-vs-full test
  is unambiguous (#5 concerns the corpus, not the capability).
- **jscpd pooled vs separate runs are equivalent** for per-repo clone counts, tested
  with identical flags in both arms: 10 and 54 clones either way, 0 cross-repo clones
  (`raw/BATCH_MODE_TEST.txt`). An earlier 51-vs-54 discrepancy was purely a
  `--format` confound and is not real.
- **The React-ish rule IDs in the ESLint logs are not React analysis.** All are
  `"Definition for rule ... was not found"` errors caused by the repos' own inline
  `eslint-disable` comments referencing uninstalled plugins. Easy to miscount as
  React support from a naive grep; it is not.
- **All four tools parse `.tsx` without erroring.** Every one, 0 errors, 188 `.tsx`
  files.
- **Halstead and cognitive complexity never co-occur** in any single tool tested.
