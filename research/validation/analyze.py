#!/usr/bin/env python3
"""
Join our engine's per-function metrics against three independent baselines and
report where they disagree.

THE JOIN IS BUILT ONCE, HERE, and reused by all three metric families, so the
structural / cognitive / lexical comparisons are mutually comparable: every row
of paired_measurements.csv is the same function for all six measurements.

Join key: (repo, repo-relative file path, function name, start line).

Documented tolerances on that key -- both are recorded per row so their effect
is auditable:

  * LINE TOLERANCE (+/- LINE_TOL lines). Tools anchor a function at different
    tokens. sonarjs reports at the identifier or the `=>` token, our engine at
    the first token of the function node, escomplex at its own `lineStart`.
    Candidates within tolerance are matched nearest-first, one-to-one.

  * NAME COMPARISON IS SKIPPED WHEN EITHER SIDE IS ANONYMOUS. ts-complex and
    escomplex do not resolve `const f = () => {}` to the name `f`; our engine
    does. Requiring name equality there would report a naming-convention
    difference as a disagreement about function identity. When both sides do
    supply a name, a mismatch blocks the match, and the per-row
    `*_name_agrees` columns record how often names agreed.

Nothing here filters, windows, or trims measurements. Outliers are kept, and
functions that fail to pair are written to unmatched.csv rather than dropped.
"""

import argparse
import csv
import json
import math
import os
from collections import Counter, defaultdict

import numpy as np
from scipy import stats

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Tolerance, in lines, when attaching a tool's record to an inventory function.
LINE_TOL = 2

# Number of largest absolute disagreements to report per metric family.
TOP_N = 15

# Volumes agreeing to within this relative difference count as "exact" for the
# lexical family, where floating-point equality is not meaningful.
VOLUME_REL_TOL = 0.01


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def load_ours(work, repo):
    """Per-function records from our engine's own report JSON."""
    path = os.path.join(work, f"ours_{repo}.json")
    with open(path) as f:
        report = json.load(f)
    records = []
    for entry in report.get("perFile", []):
        rel = entry["file"]
        for fn in entry.get("functionMetrics", []):
            records.append({
                "file": rel,
                "name": None if fn["name"] == "(anonymous)" else fn["name"],
                "line": fn["startLine"],
                "node_type": fn["type"],
                "cyclomatic": fn["cyclomaticComplexity"],
                "cognitive": fn["cognitiveComplexity"],
                "volume": fn["halstead"]["volume"],
            })
    meta = {
        "analyzer_version": report.get("analyzer_version"),
        "files_analyzed": report.get("filesAnalyzed"),
        "total_functions": report.get("totals", {}).get("functions"),
        "profile": report.get("profile", {}),
    }
    return records, meta


def load_baselines(work, repo):
    with open(os.path.join(work, f"base_{repo}.json")) as f:
        return json.load(f)


def load_diagnostics(work, repo):
    """Per-function counts of the constructs where counting rules are known to differ."""
    path = os.path.join(work, f"diag_{repo}.json")
    if not os.path.exists(path):
        return {}, 0
    with open(path) as f:
        d = json.load(f)
    return d.get("counts", {}), d.get("parseFailures", 0)


# --------------------------------------------------------------------------
# The join
# --------------------------------------------------------------------------

def attach(inventory, records, use_name=True):
    """
    Attach tool `records` to `inventory` rows one-to-one within LINE_TOL.

    Returns (matched, leftover) where `matched` maps inventory index -> record
    and `leftover` is the list of records that found no inventory row.

    Matching is greedy by |line difference|, with exact-name pairs preferred at
    equal distance. A name conflict (both sides named, names differ) blocks the
    pair; an anonymous name on either side does not.
    """
    by_file = defaultdict(list)
    for idx, inv in enumerate(inventory):
        by_file[inv["file"]].append(idx)

    matched = {}
    leftover = []
    taken = set()

    # Rank candidate pairs so that the closest, best-named matches are consumed
    # first; this keeps the assignment stable regardless of record order.
    candidates = []
    for rec_i, rec in enumerate(records):
        for inv_i in by_file.get(rec["file"], []):
            inv = inventory[inv_i]
            dist = abs(inv["line"] - rec["line"])
            if dist > LINE_TOL:
                continue
            both_named = use_name and inv["name"] and rec.get("name")
            if both_named and inv["name"] != rec["name"]:
                continue
            name_bonus = 0 if both_named else 1
            candidates.append((dist, name_bonus, rec_i, inv_i))

    candidates.sort()
    used_recs = set()
    for _dist, _bonus, rec_i, inv_i in candidates:
        if rec_i in used_recs or inv_i in taken:
            continue
        used_recs.add(rec_i)
        taken.add(inv_i)
        matched[inv_i] = records[rec_i]

    for rec_i, rec in enumerate(records):
        if rec_i not in used_recs:
            leftover.append(rec)

    return matched, leftover


