"""Assemble results.html from results_shell.html + data files."""

import json
import os

import pandas as pd

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_json(name):
    path = os.path.join(OUT_DIR, name)
    if not os.path.exists(path):
        print(f"  WARNING: {name} not found, using empty object")
        return "{}"
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def build_data_json():
    stats = pd.read_csv(os.path.join(OUT_DIR, "node_presence_2023_2026.csv"))
    if "conf_min" not in stats.columns:
        stats["conf_min"] = 1
    cols = ["occupation", "year", "node", "category", "type", "n_jobs", "total_jobs", "pct", "conf_min"]
    records = stats[cols].to_dict(orient="records")
    for r in records:
        r["year"] = int(r["year"])
        r["n_jobs"] = int(r["n_jobs"])
        r["total_jobs"] = int(r["total_jobs"])
        r["conf_min"] = int(r["conf_min"])
    return json.dumps(records, separators=(",", ":"))


def build():
    with open(os.path.join(OUT_DIR, "results_shell.html"), "r", encoding="utf-8") as f:
        html = f.read()

    print("Injecting data...")
    html = html.replace("%DATA%", build_data_json())
    html = html.replace("%DICT%", load_json("node_skill_dictionary.json"))
    html = html.replace("%TOP_SKILLS%", load_json("top_skills.json"))
    html = html.replace("%ONET_JOB_COUNTS%", load_json("onet_job_counts.json"))
    html = html.replace("%OCC_TITLES%", load_json("occupation_titles.json"))

    out_path = os.path.join(OUT_DIR, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Done — index.html ({size_kb:.0f} KB)")


if __name__ == "__main__":
    build()
