"""Build the offline research bundle from checked-in NASA-derived CSVs.

Run from any directory: python frontend/scripts/build-research-snapshot.py
No network, credentials, patient rows, or clinical inference are involved.
"""
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
OUT = ROOT / "frontend" / "src" / "data" / "researchSnapshot.json"


def read_rows(relative):
    with (DATA / relative).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def aggregate(rows, study, metric, groups):
    result = []
    for label, matches in groups:
        selected = {}
        for row in rows:
            if row["study_id"] != study or row["metric"] != metric or not matches(row):
                continue
            value = float(row["value"])
            if not math.isfinite(value):
                raise ValueError(f"Non-finite value in {study}: {metric}")
            key = (row["source_file"], row["sample_id"])
            if key in selected:
                raise ValueError(f"Duplicate sample/metric: {study} {key}")
            selected[key] = value
        if not selected:
            raise ValueError(f"No values for {study}: {label}")
        values = list(selected.values())
        result.append({"label": label, "n": len(values), "mean": round(mean(values), 3),
                       "min": min(values), "max": max(values)})
    source_files = sorted({row["source_file"] for row in rows
                           if row["study_id"] == study and row["metric"] == metric})
    return {"study": study, "metric": metric, "sourceFiles": source_files, "groups": result}


def main(check=False):
    sources = []
    domains = {}
    for domain in ("ocular_sans", "bone_muscle", "human_clinical", "radiation_neuro_immune"):
        relative = f"osdr/{domain}.csv"
        rows = read_rows(relative)
        domains[domain] = rows
        species = defaultdict(int)
        for row in rows:
            species[row["organism"] or "Not specified"] += 1
        sources.append({"path": f"backend/data/{relative}", "rows": len(rows),
                        "studies": sorted({r["study_id"] for r in rows}),
                        "speciesRows": dict(sorted(species.items())),
                        "sha256": hashlib.sha256((DATA / relative).read_bytes()).hexdigest()})
    weather = read_rows("donki/donki_daily_summary.csv")
    # An empty daily bin is not a measured quiet/safe condition. Preserve counts,
    # and encode absent Kp catalog records as null rather than a measured zero.
    days = [[r["date"], int(r["flare_count"]), int(r["m_class_count"]),
             int(r["x_class_count"]), int(r["sep_count"]),
             float(r["max_kp_index"]) if float(r["max_kp_index"]) > 0 else None]
            for r in weather]
    manifest = json.loads((DATA / "dataset_manifest.json").read_text(encoding="utf-8"))
    bundle = {
        "version": 1, "snapshotCapturedAt": manifest["generated_at_utc"],
        "provenance": "Aggregated from repository CSV exports. Original raw study files are not bundled; source attribution is retained from those exports.",
        "sources": sources,
        "weather": {
            "source": "backend/data/donki/donki_daily_summary.csv",
            "sha256": hashlib.sha256((DATA / "donki/donki_daily_summary.csv").read_bytes()).hexdigest(),
            "columns": ["date", "flares", "mClass", "xClass", "sep", "maxKp"],
            "days": days,
        },
        "vision": aggregate(domains["ocular_sans"], "OSD-583", "Left_Eye_IOP_Measurement_Average_mmHg", [
            ("Space flight", lambda r: r["factor_group"] == "Space Flight"),
            ("Ground control", lambda r: r["factor_group"] == "Ground Control"),
        ]),
        "bone": aggregate(domains["bone_muscle"], "OSD-608", "trabecular_BMD_change_from_baseline_percent_4 week", [
            ("Full loading (PWB100)", lambda r: "PWB100" in r["factor_group"]),
            ("40% loading (PWB40)", lambda r: "PWB40" in r["factor_group"]),
            ("20% loading (PWB20)", lambda r: "PWB20" in r["factor_group"]),
        ]),
        "blood": aggregate(domains["human_clinical"], "OSD-569", "white_blood_cell_count_value_thousand_per_microliter", [
            ("3 days before launch", lambda r: r["factor_group"] == "Launch minus 3 day | pre-flight"),
            ("1 day after return", lambda r: r["factor_group"] == "Return plus 1 day | post-flight"),
        ]),
    }
    serialized = json.dumps(bundle, separators=(",", ":"), ensure_ascii=False) + "\n"
    if check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != serialized:
            raise SystemExit("Research snapshot differs from the checked-in CSVs. Regenerate it before building.")
        print("Research snapshot matches all source CSVs, aggregates, and fingerprints.")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(serialized, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(days)} historical days, {len(sources)} source inventories")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify reproducibility without writing files")
    main(check=parser.parse_args().check)
