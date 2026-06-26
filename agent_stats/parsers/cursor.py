"""
Cursor JSONL log parser.

Reads Cursor conversation logs (one JSON object per line) and yields normalized
rows compatible with the ai_usage_trace.csv format the dashboard expects.

Default log locations on macOS:
  ~/Library/Application Support/Cursor/User/workspaceStorage/*/chat.jsonl
  ~/Library/Application Support/Cursor/logs/*/cursor-chat.jsonl

See agent_stats/docs/CURSOR_LOG_FORMAT.md for the full field reference.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterator, List, Optional

CSV_HEADERS: List[str] = [
    "timestamp",
    "event_type",
    "coding_agent",
    "tool_name",
    "execution_time",
    "working_dir",
    "repo_root",
    "session_id",
    "message_text",
    "input_tokens",
    "output_tokens",
    "cache_creation_tokens",
    "cache_read_tokens",
    "model",
]

# Cursor tool names
_TOOL_ALIASES: Dict[str, str] = {
    "read_file": "Read",
    "edit_file": "Edit",
    "create_file": "Write",
    "run_terminal_cmd": "Bash",
    "grep_search": "Grep",
    "file_search": "Glob",
    "list_dir": "Glob",
    "codebase_search": "codebase_search",
    "web_search": "WebSearch",
    "delete_file": "Bash",
}

# Default search roots for Cursor logs on macOS
_DEFAULT_ROOTS_MAC: List[Path] = [
    Path.home() / "Library" / "Application Support" / "Cursor" / "User" / "workspaceStorage",
    Path.home() / "Library" / "Application Support" / "Cursor" / "logs",
]


def _get_repo_root(working_dir: str) -> str:
    """Return the git repo root for working_dir, or empty string if not in a repo."""
    if not working_dir:
        return ""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=working_dir,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    return ""


def _canonical_tool(raw_name: str) -> str:
    return _TOOL_ALIASES.get(raw_name, raw_name)


def _safe_str(value: object) -> str:
    """Return a CSV-safe string: strip commas and leading/trailing whitespace."""
    return str(value).replace(",", " ").strip()


def _parse_line(line: str) -> Optional[Dict]:
    """Return parsed JSON object or None if the line is blank or invalid."""
    stripped = line.strip()
    if not stripped:
        return None
    try:
        obj = json.loads(stripped)
        if not isinstance(obj, dict):
            return None
        return obj
    except json.JSONDecodeError:
        return None


def _classify(obj: Dict) -> Optional[str]:
    """
    Map a Cursor log object to an event_type string.

    Returns one of: "user_prompt", "tool_call", "assistant_response", or None
    to skip the line (e.g. tool_result rows, which the dashboard does not use).
    """
    role = obj.get("role")
    kind = obj.get("type")

    if role == "user":
        return "user_prompt"
    if role == "assistant":
        return "assistant_response"
    if kind == "tool_call":
        return "tool_call"
    return None


def _row_from_obj(obj: Dict, event_type: str) -> Dict[str, str]:
    """Build one CSV row dict from a parsed Cursor log object."""
    timestamp = _safe_str(obj.get("timestamp", ""))
    session_id = _safe_str(obj.get("session_id", ""))
    working_dir = _safe_str(obj.get("working_dir", ""))
    repo_root = _get_repo_root(working_dir)
    model = _safe_str(obj.get("model", ""))

    tool_name = ""
    message_text = ""
    input_tokens = ""
    output_tokens = ""
    cache_creation_tokens = ""
    cache_read_tokens = ""

    if event_type == "user_prompt":
        message_text = _safe_str(obj.get("content", obj.get("text", "")))

    elif event_type == "tool_call":
        raw_tool = obj.get("tool", obj.get("name", ""))
        tool_name = _canonical_tool(_safe_str(raw_tool))

    elif event_type == "assistant_response":
        usage = obj.get("usage") or {}
    
        input_tokens = str(
            usage.get("input_tokens", usage.get("prompt_tokens", ""))
        )
        output_tokens = str(
            usage.get("output_tokens", usage.get("completion_tokens", ""))
        )
        cache_creation_tokens = str(usage.get("cache_creation_tokens", ""))
        cache_read_tokens = str(usage.get("cache_read_tokens", ""))

    return {
        "timestamp": timestamp,
        "event_type": event_type,
        "coding_agent": "cursor",
        "tool_name": tool_name,
        "execution_time": "",
        "working_dir": working_dir,
        "repo_root": repo_root,
        "session_id": session_id,
        "message_text": message_text,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_creation_tokens": cache_creation_tokens,
        "cache_read_tokens": cache_read_tokens,
        "model": model,
    }


def parse_cursor_jsonl(
    path: "os.PathLike[str]",
    *,
    verbose: bool = False,
) -> Iterator[Dict[str, str]]:
    """
    Yield one CSV row dict per relevant event in a Cursor JSONL log file.

    Skips blank lines, malformed JSON, and tool_result lines silently.
    Never raises on bad input — it logs a warning to stderr when verbose=True.
    """
    path = Path(path)
    bad_lines = 0

    with open(path, encoding="utf-8", errors="replace") as fh:
        for lineno, raw_line in enumerate(fh, start=1):
            obj = _parse_line(raw_line)
            if obj is None:
                if raw_line.strip():
                    bad_lines += 1
                    if verbose:
                        print(
                            f"[cursor] skipping bad line {lineno} in {path.name}",
                            file=sys.stderr,
                        )
                continue

            event_type = _classify(obj)
            if event_type is None:
                continue

            yield _row_from_obj(obj, event_type)

    if bad_lines and verbose:
        print(
            f"[cursor] {bad_lines} malformed line(s) skipped in {path.name}",
            file=sys.stderr,
        )


def find_cursor_logs(roots: Optional[List[Path]] = None) -> List[Path]:
    """
    Return all *.jsonl files under the given roots (default: macOS Cursor paths).

    Silently skips roots that do not exist.
    """
    search_roots = roots if roots is not None else _DEFAULT_ROOTS_MAC
    found: list[Path] = []
    for root in search_roots:
        if not root.exists():
            continue
        found.extend(root.rglob("*.jsonl"))
    return sorted(found)


def rows_to_csv(rows: List[Dict[str, str]]) -> str:
    """Serialize a list of row dicts to a CSV string (headers + data)."""
    lines = [",".join(CSV_HEADERS)]
    for row in rows:
        lines.append(",".join(row.get(h, "") for h in CSV_HEADERS))
    return "\n".join(lines) + "\n"
