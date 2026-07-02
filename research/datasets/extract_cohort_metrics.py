#!/usr/bin/env python3
"""Extract the 8 comparison metrics from report_json for every repo in manifest_sprint2.csv."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "research" / "datasets" / "manifest_sprint2.csv"
SAMPLES_DIR = ROOT / "research" / "datasets" / "samples"
RAW_REPORTS_DIR = ROOT / "research" / "datasets" / "raw_reports"
OUTPUT_PATH = ROOT / "research" / "datasets" / "outputs" / "cohort_metrics_flat.csv"

FIELDS = [
    "cohort",
    "owner",
    "repo",
    "repo_url",
    "source_file",
    "complexity_average",
    "maintainability_score",
    "smells_longFunctions",
    "profile_sourceLOC",
    "testCoverageProxy_ratio",
    "phase3_sfd",
    "phase3_srs",
    "distributions_p90_complexity",
]


def find_report(cohort: str, owner: str, repo: str) -> Path | None:
    filename = f"{owner}-{repo}.json"
    for base in (SAMPLES_DIR, RAW_REPORTS_DIR):
        candidate = base / cohort / filename
        if candidate.exists():
            return candidate
    return None


def extract_metrics(report: dict) -> dict:
    phase3 = report.get("phase3") or {}
    distributions = report.get("distributions") or {}
    return {
        "complexity_average": report.get("complexity", {}).get("average", ""),
        "maintainability_score": report.get("maintainability", {}).get("score", ""),
        "smells_longFunctions": report.get("smells", {}).get("longFunctions", ""),
        "profile_sourceLOC": report.get("profile", {}).get("sourceLOC", ""),
        "testCoverageProxy_ratio": report.get("testCoverageProxy", {}).get("ratio", ""),
        "phase3_sfd": phase3.get("sfd", ""),
        "phase3_srs": phase3.get("srs", ""),
        "distributions_p90_complexity": distributions.get("p90_complexity", ""),
    }


def main() -> None:
    with MANIFEST_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    out_rows = []
    missing = []
    for row in rows:
        cohort, owner, repo, repo_url = row["cohort"], row["owner"], row["repo"], row["repo_url"]
        source_path = find_report(cohort, owner, repo)

        out_row = {
            "cohort": cohort,
            "owner": owner,
            "repo": repo,
            "repo_url": repo_url,
            "source_file": str(source_path.relative_to(ROOT)) if source_path else "",
        }

        if source_path is None:
            missing.append(f"{cohort}/{owner}/{repo}")
            out_row.update({k: "" for k in FIELDS if k not in out_row})
        else:
            report = json.loads(source_path.read_text(encoding="utf-8"))
            out_row.update(extract_metrics(report))

        out_rows.append(out_row)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"Wrote {len(out_rows)} rows to {OUTPUT_PATH.relative_to(ROOT)}")
    if missing:
        print(f"Missing report_json for {len(missing)} repos:")
        for m in missing:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
