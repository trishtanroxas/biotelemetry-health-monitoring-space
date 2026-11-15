from datetime import datetime, timedelta, timezone
import math
from typing import Any, Dict, List, Optional

from backend.app.services.simulator import simulator

CREW_PROFILES: Dict[str, Dict[str, Any]] = {
    "ASTRO-01": {
        "base_hr": 62.0,
        "base_glucose": 92.0,
        "base_rad": 15.2,
        "scenario": "orbital-demo",
        "mission_day_start": 42,
    },
    "ASTRO-02": {
        "base_hr": 66.0,
        "base_glucose": 98.0,
        "base_rad": 18.6,
        "scenario": "orbital-demo",
        "mission_day_start": 42,
    },
    "ASTRO-03": {
        "base_hr": 58.0,
        "base_glucose": 89.0,
        "base_rad": 14.4,
        "scenario": "surface-demo",
        "mission_day_start": 19,
    },
}

DEFAULT_CREW_IDS = ["ASTRO-01", "ASTRO-02", "ASTRO-03"]

# Spread check-ins across Today, 7 days, and 30 days so all trend ranges render multi-point charts.
DAY_OFFSETS_HOURS_BACK = [
    1.5, 6.0, 26.0, 48.0, 72.0, 98.0, 122.0, 148.0,
    192.0, 224.0, 268.0, 312.0, 360.0, 412.0, 464.0, 518.0, 576.0, 636.0,
]

MOOD_CYCLE = [("Good", 4), ("Great", 5), ("Good", 4), ("Okay", 3), ("Good", 4), ("Great", 5)]


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _iso_utc_ms(dt: datetime) -> str:
    # Match JS Date.toISOString() precision so sleepTiming validation matches byte-for-byte.
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _build_environment(
    astronaut_id: str,
    scenario: str,
    mission_start: datetime,
    radiation_rate: float,
    recorded_at: datetime,
) -> Dict[str, Any]:
    elapsed_hours = max(0.0, (recorded_at - mission_start).total_seconds() / 3600.0)
    gravity_label = (
        "Microgravity · orbital demo"
        if scenario == "orbital-demo"
        else "Partial gravity · surface demo"
    )
    mission_start_label = mission_start.strftime("%Y-%m-%dT%H:%M")
    elapsed_datum = {
        "value": round(elapsed_hours, 2),
        "source": "manual",
        "detail": f"Elapsed from manually entered UTC start {mission_start_label}.",
    }
    microgravity = (
        {
            "value": round(elapsed_hours, 2),
            "source": "manual",
            "detail": "Scenario assumption: continuous microgravity since the entered start; not measured exposure time.",
        }
        if scenario == "orbital-demo"
        else {
            "value": None,
            "source": "unavailable",
            "detail": "Microgravity duration is not supported by the selected scenario.",
        }
    )
    return {
        "version": 1,
        "astronautId": astronaut_id,
        "capturedAt": _iso_utc(recorded_at),
        "scenario": scenario,
        "cabinOxygen": {
            "value": 20.9,
            "source": "manual",
            "detail": "Cabin oxygen observation entered by the user; not a connected sensor.",
        },
        "radiationRate": {
            "value": radiation_rate,
            "source": "simulated",
            "detail": "Existing telemetry simulation: environmental rate, not a personal dose.",
            "recordedAt": _iso_utc(recorded_at),
        },
        "missionDurationHours": elapsed_datum,
        "gravity": {
            "value": gravity_label,
            "source": "simulated",
            "detail": "User-selected demo scenario, not measured gravity.",
        },
        "microgravityHours": microgravity,
        "spaceWeather": {
            "value": None,
            "source": "unavailable",
            "detail": "No live space-weather feed is connected.",
        },
    }


