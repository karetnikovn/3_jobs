"""Extract unique job posting titles per O*NET occupation code (2023 + 2026)."""

import json
import os

import pandas as pd

OUT_DIR = r"C:\Users\karet\3_jobs"

FOCUS = {
    "11-2021.00": "Marketing Managers",
    "11-3121.00": "Human Resources Managers",
    "11-3031.00": "Financial Managers",
}

PATHS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}


def build():
    result = {}
    for code, name in FOCUS.items():
        counts = {}
        for yr, path in PATHS.items():
            df = pd.read_csv(path, usecols=["title", "onet_occupation_code"])
            sub = df[df["onet_occupation_code"] == code]
            vc = sub["title"].fillna("").str.strip().value_counts()
            for title, n in vc.items():
                if not title:
                    continue
                if title not in counts:
                    counts[title] = {"2023": 0, "2026": 0}
                counts[title][yr] = int(n)

        titles = [
            [title, v["2023"], v["2026"]]
            for title, v in counts.items()
        ]
        titles.sort(key=lambda x: -(x[1] + x[2]))

        result[code] = {
            "name": name,
            "onet": code,
            "unique_titles": len(titles),
            "postings_2023": sum(t[1] for t in titles),
            "postings_2026": sum(t[2] for t in titles),
            "titles": titles,
        }

    out_path = os.path.join(OUT_DIR, "occupation_titles.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    for code, info in result.items():
        print(
            f"{info['name']} ({code}): {info['unique_titles']:,} titles, "
            f"{info['postings_2023']:,} postings (2023), {info['postings_2026']:,} (2026)"
        )
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    build()
