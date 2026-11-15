import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, stdev
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "backend" / "data"
OSDR_DIR = DATA_DIR / "osdr"
OUT_PATH = ROOT_DIR / "backend" / "app" / "data" / "clinical_baselines.json"


def resolve_osdr_csv(category: str) -> Path:
    direct = OSDR_DIR / f"{category}.csv"
    if direct.exists():
        return direct
    merged = OSDR_DIR / f"{category}_merged.csv"
    if merged.exists():
        return merged
    raise FileNotFoundError(f"Missing OSDR dataset for category '{category}'")


def to_float(val: str) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def summarize_values(vals: List[float]) -> Dict[str, Any]:
    if not vals:
        return {"n": 0, "mean": None, "std": None, "min": None, "max": None}
    return {
        "n": len(vals),
        "mean": round(mean(vals), 4),
        "std": round(stdev(vals), 4) if len(vals) > 1 else 0.0,
        "min": round(min(vals), 4),
        "max": round(max(vals), 4),
    }


def pct_delta(treatment: Optional[float], control: Optional[float]) -> Optional[float]:
    if treatment is None or control is None or control == 0:
        return None
    return round(((treatment - control) / abs(control)) * 100.0, 2)


def analyze_human_clinical() -> Dict[str, Any]:
    target_metrics = {
        "glucose_value_milligram_per_deciliter": "glucose_mg_dl",
        "calcium_value_milligram_per_deciliter": "calcium_mg_dl",
        "creatinine_value_milligram_per_deciliter": "creatinine_mg_dl",
        "urea_nitrogen_bun_value_milligram_per_deciliter": "bun_mg_dl",
        "sodium_value_millimol_per_liter": "sodium_mmol_l",
        "potassium_value_millimol_per_liter": "potassium_mmol_l",
        "white_blood_cell_count_value_thousand_per_microliter": "wbc_k_ul",
        "absolute_lymphocytes_value_cells_per_microliter": "lymphocytes_cells_ul",
        "absolute_neutrophils_value_cells_per_microliter": "neutrophils_cells_ul",
        "hemoglobin_value_percent": "hemoglobin_g_dl",
        "hematocrit_value_percent": "hematocrit_pct",
        "platelet_count_value_thousand_per_microliter": "platelets_k_ul",
        "albumin_value_gram_per_deciliter": "albumin_g_dl",
        "crp_concentration_picogram_per_milliliter": "crp_pg_ml",
        "vcam1_concentration_npq": "vcam1_npq",
        "vegfa_concentration_npq": "vegfa_npq",
        "angpt1_concentration_npq": "angpt1_npq",
    }

    buckets: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    ref_ranges: Dict[str, Tuple[List[float], List[float]]] = defaultdict(lambda: ([], []))

    with resolve_osdr_csv("human_clinical").open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            metric = row["metric"]
            if metric not in target_metrics:
                continue
            val = to_float(row["value"])
            if val is None:
                continue
            alias = target_metrics[metric]
            fg = row["factor_group"].lower()
            phase = "pre_flight" if "pre-flight" in fg else ("post_flight_r1" if "return plus 1 day" in fg else "post_flight_recovery")
            buckets[alias][phase].append(val)

            rmin = to_float(row["range_min"])
            rmax = to_float(row["range_max"])
            if rmin is not None:
                ref_ranges[alias][0].append(rmin)
            if rmax is not None:
                ref_ranges[alias][1].append(rmax)

    results: Dict[str, Any] = {}
    for alias, phase_map in sorted(buckets.items()):
        pre = summarize_values(phase_map["pre_flight"])
        r1 = summarize_values(phase_map["post_flight_r1"])
        rmin_list, rmax_list = ref_ranges[alias]
        results[alias] = {
            "clinical_range_min": round(min(rmin_list), 3) if rmin_list else None,
            "clinical_range_max": round(max(rmax_list), 3) if rmax_list else None,
            "pre_flight": pre,
            "post_flight_r1": r1,
            "r1_vs_pre_pct_change": pct_delta(r1["mean"], pre["mean"]),
        }
    return results


