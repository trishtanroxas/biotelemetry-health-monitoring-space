import math
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.app.schemas.telemetry import VitalSigns
from backend.app.services.nasa_baselines import nasa_baselines

MISSION_ZONES: Dict[str, Dict[str, Any]] = {
    "LEO_ISS": {
        "label": "ISS Low Earth Orbit",
        "distance_km": 420.0,
        "comms_latency_sec": 0.08,
        "gravity_g": 0.0,
        "gcr_baseline_usv_h": 13.5,
        "magnetosphere_shielded": True,
        "phase_label": "leo_orbit",
    },
    "LUNAR_ORBIT": {
        "label": "Lunar Gateway Orbit",
        "distance_km": 384400.0,
        "comms_latency_sec": 1.28,
        "gravity_g": 0.0,
        "gcr_baseline_usv_h": 54.0,
        "magnetosphere_shielded": False,
        "phase_label": "lunar_orbit",
    },
    "LUNAR_SURFACE": {
        "label": "Lunar South Pole Base",
        "distance_km": 384400.0,
        "comms_latency_sec": 1.28,
        "gravity_g": 0.16,
        "gcr_baseline_usv_h": 36.0,
        "magnetosphere_shielded": False,
        "phase_label": "lunar_surface",
    },
    "DEEP_SPACE_TRANSIT": {
        "label": "Deep Space Transit (0.5 AU)",
        "distance_km": 74800000.0,
        "comms_latency_sec": 249.5,
        "gravity_g": 0.0,
        "gcr_baseline_usv_h": 112.0,
        "magnetosphere_shielded": False,
        "phase_label": "deep_space",
    },
    "MARS_TRANSIT": {
        "label": "Mars Transfer Cruise",
        "distance_km": 225000000.0,
        "comms_latency_sec": 750.5,
        "gravity_g": 0.0,
        "gcr_baseline_usv_h": 128.0,
        "magnetosphere_shielded": False,
        "phase_label": "mars_transit",
    },
    "MARS_SURFACE": {
        "label": "Mars Surface Habitat",
        "distance_km": 225000000.0,
        "comms_latency_sec": 750.5,
        "gravity_g": 0.38,
        "gcr_baseline_usv_h": 44.0,
        "magnetosphere_shielded": False,
        "phase_label": "mars_surface",
    },
    "PLANETARY_ROVER": {
        "label": "Pressurized Surface Rover",
        "distance_km": 225000000.0,
        "comms_latency_sec": 750.5,
        "gravity_g": 0.38,
        "gcr_baseline_usv_h": 62.0,
        "magnetosphere_shielded": False,
        "phase_label": "planetary_rover",
    },
}

SHIELDING_MULTIPLIERS: Dict[str, float] = {
    "NOMINAL": 1.0,
    "STORM_SHELTER": 0.35,
    "UNSHIELDED_EVA": 1.28,
}

SOLAR_STORM_OVERRIDES: Dict[str, Dict[str, float]] = {
    "LIVE_DONKI": {"kp_override": -1.0, "rad_bonus_usv_h": 0.0},
    "M_FLARE_CME": {"kp_override": 5.5, "rad_bonus_usv_h": 24.0},
    "X_CLASS_SPE": {"kp_override": 7.0, "rad_bonus_usv_h": 68.0},
    "EXTREME_G5": {"kp_override": 9.0, "rad_bonus_usv_h": 115.0},
}