def build_join(work, corpus):
    """Build the single shared join across all repos. Returns (rows, unmatched, meta)."""
    rows = []
    unmatched = []
    meta = {}

    for repo in corpus:
        name = repo["name"]
        ours, ours_meta = load_ours(work, name)
        base = load_baselines(work, name)
        diag, diag_parse_failures = load_diagnostics(work, name)
        inventory = base["inventory"]

        # Restrict our engine's records to the .ts/.tsx files the inventory
        # covers. Our engine also analyzes .js/.jsx/.py, which ts-complex cannot
        # read at all; comparing only where all four tools can see the source is
        # a scope decision, recorded in findings.md, not an outlier filter.
        inv_files = set(base["files"])
        ours_in_scope = [r for r in ours if r["file"] in inv_files]
        ours_out_of_scope = len(ours) - len(ours_in_scope)

        m_ours, left_ours = attach(inventory, ours_in_scope)
        m_tsc, left_tsc = attach(inventory, base["tsComplex"])
        # sonarjs messages carry no function name, only a position.
        m_son, left_son = attach(inventory, base["sonar"], use_name=False)
        m_esc, left_esc = attach(inventory, base["escomplexRaw"])
        m_esct, left_esct = attach(inventory, base["escomplexTranspiled"])

        for idx, inv in enumerate(inventory):
            o = m_ours.get(idx)
            t = m_tsc.get(idx)
            s = m_son.get(idx)
            e = m_esc.get(idx)
            et = m_esct.get(idx)

            # The sonarjs rule reports only functions above the threshold, and we
            # ran it at threshold 0. An inventory function it did not report
            # therefore has cognitive complexity exactly 0. That inference is
            # labelled per row so it can be excluded from any claim if desired.
            if s is not None:
                sonar_value, sonar_source = s["value"], "reported"
            else:
                sonar_value, sonar_source = 0, "inferred_zero"

            # Convention counts are keyed on OUR engine's own function start
            # line, so they attach to the row our engine matched.
            d = diag.get(f"{inv['file']}:{o['line']}", {}) if o else {}

            rows.append({
                "repo": name,
                "file": inv["file"],
                "function": inv["name"] or "@anon",
                "start_line": inv["line"],
                "end_line": inv["endLine"],
                "category": inv["category"],
                "inventory_node_type": inv["nodeType"],
                "is_tsx": int(inv["isTsx"]),
                "has_jsx": int(inv["hasJsx"]),

                "ours_matched": int(o is not None),
                "ours_node_type": o["node_type"] if o else "",
                "ours_line": o["line"] if o else "",
                "ours_name_agrees": _name_agrees(inv, o),
                "ours_cyclomatic": o["cyclomatic"] if o else "",
                "ours_cognitive": o["cognitive"] if o else "",
                "ours_halstead_volume": o["volume"] if o else "",

                "tsc_matched": int(t is not None),
                "tsc_name_agrees": _name_agrees(inv, t),
                "tsc_cyclomatic": t["value"] if t else "",

                "sonar_matched": int(s is not None),
                "sonar_source": sonar_source,
                "sonar_cognitive": sonar_value,

                "esc_matched": int(e is not None),
                "esc_name_agrees": _name_agrees(inv, e),
                "esc_halstead_volume": round(e["value"], 4) if e else "",
                "esc_transpiled_matched": int(et is not None),
                "esc_transpiled_halstead_volume": round(et["value"], 4) if et else "",

                "n_else_clauses": d.get("else_clauses", ""),
                "n_empty_case_clauses": d.get("empty_case_clauses", ""),
                "n_unlabeled_jumps": d.get("unlabeled_jumps", ""),
                "n_logical_sequences": d.get("logical_sequences", ""),
                "n_nested_function_expressions": d.get("nested_fn_expr", ""),
            })

        # Inventory functions a tool never reported.
        for idx, inv in enumerate(inventory):
            for tool, m in (("ours", m_ours), ("ts-complex", m_tsc),
                            ("sonarjs", m_son), ("escomplex", m_esc)):
                if idx in m:
                    continue
                if tool == "sonarjs":
                    # Distinguish "scored 0, so not reported" from a real miss:
                    # only a function our engine also failed to see is ambiguous.
                    reason = "below_report_threshold(cognitive=0)"
                else:
                    reason = "not_reported_by_tool"
                unmatched.append({
                    "repo": name,
                    "side": "inventory_function_missed_by_tool",
                    "missed_by": tool,
                    "file": inv["file"],
                    "function": inv["name"] or "@anon",
                    "start_line": inv["line"],
                    "category": inv["category"],
                    "inventory_node_type": inv["nodeType"],
                    "is_tsx": int(inv["isTsx"]),
                    "reason": reason,
                })

        # Tool records that attached to no inventory function.
        for tool, left in (("ours", left_ours), ("ts-complex", left_tsc),
                           ("sonarjs", left_son), ("escomplex", left_esc)):
            for rec in left:
                unmatched.append({
                    "repo": name,
                    "side": "tool_record_not_in_inventory",
                    "missed_by": tool,
                    "file": rec["file"],
                    "function": rec.get("name") or "@anon",
                    "start_line": rec["line"],
                    "category": "",
                    "inventory_node_type": rec.get("node_type", ""),
                    "is_tsx": int(rec["file"].endswith(".tsx")),
                    "reason": "no_inventory_function_within_line_tolerance",
                })

        meta[name] = {
            **ours_meta,
            "commit": repo["commit"],
            "url": repo.get("url"),
            "path": repo["path"],
            "ts_tsx_files": base["fileCount"],
            "inventory_functions": len(inventory),
            "ours_records_in_scope": len(ours_in_scope),
            "ours_records_out_of_scope": ours_out_of_scope,
            "tsc_records": len(base["tsComplex"]),
            "sonar_records": len(base["sonar"]),
            "esc_records": len(base["escomplexRaw"]),
            "esc_transpiled_records": len(base["escomplexTranspiled"]),
            "collector_errors": len(base["errors"]),
            "collector_error_sample": base["errors"][:5],
            "engine_parse_failures": diag_parse_failures,
            "versions": base["versions"],
        }

    return rows, unmatched, meta