def analyze_ocular_sans() -> Dict[str, Any]:
    iop_groups: Dict[str, List[float]] = defaultdict(list)
    onsd_curve: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    icp_curve: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    temp_curve: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

    with resolve_osdr_csv("ocular_sans").open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            val = to_float(row["value"])
            if val is None:
                continue
            sid = row["study_id"]
            metric = row["metric"]
            fg = row["factor_group"]

            if sid == "OSD-583" and metric in ("Left_Eye_IOP_Measurement_Average_mmHg", "Right_IOP_Measurement_Average_mmHg"):
                group = "space_flight" if "Space Flight" in fg else ("ground_control" if "Ground Control" in fg else "other")
                if group != "other":
                    iop_groups[group].append(val)

            elif sid == "OSD-680" and "Optic_Nerve_Sheath_Diameter" in metric:
                day = metric.split("_")[1]
                group = "hindlimb_unloaded" if "Hindlimb Unloaded" in fg else "control"
                onsd_curve[group][f"day_{day}"].append(val)

            elif sid == "OSD-681":
                group = "hindlimb_unloaded" if "Hindlimb Unloaded" in fg else "control"
                if "Intracranial_Pressure_torr" in metric:
                    day = metric.split("_")[1]
                    icp_curve[group][f"day_{day}"].append(val)
                elif "Average_Body_Temperature_degree_Celsius" in metric:
                    day = "baseline" if metric.startswith("Baseline") else f"day_{metric.split('_')[1]}"
                    temp_curve[group][day].append(val)

    iop_sf = summarize_values(iop_groups["space_flight"])
    iop_gc = summarize_values(iop_groups["ground_control"])

    return {
        "osd583_iop_mmhg": {
            "space_flight": iop_sf,
            "ground_control": iop_gc,
            "flight_vs_control_pct": pct_delta(iop_sf["mean"], iop_gc["mean"]),
        },
        "osd680_optic_nerve_sheath_mm": {
            grp: {day: summarize_values(vals)["mean"] for day, vals in sorted(days.items())}
            for grp, days in onsd_curve.items()
        },
        "osd681_icp_torr": {
            grp: {day: summarize_values(vals)["mean"] for day, vals in sorted(days.items())}
            for grp, days in icp_curve.items()
        },
        "osd681_body_temp_c": {
            grp: {day: summarize_values(vals)["mean"] for day, vals in sorted(days.items())}
            for grp, days in temp_curve.items()
        },
    }


def analyze_bone_muscle() -> Dict[str, Any]:
    pwb_bmd_change: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    flight_bmd: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

    with resolve_osdr_csv("bone_muscle").open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            val = to_float(row["value"])
            if val is None:
                continue
            sid = row["study_id"]
            metric = row["metric"]
            fg = row["factor_group"]

            if sid == "OSD-608" and "trabecular_BMD_change_from_baseline_percent_" in metric:
                week = metric.replace("trabecular_BMD_change_from_baseline_percent_", "")
                pwb = "PWB20" if "PWB20" in fg else ("PWB40" if "PWB40" in fg else ("PWB100" if "PWB100" in fg else ""))
                if pwb:
                    pwb_bmd_change[pwb][week].append(val)

            elif sid in ("OSD-489", "OSD-351") and metric in ("trabecular_thickness_mm", "cancellous_metaphysis_BV_TV_percent", "bone_volume_density_bvtv"):
                group = "space_flight" if "Space Flight" in fg else ("ground_control" if "Ground Control" in fg else "")
                if group:
                    flight_bmd[f"{sid}:{metric}"][group].append(val)

    pwb_summary = {
        pwb: {wk: summarize_values(vals)["mean"] for wk, vals in sorted(wks.items())}
        for pwb, wks in sorted(pwb_bmd_change.items())
    }
    flight_summary = {}
    for key, grps in sorted(flight_bmd.items()):
        sf = summarize_values(grps["space_flight"])
        gc = summarize_values(grps["ground_control"])
        flight_summary[key] = {
            "space_flight": sf,
            "ground_control": gc,
            "flight_vs_control_pct": pct_delta(sf["mean"], gc["mean"]),
        }

    return {
        "osd608_partial_gravity_trabecular_bmd_pct_change": pwb_summary,
        "microgravity_bone_comparisons": flight_summary,
    }