def compute_health_score(
    heart_rate: float,
    spo2: float,
    core_temp: float,
    radiation_rate: float,
    hrv: float,
    systolic_bp: float,
    respiration_rate: float,
    orbital_phase: str,
    kp_index: float,
    mission_zone: str,
    mission_day: int,
    cumulative_dose_msv: float,
    blood_glucose: float = 92.0,
    hydration_pct: float = 94.0,
) -> Tuple[float, str]:
    zone = MISSION_ZONES.get(mission_zone, MISSION_ZONES["LEO_ISS"])
    score = 100.0

    if spo2 < 95.0:
        score -= (95.0 - spo2) * 5.0
    if heart_rate > 100.0:
        score -= (heart_rate - 100.0) * 0.75
    elif heart_rate < 48.0:
        score -= (48.0 - heart_rate) * 1.1
    if core_temp > 37.6:
        score -= (core_temp - 37.6) * 14.0
    elif core_temp < 35.8:
        score -= (35.8 - core_temp) * 12.0
    if radiation_rate > 25.0:
        score -= min(28.0, (radiation_rate - 25.0) * 0.42)
    if hrv < 38.0:
        score -= (38.0 - hrv) * 0.55
    if systolic_bp < 94.0:
        score -= (94.0 - systolic_bp) * 0.9
    elif systolic_bp > 142.0:
        score -= (systolic_bp - 142.0) * 0.55
    if respiration_rate > 21.0:
        score -= (respiration_rate - 21.0) * 1.8
    if blood_glucose < 70.0:
        score -= min(28.0, (70.0 - blood_glucose) * 1.15)
    elif blood_glucose > 180.0:
        score -= min(24.0, (blood_glucose - 180.0) * 0.25)
    if hydration_pct < 88.0:
        score -= min(18.0, (88.0 - hydration_pct) * 1.4)

    if orbital_phase == "saa_transit":
        score -= 4.0
    elif orbital_phase == "high_latitude" and kp_index >= 4.0:
        score -= 3.5

    # Duration & altered-gravity load (microgravity fluid shift + bone/cardio deconditioning)
    gravity_penalty = 1.0 if zone["gravity_g"] == 0.0 else (0.55 if zone["gravity_g"] < 0.5 else 0.1)
    if mission_day > 30:
        score -= min(10.0, ((mission_day - 30) / 335.0) * 10.0 * gravity_penalty)
    if not zone["magnetosphere_shielded"]:
        score -= 2.5
    if cumulative_dose_msv > 80.0:
        score -= min(12.0, (cumulative_dose_msv - 80.0) * 0.04)

    clamped = max(10.0, min(100.0, round(score, 1)))
    if clamped >= 82.0:
        status = "NOMINAL"
    elif clamped >= 65.0:
        status = "STRAINED"
    elif clamped >= 45.0:
        status = "COMPROMISED"
    else:
        status = "CRITICAL"
    return clamped, status


def generate_ecg_sample(phase: float, anomaly_mode: str = "NONE") -> float:
    """Synthesizes a Lead-II P-Q-R-S-T voltage (mV) for a normalized cycle phase [0, 1)."""
    val = 0.03 * math.sin(2.0 * math.pi * phase) + random.uniform(-0.015, 0.015)

    if 0.14 <= phase <= 0.24:
        p_t = (phase - 0.19) / 0.035
        val += 0.14 * math.exp(-0.5 * p_t * p_t)

    if 0.34 <= phase <= 0.38:
        q_t = (phase - 0.36) / 0.012
        val -= 0.14 * math.exp(-0.5 * q_t * q_t)

    if 0.37 <= phase <= 0.43:
        r_t = (phase - 0.40) / 0.014
        val += 1.22 * math.exp(-0.5 * r_t * r_t)

    if 0.42 <= phase <= 0.47:
        s_t = (phase - 0.445) / 0.014
        val -= 0.26 * math.exp(-0.5 * s_t * s_t)

    # Mild ST depression during hypoxia or compound emergency stress
    if anomaly_mode in {"HYPOXIA", "COMPOUND_CRISIS"} and 0.47 <= phase <= 0.62:
        val -= 0.09

    if 0.62 <= phase <= 0.80:
        t_t = (phase - 0.70) / 0.055
        t_amp = 0.24 if anomaly_mode in {"TACHYCARDIA", "COMPOUND_CRISIS"} else 0.30
        val += t_amp * math.exp(-0.5 * t_t * t_t)

    return round(val, 3)


