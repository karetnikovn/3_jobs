"""Resolve each ESCO skill/knowledge GROUP one more level up to its parent
broaderConcept (ESCO mid-level domain / skill family).

Reads group_uri values from esco_skill_groups.json (produced by esco_fetch.py)
and writes esco_group_pillars.json:

  { group_uri: { group, pillar, pillar_uri } }

Resumable cache; reruns are free once filled.
"""

import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GROUPS = os.path.join(HERE, "esco_skill_groups.json")
CACHE = os.path.join(HERE, "esco_group_pillars.json")
API = "https://ec.europa.eu/esco/api"
HDRS = {"User-Agent": "Mozilla/5.0 (skill-drift-research)"}


def _get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDRS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.2 * (i + 1))
    return None


def resolve_pillar(group_uri):
    """Return dict(group, pillar, pillar_uri) for a group URI."""
    url = (
        API
        + "/resource/skill?uri="
        + urllib.parse.quote(group_uri, safe="")
        + "&language=en"
    )
    res = _get(url)
    group_title = (res or {}).get("title")
    links = (res or {}).get("_links", {})
    parent = links.get("broaderConcept") or links.get("broaderHierarchyConcept")
    if isinstance(parent, list) and parent:
        parent = parent[0]
    if not isinstance(parent, dict):
        return {"group": group_title, "pillar": None, "pillar_uri": None}
    return {
        "group": group_title,
        "pillar": parent.get("title"),
        "pillar_uri": parent.get("uri"),
    }


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    with open(GROUPS, encoding="utf-8") as f:
        skill_group = json.load(f)

    group_uris = sorted({
        rec["group_uri"]
        for rec in skill_group.values()
        if rec.get("group_uri")
    })

    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    todo = [u for u in group_uris if u not in cache]
    if limit:
        todo = todo[:limit]
    print(f"groups={len(group_uris)}  cached={len(cache)}  to-resolve={len(todo)}")
    t0 = time.time()
    done = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(resolve_pillar, u): u for u in todo}
        for fut in cf.as_completed(futs):
            u = futs[fut]
            try:
                cache[u] = fut.result()
            except Exception as e:
                cache[u] = {"group": None, "pillar": None, "pillar_uri": None, "err": str(e)}
            done += 1
            if done % 50 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}  ({done / max(time.time() - t0, 0.01):.1f}/s)")
                with open(CACHE, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False)

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    with_p = sum(1 for v in cache.values() if v.get("pillar"))
    pillars = {v["pillar"] for v in cache.values() if v.get("pillar")}
    print(f"done: {len(cache)} group URIs | with-pillar {with_p} | unique pillars {len(pillars)} | {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
