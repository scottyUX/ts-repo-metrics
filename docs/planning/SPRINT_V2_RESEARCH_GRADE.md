# ts-repo-metrics – Sprint V2 Planning Document

**Goal:** Upgrade the system to Research-Grade reliability and GitHub URL support.

This sprint focuses on:

1. Adding automated testing
2. Refactoring AST traversal to reduce duplication
3. Supporting public GitHub repo URLs as input
4. Expanding Git metrics depth

---

## 1. Objectives

By the end of this sprint:

- The system must be fully testable and CI-protected.
- All AST-based extractors must use a shared traversal utility.
- The CLI must accept a public GitHub repo URL and perform full analysis.
- Git metrics must include deeper behavioral signals suitable for research.

---

## 2. Scope of Work

### Per-Task Documentation and Test Requirement

**Tests and docs are written/updated at the end of each task**, before the PR is merged. Every issue must include:

- **Tests**: Add or update unit tests covering the new/changed code (after A1 is complete)
- **JSDoc**: All new exported functions must have `@param` and `@returns` documentation
- **docs/SCHEMA.md**: Update if the issue adds or changes any report fields
- **README.md**: Update example output if the JSON structure changes
- **docs/ARCHITECTURE.md**: Update if the issue adds new modules or changes data flow

---

## Epic A — Testing Infrastructure

### A1. Add Vitest Test Framework

- Use Vitest
- Add `test` and `test:watch` scripts
- Add basic test configuration

**Acceptance Criteria**

- `npm test` runs successfully
- CI runs tests on PR
- Update README with test commands; add Vitest to prerequisites section

---

### A2. Unit Tests for Extractors

Create unit tests for:

- Cyclomatic complexity
- Function length & nesting
- Smell detection
- Maintainability index
- LOC profiling
- Git metric calculations (where possible)

Each extractor must include:

- Normal case
- Edge case
- Complex case

**Acceptance Criteria**

- Minimum 80% coverage on extractor modules
- All tests deterministic
- Update CONTRIBUTING.md with test conventions

---

### A3. Snapshot Tests

Add golden snapshot tests for:

- Full repository analysis output (fixture repo)
- Ensure JSON structure stability

**Acceptance Criteria**

- Snapshots committed
- Snapshot mismatch fails CI
- Document snapshot workflow in CONTRIBUTING.md

---

## Epic B — AST Traversal Refactor

### Problem

Each extractor currently walks the AST independently. This causes:

- Duplication
- Inconsistent traversal patterns
- Higher maintenance burden

---

### B1. Create Shared AST Walker

Create utility:

```ts
walkTree(rootNode, visitor)
```

Visitor supports:

- `enter(node)`
- `leave(node)`

All AST-based extractors must use this shared walker.

**Acceptance Criteria**

- Unit tests for `walkTree()` (enter/leave order, skip-children)
- JSDoc on `AstVisitor` and `walkTree`
- Update ARCHITECTURE.md with walker in utils

---

### B2. Refactor Extractors

Refactor the following to use shared walker:

- `complexity.ts`
- `functionMetrics.ts`
- `smells.ts`
- `functionCount.ts`

**Acceptance Criteria**

- Duplication percentage decreases
- Output remains identical (validated by snapshot tests)
- Performance does not regress

---

## Epic C — GitHub Public Repo URL Support

### C1. CLI Enhancement

Extend CLI to support:

```
ts-repo-metrics analyze <local-path>
ts-repo-metrics analyze https://github.com/user/repo
ts-repo-metrics batch <parent-dir> [--output dir] [--csv]
```

### C2. URL Validation

- Only accept GitHub public repo URLs
- Validate format
- Normalize trailing slashes

Reject:

- Non-GitHub URLs
- Invalid repo patterns

### C3. Clone Strategy

- Perform full clone (NOT shallow)
- Clone into temporary directory: `.cache/ts-repo-metrics/<repo-hash>`
- Reuse cached clone unless `--no-cache`

### C4. Metadata

Include in output JSON:

```json
{
  "source": {
    "type": "local" | "git",
    "url": "...",
    "commit": "...",
    "branch": "..."
  }
}
```

**Acceptance Criteria**

- URL input produces identical metric structure as local path
- Works on public student repos
- Full commit history preserved
- No dependency installation occurs

---

## Epic D — Improved Git Metrics Depth

Critical for AI-SDLC research.

### D1. Commit Size Distribution

Add:

- Median commit size (existing)
- P90 commit size
- % commits > 500 LOC
- % commits > 1000 LOC

### D2. Commit Burst Detection

Define burst window: ≥3 commits within 30 minutes

Output:

- `burstCount`
- `burstRatio`

### D3. Commit Entropy (Temporal Irregularity)

Measure:

- Standard deviation of time between commits

Purpose: Detect irregular AI-assisted commit patterns

### D4. Churn Hotspots

Output top 10 files by:

- Number of modifications
- Total lines changed

### D5. Test Coupling Metrics

Measure:

- % commits touching test files
- Ratio of test commits to feature commits

### D6. Refactor Commit Rate

Detect via commit message keywords:

- `refactor`, `cleanup`, `restructure`, `rename`

Output:

- `refactorCommitRatio`

### Output Schema Addition

```json
{
  "gitMetricsV2": {
    "commitStats": {},
    "burstStats": {},
    "entropy": {},
    "churn": {},
    "refactorBehavior": {},
    "testCoupling": {}
  }
}
```

---

## 3. Non-Goals

This sprint does NOT include:

- UI dashboard
- Database integration
- Private repo authentication
- AI-generated interpretation layer

---

## 4. Definition of Done

Sprint is complete when:

- All tests pass in CI
- AST traversal duplication reduced
- URL mode works
- Git metrics V2 fully implemented
- Documentation updated
- No console.log in production path

---

## 5. Research Impact

This sprint transforms the tool from:

> Experimental CLI

into

> Research-Grade Repository Analysis Engine

Capable of:

- Longitudinal student project studies
- AI-driven SDLC pattern detection
- Behavior-based repository profiling

---

## 6. Labels

- `epic:testing` — A1, A2, A3
- `epic:ast-refactor` — B1, B2
- `epic:github-url` — C1, C2, C3, C4
- `epic:git-metrics-v2` — D1–D6
- `research` — D1–D6, C4
- `infrastructure` — A1, A2, A3, B1, B2
