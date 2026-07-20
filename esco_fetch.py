"""Resolve each standardized (ESCO) skill label to its parent ESCO hierarchy
concept ("one level up") via the official ESCO REST API, with an on-disk cache
so the build is resumable and reruns are free.

Output: esco_skill_groups.json  { skill_label: {uri, group, group_uri, exact} }
  * group      = immediate broaderHierarchyConcept (the ESCO skill/knowledge group)
  * exact      = True if an ESCO concept's preferred title matched the label exactly
Run with an optional integer arg = max number of NEW skills to resolve this run
(top skills by frequency first), e.g.  `py esco_fetch.py 60` for a quick test.
"""

import collections
import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "esco_skill_groups.json")
INPUTS = [
    r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
]
FOCUS = {"11-2021.00", "11-3121.00", "11-3031.00"}
API = "https://ec.europa.eu/esco/api"
HDRS = {"User-Agent": "Mozilla/5.0 (skill-drift-research)"}


def _get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDRS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.2 * (i + 1))
    return None


def resolve(label):
    """Return dict(uri, group, group_uri, exact) or None on failure."""
    q = urllib.parse.quote(label)
    s = _get(f"{API}/search?text={q}&language=en&type=skill&limit=5")
    results = (s or {}).get("_embedded", {}).get("results", [])
    if not results:
        return {"uri": None, "group": None, "group_uri": None, "exact": False}
    # Prefer an exact (case-insensitive) preferred-title match, else top hit.
    pick = None
    for r in results:
        if (r.get("title") or "").strip().lower() == label.strip().lower():
            pick = r
            break
    exact = pick is not None
    if pick is None:
        pick = results[0]
    uri = pick.get("uri")
    res = _get(f"{API}/resource/skill?uri={urllib.parse.quote(uri, safe='')}&language=en")
    links = (res or {}).get("_links", {})
    grp = links.get("broaderHierarchyConcept") or links.get("broaderSkillGroup")
    if isinstance(grp, list) and grp:
        grp = grp[0]
    g_title = grp.get("title") if isinstance(grp, dict) else None
    g_uri = grp.get("uri") if isinstance(grp, dict) else None
    return {"uri": uri, "group": g_title, "group_uri": g_uri, "exact": exact}


def load_freq():
    import pandas as pd
    c = collections.Counter()
    for p in INPUTS:
        df = pd.read_csv(p, usecols=["standardized_skills", "onet_occupation_code"])
        df = df[df["onet_occupation_code"].isin(FOCUS)]
        for s in df["standardized_skills"].dropna():
            for x in s.split(","):
                x = x.strip()
                if x:
                    c[x] += 1
    return c


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    freq = load_freq()
    todo = [sk for sk, _ in freq.most_common() if sk not in cache]
    if limit:
        todo = todo[:limit]
    print(f"cached={len(cache)}  to-resolve={len(todo)}  (of {len(freq)} unique)")
    t0 = time.time()
    done = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(resolve, sk): sk for sk in todo}
        for fut in cf.as_completed(futs):
            sk = futs[fut]
            try:
                cache[sk] = fut.result()
            except Exception as e:
                cache[sk] = {"uri": None, "group": None, "group_uri": None, "exact": False, "err": str(e)}
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(todo)}  ({done/(time.time()-t0):.1f}/s)")
                with open(CACHE, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    exact = sum(1 for v in cache.values() if v.get("exact"))
    grouped = sum(1 for v in cache.values() if v.get("group"))
    print(f"done: {len(cache)} cached | exact-match {exact} | with-group {grouped} | {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
