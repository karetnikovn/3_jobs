"""Merge LLM adjudication batches into the dashboard data artifacts.

Validates batches/batch_*.json against the working universe and the matrix
leaf-node list, then regenerates:
  ../node_skill_dictionary.json   (mapping incl. per-skill confidence)
  ../skill_ai_exposure.json       (LLM exposure + keyword comparison)
  ../node_ai_exposure.json        (node means, incl. parent aggregates)
  ../skill_exposure.js            (SKILL_AI_EXPOSURE for the dashboard)
  agreement_stats.json            (LLM-vs-keyword and LLM-vs-embedding stats)

See PROTOCOL.md for the adjudication rules.
"""

import glob
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from build_skill_exposure import score_skill  # noqa: E402  (keyword rubric)

# Parent -> children hierarchy (mirrors apply_dict.py). Parents never receive
# direct skill assignments; their exposure aggregates over children members.
HIERARCHY = {
    "Declarative and retrieval-based knowledge": ["Locate and retrieve information", "Digital information analysis and synthesis", "business knowledge as stored facts"],
    "Individual knowledge": ["language-specific knowledge"],
    "Standardized routine execution": ["Routine tasks"],
    "Foundations": ["Business and management foundations", "Quantitative, data, and analytical foundations"],
    "Creativity": ["Entrepreneurial and Innovation-Oriented Thinking", "Creative Thinking and Curiosity"],
    "A structured approach to work": ["Analytical and Structured Problem-Solving", "Data- and Evidence-Based Decision-Making", "Methodical Process and Technology Management"],
    "Criticism": ["Analytical and critical thinking", "Critical thinking", "Ethical decision-making"],
    "Communications": ["Business & Professional communication", "Data communication and storytelling"],
    "Collaboration": ["Teamwork and cooperation", "Leadership and social influence", "Emotional and interpersonal intelligence"],
    "Learning": ["Learning orientation", "Self-reflection"],
    "AI Interaction (How do humans use, communicate with, and evaluate AI?)": ["Digital and AI literacy", "Prompting skills", "AI Use-Case Identification and Professional Application", "AI monitoring; output evaluation and verification", "AI-ideation"],
    "Adaptability (capacity to respond constructively to technological and organizational change)": ["Adaptive Mindset and Resilience", "AI-Driven Change and Opportunity Management", "AI self-efficacy"],
    "AI System Design (How are AI-supported tools, workflows, and processes designed?)": ["AI Development and Implementation", "AI Data and Process Management", "AI infrastructure and Deployment Readiness"],
    "Systemic Skills (ability to understand AI implementation within a wider organizational and socio-technical context)": ["Human-AI collaboration", "Socio-Technical Systems Thinking", "AI transformation and organizational redesign"],
    "AI Governance (How do we ensure AI is used responsibly, safely, legally, and accountably?)": ["Governance and Accountability Structures", "Responsible and Ethical AI Evaluation", "AI Risk, Privacy, and Security Management", "Societal and Environmental AI Impact"],
}
PARENTS = set(HIERARCHY)
LEAVES = {c for ch in HIERARCHY.values() for c in ch}


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return cov / (sx * sy) if sx and sy else float("nan")


def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    return pearson(ranks(xs), ranks(ys))


