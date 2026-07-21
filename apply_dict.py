"""Apply the LLM-adjudicated skill->node dictionary to job postings.

Computes node penetration (share of postings containing >=1 mapped skill) per
occupation x year, under THREE mapping-confidence variants:
  conf_min = 1  -> all mappings (c1 + c2 + c3)
  conf_min = 2  -> confident only (c2 + c3)
  conf_min = 3  -> strict (c3 only)

Output: node_presence_2023_2026.csv with a conf_min column. The dashboard's
"mapping confidence" selector switches between the variants.
Parent rows = union penetration across child nodes only (job-level).
"""

import pandas as pd
import json, os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}

ALL_OCC = "All"

HIERARCHY = [
    {"hard": {"parent": "Declarative and retrieval-based knowledge", "children": ["Locate and retrieve information", "Digital information analysis and synthesis", "business knowledge as stored facts"]},
     "soft": {"parent": "Individual knowledge", "children": ["language-specific knowledge"]}},
    {"hard": {"parent": "Standardized routine execution", "children": ["Routine tasks"]},
     "soft": None},
    {"hard": {"parent": "Foundations", "children": ["Business and management foundations", "Quantitative, data, and analytical foundations"]},
     "soft": {"parent": "Creativity", "children": ["Entrepreneurial and Innovation-Oriented Thinking", "Creative Thinking and Curiosity"]}},
    {"hard": {"parent": "A structured approach to work", "children": ["Analytical and Structured Problem-Solving", "Data- and Evidence-Based Decision-Making", "Methodical Process and Technology Management"]},
     "soft": {"parent": "Criticism", "children": ["Analytical and critical thinking", "Critical thinking", "Ethical decision-making"]}},
    {"hard": {"parent": "Communications", "children": ["Business & Professional communication", "Data communication and storytelling"]},
     "soft": {"parent": "Collaboration", "children": ["Teamwork and cooperation", "Leadership and social influence", "Emotional and interpersonal intelligence"]}},
    {"hard": None,
     "soft": {"parent": "Learning", "children": ["Learning orientation", "Self-reflection"]}},
    {"hard": {"parent": "AI Interaction (How do humans use, communicate with, and evaluate AI?)", "children": ["Digital and AI literacy", "Prompting skills", "AI Use-Case Identification and Professional Application", "AI monitoring; output evaluation and verification", "AI-ideation"]},
     "soft": {"parent": "Adaptability (capacity to respond constructively to technological and organizational change)", "children": ["Adaptive Mindset and Resilience", "AI-Driven Change and Opportunity Management", "AI self-efficacy"]}},
    {"hard": {"parent": "AI System Design (How are AI-supported tools, workflows, and processes designed?)", "children": ["AI Development and Implementation", "AI Data and Process Management", "AI infrastructure and Deployment Readiness"]},
     "soft": {"parent": "Systemic Skills (ability to understand AI implementation within a wider organizational and socio-technical context)", "children": ["Human-AI collaboration", "Socio-Technical Systems Thinking", "AI transformation and organizational redesign"]}},
    {"hard": {"parent": "AI Governance (How do we ensure AI is used responsibly, safely, legally, and accountably?)", "children": ["Governance and Accountability Structures", "Responsible and Ethical AI Evaluation", "AI Risk, Privacy, and Security Management", "Societal and Environmental AI Impact"]},
     "soft": None},
]

# ── 1. Load dictionary (with per-skill mapping confidence) ──────────────────
with open(os.path.join(OUT_DIR, "node_skill_dictionary.json"), encoding="utf-8") as f:
    node_dict = json.load(f)

skill_node_conf = {}  # skill -> (node, conf)
for node_name, info in node_dict.items():
    conf_map = info.get("conf") or {}
    for sk in info["skills"]:
        skill_node_conf[sk] = (node_name, int(conf_map.get(sk, 3)))

print(f"Dictionary: {len(skill_node_conf)} skills -> {len(node_dict)} nodes\n")

