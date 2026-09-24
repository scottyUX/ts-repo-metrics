"""Join engine vs complexipy (cognitive, by file+line) and radon (Halstead, by file+unique name)."""
import json, sys, collections, statistics
out_dir = sys.argv[1]; repos = sys.argv[2:]
tot = collections.Counter(); unj = []; gap_c = []; mism_c = []; mism_h = []; per_repo = {}
def pearson(xs, ys):
    if len(xs) < 3: return None
    try: return round(statistics.correlation(xs, ys), 4)
    except Exception: return None
allc, allh = ([], []), ([], [])
for repo in repos:
    eng = json.load(open(f"{out_dir}/{repo}.engine.json"))
    base = json.load(open(f"{out_dir}/{repo}.base.json"))
    r = collections.Counter()
    top = [e for e in eng if not e["nested"]]
    r["engine_top_fns"] = len(top)
    bfile = {b["file"]: b for b in base}
    for b in base:
        if b["error"]: r["baseline_file_errors"] += 1
    # cognitive
    for e in top:
        b = bfile.get(e["file"])
        if not b: continue
        m = [c for c in b["cognitive"] if c["line"] == e["line"]]
        if len(m) != 1:
            r["cog_unjoined"] += 1
            if len(unj) < 8: unj.append((repo, e["file"], e["line"], e["name"], [(c["name"], c["line"]) for c in b["cognitive"]][:6]))
            continue
        r["cog_joined"] += 1; ev, bv = e["cognitive"], m[0]["value"]
        allc[0].append(ev); allc[1].append(bv)
        if ev == bv: r["cog_exact"] += 1
        elif e["cognitiveGaps"] == bv: r["cog_gap_explained"] += 1; gap_c.append((repo, e["file"], e["line"], e["name"], ev, bv))
        else: mism_c.append((repo, e["file"], e["line"], e["name"], ev, bv))
    # halstead
    by_file = collections.defaultdict(list)
    for e in top: by_file[e["file"]].append(e)
    for f, es in by_file.items():
        b = bfile.get(f)
        if not b: continue
        es = sorted(es, key=lambda x: x["defLine"])
        # radon lists top-level functions and methods in source order; join by
        # position when the name sequences agree, else by unique name.
        seq_ok = [x["name"] for x in es] == [x["name"] for x in b["halstead"]]
        names_e = collections.Counter(x["name"] for x in es); names_b = collections.Counter(x["name"] for x in b["halstead"])
        for i, e in enumerate(es):
            if seq_ok: h = b["halstead"][i]
            elif names_e[e["name"]] == 1 and names_b[e["name"]] == 1: h = next(x for x in b["halstead"] if x["name"] == e["name"])
            else: r["hal_unjoined"] += 1; continue
            r["hal_joined"] += 1
            allh[0].append(e["volume"]); allh[1].append(h["volume"])
            K = {"h1": "n1", "h2": "n2", "N1": "N1", "N2": "N2"}; same = all(e[K[k]] == h[k] for k in K)
            if same: r["hal_exact"] += 1
            else: mism_h.append((repo, f, e["line"], e["name"], {k: (e[K[k]], h[k]) for k in K if e[K[k]] != h[k]}))
    per_repo[repo] = r; tot.update(r)
print(f"{'repo':32} {'fns':>5} {'cogJ':>5} {'cogEx%':>7} {'halJ':>5} {'halEx%':>7}")
for repo, r in per_repo.items():
    ce = 100*r['cog_exact']/r['cog_joined'] if r['cog_joined'] else 0
    he = 100*r['hal_exact']/r['hal_joined'] if r['hal_joined'] else 0
    print(f"{repo:32} {r['engine_top_fns']:5} {r['cog_joined']:5} {ce:7.1f} {r['hal_joined']:5} {he:7.1f}")
print("TOTAL", dict(tot))
print("cognitive exact %:", round(100*tot['cog_exact']/max(tot['cog_joined'],1), 2), " pearson:", pearson(*allc))
print("cognitive exact + complexipy gap explained %:", round(100*(tot["cog_exact"]+tot["cog_gap_explained"])/max(tot["cog_joined"],1), 2))
print("halstead exact %:", round(100*tot['hal_exact']/max(tot['hal_joined'],1), 2), " volume pearson:", pearson(*allh))
json.dump({"cog": mism_c, "hal": mism_h}, open(f"{out_dir}/mismatches.json", "w"), default=str)
print("\nunjoined samples:"); [print(" ", u) for u in unj]
print("\nfirst cognitive mismatches:"); [print(" ", m) for m in mism_c[:12]]
print("first halstead mismatches:"); [print(" ", m) for m in mism_h[:12]]
