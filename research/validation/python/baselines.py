"""Per-function complexipy cognitive and radon Halstead for a list of .py files."""
import json, sys
import complexipy
from radon.metrics import h_visit

repo, listfile, out = sys.argv[1:4]
rows = []
for rel in open(listfile).read().split("\n"):
    if not rel:
        continue
    path = f"{repo}/{rel}"
    try:
        src = open(path, encoding="utf-8").read()
    except Exception as e:
        continue
    rec = {"file": rel, "cognitive": [], "halstead": [], "error": None}
    try:
        cc = complexipy.code_complexity(src)
        rec["cognitive"] = [{"name": f.name, "line": f.line_start, "value": f.complexity} for f in cc.functions]
    except Exception as e:
        rec["error"] = f"complexipy: {e}"
    try:
        hv = h_visit(src)
        rec["halstead"] = [{"name": n, "h1": r.h1, "h2": r.h2, "N1": r.N1, "N2": r.N2, "volume": round(r.volume, 3)} for n, r in hv.functions]
    except Exception as e:
        rec["error"] = (rec["error"] or "") + f" radon: {e}"
    rows.append(rec)
json.dump(rows, open(out, "w"))
