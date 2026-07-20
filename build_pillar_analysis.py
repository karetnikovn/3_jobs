"""Aggregate analysis one more ESCO level up: GROUPS -> PILLARS (broaderConcept).

Uses:
  esco_skill_groups.json   skill -> group_uri
  esco_group_pillars.json   group_uri -> pillar

Emits esco_pillars.js  ->  const ESCO_PILLAR_DATA = {...};
Also esco_pillar_presence.csv for inspection.
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
MIN_SKILLS = 5
MIN_PCT_2026 = 2.0


def skill_exposure_neutral(label):
    """LLM-adjudicated exposure when available; keyword fallback (see PROTOCOL.md)."""
    return bse.exposure_lookup(label)


def build():
    with open(SKILL_GROUPS, encoding="utf-8") as f:
        skill_group = json.load(f)
    with open(GROUP_PILLARS, encoding="utf-8") as f:
        group_pillars = json.load(f)

    def pillar_of(sk):
        rec = skill_group.get(sk) or {}
        g_uri = rec.get("group_uri")
        if not g_uri:
            return None
        p = group_pillars.get(g_uri) or {}
        return p.get("pillar")

    frames = []
    for yr, path in INPUTS.items():
        df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
        df = df[df["onet_occupation_code"].isin(FOCUS)].copy()
        df["year"] = yr
        df["occupation"] = df["onet_occupation_code"].map(FOCUS)
        df["standardized_skills"] = df["standardized_skills"].fillna("")
        frames.append(df)
    jobs = pd.concat(frames, ignore_index=True)

    def job_pillars(s):
        out = set()
        for x in s.split(","):
            p = pillar_of(x.strip())
            if p:
                out.add(p)
        return out

    jobs["pillars"] = jobs["standardized_skills"].apply(job_pillars)

    pillar_skills = collections.defaultdict(set)
    for sk, rec in skill_group.items():
        g_uri = rec.get("group_uri")
        if not g_uri:
            continue
        p = (group_pillars.get(g_uri) or {}).get("pillar")
        if p:
            pillar_skills[p].add(sk)

    pillar_exposure = {}
    pillar_nskills = {}
    for p, sks in pillar_skills.items():
        vals = [skill_exposure_neutral(s) for s in sks]
        pillar_exposure[p] = round(sum(vals) / len(vals), 3)
        pillar_nskills[p] = len(sks)

    # child groups per pillar (for UI subtitle)
    pillar_ngroups = collections.Counter()
    for rec in group_pillars.values():
        if rec.get("pillar"):
            pillar_ngroups[rec["pillar"]] += 1

    occupations = [ALL] + list(FOCUS.values())

    def subset(occ, yr):
        if occ == ALL:
            return jobs[jobs["year"] == yr]
        return jobs[(jobs["occupation"] == occ) & (jobs["year"] == yr)]

    all_pillars = sorted(pillar_skills.keys())
    records = {}
    total_jobs = {}
    for occ in occupations:
        total_jobs[occ] = {}
        for yr in ("2023", "2026"):
            sub = subset(occ, yr)
            total = len(sub)
            total_jobs[occ][yr] = total
            counts = collections.Counter()
            for ps in sub["pillars"]:
                for p in ps:
                    counts[p] += 1
            for p in all_pillars:
                pct = round(counts[p] / total * 100, 2) if total else 0
                records.setdefault(p, {}).setdefault(occ, {})[yr] = {
                    "n": int(counts[p]),
                    "pct": pct,
                }

    def max_pct26(p):
        return max(
            records[p].get(occ, {}).get("2026", {}).get("pct", 0)
            for occ in occupations
        )

    kept = [
        p
        for p in all_pillars
        if pillar_nskills[p] >= MIN_SKILLS and max_pct26(p) >= MIN_PCT_2026
    ]

    pillars_out = []
    for p in kept:
        occ_obj = {}
        for occ in occupations:
            d = records[p].get(occ, {})
            p23 = d.get("2023", {}).get("pct", 0)
            p26 = d.get("2026", {}).get("pct", 0)
            occ_obj[occ] = {"p23": p23, "p26": p26}
        pillars_out.append({
            "pillar": p,
            "exposure": pillar_exposure[p],
            "n_skills": pillar_nskills[p],
            "n_groups": int(pillar_ngroups.get(p, 0)),
            "occ": occ_obj,
        })

    data = {
        "occupations": occupations,
        "total_jobs": total_jobs,
        "method": (
            "ESCO pillars = broaderConcept parent of each skill's hierarchy group "
            "(one level above ESCO groups). Penetration = % of postings with >=1 "
            "skill under the pillar."
        ),
        "pillars": pillars_out,
    }
    with open(os.path.join(HERE, "esco_pillars.js"), "w", encoding="utf-8") as f:
        f.write("const ESCO_PILLAR_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    with open(os.path.join(HERE, "esco_pillar_presence.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "pillar", "occupation", "n_skills", "n_groups", "exposure",
            "pct_2023", "pct_2026", "change_pp",
        ])
        for p in kept:
            for occ in occupations:
                d = records[p].get(occ, {})
                p23 = d.get("2023", {}).get("pct", 0)
                p26 = d.get("2026", {}).get("pct", 0)
                w.writerow([
                    p, occ, pillar_nskills[p], pillar_ngroups.get(p, 0),
                    pillar_exposure[p], p23, p26, round(p26 - p23, 2),
                ])

    print(
        f"pillars total={len(all_pillars)} kept={len(kept)} "
        f"(>= {MIN_SKILLS} skills & >= {MIN_PCT_2026}% in 2026)"
    )
    print("Top rising (All):")
    ranked = sorted(
        kept,
        key=lambda p: (
            records[p]["All"]["2026"]["pct"] - records[p]["All"]["2023"]["pct"]
        ),
        reverse=True,
    )
    for p in ranked[:12]:
        p23 = records[p]["All"]["2023"]["pct"]
        p26 = records[p]["All"]["2026"]["pct"]
        print(
            f"  {p26 - p23:+6.2f}pp  exp={pillar_exposure[p]:.2f}  "
            f"n={pillar_nskills[p]:>3}  g={pillar_ngroups[p]:>2}  {p}"
        )
    print("Top falling (All):")
    for p in ranked[-8:]:
        p23 = records[p]["All"]["2023"]["pct"]
        p26 = records[p]["All"]["2026"]["pct"]
        print(
            f"  {p26 - p23:+6.2f}pp  exp={pillar_exposure[p]:.2f}  "
            f"n={pillar_nskills[p]:>3}  g={pillar_ngroups[p]:>2}  {p}"
        )


if __name__ == "__main__":
    build()
