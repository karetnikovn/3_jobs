"""Job posting counts for the top 10 O*NET codes in the business dataset."""

import json
import os

import pandas as pd

OUT_DIR = r"C:\Users\karet\3_jobs"
TOP_N = 10

PATHS = {
    "2023": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2023.csv",
    "2026": r"c:\Users\karet\Downloads\skill_drift_bundle\inputs\business_only_jobs_2026.csv",
}

# O*NET-SOC 2019 titles for codes that appear in the top-10 list
ONET_NAMES = {
    "11-1021.00": "General and Operations Managers",
    "11-2021.00": "Marketing Managers",
    "11-2022.00": "Sales Managers",
    "11-3021.00": "Computer and Information Systems Managers",
    "11-3031.00": "Financial Managers",
    "11-3121.00": "Human Resources Managers",
    "11-9021.00": "Construction Managers",
    "11-9041.00": "Architectural and Engineering Managers",
    "11-9051.00": "Food Service Managers",
    "11-9111.00": "Medical and Health Services Managers",
}


def load_year_counts(path):
    df = pd.read_csv(path, usecols=["onet_occupation_code", "title"])
    counts = df["onet_occupation_code"].value_counts()
    top_title = (
        df.groupby("onet_occupation_code")["title"]
        .agg(lambda s: s.value_counts().index[0] if len(s) else "")
        .to_dict()
    )
    return counts, top_title


def build():
    counts_2023, titles_2023 = load_year_counts(PATHS["2023"])
    counts_2026, titles_2026 = load_year_counts(PATHS["2026"])

    top_codes = counts_2026.head(TOP_N).index.tolist()
    rows = []
    for rank, code in enumerate(top_codes, start=1):
        n23 = int(counts_2023.get(code, 0))
        n26 = int(counts_2026.get(code, 0))
        rows.append(
            {
                "rank": rank,
                "onet": code,
                "name": ONET_NAMES.get(code, titles_2026.get(code) or titles_2023.get(code) or code),
                "postings_2023": n23,
                "postings_2026": n26,
                "change": n26 - n23,
                "in_dashboard": code in {"11-2021.00", "11-3121.00", "11-3031.00"},
            }
        )

    total_2023 = int(sum(counts_2023))
    total_2026 = int(sum(counts_2026))

    result = {
        "source": "Lightcast business_only_jobs (2023 / 2026)",
        "ranked_by": "2026 posting volume",
        "total_postings_2023": total_2023,
        "total_postings_2026": total_2026,
        "top_n": TOP_N,
        "rows": rows,
    }

    out_path = os.path.join(OUT_DIR, "onet_job_counts.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Top {TOP_N} O*NET codes by 2026 volume:")
    for row in rows:
        flag = " *" if row["in_dashboard"] else ""
        print(
            f"  #{row['rank']} {row['onet']} {row['name']}: "
            f"{row['postings_2023']:,} -> {row['postings_2026']:,}{flag}"
        )
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    build()
