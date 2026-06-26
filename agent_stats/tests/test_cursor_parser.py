
import csv
import io
import json
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "research" / "fixtures" / "cursor" / "cursor_sample.jsonl"

# Add the agent_stats directory to sys.path parsers can be imported directly
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.cursor import (
    CSV_HEADERS,
    find_cursor_logs,
    parse_cursor_jsonl,
    rows_to_csv,
)

# Helper methods

def write_jsonl(tmp_path: Path, lines: list) -> Path:
    """Write a list of objects (or raw strings) to a temp JSONL file."""
    p = tmp_path / "test.jsonl"
    with p.open("w", encoding="utf-8") as fh:
        for item in lines:
            if isinstance(item, str):
                fh.write(item + "\n")
            else:
                fh.write(json.dumps(item) + "\n")
    return p


def collect(path: Path) -> list[dict[str, str]]:
    return list(parse_cursor_jsonl(path))
# empty file edge case

def test_empty_file_produces_no_rows(tmp_path):
    p = tmp_path / "empty.jsonl"
    p.write_text("", encoding="utf-8")
    rows = collect(p)
    assert rows == [], "Empty file must produce zero rows without crashing"


def test_empty_file_csv_has_only_headers(tmp_path):
    p = tmp_path / "empty.jsonl"
    p.write_text("", encoding="utf-8")
    rows = collect(p)
    csv_text = rows_to_csv(rows)
    lines = csv_text.strip().splitlines()
    assert len(lines) == 1
    assert lines[0] == ",".join(CSV_HEADERS)


# Edge-case: bad lines in the middle

def test_bad_line_skipped_and_good_lines_parsed(tmp_path):
    lines = [
        {"role": "user", "content": "Hello", "timestamp": "2026-01-01T00:00:00.000Z", "session_id": "s1"},
        "THIS IS NOT JSON",
        {"type": "tool_call", "tool": "read_file", "timestamp": "2026-01-01T00:00:05.000Z", "session_id": "s1"},
        {"role": "assistant", "timestamp": "2026-01-01T00:00:10.000Z", "session_id": "s1", "usage": {}},
    ]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)

    event_types = [r["event_type"] for r in rows]
    assert "user_prompt" in event_types
    assert "tool_call" in event_types
    assert "assistant_response" in event_types
    assert len(rows) == 3, "Bad line must be skipped; 3 good events expected"


def test_all_bad_lines_yields_no_rows(tmp_path):
    p = write_jsonl(tmp_path, ["not json", "also not json", "!!!"])
    rows = collect(p)
    assert rows == []


def test_blank_lines_ignored(tmp_path):
    p = tmp_path / "blanks.jsonl"
    p.write_text(
        "\n\n"
        + json.dumps({"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"})
        + "\n\n\n",
        encoding="utf-8",
    )
    rows = collect(p)
    assert len(rows) == 1
    assert rows[0]["event_type"] == "user_prompt"

def test_tool_result_lines_not_emitted(tmp_path):
    lines = [
        {"role": "user", "content": "Go", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"},
        {"type": "tool_call", "tool": "read_file", "session_id": "s1", "timestamp": "2026-01-01T00:00:01.000Z"},
        {"type": "tool_result", "tool": "read_file", "success": True, "session_id": "s1", "timestamp": "2026-01-01T00:00:02.000Z"},
        {"role": "assistant", "session_id": "s1", "timestamp": "2026-01-01T00:00:03.000Z", "usage": {}},
    ]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)
    event_types = [r["event_type"] for r in rows]
    assert "tool_result" not in event_types
    assert len(rows) == 3




@pytest.mark.parametrize("cursor_name,expected_csv_name", [
    ("read_file", "Read"),
    ("edit_file", "Edit"),
    ("create_file", "Write"),
    ("run_terminal_cmd", "Bash"),
    ("grep_search", "Grep"),
    ("codebase_search", "codebase_search"),
    ("list_dir", "Glob"),
    ("file_search", "Glob"),
    ("web_search", "WebSearch"),
    ("custom_unknown_tool", "custom_unknown_tool"),  # unknown → pass through
])
def test_tool_name_canonicalized(tmp_path, cursor_name, expected_csv_name):
    lines = [{"type": "tool_call", "tool": cursor_name, "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"}]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)
    assert len(rows) == 1
    assert rows[0]["tool_name"] == expected_csv_name


# Token field mapping

def test_openai_style_tokens_mapped(tmp_path):
    line = {
        "role": "assistant",
        "session_id": "s1",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "model": "claude-3-5-sonnet-20241022",
        "usage": {"prompt_tokens": 1500, "completion_tokens": 300},
    }
    p = write_jsonl(tmp_path, [line])
    rows = collect(p)
    assert len(rows) == 1
    r = rows[0]
    assert r["input_tokens"] == "1500"
    assert r["output_tokens"] == "300"
    assert r["cache_creation_tokens"] == ""
    assert r["cache_read_tokens"] == ""


