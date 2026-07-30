#!/usr/bin/env python3
"""
Figure 3 — analysis time vs source LOC, log-log, with fitted trend.

Plots ANALYSIS TIME WITH THE DUPLICATION STEP EXCLUDED for every repository, so
the y axis measures the same quantity everywhere. jscpd's contribution is
subtracted using its separately measured per-repo runtime; where jscpd was
killed by the engine's 60 s timeout instead of completing, the subtracted amount
is that 60 s and the point is marked, because its wall clock is dominated by a
fixed timeout rather than by work proportional to LOC.

Every repository analyzed in this run is plotted. No point is excluded.

Styling follows research/validation/analyze.py (same palette, dpi, log-log
scatter with a dashed fitted line) so the cohort figure reads as part of the
same set as the validation plots.

Usage: python3 make_figure3.py [timing_data.csv] [outdir]
"""

import csv
import sys
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Palette shared with research/validation/analyze.py
POINT = "#2b6cb0"
ACCENT = "#c53030"
FLAG = "#b7791f"

csv_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "timing_data.csv")
outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(csv_path))

rows = list(csv.DictReader(open(csv_path)))
loc = np.array([float(r["source_loc"]) for r in rows])
t = np.array([float(r["analysis_excl_dup_s"]) for r in rows])
timed_out = np.array([r["jscpd_status"] != "completed" for r in rows])
labels = [r["repo"] for r in rows]

fig, ax = plt.subplots(figsize=(8, 6))

# Fit on log-log: t = a * LOC^b. Fitted over ALL points, including the flagged
# one -- excluding it would be hand-picking.
lx, ly = np.log10(loc), np.log10(t)
b, loga = np.polyfit(lx, ly, 1)
a = 10 ** loga
xs = np.logspace(np.log10(loc.min() * 0.7), np.log10(loc.max() * 1.4), 200)
resid = ly - (b * lx + loga)
r2 = 1 - np.var(resid) / np.var(ly) if np.var(ly) > 0 else float("nan")

ax.plot(xs, a * xs ** b, linestyle="--", color=ACCENT, linewidth=1.3,
        label=f"fit: t = {a:.2e} · LOC$^{{{b:.2f}}}$  (R² = {r2:.3f})")

ok = ~timed_out
ax.scatter(loc[ok], t[ok], s=70, color=POINT, edgecolors="white", linewidth=0.8,
           zorder=3, label="duplication step completed")
if timed_out.any():
    ax.scatter(loc[timed_out], t[timed_out], s=110, marker="D", color=FLAG,
               edgecolors="white", linewidth=0.8, zorder=3,
               label="duplication step hit 60 s timeout (see findings.md)")

for x, y, lab, flag in zip(loc, t, labels, timed_out):
    # Label the rightmost point to its left so it stays inside the axes.
    right_edge = x >= loc.max() * 0.9
    ax.annotate(lab, (x, y), textcoords="offset points",
                xytext=(-10 if right_edge else 8, -3),
                ha="right" if right_edge else "left",
                fontsize=8, color=FLAG if flag else "#2d3748")

ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("Source LOC (`profile.sourceLOC`, log scale)")
ax.set_ylabel("Analysis time excluding duplication step (s, log scale)")
ax.set_title(f"Figure 3 — Analysis time vs repository size\n"
             f"n={len(rows)} repositories, analyzer_version 0.1.0")
ax.grid(alpha=0.25, linewidth=0.5, which="both")
ax.legend(loc="upper left", fontsize=8.5, framealpha=0.95)
fig.tight_layout()

for ext in ("svg", "pdf", "png"):
    fig.savefig(os.path.join(outdir, f"figure3_analysis_time_vs_loc.{ext}"),
                dpi=140, bbox_inches="tight")
plt.close(fig)

print(f"fit: t = {a:.4e} * LOC^{b:.4f}   R^2 = {r2:.4f}   n = {len(rows)}")
print(f"wrote figure3_analysis_time_vs_loc.{{svg,pdf,png}} to {outdir}")
