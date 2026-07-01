#!/usr/bin/env python3
"""Select 16 public post-AI repos matching pre-AI code-type distribution."""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parents[2]
ANALYSES_PATH = ROOT / "data" / "analyses_rows.csv"
CACHE_DIR = ROOT / ".cache" / "post_ai_audit"
OUTPUT_CSV = ROOT / "research" / "datasets" / "post_ai_16.csv"
OUTPUT_MD = ROOT / "research" / "datasets" / "post_ai_16_selection.md"

EXCLUDE_OWNERS = {"scottyUX"}
SKIP_DIRS = {
    "node_modules",
    "venv",
    ".venv",
    "dist",
    "build",
    "__pycache__",
    ".git",
}

TARGET = {"js": 12, "py+js": 3, "python": 1}
SOURCE_EXTS = (".py", ".js", ".jsx", ".ts", ".tsx")


def norm_repo_url(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    if not url.startswith("http"):
        url = f"https://github.com/{url.lstrip('/')}"
    return url


def parse_owner_repo(url: str) -> tuple[str | None, str | None]:
    m = re.search(r"github\.com/([^/]+)/([^/?#]+)", url or "", re.I)
    if not m:
        return None, None
    owner, repo = m.group(1), m.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]
    return owner, repo


def is_valid_row(row: dict) -> bool:
    try:
        data = json.loads(row.get("report_json") or "")
        ok_json = isinstance(data, dict) and (
            "filesAnalyzed" in data or "profile" in data or "totals" in data
        )
    except json.JSONDecodeError:
        ok_json = False
    sha = (row.get("commit_sha") or "").strip()
    ok_sha = bool(re.fullmatch(r"[0-9a-fA-F]{7,40}", sha))
    return ok_json and ok_sha