def main():
    # ── Load universe and legacy state ──────────────────────────────────────
    with open(os.path.join(HERE, "working_data.json"), encoding="utf-8") as f:
        working = json.load(f)
    universe = {s["skill"] for s in working["skills"]}
    old_map = {s["skill"]: s["cur_node"] for s in working["skills"] if s["cur_node"]}
    node_info = {n["node"]: n for n in working["nodes"]}
    hp = {s["skill"] for s in working["skills"] if s["hp"]}

    assert set(node_info) == PARENTS | LEAVES, "node list mismatch vs HIERARCHY"

    # ── Load and validate batches ───────────────────────────────────────────
    entries = {}
    for path in sorted(glob.glob(os.path.join(HERE, "batches", "batch_*.json"))):
        with open(path, encoding="utf-8") as f:
            batch = json.load(f)
        for skill, node, conf, exp in batch:
            if skill in entries:
                raise SystemExit(f"duplicate adjudication: {skill!r}")
            if skill not in universe:
                raise SystemExit(f"skill not in universe: {skill!r} ({path})")
            if node is not None:
                if node in PARENTS:
                    raise SystemExit(f"parent-node assignment: {skill!r} -> {node!r}")
                if node not in LEAVES:
                    raise SystemExit(f"unknown node: {skill!r} -> {node!r}")
                if conf not in (1, 2, 3):
                    raise SystemExit(f"bad confidence for mapped skill {skill!r}: {conf}")
            elif conf != 0:
                raise SystemExit(f"null mapping must have conf 0: {skill!r}")
            if not (0.05 <= exp <= 0.95):
                raise SystemExit(f"exposure out of range: {skill!r} = {exp}")
            entries[skill] = (node, conf, exp)

    missing = universe - set(entries)
    if missing:
        raise SystemExit(f"{len(missing)} skills not adjudicated, e.g. {sorted(missing)[:5]}")
    print(f"validated {len(entries)} adjudications "
          f"(mapped: {sum(1 for n, _, _ in entries.values() if n)}, "
          f"null: {sum(1 for n, _, _ in entries.values() if not n)})")

    # ── node_skill_dictionary.json ──────────────────────────────────────────
    node_dict = {}
    for name, info in node_info.items():
        node_dict[name] = {
            "category": info["category"],
            "type": info["type"],
            "skills": [],
            "conf": {},
        }
    for skill in sorted(entries):
        node, conf, _ = entries[skill]
        if node:
            node_dict[node]["skills"].append(skill)
            node_dict[node]["conf"][skill] = conf
    with open(os.path.join(ROOT, "node_skill_dictionary.json"), "w", encoding="utf-8") as f:
        json.dump(node_dict, f, ensure_ascii=False, indent=1)

    # ── skill_ai_exposure.json + skill_exposure.js ─────────────────────────
    skill_scores = {}
    for skill in sorted(entries):
        node, conf, exp = entries[skill]
        kw = score_skill(skill)["exposure"]
        skill_scores[skill] = {
            "exposure": exp,
            "kw_exposure": kw,
            "node": node,
            "conf": conf,
            "source": "llm",
        }
    with open(os.path.join(ROOT, "skill_ai_exposure.json"), "w", encoding="utf-8") as f:
        json.dump(skill_scores, f, ensure_ascii=False, indent=1)

    compact = {sk: round(rec["exposure"], 2) for sk, rec in skill_scores.items()}
    with open(os.path.join(ROOT, "skill_exposure.js"), "w", encoding="utf-8") as f:
        f.write("const SKILL_AI_EXPOSURE = ")
        json.dump(compact, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    # ── node_ai_exposure.json (leaves + parent aggregates) ─────────────────
    node_scores = {}
    for name, info in node_dict.items():
        if name in PARENTS:
            members = [sk for ch in HIERARCHY[name] for sk in node_dict[ch]["skills"]]
        else:
            members = info["skills"]
        vals = [entries[sk][2] for sk in members]
        node_scores[name] = {
            "exposure": round(sum(vals) / len(vals), 3) if vals else None,
            "n_skills": len(vals),
            "category": info["category"],
            "type": info["type"],
        }
    with open(os.path.join(ROOT, "node_ai_exposure.json"), "w", encoding="utf-8") as f:
        json.dump(node_scores, f, ensure_ascii=False, indent=1)

    node_compact = {n: s["exposure"] for n, s in node_scores.items()
                    if s["exposure"] is not None}
    with open(os.path.join(ROOT, "node_exposure.js"), "w", encoding="utf-8") as f:
        f.write("// GENERATED by llm_review/build_llm_review.py — do not edit.\n")
        f.write("// Node exposure = mean of LLM-adjudicated member-skill scores.\n")
        f.write("const NODE_AI_EXPOSURE = ")
        json.dump(node_compact, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    # ── Agreement / robustness stats ────────────────────────────────────────
    llm = [entries[sk][2] for sk in sorted(entries)]
    kw = [skill_scores[sk]["kw_exposure"] for sk in sorted(entries)]
    within = sum(1 for a, b in zip(llm, kw) if abs(a - b) <= 0.15) / len(llm)
    kw_informative = [(a, b) for sk, (a, b) in
                      zip(sorted(entries), zip(llm, kw)) if abs(b - 0.5) > 0.001]

    same_node = sum(1 for sk in entries
                    if old_map.get(sk) and entries[sk][0] == old_map[sk])
    old_mapped = sum(1 for sk in entries if old_map.get(sk))
    conf_dist = {c: sum(1 for n, cf, _ in entries.values() if n and cf == c)
                 for c in (1, 2, 3)}
    hp_mapped = sum(1 for sk in hp if entries[sk][0])

    stats = {
        "n_skills": len(entries),
        "n_mapped": sum(1 for n, _, _ in entries.values() if n),
        "n_null": sum(1 for n, _, _ in entries.values() if not n),
        "high_pass": {"n": len(hp), "mapped": hp_mapped},
        "confidence_distribution": conf_dist,
        "exposure_agreement": {
            "pearson_all": round(pearson(llm, kw), 3),
            "spearman_all": round(spearman(llm, kw), 3),
            "pearson_kw_informative": round(
                pearson([a for a, _ in kw_informative], [b for _, b in kw_informative]), 3),
            "share_within_0.15": round(within, 3),
            "n_kw_informative": len(kw_informative),
        },
        "mapping_vs_embedding": {
            "previously_mapped": old_mapped,
            "same_node": same_node,
            "agreement_share": round(same_node / old_mapped, 3) if old_mapped else None,
        },
    }
    with open(os.path.join(HERE, "agreement_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)

    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
