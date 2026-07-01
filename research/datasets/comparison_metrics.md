# Comparison metrics (SIP Sprint 2 — Part B)

8 fields extracted from each repo's `report_json` for the Pre-AI vs Post-AI comparison. All field
paths are confirmed against `packages/engine/dist/types/report.d.ts` and validated in Part A's
8-sample pipeline check (`research/datasets/samples/README.md`).

| # | Metric                     | JSON path                       | Nullable |
| -: | -------------------------- | -------------------------------- | :------: |
| 1 | Average cyclomatic complexity | `complexity.average`            |    No    |
| 2 | Maintainability score         | `maintainability.score`         |    No    |
| 3 | Long functions                | `smells.longFunctions`          |    No    |
| 4 | Source LOC                    | `profile.sourceLOC`             |    No    |
| 5 | Test coverage proxy           | `testCoverageProxy.ratio`       |    No    |
| 6 | Silent failure density        | `phase3.sfd`                    |   Yes    |
| 7 | Silent-failure risk score     | `phase3.srs`                    |   Yes    |
| 8 | P90 complexity                | `distributions.p90_complexity`  |   Yes    |

## Field notes

1. **Average cyclomatic complexity** (`complexity.average`) — mean cyclomatic complexity across all analyzed functions.
2. **Maintainability score** (`maintainability.score`) — composite maintainability index (0-100, higher = more maintainable).
3. **Long functions** (`smells.longFunctions`) — count of functions flagged as excessively long (code-smell).
4. **Source LOC** (`profile.sourceLOC`) — lines of source code analyzed (excludes tests/vendored assets where detected).
5. **Test coverage proxy** (`testCoverageProxy.ratio`) — heuristic test-to-source ratio used as a coverage proxy (no real coverage tool run).
6. **Silent failure density** (`phase3.sfd`) — rate of silent-failure patterns (e.g. empty catch blocks) per LOC. Nullable: `phase3` is only present when Phase 3 analysis runs.
7. **Silent-failure risk score** (`phase3.srs`) — weighted risk score combining silent-failure event severity/frequency. Nullable: same as #6.
8. **P90 complexity** (`distributions.p90_complexity`) — 90th-percentile function complexity, a tail-risk indicator distinct from the mean (#1). Nullable: `distributions` is optional.

Nullable fields are recorded as blank in `outputs/cohort_metrics_flat.csv` rather than `0` when
absent, to distinguish "not computed" from "computed as zero".
