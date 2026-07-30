# Regeneration under analyzer_version 0.2.0

**Moved.** The authoritative figures now live in one place at the repository
root:

## → [`FINAL_NUMBERS.md`](../FINAL_NUMBERS.md)

This file previously carried its own copy of the 0.2.0 numbers. Keeping two
documents with overlapping figures is how tables drift apart, which is the exact
problem this pass set out to fix, so it is a pointer instead.

What `FINAL_NUMBERS.md` covers:

- cohort — all six repositories (files, source LOC, functions, duplication,
  cyclomatic), with per-repo `filesSkipped` / `analysisSkipped` integrity
- self-analysis
- Halstead and `maintainabilityIndexGradAi` — **TypeScript/JavaScript subset
  only**, with the Python exclusion explained
- cognitive complexity, TS/JS scoped, and the Python cognitive finding
- metric validity vs ts-complex / eslint-plugin-sonarjs / typhonjs-escomplex
- Figure 3 timing data and what its axis does and does not include
- batch mode coverage
- pre/post-AI dataset samples
- what was not regenerated, and which documents are superseded

Method notes and per-repo provenance stay in
[`cohort_regen/cohort_table.md`](cohort_regen/cohort_table.md).
