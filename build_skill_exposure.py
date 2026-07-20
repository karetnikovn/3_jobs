"""Assign an AI-exposure score to Lightcast / ESCO skill labels.

Exposure = degree to which current generative AI can perform / automate the task
implied by the skill label (0 = human bottleneck, 1 = largely automatable).

IMPORTANT: scoring is MATRIX-INDEPENDENT. Every skill uses the same neutral base
(0.5) + keyword adjustment. The AI Skill Matrix dictionary is used only to
aggregate member-skill scores up to matrix *nodes* for the matrix-shaded tabs
(Dashboard / Rankings / Teaching / What to learn) — never as a prior on skills.

Rubric grounded in task-level exposure literature (Eloundou et al. 2023;
Felten et al. AIOE):
  * HIGH — information processing, writing/drafting, data & quantitative analysis,
           coding, retrieval, documentation, routine/standardised procedures.
  * LOW  — interpersonal & relational work, leadership, negotiation, coaching,
           ethical judgement, creativity/originality, physical/manual tasks,
           adaptability and learning.

Outputs (written next to this script):
  * skill_ai_exposure.json  — per skill: {exposure, base, adj, hits, source}
  * node_ai_exposure.json   — per matrix node: mean of member skill exposures
  * skill_exposure.js       — compact SKILL_AI_EXPOSURE map for the dashboard
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DICT_PATH = os.path.join(HERE, "node_skill_dictionary.json")
DELTAS_JSON = os.path.join(HERE, "skill_deltas.json")
DELTAS_JS = os.path.join(HERE, "skill_deltas.js")

NEUTRAL_BASE = 0.5

HIGH_KEYWORDS = [
    "data", "analyse", "analysis", "analytic", "statistic", "calculat", "comput",
    "quantitat", "forecast", "model", "algorithm", "math", "metric", "measur",
    "report", "document", "record", "write", "writing", "draft", "compose",
    "summar", "translat", "transcri", "proofread", "edit text", "format",
    "information", "retriev", "extract", "gather data", "collect data", "search",
    "database", "knowledge base", "catalogue", "categor", "classif", "index",
    "spreadsheet", "bookkeep", "account", "audit", "invoice", "payroll", "ledger",
    "program", "coding", "software", "script", "debug", "automat", "process data",
    "digital", "monitor", "test", "schedul", "compile", "standardi", "routine",
    "template", "documentation", "data entry", "generate", "convert",
]
LOW_KEYWORDS = [
    "lead", "leadership", "supervis", "manage people", "manage staff", "delegat",
    "mentor", "coach", "motivat", "inspire", "empower", "negoti", "persuad",
    "relationship", "stakeholder", "rapport", "network", "liaise", "interpersonal",
    "emotional", "empath", "conflict", "counsel", "advis", "consult with",
    "customer", "client", "patient", "student", "colleague", "team",
    "collaborat", "cooperat", "communicate with", "cultural", "diversity",
    "inclusi", "ethic", "moral", "integrity", "responsib", "judgement", "judgment",
    "creativ", "innovat", "curios", "imagin", "original", "design thinking",
    "trust", "care", "wellbeing", "well-being", "safeguard", "resilien",
    "adapt", "self-reflect", "reflect", "learn", "develop others", "influence",
    "physical", "manual", "operate machin", "drive", "lift", "install",
    "repair", "maintain equipment", "safety", "hospitality", "hygiene",
]


def score_skill(label, base=NEUTRAL_BASE):
    text = " " + label.lower().strip() + " "
    high_hits = sorted({kw for kw in HIGH_KEYWORDS if kw in text})
    low_hits = sorted({kw for kw in LOW_KEYWORDS if kw in text})
    adj = 0.13 * len(high_hits) - 0.13 * len(low_hits)
    adj = max(-0.35, min(0.35, adj))
    exposure = max(0.05, min(0.95, base + adj))
    return {
        "exposure": round(exposure, 3),
        "base": round(base, 3),
        "adj": round(adj, 3),
        "high": high_hits,
        "low": low_hits,
        "source": "keyword",
    }


def score_skill_neutral(label):
    """Public alias used by ESCO group/pillar/domain builders."""
    return score_skill(label, NEUTRAL_BASE)


def load_delta_skills():
    """Unique skill labels from rebuilt skill_deltas (universe floor)."""
    path = DELTAS_JSON if os.path.exists(DELTAS_JSON) else DELTAS_JS
    if not os.path.exists(path):
        return set()
    if path.endswith(".js"):
        text = open(path, encoding="utf-8").read()
        data = json.loads(text.split("=", 1)[1].strip().rstrip(";"))
    else:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    skills = set()
    for occ in (data.get("occupations") or {}).values():
        for r in occ.get("all") or []:
            if r.get("skill"):
                skills.add(r["skill"])
    return skills


def build():
    with open(DICT_PATH, encoding="utf-8") as f:
        node_dict = json.load(f)

    skill_scores = {}

    # Every skill: same neutral base + keywords (no matrix category prior).
    universe = load_delta_skills()
    dict_skills = set()
    for info in node_dict.values():
        for sk in info.get("skills", []):
            dict_skills.add(sk)

    for sk in sorted(universe | dict_skills):
        skill_scores[sk] = score_skill(sk)

    # Matrix nodes = mean of member skill exposures (still keyword-only members).
    node_scores = {}
    for node, info in node_dict.items():
        skills = info.get("skills", [])
        vals = [skill_scores[sk]["exposure"] for sk in skills if sk in skill_scores]
        mean = round(sum(vals) / len(vals), 3) if vals else None
        node_scores[node] = {
            "exposure": mean,
            "n_skills": len(vals),
            "category": info.get("category"),
            "type": info.get("type"),
        }

    with open(os.path.join(HERE, "skill_ai_exposure.json"), "w", encoding="utf-8") as f:
        json.dump(skill_scores, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "node_ai_exposure.json"), "w", encoding="utf-8") as f:
        json.dump(node_scores, f, ensure_ascii=False, indent=1)

    compact = {sk: round(rec["exposure"], 2) for sk, rec in skill_scores.items()}
    with open(os.path.join(HERE, "skill_exposure.js"), "w", encoding="utf-8") as f:
        f.write("const SKILL_AI_EXPOSURE = ")
        json.dump(compact, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    covered = sum(1 for s in universe if s in compact)
    n_moved = sum(1 for s in universe if abs(compact.get(s, 0.5) - 0.5) > 0.001)
    print(f"Scored {len(skill_scores)} skills (matrix-independent keyword rubric).")
    print(f"Universe floor skills: {len(universe)} | with exposure: {covered}")
    print(f"Universe skills off the 0.50 line (keyword hit): {n_moved}")
    leaves = {n: s for n, s in node_scores.items() if s["exposure"] is not None}
    for n, s in sorted(leaves.items(), key=lambda kv: kv[1]["exposure"]):
        print(f"  {s['exposure']:.2f}  (n={s['n_skills']:>2})  [{s['category']:<9} {s['type']:<4}]  {n}")


if __name__ == "__main__":
    build()
