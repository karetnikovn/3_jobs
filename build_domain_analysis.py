"""Aggregate analysis one more ESCO level up: PILLARS -> DOMAINS (broaderConcept).

Uses:
  esco_skill_groups.json    skill -> group_uri
  esco_group_pillars.json   group_uri -> pillar_uri / pillar
  esco_pillar_domains.json  pillar_uri -> domain

Emits esco_domains.js  ->  const ESCO_DOMAIN_DATA = {...};
Also esco_domain_presence.csv for inspection.
"""

import collections
import csv
import json
import os

import pandas as pd

import build_skill_exposure as bse

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_GROUPS = os.path.join(HERE, "esco_skill_groups.json")
GROUP_PILLARS = os.path.join(HERE, "esco_group_pillars.json")
PILLAR_DOMAINS = os.path.join(HERE, "esco_pillar_domains.json")
INPUTS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}
FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}
ALL = "All"
MIN_SKILLS = 8
MIN_PCT_2026 = 3.0


def skill_exposure_neutral(label):
    text = " " + label.lower().strip() + " "
    high = len({kw for kw in bse.HIGH_KEYWORDS if kw in text})
    low = len({kw for kw in bse.LOW_KEYWORDS if kw in text})
    adj = max(-0.35, min(0.35, 0.13 * high - 0.13 * low))
    return max(0.05, min(0.95, 0.5 + adj))


def build():
    with open(SKILL_GROUPS, encoding="utf-8") as f:
        skill_group = json.load(f)
    with open(GROUP_PILLARS, encoding="utf-8") as f:
        group_pillars = json.load(f)
    with open(PILLAR_DOMAINS, encoding="utf-8") as f:
        pillar_domains = json.load(f)

    def domain_of(sk):
        rec = skill_group.get(sk) or {}
        g_uri = rec.get("group_uri")
        if not g_uri:
            return None
        p_uri = (group_pillars.get(g_uri) or {}).get("pillar_uri")
        if not p_uri:
            return None
        return (pillar_domains.get(p_uri) or {}).get("domain")

    frames = []
    for yr, path in INPUTS.items():
        df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
        df = df[df["onet_occupation_code"].isin(FOCUS)].copy()
        df["year"] = yr
        df["occupation"] = df["onet_occupation_code"].map(FOCUS)
        df["standardized_skills"] = df["standardized_skills"].fillna("")
        frames.append(df)
    jobs = pd.concat(frames, ignore_index=True)

    def job_domains(s):
        out = set()
        for x in s.split(","):
            d = domain_of(x.strip())
            if d:
                out.add(d)
        return out

    jobs["domains"] = jobs["standardized_skills"].apply(job_domains)

    domain_skills = collections.defaultdict(set)
    domain_pillars = collections.defaultdict(set)
    for sk, rec in skill_group.items():
        g_uri = rec.get("group_uri")
        if not g_uri:
            continue
        p_rec = group_pillars.get(g_uri) or {}
        p_uri = p_rec.get("pillar_uri")
        pillar = p_rec.get("pillar")
        if not p_uri:
            continue
        d = (pillar_domains.get(p_uri) or {}).get("domain")
        if not d:
            continue
        domain_skills[d].add(sk)
        if pillar:
            domain_pillars[d].add(pillar)

    domain_exposure = {}
    domain_nskills = {}
    domain_npillars = {}
    for d, sks in domain_skills.items():
        vals = [skill_exposure_neutral(s) for s in sks]
        domain_exposure[d] = round(sum(vals) / len(vals), 3)
        domain_nskills[d] = len(sks)
        domain_npillars[d] = len(domain_pillars[d])

    occupations = [ALL] + list(FOCUS.values())

    def subset(occ, yr):
        if occ == ALL:
            return jobs[jobs["year"] == yr]
        return jobs[(jobs["occupation"] == occ) & (jobs["year"] == yr)]

    all_domains = sorted(domain_skills.keys())
    records = {}
    total_jobs = {}
    for occ in occupations:
        total_jobs[occ] = {}
        for yr in ("2023", "2026"):
            sub = subset(occ, yr)
            total = len(sub)
            total_jobs[occ][yr] = total
            counts = collections.Counter()
            for ds in sub["domains"]:
                for d in ds:
                    counts[d] += 1
            for d in all_domains:
                pct = round(counts[d] / total * 100, 2) if total else 0
                records.setdefault(d, {}).setdefault(occ, {})[yr] = {
                    "n": int(counts[d]),
                    "pct": pct,
                }

    def max_pct26(d):
        return max(
            records[d].get(occ, {}).get("2026", {}).get("pct", 0)
            for occ in occupations
        )

    kept = [
        d
        for d in all_domains
        if domain_nskills[d] >= MIN_SKILLS and max_pct26(d) >= MIN_PCT_2026
    ]

    domains_out = []
    for d in kept:
        occ_obj = {}
        for occ in occupations:
            rec = records[d].get(occ, {})
            p23 = rec.get("2023", {}).get("pct", 0)
            p26 = rec.get("2026", {}).get("pct", 0)
            occ_obj[occ] = {"p23": p23, "p26": p26}
        domains_out.append({
            "domain": d,
            "exposure": domain_exposure[d],
            "n_skills": domain_nskills[d],
            "n_pillars": domain_npillars[d],
            "occ": occ_obj,
        })

    data = {
        "occupations": occupations,
        "total_jobs": total_jobs,
        "method": (
            "ESCO domains = broaderConcept parent of each pillar "
            "(two levels above ESCO groups / one above pillars). "
            "Penetration = % of postings with >=1 skill under the domain."
        ),
        "domains": domains_out,
    }
    with open(os.path.join(HERE, "esco_domains.js"), "w", encoding="utf-8") as f:
        f.write("const ESCO_DOMAIN_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    with open(os.path.join(HERE, "esco_domain_presence.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "domain", "occupation", "n_skills", "n_pillars", "exposure",
            "pct_2023", "pct_2026", "change_pp",
        ])
        for d in kept:
            for occ in occupations:
                rec = records[d].get(occ, {})
                p23 = rec.get("2023", {}).get("pct", 0)
                p26 = rec.get("2026", {}).get("pct", 0)
                w.writerow([
                    d, occ, domain_nskills[d], domain_npillars[d],
                    domain_exposure[d], p23, p26, round(p26 - p23, 2),
                ])

    print(
        f"domains total={len(all_domains)} kept={len(kept)} "
        f"(>= {MIN_SKILLS} skills & >= {MIN_PCT_2026}% in 2026)"
    )
    ranked = sorted(
        kept,
        key=lambda d: (
            records[d]["All"]["2026"]["pct"] - records[d]["All"]["2023"]["pct"]
        ),
        reverse=True,
    )
    print("Top rising (All):")
    for d in ranked[:12]:
        p23 = records[d]["All"]["2023"]["pct"]
        p26 = records[d]["All"]["2026"]["pct"]
        print(
            f"  {p26 - p23:+6.2f}pp  exp={domain_exposure[d]:.2f}  "
            f"n={domain_nskills[d]:>3}  p={domain_npillars[d]:>2}  {d}"
        )


if __name__ == "__main__":
    build()
