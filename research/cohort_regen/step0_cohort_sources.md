# Step 0 — Cohort source audit

Where the six CSE 115A repositories are actually recorded, what the record says,
and the one discrepancy that needs a decision before the batch run.

Audited against `luna-777/cse15` at commit `074c411f8a4d88b525f934237bf7f42c530349bf`
(shallow clone, 2026-07-29).

## Six repositories confirmed

`repos/` contains exactly six entries, matching the six names given, with case
differences (`CsLife`, `Lens`, `SlugSync`, `VeriFi`, `alexandria`, `wayfinder`).

**They are gitlinks, not directories.** All six are recorded in the git index at
mode `160000` — submodule pointers carrying a pinned commit SHA. On disk they are
empty, and `.gitignore` line 5 ignores `repos/` with the comment "Cloned student
repos (local inspection only)".

**There is no `.gitmodules` file.** Gitlinks without `.gitmodules` record commit
SHAs but no URLs, so `git submodule update` cannot resolve them and the clone
URLs are not recoverable from `repos/` alone.

The URLs were recovered from two other places in the same project:

- `docs/axis-b-wednesday.md` — a "Repos cloned" table, but only three rows
  (Alexandria, Wayfinder, Lens)
- `data/metrics_data/*.json` — the `source` block of each prior report, which
  carries `url`, `commit` and `branch` for all six

| Repo | Canonical URL | Reachable | Prior `source.commit` | `repos/` gitlink | Match |
|---|---|---|---|---|---|
| alexandria | https://github.com/ucsc-cse115a-alexandria/alexandria | yes | `e4d1139f0ff8` | `28694b8ac580` | **no** |
| wayfinder | https://github.com/juansant-cmyk/wayfinder | yes | `a8c860c746c6` | `a8c860c746c6` | yes |
| SlugSync | https://github.com/Richie59943/SlugSync | yes | `dff085a999c5` | `dff085a999c5` | yes |
| Lens | https://github.com/jacobluanjohnston/Lens | yes | `d1db5e94b2dd` | `d1db5e94b2dd` | yes |
| VeriFi | https://github.com/Kurisuo/VeriFi | yes | `3f55467c45fc` | `3f55467c45fc` | yes |
| CsLife | https://github.com/Chr0no9/CsLife | yes | `42227097b4c7` | `42227097b4c7` | yes |

All six URLs verified reachable with `git ls-remote`.

## Discrepancy — alexandria is pinned to a different commit than was measured

Five of six gitlinks match the commit the prior analysis recorded. alexandria
does not:

- **`e4d1139f0ff8`** — the commit `data/metrics_data/alexandria.json` says was
  analyzed. Merge of PR #128, 2026-07-21 14:14:20 −0700.
- **`28694b8ac580`** — the commit `repos/alexandria` pins. Merge of PR #127,
  2026-07-21 15:32:52 −0700.

Both exist in the upstream history, and both are ancestors of current `main`
(`abe07602611a`). The analyzed commit is an **ancestor** of the pinned one, 16
commits behind it.

The gap is not cosmetic:

```
git diff e4d1139f 28694b8a --shortstat
  60 files changed, 13907 insertions(+), 12 deletions(-)
```

Nearly 14,000 added lines. Running the batch against the gitlink instead of the
previously analyzed commit would change alexandria's LOC and function counts
substantially, and that change would be **indistinguishable from the effect of
the engine fixes** in any before/after table. This is why the choice is being
escalated rather than resolved here.

### The choice

| Option | Commit | Consequence |
|---|---|---|
| **A** — match the prior measurement | `e4d1139f` | Before/after diff isolates the engine fixes. Departs from what `repos/` pins |
| **B** — match the `cse15` gitlink | `28694b8a` | Uses the project's pinned source of truth. Alexandria's row conflates +13,907 lines of repo change with the fix effect |
| **C** — current `main` | `abe07602` | Freshest, but conflates the most; 17 commits past the gitlink |

Option A is the one that answers "what changed because of the fixes". Option B
answers "what does the cohort look like at the pinned revision". They are
different questions and only one of them is a regeneration of the stale table.

The other five repos are unambiguous — prior measurement and gitlink agree, so
any option gives the same result for them.

## StudyPet-Plus — referenced, but no source recorded

StudyPet-Plus **is** referenced in `cse15`, but **not** as a repository:

| Location | What it shows |
|---|---|
| `config/lint/tsconfig.json:18-19` | includes `../../repos/StudyPet-Plus/src/**/*.ts{,x}` |
| `config/lint/eslint.config.js:25` | lints `repos/StudyPet-Plus/src/**/*.{ts,tsx}` |
| `docs/lint-results.md:22,182-196` | a full results section — 11 issues, Fail |
| `scripts/lint.mjs`, `scripts/lint-report.mjs` | referenced in the lint runner |

The lint output records absolute paths from a collaborator's machine
(`C:\Users\woofy\cse15\repos\StudyPet-Plus\src\...`), so it was cloned locally at
some point and linted.

But:

- **not** in `repos/` — no gitlink, no pinned SHA
- **not** in `data/metrics_data/` — no prior metrics run, consistent with it never
  appearing in any prior output or draft table
- **no URL anywhere** in the project. A search for any line containing both
  "studypet" and a URL returns nothing
- guessed candidates (`ucsc-cse115a-alexandria/StudyPet-Plus`,
  `luna-777/StudyPet-Plus`) are not reachable, and no further guessing was done

**Conclusion: it is not in the repo list and not accessible.** There is no
canonical source to run it from, so no decision is needed — the batch proceeds
with six. If it should be included, its clone URL has to come from outside
`cse15`.

## Prior cohort numbers, for reference

From `data/metrics_data/*.json`, all recorded under `analyzer_version` **0.0.0**
— the same version string the fixed build reported until this run, which is why
the version was bumped (see the engine bump commit).

| Repo | files | sourceLOC | functions | filesSkipped |
|---|---|---|---|---|
| alexandria | 114 | 10,119 | 929 | absent (0) |
| wayfinder | 118 | 31,257 | 713 | 8 |
| SlugSync | 60 | 8,194 | 698 | 1 |
| Lens | 56 | 4,980 | 177 | absent (0) |
| VeriFi | 56 | 5,129 | 276 | absent (0) |
| CsLife | 10 | 2,792 | 62 | 1 |

10 files were skipped across the cohort under the old build. If those skips were
the D9 32,768-character parse failure, they should disappear in the regenerated
run and bring their functions with them.
