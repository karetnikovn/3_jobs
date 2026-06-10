"""Top demanded standardized skills per occupation (job penetration %)."""

import json
import os

import pandas as pd

OUT_DIR = r"C:\Users\karet\3_jobs"
TOP_N = 10
BUMP_N = 20

FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}

PATHS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}

# Taxonomy artifacts / boilerplate tags (see skill_drift_bundle/methodology.md)
NOISE_SKILLS = {
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
NOISE_LOWER = {s.lower() for s in NOISE_SKILLS}


def load_skill_to_node():
    with open(os.path.join(OUT_DIR, "node_skill_dictionary.json"), encoding="utf-8") as f:
        node_dict = json.load(f)
    skill_to_node = {}
    for node_name, info in node_dict.items():
        for sk in info["skills"]:
            skill_to_node[sk] = node_name
    return skill_to_node


def rank_skills(jobs, skill_to_node, limit):
    total = len(jobs)
    counts = {}
    for skills_str in jobs["standardized_skills"].fillna(""):
        seen = set()
        for sk in skills_str.split(","):
            sk = sk.strip()
            if not sk or sk in seen or sk.lower() in NOISE_LOWER:
                continue
            seen.add(sk)
            counts[sk] = counts.get(sk, 0) + 1
    ranked_all = sorted(counts.items(), key=lambda x: -x[1])
    lookup = {skill: i + 1 for i, (skill, _) in enumerate(ranked_all)}
    ranked = [
        [skill, int(n), round(n / total * 100, 1) if total else 0, skill_to_node.get(skill)]
        for skill, n in ranked_all[:limit]
    ]
    return ranked, lookup


def build():
    skill_to_node = load_skill_to_node()
    result = {"noise_skills": sorted(NOISE_SKILLS)}

    codes = list(FOCUS.keys())

    def finish_occ(occ_data, lookups):
        union = set()
        for yr in ("2023", "2026"):
            for item in occ_data.get(f"ranked_{yr}", []):
                union.add(item[0])
        for yr, lookup in lookups.items():
            occ_data[f"rank_lookup_{yr}"] = {sk: lookup[sk] for sk in union if sk in lookup}
        return occ_data

    for code, name in FOCUS.items():
        occ_data = {"name": name, "onet": code}
        lookups = {}
        for yr, path in PATHS.items():
            df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
            sub = df[df["onet_occupation_code"] == code]
            occ_data[f"total_jobs_{yr}"] = len(sub)
            ranked, lookup = rank_skills(sub, skill_to_node, BUMP_N)
            lookups[yr] = lookup
            occ_data[f"ranked_{yr}"] = ranked
            occ_data[f"top_{yr}"] = ranked[:TOP_N]
        result[name] = finish_occ(occ_data, lookups)

    all_data = {"name": "All occupations", "onet": "all"}
    lookups = {}
    for yr, path in PATHS.items():
        df = pd.read_csv(path, usecols=["standardized_skills", "onet_occupation_code"])
        sub = df[df["onet_occupation_code"].isin(codes)]
        all_data[f"total_jobs_{yr}"] = len(sub)
        ranked, lookup = rank_skills(sub, skill_to_node, BUMP_N)
        lookups[yr] = lookup
        all_data[f"ranked_{yr}"] = ranked
        all_data[f"top_{yr}"] = ranked[:TOP_N]
    result["All"] = finish_occ(all_data, lookups)

    out_path = os.path.join(OUT_DIR, "top_skills.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    for name, info in result.items():
        if name == "noise_skills":
            continue
        top26 = info["top_2026"][0] if info["top_2026"] else None
        print(f"{name}: top 2026 = {top26[0] if top26 else 'n/a'} ({top26[2] if top26 else 0}%)")
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    build()