def git_run(args: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return subprocess.CompletedProcess(
            args=args,
            returncode=124,
            stdout=exc.stdout or "",
            stderr=(exc.stderr or "") + "\ntimeout",
        )


def check_public(url: str) -> tuple[bool, str]:
    result = git_run(["git", "ls-remote", "--symref", url, "HEAD"], timeout=30)
    if result.returncode == 0 and result.stdout.strip():
        return True, "public"
    err = (result.stderr or result.stdout or "").strip().lower()
    if "not found" in err:
        return False, "not_found"
    if "authentication" in err or "permission" in err:
        return False, "private"
    return False, err[:80] or "ls-remote-failed"


def shallow_clone(url: str, dest: Path) -> tuple[bool, str]:
    if dest.exists() and (dest / ".git").exists():
        return True, "cached"
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = git_run(
        ["git", "clone", "--depth", "1", "--single-branch", url, str(dest)],
        timeout=90,
    )
    if result.returncode == 0 and (dest / ".git").exists():
        return True, "ok"
    err = (result.stderr or result.stdout or "").strip().replace("\n", " ")[:120]
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    if result.returncode == 124:
        err = "clone timeout (90s)"
    return False, err


def count_exts_local(repo_dir: Path) -> dict[str, int]:
    exts = {ext: 0 for ext in SOURCE_EXTS}
    for path in repo_dir.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        suffix = path.suffix.lower()
        if suffix in exts:
            exts[suffix] += 1
    return exts


def classify(exts: dict[str, int] | None) -> str:
    if exts is None:
        return "unavailable"
    py = exts[".py"]
    js = exts[".js"] + exts[".jsx"]
    ts = exts[".ts"] + exts[".tsx"]
    has_py, has_js, has_ts = py > 0, js > 0, ts > 0
    if has_py and has_js and not has_ts:
        return "py+js"
    if has_py and has_js and has_ts:
        return "py+js+ts"
    if has_py and has_ts and not has_js:
        return "py+ts"
    if has_js and has_ts and not has_py:
        return "js+ts"
    if has_py and not has_js and not has_ts:
        return "python"
    if has_js and not has_py and not has_ts:
        return "js"
    if has_ts and not has_py and not has_js:
        return "ts"
    if not (has_py or has_js or has_ts):
        return "other"
    return "mixed"


def bucket_for_selection(category: str) -> str | None:
    if category == "js":
        return "js"
    if category == "py+js":
        return "py+js"
    if category == "python":
        return "python"
    return None


def build_pool() -> list[dict]:
    rows: list[dict] = []
    with ANALYSES_PATH.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            owner, _ = parse_owner_repo(row.get("repo_url", ""))
            if owner in EXCLUDE_OWNERS:
                continue
            if not is_valid_row(row):
                continue
            rows.append(row)

    by_url: dict[str, dict] = {}
    for row in rows:
        url = norm_repo_url(row["repo_url"]).lower()
        prev = by_url.get(url)
        if prev is None or row["analyzed_at"] > prev["analyzed_at"]:
            by_url[url] = row

    return sorted(by_url.values(), key=lambda r: r["analyzed_at"], reverse=True)[:30]


def row_to_output(row: dict) -> dict:
    owner, repo = parse_owner_repo(row["repo_url"])
    return {
        "owner": owner or "",
        "team_name": (row.get("team_name") or "").strip(),
        "commit_sha": (row.get("commit_sha") or "").strip(),
        "analysis_timestamp": (row.get("analyzed_at") or "").strip(),
        "repo": repo or "",
        "course_id": (row.get("course_id") or "").strip(),
        "result_id": (row.get("result_id") or "").strip(),
        "repo_url": norm_repo_url(row["repo_url"]),
    }


def sort_key(item: dict):
    row = item["row"]
    has_course = 1 if (row.get("course_id") or "").strip() else 0
    return (has_course, row["analyzed_at"])


def js_score(exts: dict[str, int]) -> int:
    return exts.get(".js", 0) + exts.get(".jsx", 0) + exts.get(".ts", 0) + exts.get(".tsx", 0)


def py_score(exts: dict[str, int]) -> int:
    return exts.get(".py", 0)


def select_repos(audited: list[dict]) -> tuple[list[dict], dict]:
    public = [a for a in audited if a["public"] and a["exts"] is not None]
    selected: list[dict] = []
    notes: dict = {"shortfalls": {}, "fallbacks": []}
    used: set[str] = set()

    def take(candidates: list[dict], n: int) -> list[dict]:
        picked: list[dict] = []
        for item in candidates:
            if item["label"] in used:
                continue
            picked.append(item)
            used.add(item["label"])
            if len(picked) >= n:
                break
        return picked

    def by_priority(items: list[dict]) -> list[dict]:
        return sorted(items, key=sort_key, reverse=True)

    # 1 python-only
    python_pool = by_priority([a for a in public if a["category"] == "python"])
    py_picked = take(python_pool, TARGET["python"])
    for item in py_picked:
        item["assigned_bucket"] = "python"
    if len(py_picked) < TARGET["python"]:
        notes["shortfalls"]["python"] = TARGET["python"] - len(py_picked)
    selected.extend(py_picked)

    # 3 py+js (strict, then py+js+ts fallback)
    pyjs_pool = by_priority([a for a in public if a["category"] == "py+js"])
    pyjs_picked = take(pyjs_pool, TARGET["py+js"])
    for item in pyjs_picked:
        item["assigned_bucket"] = "py+js"
    if len(pyjs_picked) < TARGET["py+js"]:
        need = TARGET["py+js"] - len(pyjs_picked)
        pyjs_ts_pool = by_priority([a for a in public if a["category"] == "py+js+ts"])
        extra = take(pyjs_ts_pool, need)
        for item in extra:
            item["assigned_bucket"] = "py+js"
        if extra:
            notes["fallbacks"].append(
                f"Used {len(extra)} py+js+ts repos as py+js substitutes"
            )
        pyjs_picked.extend(extra)
    if len(pyjs_picked) < TARGET["py+js"]:
        notes["shortfalls"]["py+js"] = TARGET["py+js"] - len(pyjs_picked)
    selected.extend(pyjs_picked)

    # 12 js — exclusive pools, no overlap with py+js picks
    js_need = TARGET["js"]
    js_picked: list[dict] = []

    js_tiers: list[tuple[str, str]] = [
        ("js", "strict js"),
        ("js+ts", "js+ts"),
        ("ts", "ts-only (JS ecosystem fallback)"),
        ("py+js+ts", "py+js+ts (JS-heavy fallback)"),
        ("mixed", "mixed frontend fallback"),
        ("other", "other public fallback"),
    ]

    for cat, label in js_tiers:
        if len(js_picked) >= js_need:
            break
        pool = by_priority([a for a in public if a["category"] == cat])
        if cat == "py+js+ts":
            pool.sort(
                key=lambda a: (js_score(a["exts"]), sort_key(a)),
                reverse=True,
            )
        extra = take(pool, js_need - len(js_picked))
        for item in extra:
            item["assigned_bucket"] = "js"
        if extra and cat not in ("js",):
            notes["fallbacks"].append(f"Used {len(extra)} {label} repos for js bucket")
        js_picked.extend(extra)

    if len(js_picked) < js_need:
        remainder = by_priority([a for a in public if a["label"] not in used])
        extra = take(remainder, js_need - len(js_picked))
        for item in extra:
            item["assigned_bucket"] = "js"
        if extra:
            notes["fallbacks"].append(
                f"Used {len(extra)} remaining public repos to reach 16"
            )
        js_picked.extend(extra)

    if len(js_picked) < js_need:
        notes["shortfalls"]["js"] = js_need - len(js_picked)
    selected.extend(js_picked)

    selected.sort(key=lambda item: item["row"]["analyzed_at"], reverse=True)
    return selected, notes


OLD_SELECTION = [
    "microfaults/manteion-ui",
    "apagadua/shoe_shopper",
    "Alaurosa/vision-studio",
    "MasonD-007/ks_MCPS",
    "s-achawro/CWTCG",
    "sbelambe/UCSC-Financial-Purchase-Prediction",
    "royshadmon/EADS",
    "MandoBug/InterviewPal",
    "microfaults/manteion-go",
    "PoolCloser/HabiMatch",
    "DAWLab-cse115/DAWLab-FrontEnd",
    "Brinqa-CRQ-2026/VulnContext-Desktop",
    "Colin-Posat/SlugFound",
    "Aicnev04/PriceYourPlaylist",
    "nisergdesai/Planly_Organizer",
    "MikeyZv/SlugMarket",
]


def map_to_target_bucket(category: str) -> str:
    if category in ("js", "js+ts"):
        return "js"
    if category in ("py+js", "py+js+ts"):
        return "py+js"
    if category == "python":
        return "python"
    return category


def main() -> None:
    old = OLD_SELECTION
    pool = build_pool()
    print(f"Pool size: {len(pool)}")

    audited: list[dict] = []
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    for i, row in enumerate(pool, 1):
        owner, repo = parse_owner_repo(row["repo_url"])
        label = f"{owner}/{repo}"
        url = norm_repo_url(row["repo_url"])
        print(f"[{i}/30] Auditing {label}...", flush=True)

        public, access = check_public(url)
        exts = None
        category = "private/unavailable"
        clone_note = ""

        if public:
            clone_dir = CACHE_DIR / f"{owner}-{repo}"
            ok, clone_note = shallow_clone(url, clone_dir)
            if ok:
                exts = count_exts_local(clone_dir)
                category = classify(exts)
            else:
                public = False
                access = f"clone-failed: {clone_note}"

        audited.append(
            {
                "row": row,
                "owner": owner,
                "repo": repo,
                "label": label,
                "public": public,
                "access": access,
                "exts": exts,
                "category": category,
            }
        )

    selected, notes = select_repos(audited)
    if len(selected) < 16:
        print(f"WARNING: only {len(selected)} repos selected")

    fieldnames = [
        "owner",
        "team_name",
        "commit_sha",
        "analysis_timestamp",
        "repo",
        "course_id",
        "result_id",
        "repo_url",
    ]
    out_rows = [row_to_output(item["row"]) for item in selected]

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    sel_target = Counter(item.get("assigned_bucket", "?") for item in selected)
    sel_raw = Counter(item["category"] for item in selected)
    pool_public = [a for a in audited if a["public"]]
    pool_cats = Counter(a["category"] for a in pool_public)
    pool_target = Counter(map_to_target_bucket(a["category"]) for a in pool_public)

    new = [f"{r['owner']}/{r['repo']}" for r in out_rows]
    replaced = sorted(set(old) - set(new))
    added = sorted(set(new) - set(old))
    kept = sorted(set(old) & set(new))

    def pct(n: int, total: int = 16) -> str:
        return f"{100 * n / total:.0f}%"

    md_lines = [
        "# Post-AI 16 Selection",
        "",
        "Selected 16 **public** repos from the top-30 post-AI pool to approximate "
        "the pre-AI code-type distribution.",
        "",
        "## Distribution comparison",
        "",
        "| Bucket | Pre-AI target | Post-AI selected | Achieved |",
        "|--------|--------------:|-----------------:|----------|",
        f"| JavaScript only (`js`) | 12 (75%) | {sel_target.get('js', 0)} ({pct(sel_target.get('js', 0))}) | {'✓' if sel_target.get('js', 0) == 12 else 'partial'} |",
        f"| Python + JavaScript (`py+js`) | 3 (19%) | {sel_target.get('py+js', 0)} ({pct(sel_target.get('py+js', 0))}) | {'✓' if sel_target.get('py+js', 0) == 3 else 'partial'} |",
        f"| Python only (`python`) | 1 (6%) | {sel_target.get('python', 0)} ({pct(sel_target.get('python', 0))}) | {'✓' if sel_target.get('python', 0) == 1 else 'partial'} |",
        "",
        "### Raw categories in selection",
        "",
        "| Category | Count |",
        "|----------|------:|",
    ]
    for cat, n in sorted(sel_raw.items(), key=lambda x: (-x[1], x[0])):
        md_lines.append(f"| {cat} | {n} |")

    md_lines.extend(
        [
            "",
            "## Pool availability (public repos in top 30)",
            "",
            "| Target bucket | Strict matches | Including fallbacks |",
            "|---------------|---------------:|--------------------:|",
            f"| js | {pool_target.get('js', 0) - pool_cats.get('js+ts', 0)} | {pool_target.get('js', 0)} |",
            f"| py+js | {pool_cats.get('py+js', 0)} | {pool_target.get('py+js', 0)} |",
            f"| python | {pool_cats.get('python', 0)} | {pool_cats.get('python', 0)} |",
            "",
            f"Public repos in pool: **{len(pool_public)} / 30**",
            "",
            "| Category (all public) | Count |",
            "|-----------------------|------:|",
        ]
    )
    for cat, n in sorted(pool_cats.items(), key=lambda x: (-x[1], x[0])):
        md_lines.append(f"| {cat} | {n} |")

    md_lines.extend(
        [
            "",
            "## Selected repos",
            "",
            "| # | Repo | Category | Assigned bucket | .py | .js/.jsx | .ts/.tsx | course_id |",
            "|--:|------|----------|-----------------|----:|---------:|---------:|-----------|",
        ]
    )
    for i, item in enumerate(selected, 1):
        row = item["row"]
        exts = item["exts"] or {}
        course = (row.get("course_id") or "").strip() or "—"
        js = exts.get(".js", 0) + exts.get(".jsx", 0)
        ts = exts.get(".ts", 0) + exts.get(".tsx", 0)
        md_lines.append(
            f"| {i} | {item['label']} | {item['category']} | {item.get('assigned_bucket', '?')} | "
            f"{exts.get('.py', 0)} | {js} | {ts} | {course} |"
        )

    if kept:
        md_lines.extend(["", "## Kept from previous post_ai_16.csv", ""])
        for r in kept:
            md_lines.append(f"- {r}")

    if replaced:
        md_lines.extend(["", "## Replaced from previous post_ai_16.csv", ""])
        for r in replaced:
            reason = next(
                (f"{a['access']}, category={a['category']}" for a in audited if a["label"] == r),
                "not selected for distribution match",
            )
            md_lines.append(f"- **{r}** — {reason}")

    if added:
        md_lines.extend(["", "## Newly added", ""])
        for r in added:
            md_lines.append(f"- {r}")

    if notes.get("shortfalls"):
        md_lines.extend(["", "## Bucket shortfalls", ""])
        for bucket, short in notes["shortfalls"].items():
            md_lines.append(
                f"- `{bucket}`: short by **{short}** "
                f"(target {TARGET[bucket]}, available in public pool: {pool_target.get(bucket, 0)})"
            )

    if notes.get("fallbacks"):
        md_lines.extend(["", "## Fallback notes", ""])
        for note in notes["fallbacks"]:
            md_lines.append(f"- {note}")

    private_repos = [a for a in audited if not a["public"]]
    if private_repos:
        md_lines.extend(["", "## Private / unavailable in pool", ""])
        for a in private_repos:
            md_lines.append(f"- {a['label']} — {a['access']}")

    md_lines.extend(
        [
            "",
            "## Method",
            "",
            "- **Pool**: exclude `scottyUX` owner; dedupe by `repo_url` (latest `analyzed_at`); "
            "require valid `report_json` + `commit_sha`; top 30 by `analyzed_at`.",
            "- **Code type**: shallow-clone default branch; count `.py`, `.js`, `.jsx`, `.ts`, "
            "`.tsx` (excluding `node_modules`, `venv`, etc.) — same extension rules as pre-AI audit.",
            "- **Public check**: `git ls-remote` HEAD (clone without auth).",
            "- **Selection**: fill buckets 12 js / 3 py+js / 1 python; prefer `course_id`, "
            "then most recent `analyzed_at`; allow `js+ts` → js and `py+js+ts` → py+js fallbacks.",
        ]
    )

    OUTPUT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print("\n=== SELECTED 16 ===")
    for item in selected:
        row = item["row"]
        course = (row.get("course_id") or "").strip() or "(none)"
        print(f"  {item['label']}  [{item['category']}]  course_id={course}")
    print(f"\nTarget buckets: {dict(sel_target)}")
    print(f"Raw categories: {dict(sel_raw)}")
    print(f"Wrote {OUTPUT_CSV}")
    print(f"Wrote {OUTPUT_MD}")
    if replaced:
        print(f"\nReplaced ({len(replaced)}): {', '.join(replaced)}")
    if notes.get("shortfalls"):
        print(f"Shortfalls: {notes['shortfalls']}")


if __name__ == "__main__":
    main()