def analyze_radiation_neuro_immune() -> Dict[str, Any]:
    epm_by_dose: Dict[str, List[float]] = defaultdict(list)
    brain_tnf: Dict[str, List[float]] = defaultdict(list)
    x_ray_open_field: Dict[str, List[float]] = defaultdict(list)

    with resolve_osdr_csv("radiation_neuro_immune").open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            val = to_float(row["value"])
            if val is None:
                continue
            sid = row["study_id"]
            metric = row["metric"]
            fg = row["factor_group"]

            if sid == "OSD-479" and metric == "EPM_OpenandCenter_sec" and "Normal Chow" in fg:
                dose = "0_cGy" if "non-irradiated" in fg else ("50_cGy" if "50 centigray" in fg else ("100_cGy" if "100 centigray" in fg else ""))
                if dose:
                    epm_by_dose[dose].append(val)

            elif sid in ("OSD-751", "OSD-752") and metric == "tnf_alpha_concentration_normalized":
                group = "space_flight" if "Space Flight" in fg else ("ground_control" if "Ground Control" in fg else "")
                if group:
                    brain_tnf[group].append(val)

            elif sid == "OSD-836" and metric == "duration_center":
                for d in ("0 gray", "3 gray", "8 gray", "10 gray"):
                    if d in fg:
                        x_ray_open_field[d.replace(" ", "_")].append(val)
                        break

    tnf_sf = summarize_values(brain_tnf["space_flight"])
    tnf_gc = summarize_values(brain_tnf["ground_control"])

    return {
        "osd479_gcr_anxiety_epm_open_sec": {d: summarize_values(v) for d, v in sorted(epm_by_dose.items())},
        "osd836_xray_unloading_center_sec": {d: summarize_values(v) for d, v in sorted(x_ray_open_field.items())},
        "osd751_752_brain_tnf_alpha": {
            "space_flight": tnf_sf,
            "ground_control": tnf_gc,
            "flight_vs_control_pct": pct_delta(tnf_sf["mean"], tnf_gc["mean"]),
        },
    }


