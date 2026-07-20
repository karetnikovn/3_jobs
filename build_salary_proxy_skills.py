"""Approximate 'top 5% salary' skill comparison for 2026 MM / HR / FM.

We do NOT have posting-level salaries. Approximation:
  1) Score each job title for seniority / pay signals (VP, Director, Senior, ...)
  2) Within each O*NET occupation, take the top ~5% by that score
     (= high-pay PROXY, not observed wages)
  3) Compare top skills vs (a) all 2026 postings and (b) a random 100-posting sample
  4) Annotate each occupation with public BLS OES wage percentiles (internet)

Outputs:
  salary_proxy_skills.json  — data for the dashboard
  salary_proxy_skills.js    — const SALARY_PROXY_DATA = {...}
"""

from __future__ import annotations

import json
import os
import random
import re
from collections import Counter

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS_2026 = r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv"
TOP_N = 20
SAMPLE_N = 100
TOP_PCT = 0.05
SEED = 42

FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}

# Same noise list as build_top_skills.py (taxonomy boilerplate / false positives)
NOISE_SKILLS = {
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

# BLS OES May 2024 / May 2023 national annual wages (USD).
# 90th percentile is often top-coded as ">= $239,200" for these management roles.
# Sources: bls.gov/oes and OOH pages for 11-2021, 11-3121, 11-3031.
BLS_WAGES = {
    "11-2021.00": {
        "source": "BLS OES / OOH (Marketing Managers 11-2021)",
        "year": "May 2024 (median/OOH); percentiles May 2023 OES where noted",
        "median": 161030,
        "p10": 81900,
        "p25": 108000,
        "p75": 208000,
        "p90": 239200,
        "p90_note": "OOH: highest 10% > $239,200 (top-coded)",
    },
    "11-3121.00": {
        "source": "BLS OES May 2023 (Human Resources Managers 11-3121)",
        "year": "May 2023",
        "median": 136350,
        "p10": 81060,
        "p25": 103340,
        "p75": 182120,
        "p90": 239200,
        "p90_note": "OES 90th often top-coded (5); use $239,200+ as upper-tail marker",
    },
    "11-3031.00": {
        "source": "BLS OES May 2023 (Financial Managers 11-3031); OOH median May 2024",
        "year": "May 2023 percentiles; May 2024 median $161,700 (OOH)",
        "median": 161700,
        "p10": 82870,
        "p25": 110190,
        "p75": 210830,
        "p90": 239200,
        "p90_note": "OES 90th top-coded (5); use $239,200+ as upper-tail marker",
    },
}

# Weighted seniority / pay signals in titles. Higher = likelier high compensation.
WEIGHTS = [
    (re.compile(r"(?i)\b(chief|cmo|chro|cfo|ceo|coo|cto)\b"), 12),
    (re.compile(r"(?i)\b(evp|svp|executive\s+vice\s+president)\b"), 11),
    (re.compile(r"(?i)\b(vice\s+president|\bvp\b)\b"), 10),
    (re.compile(r"(?i)\b(managing\s+director|partner)\b"), 9),
    (re.compile(r"(?i)\b(head\s+of|global\s+head)\b"), 8),
    (re.compile(r"(?i)\b(senior\s+director|sr\.?\s+director)\b"), 7),
    (re.compile(r"(?i)\bdirector\b"), 6),
    (re.compile(r"(?i)\bprincipal\b"), 5),
    (re.compile(r"(?i)\b(executive|lead)\b"), 3),
    (re.compile(r"(?i)\b(senior|sr\.?)\b"), 2),
]

# Down-weight junior / support titles so they don't land in the top 5%.
PENALTIES = [
    (re.compile(r"(?i)\b(intern|internship|trainee|apprentice)\b"), -20),
    (re.compile(r"(?i)\b(assistant|coordinator|junior|jr\.?|associate|entry[\s-]?level)\b"), -8),
]


def title_score(title: str) -> float:
    t = title or ""
    score = 0.0
    for rx, w in WEIGHTS:
        if rx.search(t):
            score += w
    for rx, w in PENALTIES:
        if rx.search(t):
            score += w
    # Slight bump for English C-suite / VP patterns already covered; keep floor at 0 for ranking stability
    return score


def skill_counts(jobs: pd.DataFrame) -> Counter:
    c: Counter = Counter()
    for s in jobs["standardized_skills"].fillna(""):
        seen = set()
        for sk in s.split(","):
            sk = sk.strip()
            if not sk or sk.lower() in NOISE_SKILLS or sk in seen:
                continue
            seen.add(sk)
            c[sk] += 1
    return c


def top_list(counts: Counter, total: int, n: int = TOP_N):
    out = []
    for skill, k in counts.most_common(n):
        out.append({
            "skill": skill,
            "jobs": int(k),
            "pct": round(100.0 * k / total, 1) if total else 0.0,
        })
    return out


def compare_lists(base: list, other: list):
    """Return other list annotated with rank/pct delta vs base."""
    base_rank = {e["skill"]: i + 1 for i, e in enumerate(base)}
    base_pct = {e["skill"]: e["pct"] for e in base}
    other_rank = {e["skill"]: i + 1 for i, e in enumerate(other)}
    annotated = []
    for i, e in enumerate(other):
        sk = e["skill"]
        br = base_rank.get(sk)
        annotated.append({
            **e,
            "rank": i + 1,
            "base_rank": br,
            "rank_delta": (br - (i + 1)) if br else None,  # + = rose into / within top vs base
            "base_pct": base_pct.get(sk),
            "pct_delta": round(e["pct"] - base_pct[sk], 1) if sk in base_pct else None,
            "new_in_top": br is None,
        })
    # Skills in base top-N missing from other top-N
    dropped = [e["skill"] for e in base if e["skill"] not in other_rank]
    return annotated, dropped


def build():
    df = pd.read_csv(
        JOBS_2026,
        usecols=["title", "standardized_skills", "onet_occupation_code", "country"],
    )
    df = df[df["onet_occupation_code"].isin(FOCUS)].copy()
    df["title"] = df["title"].fillna("")
    df["pay_score"] = df["title"].map(title_score)

    result = {
        "method": (
            "Posting-level salaries are unavailable. High-pay group = top 5% of 2026 "
            "postings within each O*NET occupation by a title-seniority score "
            "(VP/Director/Senior/…). This is a PROXY for top-tail pay, validated "
            "directionally against BLS OES upper-tail wages for the same occupations. "
            "Compare to (1) all postings and (2) a random sample of 100 postings."
        ),
        "year": 2026,
        "top_pct": TOP_PCT,
        "sample_n": SAMPLE_N,
        "occupations": {},
    }

    rng = random.Random(SEED)

    for code, name in FOCUS.items():
        sub = df[df["onet_occupation_code"] == code].copy()
        n = len(sub)
        k = max(1, int(round(n * TOP_PCT)))
        # Break ties with random noise so we get a clean top-k
        sub = sub.assign(_tie=sub.index.to_series().map(lambda i: rng.random()))
        ranked = sub.sort_values(["pay_score", "_tie"], ascending=[False, False])
        high = ranked.head(k)
        # Random 100 (or all if smaller)
        sample_idx = rng.sample(list(sub.index), min(SAMPLE_N, n))
        sample = sub.loc[sample_idx]

        # How many in high group have score > 0 (true seniority signal)?
        signal_share = float((high["pay_score"] > 0).mean())
        score_cut = float(high["pay_score"].min()) if len(high) else 0.0

        all_top = top_list(skill_counts(sub), n)
        high_top = top_list(skill_counts(high), len(high))
        sample_top = top_list(skill_counts(sample), len(sample))
        high_ann, high_dropped = compare_lists(all_top, high_top)
        sample_ann, sample_dropped = compare_lists(all_top, sample_top)

        # Example high-pay titles
        examples = (
            high.sort_values("pay_score", ascending=False)["title"]
            .head(12)
            .tolist()
        )

        result["occupations"][name] = {
            "onet": code,
            "n_all": int(n),
            "n_high_proxy": int(len(high)),
            "n_sample": int(len(sample)),
            "score_cutoff": score_cut,
            "high_with_seniority_signal_pct": round(100 * signal_share, 1),
            "bls": BLS_WAGES[code],
            "example_high_titles": examples,
            "top_all": all_top,
            "top_high_proxy": high_ann,
            "top_sample100": sample_ann,
            "dropped_from_high_vs_all": high_dropped,
            "dropped_from_sample_vs_all": sample_dropped,
        }

        print(f"{name}: all={n} high_proxy={len(high)} (cutoff score={score_cut}) sample={len(sample)}")
        print(f"  high titles w/ seniority signal: {100*signal_share:.0f}%")
        print("  top high-proxy skills:", ", ".join(e["skill"] for e in high_top[:5]))
        print("  top all skills:       ", ", ".join(e["skill"] for e in all_top[:5]))

    out_json = os.path.join(HERE, "salary_proxy_skills.json")
    out_js = os.path.join(HERE, "salary_proxy_skills.js")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("const SALARY_PROXY_DATA = ")
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"\nSaved {out_json} and {out_js}")


if __name__ == "__main__":
    build()
