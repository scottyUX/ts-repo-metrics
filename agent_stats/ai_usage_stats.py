#!/usr/bin/env python3
"""
ai_usage_stats — export AI coding-agent activity to ai_usage_trace.csv.

Supported agents: cursor

Usage:
  python ai_usage_stats.py --agent cursor [--roots DIR [DIR ...]] [--csv OUT.csv] [--verbose]

Flags:
  --agent   Agent type to parse.  Currently: cursor
  --roots   One or more directories to search for logs (overrides the default
            macOS paths documented in parsers/cursor.py).
  --csv     Write output to this path instead of stdout.
  --verbose Print skipped-line warnings to stderr.
"""

import argparse
import sys
from pathlib import Path

from typing import List, Dict
from parsers.cursor import CSV_HEADERS, find_cursor_logs, parse_cursor_jsonl, rows_to_csv


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Export AI coding-agent logs to ai_usage_trace.csv.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--agent",
        choices=["cursor"],
        required=True,
        help="Which agent's logs to parse.",
    )
    p.add_argument(
        "--roots",
        nargs="+",
        metavar="DIR",
        help="Override default log search paths.",
    )
    p.add_argument(
        "--csv",
        metavar="PATH",
        help="Write CSV to this file (default: stdout).",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Print warnings about skipped lines to stderr.",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()

    roots = [Path(r) for r in args.roots] if args.roots else None

    if args.agent == "cursor":
        log_files = find_cursor_logs(roots)
        if not log_files:
            print(
                "[ai_usage_stats] No Cursor log files found. "
                "Pass --roots to specify a directory.",
                file=sys.stderr,
            )
            # Still write an empty CSV with correct headers so callers can detect
            # the run completed (just with no data).
            rows: List[Dict[str, str]] = []
        else:
            rows: List[Dict[str, str]] = []
            for log_path in log_files:
                rows.extend(parse_cursor_jsonl(log_path, verbose=args.verbose))
    else:
        print(f"[ai_usage_stats] Unknown agent: {args.agent}", file=sys.stderr)
        return 1

    csv_text = rows_to_csv(rows)

    if args.csv:
        out_path = Path(args.csv)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(csv_text, encoding="utf-8")
        if args.verbose:
            print(f"[ai_usage_stats] Wrote {len(rows)} rows to {out_path}", file=sys.stderr)
    else:
        sys.stdout.write(csv_text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
