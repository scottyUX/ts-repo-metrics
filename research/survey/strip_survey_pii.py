#!/usr/bin/env python3
"""
Remove PII columns from the raw Qualtrics survey export.

The export is a three-row header CSV (row 1 = column names, row 2 = question
text, row 3 = Qualtrics ImportId metadata) followed by one row per respondent.
All three header rows are kept and filtered to the same surviving columns.

Dropped columns are either direct identifiers/locators (IP address, lat/long) or
Qualtrics recipient fields that are empty in this export but should not ship as
headers either. Research-relevant fields -- including GitHub Handle, Team Repo
URL, and Consent -- are deliberately kept.

Usage:
    python3 research/survey/strip_survey_pii.py [CSV_PATH]

Rewrites the file in place. Idempotent: re-running on a cleaned file is a no-op.
"""

import csv
import sys
from pathlib import Path

DEFAULT_PATH = (
    Path(__file__).parent
    / "data"
    / "raw"
    / "survey_CSE115A-C_Spring2026_2026-06-23.csv"
)

HEADER_ROWS = 3

PII_COLUMNS = [
    "IPAddress",
    "LocationLatitude",
    "LocationLongitude",
    "RecipientFirstName",
    "RecipientLastName",
    "RecipientEmail",
    "ExternalReference",
]


def strip_pii(path: Path):
    """Drop PII columns from the export at `path`, rewriting it in place."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    if len(rows) <= HEADER_ROWS:
        raise ValueError(f"{path}: expected {HEADER_ROWS} header rows plus data")

    names = rows[0]
    keep = [i for i, name in enumerate(names) if name not in PII_COLUMNS]
    dropped = [names[i] for i in range(len(names)) if i not in keep]

    filtered = [[row[i] if i < len(row) else "" for i in keep] for row in rows]

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        csv.writer(f, lineterminator="\n").writerows(filtered)

    print(f"{path}")
    print(f"  columns: {len(names)} -> {len(keep)} (dropped {len(dropped)})")
    print(f"  dropped: {', '.join(dropped) if dropped else '(none)'}")
    print(f"  rows:    {len(rows)} ({HEADER_ROWS} header + {len(rows) - HEADER_ROWS} data)")


if __name__ == "__main__":
    strip_pii(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH)
