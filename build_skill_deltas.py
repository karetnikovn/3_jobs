"""Skill-level contribution to 2023→2026 penetration change (percentage points).

For each occupation (and All), compute each standardized skill's posting
penetration in 2023 and 2026, then delta_pp = pct_2026 - pct_2023.
"Contribution" here = that skill's own Δpp (how much its prevalence moved).

Emits skill_deltas.js  ->  const SKILL_DELTA_DATA = {...}
"""

from __future__ import annotations

import json
import os
from collections import Counter

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
PATHS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}
FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}
DICT_PATH = os.path.join(HERE, "node_skill_dictionary.json")

# Same noise filter as Top Skills
NOISE = {
    s.lower()
    for s in {
        "gender studies",
        "support employability of people with disabilities",
        "assign duties to agriculture workers",
        "analyse psychological aspects of illness",
        "organise information",
        "organise harvests",
        "organise irrigation",
        "organise creative performance",
        "organise information on availability of the team",
        "use markup languages",
        "manage student relationships",
        "rheumatology",
        "arrange parent teacher meeting",
        "analyse goal progress",
        "reconstruct program theory",
        "inspect agricultural fields",
        "community-led local development",
        "organise event participants registration",
        "develop inclusive communication material",
        "address problems critically",
        "check payrolls",
        "objective-c",
        "sell bicycles",
        "apply basic programming skills",
        "interpret traffic signals",
        "manage emergency procedures",
        "ensure private property security",
        "medical device test procedures",
        "carpooling services",
        "real-time computing",
        "childbirth",
        "investment banking",
        "communication studies",
    }
}

MIN_PCT_EITHER = 1.0   # ship skills with >=1% in 2023 or 2026; UI can tighten to 5%
TOP_SHOW = 40          # top risers + top fallers to ship (full kept list also included, capped)


def count_skills(df: pd.DataFrame) -> tuple[Counter, int]:
    c: Counter = Counter()
    for s in df["standardized_skills"].fillna(""):
        seen = set()
        for sk in s.split(","):
            sk = sk.strip()
            if not sk or sk.lower() in NOISE or sk in seen:
                continue
            seen.add(sk)
            c[sk] += 1
    return c, len(df)


def build_occ(counts23: Counter, n23: int, counts26: Counter, n26: int, skill_to_node: dict):
    skills = set(counts23) | set(counts26)
    rows = []
    for sk in skills:
        j23 = counts23.get(sk, 0)
        j26 = counts26.get(sk, 0)
        p23 = 100.0 * j23 / n23 if n23 else 0.0
        p26 = 100.0 * j26 / n26 if n26 else 0.0
        if p23 < MIN_PCT_EITHER and p26 < MIN_PCT_EITHER:
            continue
        rows.append({
            "skill": sk,
            "node": skill_to_node.get(sk),
            "jobs_2023": int(j23),
            "jobs_2026": int(j26),
            "pct_2023": round(p23, 2),
            "pct_2026": round(p26, 2),
            "delta_pp": round(p26 - p23, 2),
        })
    rows.sort(key=lambda r: -abs(r["delta_pp"]))
    return rows


def build():
    with open(DICT_PATH, encoding="utf-8") as f:
        node_dict = json.load(f)
    skill_to_node = {}
    for node, info in node_dict.items():
        for sk in info.get("skills", []):
            skill_to_node[sk] = node

    frames = {}
    for yr, path in PATHS.items():
        df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
        df = df[df["onet_occupation_code"].isin(FOCUS)].copy()
        frames[yr] = df

    result = {
        "method": (
            "Each skill's contribution = change in posting penetration (pp) between 2023 and 2026: "
            "pct_2026 - pct_2023, where pct = share of postings mentioning the skill at least once. "
            "Skills below 1% in both years are dropped at build time; the dashboard can apply a stricter "
            ">=5% either-year filter. Noise skills filtered as in Top Skills."
        ),
        "occupations": {},
    }

    codes = list(FOCUS.keys())
    occ_specs = [("All", None)] + [(name, code) for code, name in FOCUS.items()]

    for occ_name, code in occ_specs:
        c23, n23 = count_skills(
            frames["2023"] if code is None else frames["2023"][frames["2023"]["onet_occupation_code"] == code]
        )
        c26, n26 = count_skills(
            frames["2026"] if code is None else frames["2026"][frames["2026"]["onet_occupation_code"] == code]
        )
        rows = build_occ(c23, n23, c26, n26, skill_to_node)
        risers = sorted([r for r in rows if r["delta_pp"] > 0], key=lambda r: -r["delta_pp"])[:TOP_SHOW]
        fallers = sorted([r for r in rows if r["delta_pp"] < 0], key=lambda r: r["delta_pp"])[:TOP_SHOW]
        # share of total absolute movement explained by top-N risers/fallers (descriptive)
        abs_all = sum(abs(r["delta_pp"]) for r in rows) or 1.0
        result["occupations"][occ_name] = {
            "n_2023": int(n23),
            "n_2026": int(n26),
            "n_skills_kept": len(rows),
            "sum_abs_delta_pp": round(abs_all, 2),
            "risers": risers,
            "fallers": fallers,
            "top_by_abs": rows[:TOP_SHOW],
            "all": rows,  # full kept set — needed for Δrank vs 2023
        }
        print(f"{occ_name}: kept {len(rows)} skills | top riser {risers[0]['skill'] if risers else '-'} "
              f"({risers[0]['delta_pp'] if risers else 0:+.1f}pp)")

    out_js = os.path.join(HERE, "skill_deltas.js")
    out_json = os.path.join(HERE, "skill_deltas.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("const SKILL_DELTA_DATA = ")
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Saved {out_js}")


if __name__ == "__main__":
    build()
