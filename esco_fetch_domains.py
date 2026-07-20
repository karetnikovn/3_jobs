"""Resolve each ESCO PILLAR one more level up to its parent broaderConcept
(top-level ESCO skill/knowledge domain).

Reads pillar_uri values from esco_group_pillars.json and writes
esco_pillar_domains.json:

  { pillar_uri: { pillar, domain, domain_uri } }
"""

import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PILLARS = os.path.join(HERE, "esco_group_pillars.json")
CACHE = os.path.join(HERE, "esco_pillar_domains.json")
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


def resolve_domain(pillar_uri):
    url = (
        API
        + "/resource/skill?uri="
        + urllib.parse.quote(pillar_uri, safe="")
        + "&language=en"
    )
    res = _get(url)
    pillar_title = (res or {}).get("title")
    links = (res or {}).get("_links", {})
    parent = links.get("broaderConcept") or links.get("broaderHierarchyConcept")
    if isinstance(parent, list) and parent:
        parent = parent[0]
    if not isinstance(parent, dict):
        return {"pillar": pillar_title, "domain": None, "domain_uri": None}
    return {
        "pillar": pillar_title,
        "domain": parent.get("title"),
        "domain_uri": parent.get("uri"),
    }


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    with open(PILLARS, encoding="utf-8") as f:
        group_pillars = json.load(f)

    pillar_uris = sorted({
        rec["pillar_uri"]
        for rec in group_pillars.values()
        if rec.get("pillar_uri")
    })

    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    todo = [u for u in pillar_uris if u not in cache]
    if limit:
        todo = todo[:limit]
    print(f"pillars={len(pillar_uris)}  cached={len(cache)}  to-resolve={len(todo)}")
    t0 = time.time()
    done = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(resolve_domain, u): u for u in todo}
        for fut in cf.as_completed(futs):
            u = futs[fut]
            try:
                cache[u] = fut.result()
            except Exception as e:
                cache[u] = {
                    "pillar": None, "domain": None, "domain_uri": None, "err": str(e)
                }
            done += 1
            if done % 25 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}  ({done / max(time.time() - t0, 0.01):.1f}/s)")
                with open(CACHE, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False)

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    with_d = sum(1 for v in cache.values() if v.get("domain"))
    domains = {v["domain"] for v in cache.values() if v.get("domain")}
    print(
        f"done: {len(cache)} pillar URIs | with-domain {with_d} | "
        f"unique domains {len(domains)} | {time.time() - t0:.0f}s"
    )
    for d, _ in sorted(
        ((v["domain"], 1) for v in cache.values() if v.get("domain")),
        key=lambda x: x[0],
    ):
        pass
    from collections import Counter
    c = Counter(v["domain"] for v in cache.values() if v.get("domain"))
    print("domains:")
    for name, n in c.most_common():
        print(f"  {n:>3} pillars  {name}")


if __name__ == "__main__":
    main()