def analyze_space_weather_and_orbit() -> Dict[str, Any]:
    donki_path = DATA_DIR / "donki" / "donki_daily_summary.csv"
    days: List[Dict[str, Any]] = []
    with donki_path.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            days.append(
                {
                    "date": row["date"],
                    "m_plus_x": int(row["m_class_count"]) + int(row["x_class_count"]),
                    "x_count": int(row["x_class_count"]),
                    "sep_count": int(row["sep_count"]),
                    "kp": float(row["max_kp_index"]),
                }
            )

    total_days = len(days)
    m_x_days = sum(1 for d in days if d["m_plus_x"] > 0)
    x_days = sum(1 for d in days if d["x_count"] > 0)
    sep_days = sum(1 for d in days if d["sep_count"] > 0)
    storm_days = sum(1 for d in days if d["kp"] >= 5.0)
    severe_storm_days = sum(1 for d in days if d["kp"] >= 7.0)

    # Conditional probability of SEP or Kp >= 5 within 3 days following an X-class flare
    x_followed_by_sep = 0
    x_followed_by_storm = 0
    for idx, d in enumerate(days):
        if d["x_count"] == 0:
            continue
        window = days[idx : min(idx + 4, total_days)]
        if any(w["sep_count"] > 0 for w in window):
            x_followed_by_sep += 1
        if any(w["kp"] >= 5.0 for w in window):
            x_followed_by_storm += 1

    orbit_path = DATA_DIR / "orbital" / "iss_orbit_48h.csv"
    orbit_rows: List[Dict[str, str]] = []
    with orbit_path.open("r", encoding="utf-8", newline="") as fh:
        orbit_rows = list(csv.DictReader(fh))

    n_orb = len(orbit_rows)
    saa_pts = sum(1 for r in orbit_rows if r["in_saa"] == "True")
    high_lat_pts = sum(1 for r in orbit_rows if r["high_lat_exposure"] == "True")
    eclipsed_pts = sum(1 for r in orbit_rows if r["visibility"] == "eclipsed")
    transitions = sum(
        1 for i in range(1, n_orb) if orbit_rows[i]["visibility"] != orbit_rows[i - 1]["visibility"]
    )

    return {
        "donki_2020_2026": {
            "total_days": total_days,
            "days_with_m_or_x_flare": m_x_days,
            "days_with_x_flare": x_days,
            "days_with_sep_storm": sep_days,
            "days_with_kp_ge_5": storm_days,
            "days_with_kp_ge_7": severe_storm_days,
            "p_sep_within_3d_given_x_flare": round(x_followed_by_sep / x_days, 3) if x_days else 0.0,
            "p_kp_ge_5_within_3d_given_x_flare": round(x_followed_by_storm / x_days, 3) if x_days else 0.0,
        },
        "iss_orbit_48h": {
            "sample_points": n_orb,
            "pct_time_in_saa": round((saa_pts / n_orb) * 100.0, 2) if n_orb else 0.0,
            "pct_time_high_latitude": round((high_lat_pts / n_orb) * 100.0, 2) if n_orb else 0.0,
            "pct_time_eclipsed": round((eclipsed_pts / n_orb) * 100.0, 2) if n_orb else 0.0,
            "daylight_eclipse_transitions_per_24h": round(transitions / 2.0, 1),
        },
    }


def export_runtime_profiles(space_weather_and_orbit: Dict[str, Any]) -> None:
    orbit_path = DATA_DIR / "orbital" / "iss_orbit_48h.csv"
    with orbit_path.open("r", encoding="utf-8", newline="") as fh:
        orbit_rows = list(csv.DictReader(fh))
    # One ~93-minute ISS orbit spans ~10 sample points at 10-minute cadence
    cycle_points = [
        {
            "latitude": float(r["latitude"]),
            "longitude": float(r["longitude"]),
            "altitude_km": float(r["altitude_km"]),
            "visibility": r["visibility"],
            "in_saa": r["in_saa"] == "True",
            "high_lat_exposure": r["high_lat_exposure"] == "True",
        }
        for r in orbit_rows[-10:]
    ]
    orbital_out = OUT_PATH.parent / "orbital_profile.json"
    orbital_out.write_text(
        json.dumps({"summary": space_weather_and_orbit["iss_orbit_48h"], "cycle_points": cycle_points}, indent=2),
        encoding="utf-8",
    )

    donki_path = DATA_DIR / "donki" / "donki_daily_summary.csv"
    with donki_path.open("r", encoding="utf-8", newline="") as fh:
        donki_rows = list(csv.DictReader(fh))
    donki_out = OUT_PATH.parent / "donki_priors.json"
    donki_out.write_text(
        json.dumps(
            {
                "priors": space_weather_and_orbit["donki_2020_2026"],
                "recent_days": donki_rows[-14:],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    space_weather_and_orbit = analyze_space_weather_and_orbit()
    report = {
        "generated_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        "human_clinical_baselines": analyze_human_clinical(),
        "ocular_sans_patterns": analyze_ocular_sans(),
        "bone_muscle_patterns": analyze_bone_muscle(),
        "radiation_neuro_immune_patterns": analyze_radiation_neuro_immune(),
        "space_weather_and_orbit_patterns": space_weather_and_orbit,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    export_runtime_profiles(space_weather_and_orbit)
    print(json.dumps(report, indent=2))
    print(f"\nSaved calibrated baselines to {OUT_PATH.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()