def test_anthropic_style_tokens_mapped(tmp_path):
    line = {
        "role": "assistant",
        "session_id": "s1",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "usage": {"input_tokens": 900, "output_tokens": 200},
    }
    p = write_jsonl(tmp_path, [line])
    rows = collect(p)
    r = rows[0]
    assert r["input_tokens"] == "900"
    assert r["output_tokens"] == "200"

# CSV output format2

def test_csv_headers_match_contract(tmp_path):
    p = write_jsonl(tmp_path, [])
    rows_to_csv([])  # must not crash
    csv_text = rows_to_csv([])
    reader = csv.DictReader(io.StringIO(csv_text))
    assert reader.fieldnames == CSV_HEADERS


def test_csv_row_has_all_columns(tmp_path):
    lines = [
        {"role": "user", "content": "Fix it", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z", "working_dir": "/proj"},
        {"type": "tool_call", "tool": "edit_file", "session_id": "s1", "timestamp": "2026-01-01T00:00:01.000Z"},
    ]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)
    csv_text = rows_to_csv(rows)
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        assert set(row.keys()) == set(CSV_HEADERS)


def test_message_text_captured_for_user_prompt(tmp_path):
    msg = "Please fix the login redirect"
    lines = [{"role": "user", "content": msg, "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"}]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)
    assert rows[0]["message_text"] == msg


def test_coding_agent_is_cursor(tmp_path):
    lines = [{"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"}]
    p = write_jsonl(tmp_path, lines)
    rows = collect(p)
    assert all(r["coding_agent"] == "cursor" for r in rows)


# repo_root column

def test_repo_root_populated_when_working_dir_is_git_repo(tmp_path):
    lines = [{"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z", "working_dir": "/home/user/project"}]
    p = write_jsonl(tmp_path, lines)
    with patch("parsers.cursor._get_repo_root", return_value="/home/user/project"):
        rows = collect(p)
    assert rows[0]["repo_root"] == "/home/user/project"


def test_repo_root_empty_when_not_a_git_repo(tmp_path):
    lines = [{"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z", "working_dir": "/tmp/no-git"}]
    p = write_jsonl(tmp_path, lines)
    with patch("parsers.cursor._get_repo_root", return_value=""):
        rows = collect(p)
    assert rows[0]["repo_root"] == ""


def test_repo_root_empty_when_no_working_dir(tmp_path):
    lines = [{"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z"}]
    p = write_jsonl(tmp_path, lines)
    with patch("parsers.cursor._get_repo_root", return_value=""):
        rows = collect(p)
    assert rows[0]["repo_root"] == ""


def test_repo_root_subdirectory_maps_to_repo_root(tmp_path):
    lines = [{"role": "user", "content": "hi", "session_id": "s1", "timestamp": "2026-01-01T00:00:00.000Z", "working_dir": "/home/user/project/src"}]
    p = write_jsonl(tmp_path, lines)
    with patch("parsers.cursor._get_repo_root", return_value="/home/user/project"):
        rows = collect(p)
    assert rows[0]["repo_root"] == "/home/user/project"


def test_repo_root_in_csv_headers():
    assert "repo_root" in CSV_HEADERS
    assert CSV_HEADERS.index("repo_root") == CSV_HEADERS.index("working_dir") + 1


# ---------------------------------------------------------------------------
# Integration: sanitized instructor sample fixture
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not FIXTURE_PATH.exists(), reason="Instructor sample not yet available (issue #112)")
class TestSampleFixture:
    """
    Concrete count expectations derived from cursor_sample.jsonl.

    Session 001 prompt 1: read_file, grep_search, read_file, edit_file, run_terminal_cmd  (5 tool calls)
    Session 001 prompt 2: read_file, edit_file                                            (2 tool calls)
    Session 002 prompt 1: codebase_search, edit_file, list_dir, edit_file                 (4 tool calls)
    Totals: 3 user_prompts + 11 tool_calls + 3 assistant_responses = 17 rows
    (The malformed line in the middle must be skipped.)
    """

    def setup_method(self):
        self.rows = list(parse_cursor_jsonl(FIXTURE_PATH))
        self.by_type = {}
        for r in self.rows:
            et = r["event_type"]
            self.by_type.setdefault(et, []).append(r)

    def test_user_prompt_count(self):
        assert len(self.by_type.get("user_prompt", [])) == 3

    def test_tool_call_count(self):
        assert len(self.by_type.get("tool_call", [])) == 11

    def test_assistant_response_count(self):
        assert len(self.by_type.get("assistant_response", [])) == 3

    def test_total_row_count(self):
        assert len(self.rows) == 17

    def test_no_tool_result_rows(self):
        assert "tool_result" not in self.by_type

    def test_sessions_present(self):
        session_ids = {r["session_id"] for r in self.rows}
        assert "cursor-session-001" in session_ids
        assert "cursor-session-002" in session_ids

    def test_model_populated_on_assistant_rows(self):
        for r in self.by_type.get("assistant_response", []):
            assert r["model"] == "claude-3-5-sonnet-20241022"

    def test_token_data_on_assistant_rows(self):
        for r in self.by_type.get("assistant_response", []):
            assert r["input_tokens"] != ""
            assert r["output_tokens"] != ""