class BiotelemetrySimulator:
    def __init__(self) -> None:
        self.state: Dict[str, Dict] = {
            "ASTRO-01": {"hr": 62.0, "spo2": 98.8, "temp": 36.8, "rad": 14.5, "hrv": 56.0, "eva": True, "phase": 0.0},
            "ASTRO-02": {"hr": 65.0, "spo2": 99.1, "temp": 37.0, "rad": 12.0, "hrv": 61.0, "eva": False, "phase": 0.33},
            "ASTRO-03": {"hr": 58.0, "spo2": 98.4, "temp": 36.7, "rad": 15.2, "hrv": 64.0, "eva": True, "phase": 0.67},
        }
        self.active_kp: float = 1.5
        self._last_config: Dict[str, tuple] = {}

    def set_space_weather_kp(self, kp_index: float) -> None:
        self.active_kp = max(0.0, min(9.0, float(kp_index)))

    def resolve_effective_kp(self, solar_storm: str = "LIVE_DONKI") -> float:
        storm_cfg = SOLAR_STORM_OVERRIDES.get(solar_storm, SOLAR_STORM_OVERRIDES["LIVE_DONKI"])
        return self.active_kp if storm_cfg["kp_override"] < 0 else storm_cfg["kp_override"]

    def generate_vitals(
        self,
        astronaut_id: str,
        anomaly_mode: str = "NONE",
        sample_rate_hz: int = 100,
        window_seconds: float = 1.2,
        mission_zone: str = "LEO_ISS",
        mission_day: int = 14,
        eva_active: Optional[bool] = None,
        shielding: str = "NOMINAL",
        solar_storm: str = "LIVE_DONKI",
    ) -> VitalSigns:
        if astronaut_id not in self.state:
            self.state[astronaut_id] = {
                "hr": 66.0,
                "spo2": 98.5,
                "temp": 36.8,
                "rad": 13.0,
                "hrv": 54.0,
                "eva": False,
                "phase": 0.0,
            }
        base = self.state[astronaut_id]
        now_sec = time.time()
        zone_key = mission_zone if mission_zone in MISSION_ZONES else "LEO_ISS"
        zone = MISSION_ZONES[zone_key]
        day = max(1, min(1000, int(mission_day)))
        shield_key = shielding if shielding in SHIELDING_MULTIPLIERS else "NOMINAL"
        storm_cfg = SOLAR_STORM_OVERRIDES.get(solar_storm, SOLAR_STORM_OVERRIDES["LIVE_DONKI"])
        effective_kp = self.resolve_effective_kp(solar_storm)

        orb = nasa_baselines.orbital_context(now_sec, kp_index=effective_kp)
        is_eva = bool(base["eva"]) if eva_active is None else bool(eva_active)
        if shield_key == "UNSHIELDED_EVA":
            is_eva = True

        # Long-duration microgravity/partial-gravity cardiovascular deconditioning (OSD-569/575)
        duration_factor = min(1.0, day / 365.0)
        gravity_relief = 0.55 if zone["gravity_g"] > 0 else 1.0
        duration_hr_drift = 11.5 * duration_factor * gravity_relief
        duration_hrv_loss = 15.0 * duration_factor * gravity_relief
        distance_stress_hr = 3.5 if not zone["magnetosphere_shielded"] else 0.0

        eva_hr_load = 12.0 if is_eva else 0.0
        target_hr = (
            (62.0 if astronaut_id == "ASTRO-01" else 65.0 if astronaut_id == "ASTRO-02" else 58.0)
            + eva_hr_load
            + duration_hr_drift
            + distance_stress_hr
            + orb["hr_delta"]
        )
        target_hrv = 56.0 - (6.0 if is_eva else 0.0) - duration_hrv_loss + orb["hrv_delta"]
        target_temp = 36.85 + (0.16 if is_eva else 0.0) + orb["temp_delta"]

        # Base radiation reflects LEO orbital phase vs deep-space GCR + solar storm + shielding
        if zone_key == "LEO_ISS":
            ambient_base = orb["ambient_rad"]
            orbital_phase = "saa_transit" if anomaly_mode == "SAA_TRANSIT" else orb["orbital_phase"]
            if anomaly_mode == "SAA_TRANSIT":
                ambient_base += 22.0
        else:
            ambient_base = zone["gcr_baseline_usv_h"]
            orbital_phase = zone["phase_label"]

        shield_mult = SHIELDING_MULTIPLIERS[shield_key]
        eva_rad_mult = 1.15 if is_eva and shield_key == "NOMINAL" else 1.0
        storm_rad = storm_cfg["rad_bonus_usv_h"] * (0.35 if zone["magnetosphere_shielded"] and shield_key != "UNSHIELDED_EVA" else 1.0)
        target_rad = (ambient_base + storm_rad) * shield_mult * eva_rad_mult

        config_sig = (zone_key, day, shield_key, solar_storm, is_eva, anomaly_mode)
        if self._last_config.get(astronaut_id) != config_sig:
            # Re-anchor state immediately on simulation parameter changes so hazards clear/shift without decay lag.
            self._last_config[astronaut_id] = config_sig
            base["hr"] = target_hr
            base["spo2"] = 98.6
            base["temp"] = target_temp
            base["rad"] = target_rad
            base["hrv"] = target_hrv

        # Mean-reverting Ornstein-Uhlenbeck style drift calibrated to NASA baselines
        base["hr"] += 0.25 * (target_hr - base["hr"]) + random.uniform(-0.8, 0.8)
        base["hr"] = max(46.0, min(115.0, base["hr"]))

        base["spo2"] += 0.2 * (98.6 - base["spo2"]) + random.uniform(-0.12, 0.12)
        base["spo2"] = max(94.5, min(100.0, base["spo2"]))

        base["temp"] += 0.2 * (target_temp - base["temp"]) + random.uniform(-0.02, 0.02)
        base["temp"] = max(36.2, min(37.6, base["temp"]))

        base["rad"] += 0.35 * (target_rad - base["rad"]) + random.uniform(-0.4, 0.4)
        base["rad"] = max(4.0, min(260.0, base["rad"]))

        base["hrv"] += 0.25 * (target_hrv - base["hrv"]) + random.uniform(-1.4, 1.4)
        base["hrv"] = max(18.0, min(95.0, base["hrv"]))

        hr = base["hr"]
        spo2 = base["spo2"]
        temp = base["temp"]
        rad = base["rad"]
        hrv = base["hrv"]
        sbp = 116.0 + (hr - 68.0) * 0.32 - (4.0 * duration_factor if zone["gravity_g"] == 0 else 0.0)
        dbp = 76.0 + (hr - 68.0) * 0.16
        resp_rate = 14.0 + (hr - 68.0) * 0.12

        if anomaly_mode == "EVA_HEAVY":
            hr = round(min(132.0, hr + 34.0), 1)
            temp = round(temp + 0.65, 2)
            hrv = round(max(20.0, hrv - 16.0), 1)
            resp_rate = max(resp_rate, 21.5)
        elif anomaly_mode == "HYPOXIA":
            spo2 = round(random.uniform(86.0, 89.5), 1)
            hr = round(hr + 28.0, 1)
            hrv = round(max(18.0, hrv - 18.0), 1)
            resp_rate = round(random.uniform(22.0, 26.0), 1)
        elif anomaly_mode == "HYPERCAPNIA":
            resp_rate = round(random.uniform(24.5, 28.5), 1)
            hr = round(hr + 22.0, 1)
            spo2 = round(random.uniform(91.5, 93.8), 1)
            sbp += 18.0
            dbp += 10.0
        elif anomaly_mode == "DCS_RISK":
            spo2 = round(random.uniform(91.0, 93.5), 1)
            hr = round(hr + 24.0, 1)
            resp_rate = round(random.uniform(22.5, 25.5), 1)
            hrv = round(max(20.0, hrv - 16.0), 1)
        elif anomaly_mode == "HEAT_STRESS":
            temp = round(random.uniform(38.3, 39.1), 2)
            hr = round(max(126.0, hr + 36.0), 1)
            sbp -= 14.0
            hrv = round(max(18.0, hrv - 18.0), 1)
        elif anomaly_mode == "HYPOTHERMIA":
            temp = round(random.uniform(34.9, 35.35), 2)
            hr = round(random.uniform(41.0, 44.5), 1)
            resp_rate = 11.0
        elif anomaly_mode == "TACHYCARDIA":
            hr = round(random.uniform(132.0, 154.0), 1)
            hrv = round(max(15.0, hrv - 22.0), 1)
        elif anomaly_mode == "BRADYCARDIA":
            hr = round(random.uniform(38.0, 43.5), 1)
            sbp -= 12.0
        elif anomaly_mode == "ORTHOSTATIC":
            sbp = round(random.uniform(82.0, 89.0), 0)
            dbp = round(random.uniform(54.0, 60.0), 0)
            hr = round(max(108.0, hr + 32.0), 1)
            hrv = round(max(18.0, hrv - 16.0), 1)
        elif anomaly_mode == "SLEEP_FATIGUE":
            hrv = round(random.uniform(20.0, 26.5), 1)
            hr = round(hr + 12.0, 1)
            sbp += 8.0
        elif anomaly_mode == "DUST_EXPOSURE":
            resp_rate = round(random.uniform(24.0, 27.0), 1)
            spo2 = round(random.uniform(92.0, 93.8), 1)
            hr = round(hr + 16.0, 1)
        # Metabolic, immune (OSD-569/575), and hydration markers coupled with mission stress
        blood_glucose = 88.0 + (4.5 * duration_factor) - (6.0 if is_eva else 0.0) + random.uniform(-3.5, 4.5)
        wbc_k_ul = 6.2 * (1.0 - 0.15 * duration_factor) - min(0.8, max(0.0, (rad - 20.0) * 0.008)) + random.uniform(-0.15, 0.15)
        hydration_pct = 96.2 - (2.4 if is_eva else 0.0) - (1.8 * duration_factor) + random.uniform(-0.8, 0.8)

        if anomaly_mode == "HYPOGLYCEMIA":
            blood_glucose = round(random.uniform(49.0, 62.0), 1)
            hr = round(hr + 18.0, 1)
            hrv = round(max(22.0, hrv - 12.0), 1)
        elif anomaly_mode == "HYPERGLYCEMIA":
            blood_glucose = round(random.uniform(195.0, 232.0), 1)
            hydration_pct = round(random.uniform(80.0, 85.0), 1)
        elif anomaly_mode in ("DEHYDRATION", "HEAT_STRESS", "ORTHOSTATIC", "ORTHOSTATIC_HYPOTENSION"):
            hydration_pct = round(random.uniform(79.0, 83.5), 1)
            blood_glucose += 14.0
        elif anomaly_mode == "RADIATION_SPIKE":
            rad = round(max(rad + 55.0, random.uniform(65.0, 105.0)), 1)
            hr = round(hr + 8.0, 1)
            hrv = round(max(20.0, hrv - 14.0), 1)
            wbc_k_ul = round(random.uniform(3.2, 3.9), 2)
        elif anomaly_mode == "COMPOUND_CRISIS":
            rad = round(max(rad + 75.0, random.uniform(85.0, 145.0)), 1)
            temp = round(random.uniform(38.4, 39.0), 2)
            spo2 = round(random.uniform(87.5, 89.8), 1)
            hr = round(random.uniform(132.0, 148.0), 1)
            hrv = round(random.uniform(16.0, 22.0), 1)
            resp_rate = round(random.uniform(24.5, 28.0), 1)
            blood_glucose = round(random.uniform(54.0, 66.0), 1)
            wbc_k_ul = round(random.uniform(3.1, 3.6), 2)
            hydration_pct = round(random.uniform(78.0, 82.5), 1)

        blood_glucose = round(max(35.0, min(400.0, blood_glucose)), 1)
        wbc_k_ul = round(max(1.5, min(20.0, wbc_k_ul)), 2)
        hydration_pct = round(max(55.0, min(100.0, hydration_pct)), 1)

        resp_rate = max(10.0, min(34.0, resp_rate))
        sbp = max(72.0, min(185.0, round(sbp, 0)))
        dbp = max(45.0, min(115.0, round(dbp, 0)))

        # Mission cumulative dose integrates baseline zone exposure + current elevated event
        baseline_daily_msv = (zone["gcr_baseline_usv_h"] * shield_mult * 24.0) / 1000.0
        cumulative_dose_msv = round(baseline_daily_msv * day + (max(0.0, rad - zone["gcr_baseline_usv_h"]) * 0.008), 2)

        overall_score, health_status = compute_health_score(
            heart_rate=hr,
            spo2=spo2,
            core_temp=temp,
            radiation_rate=rad,
            hrv=hrv,
            systolic_bp=sbp,
            respiration_rate=resp_rate,
            orbital_phase=orbital_phase,
            kp_index=effective_kp,
            mission_zone=zone_key,
            mission_day=day,
            cumulative_dose_msv=cumulative_dose_msv,
            blood_glucose=blood_glucose,
            hydration_pct=hydration_pct,
        )

        sample_count = max(50, int(round(sample_rate_hz * window_seconds)))
        dt = 1.0 / float(sample_rate_hz)

        # Respiratory sinus arrhythmia + HRV cycle-to-cycle modulation
        ecg_window: List[float] = []
        phase = float(base.get("phase", 0.0))
        hrv_mod = min(0.06, (hrv / 1000.0) * 0.5)
        for i in range(sample_count):
            t_offset = now_sec + i * dt
            rsa = 0.04 * math.sin(2.0 * math.pi * (resp_rate / 60.0) * t_offset)
            inst_hr = max(35.0, hr * (1.0 + rsa + random.uniform(-hrv_mod, hrv_mod) * 0.15))
            phase = (phase + (inst_hr / 60.0) * dt) % 1.0
            ecg_window.append(generate_ecg_sample(phase, anomaly_mode=anomaly_mode))
        base["phase"] = phase

        return VitalSigns(
            astronaut_id=astronaut_id,
            timestamp=datetime.now(timezone.utc),
            heart_rate=round(hr, 1),
            spo2=round(spo2, 1),
            core_temp=round(temp, 2),
            radiation_rate=round(rad, 1),
            hrv=round(hrv, 1),
            systolic_bp=sbp,
            diastolic_bp=dbp,
            respiration_rate=round(resp_rate, 1),
            battery_level=round(94.5 - random.uniform(0.0, 0.4), 1),
            ecg_samples=ecg_window,
            telemetry_source="simulated",
            ecg_sample_rate_hz=sample_rate_hz,
            orbital_phase=orbital_phase,
            calibration_basis=nasa_baselines.calibration_basis,
            iss_latitude=orb["iss_latitude"],
            iss_longitude=orb["iss_longitude"],
            iss_altitude_km=orb["iss_altitude_km"],
            iss_coord_source=orb["iss_coord_source"],
            iss_velocity_kms=orb["iss_velocity_kms"],
            mission_zone=zone_key,
            mission_day=day,
            distance_km=zone["distance_km"],
            comms_latency_sec=zone["comms_latency_sec"],
            gravity_g=zone["gravity_g"],
            shielding_mode=shield_key,
            cumulative_dose_msv=cumulative_dose_msv,
            overall_health_score=overall_score,
            health_status=health_status,
            blood_glucose=blood_glucose,
            wbc_k_ul=wbc_k_ul,
            hydration_pct=hydration_pct,
        )


simulator = BiotelemetrySimulator()