def build_seed_checkins(astronaut_id: str, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    ref_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    profile = CREW_PROFILES.get(astronaut_id, CREW_PROFILES["ASTRO-01"])
    mission_start = ref_now - timedelta(days=profile["mission_day_start"])
    rows: List[Dict[str, Any]] = []

    for idx, hours_back in enumerate(DAY_OFFSETS_HOURS_BACK):
        recorded_at = ref_now - timedelta(hours=hours_back)
        recorded_iso = _iso_utc(recorded_at)
        wave = math.sin(idx * 0.9)
        eva_peak = 7 if idx % 4 == 1 else 0
        eva_heavy = idx % 4 == 1

        sleep_hours = round(6.4 + ((idx * 3) % 5) * 0.4 + (-0.5 if idx % 4 == 2 else 0.2), 1)
        sleep_quality = min(5, max(2, 4 + (idx % 2) if sleep_hours >= 7.2 else 3))
        fatigue = min(5, max(1, 3 + (idx % 2) if eva_heavy else (3 if sleep_hours < 6.5 else 2)))
        stress = min(5, max(1, 3 if (eva_heavy or idx % 5 == 2) else 1 + (idx % 2)))
        mood_label, mood_num = ("Okay", 3) if (eva_heavy and idx % 3 == 1) else MOOD_CYCLE[idx % len(MOOD_CYCLE)]
        exercise_minutes = 60 if eva_heavy else (45 if idx % 3 == 0 else (30 if idx % 2 == 0 else 0))
        hydration_ml = int(round(2050 + (300 if exercise_minutes > 0 else 50) + (idx % 3) * 100))

        heart_rate = round(profile["base_hr"] + eva_peak + wave * 3.5)
        radiation_rate = round(profile["base_rad"] + (7.4 if idx % 5 == 2 else 0.0) + wave * 2.1, 1)
        blood_glucose = round(profile["base_glucose"] + (16 if idx % 3 == 1 else -4) + wave * 6)
        spo2 = round(98.4 + wave * 0.4, 1)
        core_temp = round(36.75 + (0.2 if eva_peak > 0 else 0.0) + wave * 0.08, 2)
        hrv = max(28, round(54 - eva_peak * 1.4 - wave * 4))
        hydration_pct = round(92 - (3 if eva_peak > 0 else 0) + wave * 2)
        nutrition_quality = "optimal" if (exercise_minutes >= 45 or hydration_ml >= 2300) else "adequate"

        wake_target = datetime(
            recorded_at.year,
            recorded_at.month,
            recorded_at.day,
            5 + (idx % 3),
            30 if idx % 2 == 0 else 0,
            tzinfo=timezone.utc,
        )
        if wake_target > recorded_at:
            wake_target = recorded_at - timedelta(minutes=30)
        wake_rounded = wake_target.replace(second=0, microsecond=0)
        window_minutes = int(round(sleep_hours * 60))
        sleep_start = wake_rounded - timedelta(minutes=window_minutes)

        pain_intensity = 2 if idx % 5 == 1 else (1 if idx % 7 == 3 else 0)
        pain: Dict[str, Any] = {"intensity": pain_intensity}
        if pain_intensity > 0:
            pain["location"] = "Upper shoulder strap" if idx % 2 == 0 else "Lower lumbar"

        vitals_snapshot = {
            "astronaut_id": astronaut_id,
            "timestamp": recorded_iso,
            "heart_rate": heart_rate,
            "spo2": spo2,
            "core_temp": core_temp,
            "radiation_rate": radiation_rate,
            "hrv": hrv,
            "systolic_bp": round(115 + eva_peak * 0.8 + wave * 3),
            "diastolic_bp": round(75 + wave * 2),
            "respiration_rate": round(14 + (2 if eva_peak > 0 else 0)),
            "telemetry_source": "database",
            "blood_glucose": blood_glucose,
            "wbc_k_ul": round(6.2 - (idx % 4) * 0.15, 1),
            "hydration_pct": hydration_pct,
            "mission_day": max(1, profile["mission_day_start"] - int(hours_back // 24)),
            "overall_health_score": round(91.5 - (3.2 if eva_peak > 0 else 0.0) - wave * 1.5, 1),
            "health_status": "STRAINED" if (eva_peak > 0 and radiation_rate > 22) else "NOMINAL",
        }

        space_wellness = {
            "version": 1,
            "mode": "local-demo",
            "pain": pain,
            "mental": {
                "isolation": 3 if idx % 5 == 2 else (2 if idx % 3 == 0 else 1),
                "socialConnection": 3 if idx % 5 == 2 else 4 + (idx % 2),
                "emotionalWellbeing": 3 if eva_heavy else 4 + (idx % 2),
            },
            "sleep": {
                "startUtc": _iso_utc_ms(sleep_start),
                "wakeUtc": _iso_utc_ms(wake_rounded),
                "timeBasis": "UTC",
                "windowMinutes": window_minutes,
            },
            "environment": _build_environment(
                astronaut_id,
                profile["scenario"],
                mission_start,
                radiation_rate,
                recorded_at,
            ),
        }

        rows.append(
            {
                "client_id": f"db-checkin-{astronaut_id}-{idx + 1:02d}",
                "astronaut_id": astronaut_id,
                "recorded_at": recorded_iso,
                "mood": mood_num,
                "energy": max(1, 6 - fatigue),
                "stress": stress,
                "sleep_hours": sleep_hours,
                "pain_level": pain_intensity,
                "blood_glucose_mg_dl": blood_glucose,
                "hydration_ml": hydration_ml,
                "nutrition_quality": nutrition_quality,
                "immune_symptoms": [],
                "metrics": {
                    "sleepQuality": sleep_quality,
                    "fatigue": fatigue,
                    "moodLabel": mood_label,
                    "exerciseMinutes": exercise_minutes,
                    "biometrics": vitals_snapshot,
                    "spaceWellness": space_wellness,
                },
            }
        )

    return rows


def build_seed_assessments(astronaut_id: str, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    ref_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return [
        {
            "client_id": f"db-exam-{astronaut_id}-01",
            "astronaut_id": astronaut_id,
            "exam_type": "ocular_ultrasound",
            "recorded_at": _iso_utc(ref_now - timedelta(hours=20)),
            "severity": "nominal",
            "findings": "Bilateral optic nerve sheath diameter measured ~4.3 mm 3 mm posterior to retina with smooth posterior sclera and no globe flattening.",
            "recommended_actions": [
                "Continue routine SANS ultrasound cadence per mission flight plan.",
                "Log visual acuity or any transient peripheral blur in your next check-in.",
            ],
            "ground_consult_required": False,
            "analysis_source": "database-baseline",
        },
        {
            "client_id": f"db-exam-{astronaut_id}-02",
            "astronaut_id": astronaut_id,
            "exam_type": "dermal_radiation",
            "recorded_at": _iso_utc(ref_now - timedelta(hours=52)),
            "severity": "warning",
            "findings": "Mild localized erythema over left forearm cuff contact zone following EVA suit doffing; no blistering or exudate observed.",
            "recommended_actions": [
                "Cleanse affected area gently with sterile saline and avoid harsh alcohol wipes.",
                "Check cumulative personal dosimeter and capture follow-up photo in 12 hours.",
            ],
            "ground_consult_required": True,
            "analysis_source": "database-baseline",
        },
        {
            "client_id": f"db-exam-{astronaut_id}-03",
            "astronaut_id": astronaut_id,
            "exam_type": "glucometer_nutrition",
            "recorded_at": _iso_utc(ref_now - timedelta(hours=96)),
            "severity": "nominal",
            "findings": "Fasting capillary glucometer readout 94 mg/dL, cleanly within the 70-140 mg/dL NASA OSDR OSD-575 reference band.",
            "recommended_actions": [
                "Maintain spaced hydration (2,200-2,500 mL/day) and balanced sodium/potassium intake.",
                "Confirm caloric intake matches ARED and EVA flight energy target.",
            ],
            "ground_consult_required": False,
            "analysis_source": "database-baseline",
        },
        {
            "client_id": f"db-exam-{astronaut_id}-04",
            "astronaut_id": astronaut_id,
            "exam_type": "ocular_ultrasound",
            "recorded_at": _iso_utc(ref_now - timedelta(days=11)),
            "severity": "nominal",
            "findings": "Baseline orbital ultrasound ONSD 4.2 mm symmetrically with clear optic disc margins.",
            "recommended_actions": [
                "Archive baseline measurement for comparison during extended microgravity.",
            ],
            "ground_consult_required": False,
            "analysis_source": "database-baseline",
        },
    ]


def build_seed_telemetry(
    astronaut_id: str,
    now: Optional[datetime] = None,
    count: int = 24,
    step_sec: int = 90,
) -> List[Dict[str, Any]]:
    ref_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    profile = CREW_PROFILES.get(astronaut_id, CREW_PROFILES["ASTRO-01"])
    rows: List[Dict[str, Any]] = []

    for idx in range(count):
        point_time = ref_now - timedelta(seconds=(count - 1 - idx) * step_sec)
        vitals = simulator.generate_vitals(
            astronaut_id,
            anomaly_mode="NONE",
            mission_zone="LEO_ISS",
            mission_day=profile["mission_day_start"],
        )
        rows.append(
            {
                "astronaut_id": astronaut_id,
                "timestamp": _iso_utc(point_time),
                "heart_rate": vitals.heart_rate,
                "spo2": vitals.spo2,
                "core_temp": vitals.core_temp,
                "radiation_rate": vitals.radiation_rate,
                "hrv": vitals.hrv,
                "systolic_bp": vitals.systolic_bp,
                "diastolic_bp": vitals.diastolic_bp,
                "respiration_rate": vitals.respiration_rate,
                "battery_level": vitals.battery_level,
                "telemetry_source": vitals.telemetry_source,
                "orbital_phase": vitals.orbital_phase,
                "calibration_basis": vitals.calibration_basis,
                "is_synced": True,
                "blood_glucose": vitals.blood_glucose,
                "wbc_k_ul": vitals.wbc_k_ul,
                "hydration_pct": vitals.hydration_pct,
                "mission_zone": vitals.mission_zone,
                "mission_day": vitals.mission_day,
                "distance_km": vitals.distance_km,
                "comms_latency_sec": vitals.comms_latency_sec,
                "gravity_g": vitals.gravity_g,
                "shielding_mode": vitals.shielding_mode,
                "cumulative_dose_msv": vitals.cumulative_dose_msv,
                "overall_health_score": vitals.overall_health_score,
                "health_status": vitals.health_status,
                "iss_latitude": vitals.iss_latitude,
                "iss_longitude": vitals.iss_longitude,
                "iss_altitude_km": vitals.iss_altitude_km,
            }
        )

    return rows


def seed_supabase_trends(
    supabase: Any,
    astronaut_ids: Optional[List[str]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, int]:
    if not supabase:
        raise RuntimeError("Supabase client is not configured.")

    target_ids = astronaut_ids or DEFAULT_CREW_IDS
    ref_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)

    checkin_rows: List[Dict[str, Any]] = []
    exam_rows: List[Dict[str, Any]] = []
    telemetry_inserted = 0

    for astro_id in target_ids:
        checkin_rows.extend(build_seed_checkins(astro_id, ref_now))
        exam_rows.extend(build_seed_assessments(astro_id, ref_now))

        existing = (
            supabase.table("telemetry_logs")
            .select("id", count="exact")
            .eq("astronaut_id", astro_id)
            .execute()
        )
        existing_count = existing.count if existing.count is not None else len(existing.data or [])
        if existing_count < 12:
            t_rows = build_seed_telemetry(astro_id, ref_now, count=24 - existing_count)
            supabase.table("telemetry_logs").insert(t_rows).execute()
            telemetry_inserted += len(t_rows)

    supabase.table("crew_checkins").upsert(checkin_rows, on_conflict="client_id").execute()
    supabase.table("imaging_assessments").upsert(exam_rows, on_conflict="client_id").execute()

    return {
        "checkins_upserted": len(checkin_rows),
        "assessments_upserted": len(exam_rows),
        "telemetry_inserted": telemetry_inserted,
    }