# ── 2. Load jobs ────────────────────────────────────────────────────────────
print("Loading 2023...")
j23 = pd.read_csv(r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv")
j23["year"] = "2023"

print("Loading 2026...")
j26 = pd.read_csv(r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv")
j26["year"] = "2026"

jobs = pd.concat([j23, j26], ignore_index=True)
jobs = jobs[jobs["onet_occupation_code"].isin(FOCUS)].reset_index(drop=True)
jobs["occupation"] = jobs["onet_occupation_code"].map(FOCUS)
jobs["standardized_skills"] = jobs["standardized_skills"].fillna("")

for occ in FOCUS.values():
    n23 = len(jobs[(jobs["occupation"] == occ) & (jobs["year"] == "2023")])
    n26 = len(jobs[(jobs["occupation"] == occ) & (jobs["year"] == "2026")])
    print(f"  {occ:<30} 2023: {n23:>5}   2026: {n26:>5}")
print()

all_nodes = list(node_dict.keys())
occupations = list(FOCUS.values()) + [ALL_OCC]


def compute_variant(conf_min):
    """Node presence stats for mappings with confidence >= conf_min."""
    lookup = {sk: node for sk, (node, conf) in skill_node_conf.items() if conf >= conf_min}

    def get_nodes_for_job(skills_str):
        found = set()
        for sk in skills_str.split(","):
            sk = sk.strip()
            if sk in lookup:
                found.add(lookup[sk])
        return found

    matched = jobs["standardized_skills"].apply(get_nodes_for_job)

    rows = []
    for occ in occupations:
        for yr in ["2023", "2026"]:
            if occ == ALL_OCC:
                mask = jobs["year"] == yr
            else:
                mask = (jobs["occupation"] == occ) & (jobs["year"] == yr)
            subset = matched[mask]
            total = int(mask.sum())
            for node_name in all_nodes:
                n_jobs = int(subset.apply(lambda ns, n=node_name: n in ns).sum())
                rows.append({
                    "occupation": occ,
                    "year": yr,
                    "node": node_name,
                    "category": node_dict[node_name]["category"],
                    "type": node_dict[node_name]["type"],
                    "n_jobs": n_jobs,
                    "total_jobs": total,
                    "pct": round(n_jobs / total * 100, 1) if total > 0 else 0,
                    "conf_min": conf_min,
                })
    stats = pd.DataFrame(rows)

    # Parent rows = union penetration across children only (job-level)
    for occ in occupations:
        for yr in ["2023", "2026"]:
            if occ == ALL_OCC:
                mask = jobs["year"] == yr
            else:
                mask = (jobs["occupation"] == occ) & (jobs["year"] == yr)
            subset = matched[mask]
            total = int(mask.sum())
            for group in HIERARCHY:
                for side in (group.get("hard"), group.get("soft")):
                    if not side:
                        continue
                    member_nodes = set(side["children"])
                    n_jobs = int(subset.apply(lambda ns, mn=member_nodes: bool(ns & mn)).sum())
                    pct = round(n_jobs / total * 100, 1) if total > 0 else 0
                    m = (
                        (stats["occupation"] == occ)
                        & (stats["year"] == yr)
                        & (stats["node"] == side["parent"])
                    )
                    stats.loc[m, "n_jobs"] = n_jobs
                    stats.loc[m, "pct"] = pct
    return stats


frames = []
for conf_min in (1, 2, 3):
    n_skills = sum(1 for _, (n, c) in skill_node_conf.items() if c >= conf_min)
    print(f"Variant conf_min={conf_min}: {n_skills} mapped skills...")
    frames.append(compute_variant(conf_min))

stats_all = pd.concat(frames, ignore_index=True)

# ── Report (conf_min=1 variant, matches prior behaviour) ────────────────────
stats = frames[0]
for occ in occupations:
    occ_data = stats[stats["occupation"] == occ]
    pivot = occ_data.pivot_table(index=["category", "type", "node"],
                                  columns="year", values="pct", fill_value=0)
    pivot["change"] = pivot["2026"] - pivot["2023"]
    pivot = pivot.reset_index()
    pivot["trend"] = pivot["change"].apply(
        lambda d: "UP" if d >= 3 else ("DOWN" if d <= -3 else "stable"))

    print(f"\n{'='*120}")
    print(f"  {occ.upper()}")
    n23 = occ_data[occ_data["year"] == "2023"].iloc[0]["total_jobs"]
    n26 = occ_data[occ_data["year"] == "2026"].iloc[0]["total_jobs"]
    print(f"  2023: {n23} jobs   2026: {n26} jobs")
    print(f"{'='*120}")

    up = pivot[pivot["trend"] == "UP"].sort_values("change", ascending=False)
    down = pivot[pivot["trend"] == "DOWN"].sort_values("change")
    stable = pivot[(pivot["trend"] == "stable") & ((pivot["2023"] > 0) | (pivot["2026"] > 0))]

    if len(up):
        print("\n  GREW:")
        for _, r in up.iterrows():
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%  (+{r['change']:.1f}pp)")
    if len(down):
        print("\n  DECLINED:")
        for _, r in down.iterrows():
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%  ({r['change']:.1f}pp)")
    if len(stable):
        print(f"\n  STABLE ({len(stable)} nodes):")
        for _, r in stable.sort_values("2026", ascending=False).iterrows():
            marker = ""
            if r["change"] > 0: marker = f" (+{r['change']:.1f})"
            elif r["change"] < 0: marker = f" ({r['change']:.1f})"
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%{marker}")

stats_all.to_csv(os.path.join(OUT_DIR, "node_presence_2023_2026.csv"), index=False)
print(f"\nSaved: node_presence_2023_2026.csv ({len(stats_all)} rows, 3 confidence variants)")