def _name_agrees(inv, rec):
    """1 / 0 when both sides name the function, blank when either is anonymous."""
    if rec is None:
        return ""
    if not inv["name"] or not rec.get("name"):
        return ""
    return int(inv["name"] == rec["name"])


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------

def family_stats(rows, ours_key, base_key, exact_rel_tol=None, gate=None):
    """
    Paired statistics for one metric family, over every row where both sides
    produced a value. No trimming, no windowing.
    """
    pairs = []
    for r in rows:
        if not r["ours_matched"]:
            continue
        if gate and not gate(r):
            continue
        o, b = r[ours_key], r[base_key]
        if o == "" or b == "":
            continue
        pairs.append((float(o), float(b), r))

    if not pairs:
        return {"n": 0}

    ours = np.array([p[0] for p in pairs], dtype=float)
    base = np.array([p[1] for p in pairs], dtype=float)
    diff = ours - base

    if exact_rel_tol is None:
        exact = int(np.sum(ours == base))
    else:
        denom = np.maximum(np.abs(base), 1e-12)
        exact = int(np.sum(np.abs(diff) / denom <= exact_rel_tol))

    if np.std(ours) == 0 or np.std(base) == 0:
        rho, pval = float("nan"), float("nan")
    else:
        rho, pval = stats.spearmanr(ours, base)

    mean_d = float(np.mean(diff))
    sd_d = float(np.std(diff, ddof=1)) if len(diff) > 1 else 0.0

    # A constant offset points at a counting-convention mismatch rather than a
    # genuine disagreement, so the modal difference is reported explicitly.
    rounded = np.round(diff, 6)
    modal_diff, modal_count = Counter(rounded.tolist()).most_common(1)[0]

    return {
        "n": len(pairs),
        "exact_agreement": exact,
        "exact_agreement_rate": exact / len(pairs),
        "spearman_rho": float(rho),
        "spearman_p": float(pval),
        "mean_diff": mean_d,
        "median_diff": float(np.median(diff)),
        "sd_diff": sd_d,
        "modal_diff": float(modal_diff),
        "modal_diff_share": modal_count / len(pairs),
        "diff_percentiles": {
            str(p): float(np.percentile(diff, p)) for p in (1, 5, 25, 50, 75, 95, 99)
        },
        "diff_min": float(np.min(diff)),
        "diff_max": float(np.max(diff)),
        "ours_mean": float(np.mean(ours)),
        "base_mean": float(np.mean(base)),
        "ours_median": float(np.median(ours)),
        "base_median": float(np.median(base)),
        "ba_bias": mean_d,
        "ba_loa_lower": mean_d - 1.96 * sd_d,
        "ba_loa_upper": mean_d + 1.96 * sd_d,
        "pairs": pairs,
    }


