"""Extract the adjudication working set for the LLM review.

Produces llm_review/working_data.json:
  nodes: [{node, category, type}]           (55 matrix nodes)
  skills: [{skill, cur_node, kw_exp, hp}]   (full scored universe;
           hp = 1 if the skill is in the >=5%-either-year high-pass set)
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    with open(os.path.join(ROOT, "node_skill_dictionary.json"), encoding="utf-8") as f:
        node_dict = json.load(f)
    with open(os.path.join(ROOT, "skill_ai_exposure.json"), encoding="utf-8") as f:
        exposure = json.load(f)
    with open(os.path.join(ROOT, "skill_deltas.json"), encoding="utf-8") as f:
        deltas = json.load(f)

    nodes = [
        {"node": n, "category": info.get("category"), "type": info.get("type")}
        for n, info in node_dict.items()
    ]

    skill_to_node = {}
    for n, info in node_dict.items():
        for sk in info.get("skills", []):
            skill_to_node[sk] = n

    # High-pass universe: skills appearing in skill_deltas occupations (>=5% floor)
    hp = set()
    for occ in (deltas.get("occupations") or {}).values():
        for r in occ.get("all") or []:
            if r.get("skill"):
                hp.add(r["skill"])

    skills = []
    for sk in sorted(exposure.keys()):
        skills.append({
            "skill": sk,
            "cur_node": skill_to_node.get(sk),
            "kw_exp": exposure[sk]["exposure"],
            "hp": 1 if sk in hp else 0,
        })

    out = {"nodes": nodes, "skills": skills}
    with open(os.path.join(HERE, "working_data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"nodes: {len(nodes)}")
    print(f"skills: {len(skills)} (high-pass: {sum(s['hp'] for s in skills)}, "
          f"mapped: {sum(1 for s in skills if s['cur_node'])})")


if __name__ == "__main__":
    main()
