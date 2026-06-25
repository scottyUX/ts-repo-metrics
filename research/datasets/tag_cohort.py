#!/usr/bin/env python3
"""
Merge pre-AI (2021) and post-AI (2026) repo lists into a single cohort manifest.

Combines research/datasets/pre_ai_baseline.csv and research/datasets/post_ai_30.csv
into research/datasets/manifest_sprint1.csv with cohort tags and analysis metadata.
"""

import csv
from pathlib import Path


def _validate_row(row: dict, required: list, cohort: str, row_num: int):
    for field in required:
        if field not in row:
            raise ValueError(f"{cohort} row {row_num}: missing column '{field}'")
        value = row[field]
        if value is None or not value.strip():
            raise ValueError(f"{cohort} row {row_num}: blank required field '{field}'")


def merge_cohorts():
    """Merge pre-AI and post-AI repos into manifest."""
    script_dir = Path(__file__).parent
    pre_ai_path = script_dir / "pre_ai_baseline.csv"
    post_ai_path = script_dir / "post_ai_30.csv"
    output_path = script_dir / "manifest_sprint1.csv"

    rows = []

    # Read pre-AI repos
    if pre_ai_path.exists():
        with open(pre_ai_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row_num, row in enumerate(reader, start=2):
                _validate_row(row, ["owner", "repo", "url"], "pre_ai", row_num)
                rows.append({
                    "cohort": "pre_ai",
                    "owner": row["owner"].strip(),
                    "repo": row["repo"].strip(),
                    "repo_url": row["url"].strip(),
                    "analysis_source": "local_run",
                })

    # Read post-AI repos
    if post_ai_path.exists():
        with open(post_ai_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row_num, row in enumerate(reader, start=2):
                _validate_row(row, ["owner", "repo", "repo_url"], "post_ai", row_num)
                rows.append({
                    "cohort": "post_ai",
                    "owner": row["owner"].strip(),
                    "repo": row["repo"].strip(),
                    "repo_url": row["repo_url"].strip(),
                    "analysis_source": "supabase",
                })

    # Write manifest
    fieldnames = ["cohort", "owner", "repo", "repo_url", "analysis_source"]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[OK] Merged {len(rows)} repos into {output_path.name}")
    pre_count = sum(1 for r in rows if r["cohort"] == "pre_ai")
    post_count = sum(1 for r in rows if r["cohort"] == "post_ai")
    print(f"  Pre-AI:  {pre_count} repos")
    print(f"  Post-AI: {post_count} repos")


if __name__ == "__main__":
    merge_cohorts()