def attribute(rows, ours_key, base_key, predictor, label):
    """
    Test whether a divergence is explained by a known counting-convention
    difference: `predictor(row)` gives the difference the convention alone would
    produce, and we ask how often that equals the observed difference.

    A high explained share means the tools are counting the same code correctly
    under different rules; a large residual means something else is going on.
    """
    obs, pred = [], []
    for r in rows:
        if not r["ours_matched"]:
            continue
        o, b = r[ours_key], r[base_key]
        if o == "" or b == "":
            continue
        p = predictor(r)
        if p is None:
            continue
        obs.append(float(o) - float(b))
        pred.append(float(p))
    if not obs:
        return {"label": label, "n": 0}

    obs = np.array(obs)
    pred = np.array(pred)
    residual = obs - pred
    disagreeing = obs != 0
    return {
        "label": label,
        "n": len(obs),
        "disagreeing_pairs": int(np.sum(disagreeing)),
        "predicted_exactly": int(np.sum(residual == 0)),
        "predicted_exactly_rate": float(np.mean(residual == 0)),
        "disagreeing_predicted_exactly": int(np.sum(residual[disagreeing] == 0))
        if np.any(disagreeing) else 0,
        "disagreeing_predicted_exactly_rate": float(np.mean(residual[disagreeing] == 0))
        if np.any(disagreeing) else float("nan"),
        "mean_observed_diff": float(np.mean(obs)),
        "mean_predicted_diff": float(np.mean(pred)),
        "mean_residual": float(np.mean(residual)),
        "residual_sd": float(np.std(residual, ddof=1)) if len(residual) > 1 else 0.0,
        "variance_explained": float(1 - np.var(residual) / np.var(obs))
        if np.var(obs) > 0 else float("nan"),
    }


def _num(v):
    return 0 if v == "" else float(v)


def top_disagreements(stats_block, corpus_paths, n=TOP_N):
    """The n largest absolute disagreements, with a source excerpt for each."""
    pairs = sorted(stats_block["pairs"], key=lambda p: abs(p[0] - p[1]), reverse=True)[:n]
    out = []
    for ours, base, row in pairs:
        out.append({
            "repo": row["repo"],
            "file": row["file"],
            "function": row["function"],
            "start_line": row["start_line"],
            "category": row["category"],
            "ours": ours,
            "baseline": base,
            "diff": ours - base,
            "excerpt": read_excerpt(corpus_paths, row),
        })
    return out


