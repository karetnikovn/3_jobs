"""Move the analysis one ESCO level up: aggregate to ESCO hierarchy GROUPS.

Uses esco_skill_groups.json (skill -> parent ESCO group, from esco_fetch.py) to
recompute, at the group level:
  * penetration per (occupation, year): % of postings containing >=1 skill in the group
  * AI-exposure per group: mean of member skills' exposure (matrix-independent rubric)

Emits esco_groups.js  ->  const ESCO_GROUP_DATA = {...};  (loaded by the dashboard)
Also esco_group_presence.csv for the paper / inspection.
"""

import collections
import csv
import json
import os

import pandas as pd

import build_skill_exposure as bse  # reuse the exposure keyword rubric

HERE = os.path.dirname(os.path.abspath(__file__))
GROUPS = os.path.join(HERE, "esco_skill_groups.json")
INPUTS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}
FOCUS = {"11-2021.00": "Marketing Managers", "11-3121.00": "Human Resources Managers", "11-3031.00": "Financial Managers"}
ALL = "All"
MIN_SKILLS = 3        # ignore ultra-thin groups
MIN_PCT_2026 = 1.0    # ignore groups seen in <1% of 2026 postings (any occ)


def skill_exposure_neutral(label):
    """Matrix-independent exposure: neutral base 0.5 + keyword evidence."""
    text = " " + label.lower().strip() + " "
    high = len({kw for kw in bse.HIGH_KEYWORDS if kw in text})
    low = len({kw for kw in bse.LOW_KEYWORDS if kw in text})
    adj = max(-0.35, min(0.35, 0.13 * high - 0.13 * low))
    return max(0.05, min(0.95, 0.5 + adj))


def build():
    with open(GROUPS, encoding="utf-8") as f:
        skill_group = json.load(f)

    def group_of(sk):
        rec = skill_group.get(sk)
        return rec.get("group") if rec else None

    # ── Load postings (focus occupations) ───────────────────────────────────
    frames = []
    for yr, path in INPUTS.items():
        df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
        df = df[df["onet_occupation_code"].isin(FOCUS)].copy()
        df["year"] = yr
        df["occupation"] = df["onet_occupation_code"].map(FOCUS)
        df["standardized_skills"] = df["standardized_skills"].fillna("")
        frames.append(df)
    jobs = pd.concat(frames, ignore_index=True)

    # Per posting -> set of ESCO groups
    def job_groups(s):
        out = set()
        for x in s.split(","):
            g = group_of(x.strip())
            if g:
                out.add(g)
        return out
    jobs["groups"] = jobs["standardized_skills"].apply(job_groups)

    # ── Group-level exposure (mean over distinct member skills seen in data) ──
    group_skills = collections.defaultdict(set)
    for sk, rec in skill_group.items():
        g = rec.get("group")
        if g:
            group_skills[g].add(sk)
    group_exposure = {}
    group_nskills = {}
    for g, sks in group_skills.items():
        vals = [skill_exposure_neutral(s) for s in sks]
        group_exposure[g] = round(sum(vals) / len(vals), 3)
        group_nskills[g] = len(sks)

    occupations = [ALL] + list(FOCUS.values())

    def subset(occ, yr):
        if occ == ALL:
            return jobs[jobs["year"] == yr]
        return jobs[(jobs["occupation"] == occ) & (jobs["year"] == yr)]

    all_groups = sorted(group_skills.keys())
    records = {}
    total_jobs = {}
    for occ in occupations:
        total_jobs[occ] = {}
        for yr in ("2023", "2026"):
            sub = subset(occ, yr)
            total = len(sub)
            total_jobs[occ][yr] = total
            counts = collections.Counter()
            for gs in sub["groups"]:
                for g in gs:
                    counts[g] += 1
            for g in all_groups:
                pct = round(counts[g] / total * 100, 2) if total else 0
                records.setdefault(g, {}).setdefault(occ, {})[yr] = {"n": int(counts[g]), "pct": pct}

    # ── Filter to substantive groups ─────────────────────────────────────────
    def max_pct26(g):
        return max(records[g].get(occ, {}).get("2026", {}).get("pct", 0) for occ in occupations)
    kept = [g for g in all_groups
            if group_nskills[g] >= MIN_SKILLS and max_pct26(g) >= MIN_PCT_2026]

    # ── Emit JS artifact ─────────────────────────────────────────────────────
    groups_out = []
    for g in kept:
        occ_obj = {}
        for occ in occupations:
            d = records[g].get(occ, {})
            p23 = d.get("2023", {}).get("pct", 0)
            p26 = d.get("2026", {}).get("pct", 0)
            occ_obj[occ] = {"p23": p23, "p26": p26}
        groups_out.append({
            "group": g,
            "exposure": group_exposure[g],
            "n_skills": group_nskills[g],
            "occ": occ_obj,
        })

    data = {"occupations": occupations, "total_jobs": total_jobs, "groups": groups_out}
    with open(os.path.join(HERE, "esco_groups.js"), "w", encoding="utf-8") as f:
        f.write("const ESCO_GROUP_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    # CSV for the paper
    with open(os.path.join(HERE, "esco_group_presence.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["group", "occupation", "n_skills", "exposure", "pct_2023", "pct_2026", "change_pp"])
        for g in kept:
            for occ in occupations:
                d = records[g].get(occ, {})
                p23 = d.get("2023", {}).get("pct", 0)
                p26 = d.get("2026", {}).get("pct", 0)
                w.writerow([g, occ, group_nskills[g], group_exposure[g], p23, p26, round(p26 - p23, 2)])

    print(f"groups total={len(all_groups)} kept={len(kept)} (>= {MIN_SKILLS} skills & >= {MIN_PCT_2026}% in 2026)")
    print("Top rising (All):")
    ranked = sorted(kept, key=lambda g: (records[g]["All"]["2026"]["pct"] - records[g]["All"]["2023"]["pct"]), reverse=True)
    for g in ranked[:12]:
        p23 = records[g]["All"]["2023"]["pct"]; p26 = records[g]["All"]["2026"]["pct"]
        print(f"  {p26-p23:+6.2f}pp  exp={group_exposure[g]:.2f}  n={group_nskills[g]:>3}  {g}")
    print("Top falling (All):")
    for g in ranked[-8:]:
        p23 = records[g]["All"]["2023"]["pct"]; p26 = records[g]["All"]["2026"]["pct"]
        print(f"  {p26-p23:+6.2f}pp  exp={group_exposure[g]:.2f}  n={group_nskills[g]:>3}  {g}")


if __name__ == "__main__":
    build()
