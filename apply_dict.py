import pandas as pd
import json, os

OUT_DIR = r"C:\Users\karet\3_jobs"

FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}

ALL_OCC = "All"

# Parent rows = union penetration across child nodes only (job-level)
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

# ── 1. Load dictionary ──────────────────────────────────────────────────────
with open(os.path.join(OUT_DIR, "node_skill_dictionary.json"), encoding="utf-8") as f:
    node_dict = json.load(f)

# Reverse: skill -> node
skill_to_node = {}
for node_name, info in node_dict.items():
    for sk in info["skills"]:
        skill_to_node[sk] = node_name

print(f"Dictionary: {len(skill_to_node)} skills -> {len(node_dict)} nodes\n")

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

# ── 3. For each job, find which nodes its skills map to ─────────────────────
def get_nodes_for_job(skills_str):
    nodes_found = set()
    for sk in skills_str.split(","):
        sk = sk.strip()
        if sk in skill_to_node:
            nodes_found.add(skill_to_node[sk])
    return nodes_found

jobs["matched_nodes"] = jobs["standardized_skills"].apply(get_nodes_for_job)

# ── 4. For each (occupation, year, node) count % of jobs ────────────────────
all_nodes = list(node_dict.keys())
rows = []

def append_node_stats(rows, occ, subset, yr):
    total = len(subset)
    for node_name in all_nodes:
        n_jobs = subset["matched_nodes"].apply(lambda ns, n=node_name: n in ns).sum()
        rows.append({
            "occupation": occ,
            "year": yr,
            "node": node_name,
            "category": node_dict[node_name]["category"],
            "type": node_dict[node_name]["type"],
            "n_jobs": int(n_jobs),
            "total_jobs": total,
            "pct": round(n_jobs / total * 100, 1) if total > 0 else 0,
        })


occupations = list(FOCUS.values()) + [ALL_OCC]
rows = []

for occ in occupations:
    for yr in ["2023", "2026"]:
        if occ == ALL_OCC:
            subset = jobs[jobs["year"] == yr]
        else:
            subset = jobs[(jobs["occupation"] == occ) & (jobs["year"] == yr)]
        append_node_stats(rows, occ, subset, yr)

stats = pd.DataFrame(rows)

# ── 4b. Parent categories = union penetration across children only ────────
for occ in occupations:
    for yr in ["2023", "2026"]:
        if occ == ALL_OCC:
            subset = jobs[jobs["year"] == yr]
        else:
            subset = jobs[(jobs["occupation"] == occ) & (jobs["year"] == yr)]
        total = len(subset)
        for group in HIERARCHY:
            for side in (group.get("hard"), group.get("soft")):
                if not side:
                    continue
                member_nodes = set(side["children"])
                n_jobs = subset["matched_nodes"].apply(
                    lambda ns, mn=member_nodes: bool(ns & mn)
                ).sum()
                pct = round(n_jobs / total * 100, 1) if total > 0 else 0
                mask = (
                    (stats["occupation"] == occ)
                    & (stats["year"] == yr)
                    & (stats["node"] == side["parent"])
                )
                stats.loc[mask, "n_jobs"] = int(n_jobs)
                stats.loc[mask, "pct"] = pct

# ── 5. Pivot and compare ───────────────────────────────────────────────────
for occ in occupations:
    occ_data = stats[stats["occupation"] == occ]
    pivot = occ_data.pivot_table(index=["category", "type", "node"],
                                  columns="year", values="pct", fill_value=0)
    pivot["change"] = pivot["2026"] - pivot["2023"]
    pivot = pivot.reset_index()

    # classify
    pivot["trend"] = pivot["change"].apply(
        lambda d: "UP" if d >= 3 else ("DOWN" if d <= -3 else "stable"))

    print(f"\n{'='*120}")
    print(f"  {occ.upper()}")
    n23 = occ_data[occ_data["year"]=="2023"].iloc[0]["total_jobs"]
    n26 = occ_data[occ_data["year"]=="2026"].iloc[0]["total_jobs"]
    print(f"  2023: {n23} jobs   2026: {n26} jobs")
    print(f"{'='*120}")

    up = pivot[pivot["trend"] == "UP"].sort_values("change", ascending=False)
    down = pivot[pivot["trend"] == "DOWN"].sort_values("change")
    stable = pivot[(pivot["trend"] == "stable") & ((pivot["2023"] > 0) | (pivot["2026"] > 0))]

    if len(up):
        print(f"\n  GREW:")
        for _, r in up.iterrows():
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%  (+{r['change']:.1f}pp)")

    if len(down):
        print(f"\n  DECLINED:")
        for _, r in down.iterrows():
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%  ({r['change']:.1f}pp)")

    if len(stable):
        print(f"\n  STABLE ({len(stable)} nodes):")
        for _, r in stable.sort_values("2026", ascending=False).iterrows():
            marker = ""
            if r["change"] > 0: marker = f" (+{r['change']:.1f})"
            elif r["change"] < 0: marker = f" ({r['change']:.1f})"
            print(f"    [{r['category']:<10} {r['type']:<5}] {r['node']:<60} {r['2023']:>5.1f}% -> {r['2026']:>5.1f}%{marker}")

stats.to_csv(os.path.join(OUT_DIR, "node_presence_2023_2026.csv"), index=False)
print(f"\nSaved: node_presence_2023_2026.csv")