def read_excerpt(corpus_paths, row, max_lines=12):
    root = corpus_paths.get(row["repo"])
    if not root:
        return ""
    path = os.path.join(root, row["file"])
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()
    except OSError:
        return ""
    start = max(0, row["start_line"] - 1)
    end = min(len(lines), row["end_line"])
    body = lines[start:end]
    if len(body) > max_lines:
        body = body[: max_lines - 1] + [f"    ... ({end - start - max_lines + 1} more lines)"]
    return "\n".join(body)


# --------------------------------------------------------------------------
# Plots
# --------------------------------------------------------------------------

def scatter(stats_block, title, xlabel, ylabel, path):
    if not stats_block.get("n"):
        return
    ours = np.array([p[0] for p in stats_block["pairs"]])
    base = np.array([p[1] for p in stats_block["pairs"]])

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(base, ours, s=14, alpha=0.35, edgecolors="none", color="#2b6cb0")

    lo = float(min(base.min(), ours.min()))
    hi = float(max(base.max(), ours.max()))
    pad = (hi - lo) * 0.04 or 1.0
    ax.plot([lo - pad, hi + pad], [lo - pad, hi + pad],
            color="#c53030", linewidth=1.2, linestyle="--", label="y = x (perfect agreement)")

    ax.set_xlim(lo - pad, hi + pad)
    ax.set_ylim(lo - pad, hi + pad)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(
        f"{title}\nn={stats_block['n']}  "
        f"exact={stats_block['exact_agreement_rate']:.1%}  "
        f"Spearman rho={stats_block['spearman_rho']:.3f}  "
        f"bias={stats_block['ba_bias']:+.2f}"
    )
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(alpha=0.2, linewidth=0.5)
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

PAIRED_COLUMNS = [
    "repo", "file", "function", "start_line", "end_line", "category",
    "inventory_node_type", "is_tsx", "has_jsx",
    "ours_matched", "ours_node_type", "ours_line", "ours_name_agrees",
    "ours_cyclomatic", "ours_cognitive", "ours_halstead_volume",
    "tsc_matched", "tsc_name_agrees", "tsc_cyclomatic",
    "sonar_matched", "sonar_source", "sonar_cognitive",
    "esc_matched", "esc_name_agrees", "esc_halstead_volume",
    "esc_transpiled_matched", "esc_transpiled_halstead_volume",
    "n_else_clauses", "n_empty_case_clauses", "n_unlabeled_jumps",
    "n_logical_sequences", "n_nested_function_expressions",
]

UNMATCHED_COLUMNS = [
    "repo", "side", "missed_by", "file", "function", "start_line",
    "category", "inventory_node_type", "is_tsx", "reason",
]


