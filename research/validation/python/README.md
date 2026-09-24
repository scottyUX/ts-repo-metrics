# Python lexical metrics: validation against complexipy and radon

Python functions now carry cognitive complexity, Halstead metrics, and the per-function GRAD-AI MI built from them. Before this, those fields were null for Python. The TS/JS study in [`../findings.md`](../findings.md) had no Python baseline, and `1d0424e` found the earlier Python cognitive rules disagreed with Sonar on 4 of 5 shapes.

Each metric now follows one reference tool, and this folder measures how closely.

| Metric | Reference | Engine code |
|---|---|---|
| Cognitive complexity | complexipy 8.0.1 (SonarSource's spec applied to Python) | `computePythonCognitiveComplexity` in `packages/engine/src/extract/python/lexical.ts` |
| Halstead (n1, n2, N1, N2, volume, difficulty, effort) | radon 6.0.1 `HalsteadVisitor` | `computePythonHalstead` in the same file |
| Per-function MI (`maintainabilityIndexGradAi*`) | none; the existing formula applied to the validated Halstead volume, our cyclomatic complexity, and function lines | `functionMetrics.ts` |

## Results

1,992 top-level functions and methods from eight public Python repos ([`corpus.json`](corpus.json)), at pinned commits.

| | joined | exact match | notes |
|---|---|---|---|
| Cognitive vs complexipy | 1,990 | **98.19%** (Pearson 0.9964) | **99.85%** once complexipy's skipped structures are accounted for (33 functions); 3 unexplained |
| Halstead vs radon | 1,914 | **100%** of n1, n2, N1, N2 (volume Pearson 1.0) | 78 not joined: repeated names in a file whose order could not be matched |

Per-repo figures are in [`results.txt`](results.txt).

### Joining

- **Cognitive:** by file and line. complexipy reports a decorated function at its first decorator's line, and the harness uses the same line.
- **Halstead:** radon reports no line numbers. The join is by source order when a file's top-level/method names line up with radon's, and otherwise by name when it is unique in the file.
- **Nested functions:** both tools roll nested `def`s and lambdas into the enclosing function and don't report them. The engine still reports each nested function, scored over its own body, but only top-level functions and methods are compared.

## How the rules were derived

complexipy is compiled Rust, so its rules were derived one shape at a time. [`probe_complexipy_shapes.py`](probe_complexipy_shapes.py) holds every shape used. What complexipy does:

- **+1 plus nesting:** `if`, conditional expression, `for`, `while`, `except`, `match`, and each comprehension `for` clause.
- **+1 flat:** `elif`, `else`, and comprehension `if` clauses.
- **Boolean operators:** +1 per run of one operator, with parentheses looked through. `a and b and c` is 1, `a and b or c` is 2, and `a or (b or c)` is 1.
- **Recursion:** +1 once when the function calls itself by bare name.
- **Nesting rises for:** the bodies of `if`/`elif`/`else`, loops, `match` cases, `except`, conditional expressions, comprehensions, and lambdas.
- **Nesting does not rise for:** `with`, the `try` body, loop `else`, `try` `else`, or `finally`.
- **Nested `def`:** raises nesting by one only when it is a direct statement of a function body, unless that function is decorator-shaped (its body is exactly a `def` and a `return`). A `def` inside an `if` or loop, or a method of a nested class, does not raise nesting.
- **No effect:** `break`, `continue`, `raise`, `return`, `assert`, and `with`.

radon's Halstead rules come from its source:

- **Operators:** arithmetic, bitwise, boolean (one per unparenthesized chain), comparison (one per operator in a chain), unary, `not`, and augmented assignment. `+=` shares a name with `+`.
- **Operands:** the direct operands of those operators, keyed by raw value. The name `x`, the attribute `.x`, and the string `"x"` are one operand, and `True == 1` as in Python. Any other expression counts as a new, distinct operand each time.
- **Scope:** only the function body. Decorators and default arguments are excluded.

## Where the engine deliberately differs from complexipy

complexipy doesn't look inside some expressions that Sonar's spec counts:
- keyword-argument values;
- `await`;
- a call's callee;
- `*` and `**` unpacking;
- arithmetic and unary operands, `not`, and subscripts;
- boolean operands, except nested `and`/`or`.

So `g(x=1 if a else 2)` and `sum(x for x in a) - 1` score 0 there. The engine counts them. `emulateComplexipyGaps` (validation only) turns the gap back on, and that accounts for 33 of the 36 mismatches.

complexipy also adds 1 when `not` sits beside mixed `and`/`or` groups: `(a or b) and not c` is 3 there and 2 by the spec. The engine uses the spec. The remaining 2 unexplained functions involve `**` unpacking inside a dict literal and an f-string.

## Limits

- **Python Halstead is not comparable to TS/JS Halstead.** radon's definition counts far fewer operators and operands than the TS/JS scanner. Python volume, and the MI built from it, should be compared only with other Python values. Don't pool them with TS/JS in one mean.
- **Notebooks aren't in the corpus.** Neither tool reads `.ipynb`. Notebook code cells go through the same extractor as `.py` files.
- **One baseline per metric.** Where complexipy departs from Sonar's written spec, the engine follows the spec. Those departures are listed above.

## Reproduce

```bash
npm run build --prefix packages/engine
research/validation/python/run_validation.sh
```

The script creates a venv with the pinned tools, clones the corpus at the pinned commits into `.work/` (ignored), and rewrites `results.txt`.
