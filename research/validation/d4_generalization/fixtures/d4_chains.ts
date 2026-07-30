// Fixtures for testing whether the D4 rule (terminal `else` gets its own flat
// +1, separate from the chain's nesting escalation) generalizes beyond the
// single 3-link case it was derived from.
//
// Each function isolates ONE chain shape. No `&&`/`||` anywhere: logical-operator
// counting is a SEPARATE known divergence (see fixture_table.md h4_logicalOps,
// BoolLogical) and mixing it in would confound the D4 signal.
// Every chain sits at the top level of its function so nesting depth is 0 and
// the expected Sonar score is just the number of increments.

// ---------------------------------------------------------------------------
// The three cases named in the task
// ---------------------------------------------------------------------------

// (1) 2-link chain: if / else if / else
export function chain2Link(n: number) {
  if (n === 1) {
    return 1;
  } else if (n === 2) {
    return 2;
  } else {
    return 0;
  }
}

// (2) 4-link chain: if / else if / else if / else if / else
// NOTE: this is structurally identical to the existing `elseIfChain` fixture in
// ../../fixtures/else_chains.ts, i.e. the very case D4 was tuned on. Included
// for completeness/traceability, but it cannot by itself show generalization.
export function chain4Link(n: number) {
  if (n === 1) {
    return 1;
  } else if (n === 2) {
    return 2;
  } else if (n === 3) {
    return 3;
  } else if (n === 4) {
    return 4;
  } else {
    return 0;
  }
}

// (3) Chain with NO terminal else: if / else if / else if
// This is the case that isolates D4 directly -- the terminal-else branch of the
// rule never fires here, so the chain must score purely from its links.
export function chainNoTerminalElse(n: number) {
  if (n === 1) {
    return 1;
  } else if (n === 2) {
    return 2;
  } else if (n === 3) {
    return 3;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Supplementary cases.
// Case (2) reproduces the tuning target, so on its own the specified set gives
// little new signal. These probe where a fixture-fitted rule would most likely
// break: interaction with real nesting, and chain length beyond the tuned one.
// ---------------------------------------------------------------------------

// (4) Chain nested one level inside an `if`. Sonar applies the nesting increment
// to the leading `if` of the inner chain but NOT to its `else if` / `else`
// links. This is the sharpest test of D4 vs. the nesting escalation.
export function chainNestedOneLevel(n: number, flag: boolean) {
  if (flag) {
    if (n === 1) {
      return 1;
    } else if (n === 2) {
      return 2;
    } else {
      return 0;
    }
  }
  return -1;
}

// (5) Chain nested two levels deep.
export function chainNestedTwoLevels(n: number, a: boolean, b: boolean) {
  if (a) {
    if (b) {
      if (n === 1) {
        return 1;
      } else if (n === 2) {
        return 2;
      } else {
        return 0;
      }
    }
  }
  return -1;
}

// (6) Longer than anything tuned: 6 links + terminal else.
export function chain6Link(n: number) {
  if (n === 1) {
    return 1;
  } else if (n === 2) {
    return 2;
  } else if (n === 3) {
    return 3;
  } else if (n === 4) {
    return 4;
  } else if (n === 5) {
    return 5;
  } else if (n === 6) {
    return 6;
  } else {
    return 0;
  }
}

// (7) Bare if/else, no else-if links at all -- the minimal terminal-else case.
export function chainPlainElse(n: number) {
  if (n === 1) {
    return 1;
  } else {
    return 0;
  }
}

// (8) A nested if INSIDE a terminal else. The else body genuinely nests, so the
// inner `if` should take a nesting increment. Distinguishes "else adds +1" from
// "else opens a nesting level".
export function chainElseContainingIf(n: number, flag: boolean) {
  if (n === 1) {
    return 1;
  } else {
    if (flag) {
      return 2;
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Discriminating cases, added after the first run showed divergences in BOTH
// directions. These separate "does `else if` take a nesting increment?" from
// "does `else if` raise the nesting level for its own body?" -- two independent
// questions that the cases above cannot tell apart.
// ---------------------------------------------------------------------------

// (9) An `if` inside an `else if` BODY. If `else if` raises the nesting level,
// the inner `if` is worth +2; if it does not, +1.
export function elseIfContainingIf(n: number, flag: boolean) {
  if (n === 1) {
    return 1;
  } else if (n === 2) {
    if (flag) {
      return 2;
    }
    return 0;
  }
  return -1;
}

// (10) A loop inside a terminal else, to confirm the else-body nesting result
// generalizes past `if` to other nesting-increment structures.
export function elseContainingLoop(n: number, items: number[]) {
  if (n === 1) {
    return 1;
  } else {
    for (const it of items) {
      if (it > 0) {
        return it;
      }
    }
    return 0;
  }
}