def write_csv(path, columns, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def fmt_stats(s):
    if not s.get("n"):
        return "_No paired measurements._\n"
    p = s["diff_percentiles"]
    return (
        f"| paired functions (n) | {s['n']} |\n"
        f"| exact agreement | {s['exact_agreement']} / {s['n']} = **{s['exact_agreement_rate']:.1%}** |\n"
        f"| Spearman rho | **{s['spearman_rho']:.4f}** (p = {s['spearman_p']:.3g}) |\n"
        f"| mean signed diff (ours - baseline) | **{s['mean_diff']:+.3f}** |\n"
        f"| median signed diff | **{s['median_diff']:+.3f}** |\n"
        f"| sd of diff | {s['sd_diff']:.3f} |\n"
        f"| modal diff | {s['modal_diff']:+g} (holds for {s['modal_diff_share']:.1%} of pairs) |\n"
        f"| diff percentiles p1/p5/p25/p50/p75/p95/p99 | "
        f"{p['1']:+.2f} / {p['5']:+.2f} / {p['25']:+.2f} / {p['50']:+.2f} / "
        f"{p['75']:+.2f} / {p['95']:+.2f} / {p['99']:+.2f} |\n"
        f"| diff range | {s['diff_min']:+.2f} to {s['diff_max']:+.2f} |\n"
        f"| mean ours / baseline | {s['ours_mean']:.2f} / {s['base_mean']:.2f} |\n"
        f"| median ours / baseline | {s['ours_median']:.2f} / {s['base_median']:.2f} |\n"
        f"| Bland-Altman bias | **{s['ba_bias']:+.3f}** |\n"
        f"| Bland-Altman 95% limits of agreement | **[{s['ba_loa_lower']:+.3f}, {s['ba_loa_upper']:+.3f}]** |\n"
    )


def fmt_top(top, ours_label, base_label):
    lines = [
        f"| # | repo | file:line | function | category | ours ({ours_label}) | baseline ({base_label}) | diff |",
        "|---|------|-----------|----------|----------|------|----------|------|",
    ]
    for i, t in enumerate(top, 1):
        lines.append(
            f"| {i} | {t['repo']} | `{t['file']}`:{t['start_line']} | `{t['function']}` | "
            f"{t['category']} | {t['ours']:g} | {t['baseline']:g} | {t['diff']:+g} |"
        )
    lines.append("")
    for i, t in enumerate(top, 1):
        lines.append(f"<details><summary>{i}. <code>{t['file']}:{t['start_line']}</code> "
                     f"<code>{t['function']}</code> &mdash; ours {t['ours']:g} vs "
                     f"baseline {t['baseline']:g}</summary>\n")
        lines.append("```ts")
        lines.append(t["excerpt"])
        lines.append("```\n</details>\n")
    return "\n".join(lines)


def join_rates(rows, unmatched, meta):
    """Per-baseline join rates plus a categorised breakdown of what went unpaired."""
    total_inv = len(rows)
    out = {"inventory_functions": total_inv}
    for tool, col in (("ours", "ours_matched"), ("ts-complex", "tsc_matched"),
                      ("sonarjs", "sonar_matched"), ("escomplex", "esc_matched")):
        matched = sum(r[col] for r in rows)
        out[tool] = {
            "reported_records": sum(
                m[{"ours": "ours_records_in_scope", "ts-complex": "tsc_records",
                   "sonarjs": "sonar_records", "escomplex": "esc_records"}[tool]]
                for m in meta.values()
            ),
            "paired_to_inventory": matched,
            "join_rate": matched / total_inv if total_inv else 0.0,
        }
    # Pairs usable per family need BOTH sides.
    out["usable_pairs"] = {
        "structural": sum(1 for r in rows if r["ours_matched"] and r["tsc_matched"]),
        "cognitive": sum(1 for r in rows if r["ours_matched"]),
        "lexical": sum(1 for r in rows if r["ours_matched"] and r["esc_matched"]),
    }
    by_cat = defaultdict(Counter)
    for u in unmatched:
        if u["side"] == "inventory_function_missed_by_tool":
            by_cat[u["missed_by"]][u["category"] or "(uncategorised)"] += 1
    out["missed_by_category"] = {k: dict(v.most_common()) for k, v in by_cat.items()}
    stray = Counter()
    for u in unmatched:
        if u["side"] == "tool_record_not_in_inventory":
            stray[u["missed_by"]] += 1
    out["tool_records_outside_inventory"] = dict(stray)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--engine-sha", default="")
    ap.add_argument("--engine-version", default="")
    args = ap.parse_args()

    with open(args.corpus) as f:
        corpus = json.load(f)
    corpus_paths = {r["name"]: r["path"] for r in corpus}

    rows, unmatched, meta = build_join(args.work, corpus)

    os.makedirs(os.path.join(args.out, "plots"), exist_ok=True)
    write_csv(os.path.join(args.out, "paired_measurements.csv"), PAIRED_COLUMNS, rows)
    write_csv(os.path.join(args.out, "unmatched.csv"), UNMATCHED_COLUMNS, unmatched)

    structural = family_stats(rows, "ours_cyclomatic", "tsc_cyclomatic")
    cognitive = family_stats(rows, "ours_cognitive", "sonar_cognitive")
    lexical = family_stats(rows, "ours_halstead_volume", "esc_halstead_volume",
                           exact_rel_tol=VOLUME_REL_TOL)
    # Same lexical comparison restricted to sonarjs-reported (non-inferred) rows
    # and to the transpiled escomplex pass, so both caveats can be quantified.
    cognitive_reported_only = family_stats(
        rows, "ours_cognitive", "sonar_cognitive",
        gate=lambda r: r["sonar_source"] == "reported")
    lexical_transpiled = family_stats(
        rows, "ours_halstead_volume", "esc_transpiled_halstead_volume",
        exact_rel_tol=VOLUME_REL_TOL)
    lexical_ts_only = family_stats(
        rows, "ours_halstead_volume", "esc_halstead_volume",
        exact_rel_tol=VOLUME_REL_TOL, gate=lambda r: not r["is_tsx"])
    lexical_tsx_only = family_stats(
        rows, "ours_halstead_volume", "esc_halstead_volume",
        exact_rel_tol=VOLUME_REL_TOL, gate=lambda r: bool(r["is_tsx"]))

    # DISCLOSURE, not a filter: the headline agreement rates are dominated by
    # trivial functions where both tools trivially return the same small number.
    # The headline figures above stand as computed over everything; these show
    # what is left once functions that are trivial for BOTH tools are set aside.
    structural_nontrivial = family_stats(
        rows, "ours_cyclomatic", "tsc_cyclomatic",
        gate=lambda r: max(_num(r["ours_cyclomatic"]), _num(r["tsc_cyclomatic"])) >= 2)
    cognitive_nontrivial = family_stats(
        rows, "ours_cognitive", "sonar_cognitive",
        gate=lambda r: max(_num(r["ours_cognitive"]), _num(r["sonar_cognitive"])) >= 1)

    # Convention attribution.
    attribution = [
        attribute(
            rows, "ours_cyclomatic", "tsc_cyclomatic",
            lambda r: _num(r["n_else_clauses"]) + _num(r["n_empty_case_clauses"]),
            "structural: else_clause + empty fall-through case",
        ),
        attribute(
            rows, "ours_cognitive", "sonar_cognitive",
            lambda r: _num(r["n_unlabeled_jumps"])
            - _num(r["n_logical_sequences"])
            - _num(r["n_else_clauses"]),
            "cognitive: unlabeled jumps - logical-operator runs - else",
        ),
    ]

    scatter(structural, "Structural: cyclomatic complexity",
            "ts-complex (TypeScript compiler API)", "ours (Tree-sitter)",
            os.path.join(args.out, "plots", "structural_cyclomatic.png"))
    scatter(cognitive, "Cognitive: cognitive complexity",
            "eslint-plugin-sonarjs", "ours (Tree-sitter)",
            os.path.join(args.out, "plots", "cognitive.png"))
    scatter(lexical, "Lexical: Halstead volume",
            "typhonjs-escomplex (raw TS/TSX parse)", "ours (Tree-sitter)",
            os.path.join(args.out, "plots", "lexical_halstead_volume.png"))

    jr = join_rates(rows, unmatched, meta)

    summary = {
        "engine": {"git_sha": args.engine_sha, "analyzer_version": args.engine_version},
        "line_tolerance": LINE_TOL,
        "corpus": meta,
        "join_rates": jr,
        "structural": {k: v for k, v in structural.items() if k != "pairs"},
        "structural_nontrivial": {k: v for k, v in structural_nontrivial.items() if k != "pairs"},
        "cognitive": {k: v for k, v in cognitive.items() if k != "pairs"},
        "cognitive_nontrivial": {k: v for k, v in cognitive_nontrivial.items() if k != "pairs"},
        "cognitive_reported_only": {k: v for k, v in cognitive_reported_only.items() if k != "pairs"},
        "attribution": attribution,
        "lexical": {k: v for k, v in lexical.items() if k != "pairs"},
        "lexical_transpiled": {k: v for k, v in lexical_transpiled.items() if k != "pairs"},
        "lexical_ts_only": {k: v for k, v in lexical_ts_only.items() if k != "pairs"},
        "lexical_tsx_only": {k: v for k, v in lexical_tsx_only.items() if k != "pairs"},
        "top_structural": [
            {k: v for k, v in t.items() if k != "excerpt"}
            for t in top_disagreements(structural, corpus_paths)
        ],
        "top_cognitive": [
            {k: v for k, v in t.items() if k != "excerpt"}
            for t in top_disagreements(cognitive, corpus_paths)
        ],
        "top_lexical": [
            {k: v for k, v in t.items() if k != "excerpt"}
            for t in top_disagreements(lexical, corpus_paths)
        ],
    }
    with open(os.path.join(args.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2, default=str)

    # findings.md prose is written by hand; this file carries the numbers and
    # the ready-to-paste tables so the two cannot drift apart.
    with open(os.path.join(args.out, "stats_tables.md"), "w") as f:
        f.write("<!-- generated by analyze.py; do not edit by hand -->\n\n")
        for label, block, ours_l, base_l in (
            ("Structural (cyclomatic) vs ts-complex", structural, "cyclomatic", "ts-complex"),
            ("Structural, non-trivial subset (max >= 2)", structural_nontrivial, "cyclomatic", "ts-complex"),
            ("Cognitive vs eslint-plugin-sonarjs", cognitive, "cognitive", "sonarjs"),
            ("Cognitive, non-trivial subset (max >= 1)", cognitive_nontrivial, "cognitive", "sonarjs"),
            ("Cognitive, sonarjs-reported rows only", cognitive_reported_only, "cognitive", "sonarjs"),
            ("Lexical (Halstead volume) vs escomplex, raw parse", lexical, "volume", "escomplex"),
            ("Lexical, .ts only", lexical_ts_only, "volume", "escomplex"),
            ("Lexical, .tsx only", lexical_tsx_only, "volume", "escomplex"),
            ("Lexical vs escomplex, Babel-transpiled parse", lexical_transpiled, "volume", "escomplex"),
        ):
            f.write(f"### {label}\n\n| statistic | value |\n|---|---|\n")
            f.write(fmt_stats(block))
            f.write("\n")
        for label, block, ours_l, base_l in (
            ("structural", structural, "cyclomatic", "ts-complex"),
            ("cognitive", cognitive, "cognitive", "sonarjs"),
            ("lexical", lexical, "Halstead volume", "escomplex"),
        ):
            f.write(f"### Top {TOP_N} disagreements — {label}\n\n")
            f.write(fmt_top(top_disagreements(block, corpus_paths), ours_l, base_l))
            f.write("\n")
        f.write("### Convention attribution\n\n")
        f.write("| model | pairs | disagreeing | disagreements the convention predicts exactly | "
                "mean observed diff | mean predicted diff | mean residual | variance explained |\n")
        f.write("|---|---|---|---|---|---|---|---|\n")
        for a in attribution:
            if not a.get("n"):
                continue
            f.write(
                f"| {a['label']} | {a['n']} | {a['disagreeing_pairs']} | "
                f"{a['disagreeing_predicted_exactly']} / {a['disagreeing_pairs']} = "
                f"{a['disagreeing_predicted_exactly_rate']:.1%} | "
                f"{a['mean_observed_diff']:+.3f} | {a['mean_predicted_diff']:+.3f} | "
                f"{a['mean_residual']:+.3f} | {a['variance_explained']:.1%} |\n"
            )
        f.write("\n### Join rates\n\n```json\n")
        f.write(json.dumps(jr, indent=2))
        f.write("\n```\n")

    print(json.dumps({
        "join_rates": jr,
        "structural": {k: summary["structural"][k] for k in
                       ("n", "exact_agreement_rate", "spearman_rho", "mean_diff",
                        "median_diff", "modal_diff", "modal_diff_share",
                        "ba_bias", "ba_loa_lower", "ba_loa_upper")},
        "cognitive": {k: summary["cognitive"][k] for k in
                      ("n", "exact_agreement_rate", "spearman_rho", "mean_diff",
                       "median_diff", "modal_diff", "modal_diff_share",
                       "ba_bias", "ba_loa_lower", "ba_loa_upper")},
        "lexical": {k: summary["lexical"][k] for k in
                    ("n", "exact_agreement_rate", "spearman_rho", "mean_diff",
                     "median_diff", "ba_bias", "ba_loa_lower", "ba_loa_upper")},
    }, indent=2))


if __name__ == "__main__":
    main()
