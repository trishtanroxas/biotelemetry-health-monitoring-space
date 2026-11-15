from datetime import datetime, timezone
from typing import Any, Dict, List
import uuid

from backend.app.core.config import settings
from backend.app.schemas.alert import AlertItem
from backend.app.schemas.diagnostic import DiagnosticResult
from backend.app.schemas.telemetry import VitalSigns
from backend.app.services.simulator import MISSION_ZONES, compute_health_score


def compute_space_environment_risks(
    avg_hr: float,
    avg_spo2: float,
    avg_temp: float,
    avg_rad: float,
    avg_hrv: float,
    avg_sbp: float,
    avg_resp: float,
    orbital_phase: str,
    kp_index: float,
    mission_zone: str,
    mission_day: int,
    cumulative_dose_msv: float,
) -> List[Dict[str, Any]]:
    zone = MISSION_ZONES.get(mission_zone, MISSION_ZONES["LEO_ISS"])
    gravity_g = float(zone["gravity_g"])
    latency = float(zone["comms_latency_sec"])
    shielded = bool(zone["magnetosphere_shielded"])

    rad_level = "SEVERE" if avg_rad >= 60 or cumulative_dose_msv >= 300 else ("HIGH" if avg_rad >= 30 or cumulative_dose_msv >= 150 else ("MODERATE" if orbital_phase in {"saa_transit", "high_latitude"} or not shielded else "LOW"))
    sans_score = min(100, round((1.0 - min(1.0, gravity_g)) * (min(180, mission_day) / 180.0) * 78 + (12 if avg_sbp < 95 else 0)))
    sans_level = "HIGH" if sans_score >= 55 else ("MODERATE" if sans_score >= 25 else "LOW")

    bone_score = min(100, round((1.0 - min(1.0, gravity_g)) * (min(365, mission_day) / 365.0) * 85))
    bone_level = "HIGH" if bone_score >= 55 else ("MODERATE" if bone_score >= 25 else "LOW")

    cardio_strain = (12 if avg_hr > 105 else 0) + (18 if avg_hr > 125 else 0) + (20 if avg_hrv < 35 else 0) + (22 if avg_sbp < 94 else 0) + round(min(22, mission_day / 16))
    cardio_level = "SEVERE" if cardio_strain >= 55 else ("HIGH" if cardio_strain >= 35 else ("MODERATE" if cardio_strain >= 18 else "LOW"))

    atmo_bad = (avg_spo2 < 90 or avg_temp >= 38.8)
    atmo_warn = (avg_spo2 < 95 or avg_temp >= 37.9 or avg_temp <= 35.5 or avg_resp >= 23)
    atmo_level = "SEVERE" if atmo_bad else ("HIGH" if atmo_warn else "LOW")

    isolation_score = min(100, round((min(365, mission_day) / 365.0) * 55 + (25 if latency > 60 else (10 if latency > 1 else 0)) + (18 if avg_hrv < 35 else 0)))
    isolation_level = "HIGH" if isolation_score >= 55 else ("MODERATE" if isolation_score >= 28 else "LOW")

    return [
        {
            "domain": "Radiation & Space Weather",
            "hazard": "GCR, Solar Particle Events, and SAA Trapped Protons",
            "risk_level": rad_level,
            "summary": f"Ambient {avg_rad:.1f} uSv/h; cumulative ~{cumulative_dose_msv:.1f} mSv over {mission_day}d ({'outside magnetosphere' if not shielded else orbital_phase.replace('_', ' ')}).",
            "countermeasure": "Move to water/polyethylene storm shelter during SPE; defer EVA across SAA and high-Kp polar passes.",
            "evidence_basis": "NASA DONKI 2020-2026 + ISS 48h Orbit + OSDR OSD-479/751",
        },
        {
            "domain": "SANS & Cephalad Fluid Shift",
            "hazard": "Optic nerve sheath distension and elevated intracranial pressure",
            "risk_level": sans_level,
            "summary": f"{gravity_g:.2f}g field over {mission_day} days drives headward fluid redistribution (index {sans_score}/100).",
            "countermeasure": "Apply lower-body negative pressure (LBNP), venous thigh cuffs, and scheduled ocular ultrasound/fundoscopy.",
            "evidence_basis": "NASA OSDR OSD-583/680/681 optic sheath & ICP curves",
        },
        {
            "domain": "Bone & Muscle Deconditioning",
            "hazard": "Trabecular BMD loss and anti-gravity muscle atrophy",
            "risk_level": bone_level,
            "summary": f"{gravity_g:.2f}g unloading over {mission_day} days (load index {bone_score}/100).",
            "countermeasure": "Maintain daily ARED resistive loading, aerobic countermeasures, and vitamin D/calcium monitoring.",
            "evidence_basis": "NASA OSDR OSD-351/489/608 partial-gravity bone studies",
        },
        {
            "domain": "Cardiovascular & Orthostatic",
            "hazard": "Plasma volume reduction, resting HR drift, and post-G orthostatic intolerance",
            "risk_level": cardio_level,
            "summary": f"Avg HR {avg_hr:.0f} BPM, HRV {avg_hrv:.0f} ms, SBP {avg_sbp:.0f} mmHg.",
            "countermeasure": "Fluid/electrolyte loading before G-transitions, aerobic interval protocol, and autonomic HRV pacing.",
            "evidence_basis": "NASA OSDR OSD-569/575 vascular & hematocrit baselines",
        },
        {
            "domain": "Closed-Loop Atmosphere & Thermal",
            "hazard": "Hypoxia, CO2 hypercapnia, EVA thermal stress, or decompression strain",
            "risk_level": atmo_level,
            "summary": f"SpO2 {avg_spo2:.1f}%, core temp {avg_temp:.2f} C, resp {avg_resp:.1f}/min.",
            "countermeasure": "Verify suit/cabin O2 partial pressure, LiOH/amine CO2 scrubber capacity, and liquid cooling garment flow.",
            "evidence_basis": "NASA ECLSS & EVA biomedical limits",
        },
        {
            "domain": "Distance, Latency & Circadian",
            "hazard": "Signal delay autonomy and circadian misalignment (16 sunrises/day in LEO)",
            "risk_level": isolation_level,
            "summary": f"One-way lag {latency:.1f}s ({zone['label']}); mission day {mission_day}.",
            "countermeasure": "Enforce structured 24h lighting/sleep hygiene, onboard autonomous triage, and crew behavioral check-ins.",
            "evidence_basis": "ISS 48h daylight/eclipse cycle + HRP deep-space autonomy",
        },
    ]


class HealthAnalyzer:
    def evaluate_vitals(self, vitals: VitalSigns, kp_index: float = 0.0) -> List[AlertItem]:
        alerts: List[AlertItem] = []
        now = datetime.now(timezone.utc)
        sbp = vitals.systolic_bp if vitals.systolic_bp is not None else 120.0
        resp = vitals.respiration_rate if vitals.respiration_rate is not None else 14.0
        zone_key = vitals.mission_zone or "LEO_ISS"
        day = vitals.mission_day or 14
        cum_dose = vitals.cumulative_dose_msv or 0.0

        def add_alert(severity: str, alert_type: str, message: str, trigger_metric: str, recommended_action: str, hazard_domain: str) -> None:
            alerts.append(
                AlertItem(
                    id=str(uuid.uuid4())[:8],
                    astronaut_id=vitals.astronaut_id,
                    timestamp=now,
                    severity=severity,
                    alert_type=alert_type,
                    message=message,
                    trigger_metric=trigger_metric,
                    recommended_action=recommended_action,
                    hazard_domain=hazard_domain,
                )
            )

        # 1. Oxygenation / Hypoxia
        if vitals.spo2 < 90.0:
            add_alert(
                "CRITICAL",
                "HYPOXIA",
                f"Critical blood oxygen saturation drop ({vitals.spo2}%). Immediate suit O2 flush required!",
                f"SpO2 {vitals.spo2}%",
                "Switch to secondary O2 supply, verify helmet/cabin seal, and abort physical exertion.",
                "Atmosphere & Suit",
            )
        elif vitals.spo2 < settings.NORMAL_SPO2_MIN:
            add_alert(
                "WARNING",
                "HYPOXIA",
                f"Sub-optimal SpO2 ({vitals.spo2}%). Check breathing regulator and cabin O2.",
                f"SpO2 {vitals.spo2}%",
                "Inspect suit regulator pressure and monitor SpO2 recovery every 30s.",
                "Atmosphere & Suit",
            )

        # 2. Cardiovascular Rate
        if vitals.heart_rate > 145.0:
            add_alert(
                "CRITICAL",
                "TACHYCARDIA",
                f"Severe sustained tachycardia ({vitals.heart_rate} BPM) under orbital/suit load.",
                f"HR {vitals.heart_rate} BPM",
                "Halt EVA tasks immediately, initiate controlled recovery breathing, and review ECG Lead-II.",
                "Cardiovascular",
            )
        elif vitals.heart_rate > 125.0:
            add_alert(
                "WARNING",
                "TACHYCARDIA",
                f"Elevated heart rate detected ({vitals.heart_rate} BPM). Heavy physical strain or stress.",
                f"HR {vitals.heart_rate} BPM",
                "Reduce workload intensity and hydrate; schedule 15-minute rest period.",
                "Cardiovascular",
            )
        elif vitals.heart_rate < 45.0:
            add_alert(
                "WARNING",
                "BRADYCARDIA",
                f"Low resting pulse ({vitals.heart_rate} BPM). Monitor autonomic response.",
                f"HR {vitals.heart_rate} BPM",
                "Confirm sensor contact, check core temperature, and assess for dizziness.",
                "Cardiovascular",
            )

        # 3. Thermal Regulation (EVA Heat Stress / Hypothermia)
        if vitals.core_temp >= 38.8:
            add_alert(
                "CRITICAL",
                "HEAT_STRESS",
                f"Critical hyperthermia ({vitals.core_temp:.2f} C). Possible suit cooling loop failure.",
                f"Core Temp {vitals.core_temp:.2f} C",
                "Maximize liquid cooling garment flow, cease EVA exertion, and return to airlock.",
                "Thermal & Suit",
            )
        elif vitals.core_temp >= 38.0:
            add_alert(
                "WARNING",
                "HEAT_STRESS",
                f"Elevated core temperature ({vitals.core_temp:.2f} C). Thermal strain developing.",
                f"Core Temp {vitals.core_temp:.2f} C",
                "Increase suit cooling setting and hydrate with electrolytes.",
                "Thermal & Suit",
            )
        elif vitals.core_temp <= 35.4:
            add_alert(
                "WARNING",
                "HYPOTHERMIA",
                f"Low core temperature ({vitals.core_temp:.2f} C) during eclipse/thermal loss.",
                f"Core Temp {vitals.core_temp:.2f} C",
                "Engage suit thermal heater and reduce convective cooling flow.",
                "Thermal & Suit",
            )

        # 4. Respiratory / CO2 Hypercapnia
        if resp >= 24.0:
            add_alert(
                "WARNING",
                "HYPERCAPNIA",
                f"Elevated respiratory rate ({resp:.1f} breaths/min) suggesting CO2 buildup or high exertion.",
                f"Resp {resp:.1f}/min",
                "Verify CO2 scrubber cartridge status and slow breathing cadence.",
                "Atmosphere & Suit",
            )

        # 5. Orthostatic / Blood Pressure & Autonomic HRV
        if sbp < 90.0:
            add_alert(
                "WARNING",
                "ORTHOSTATIC_HYPOTENSION",
                f"Low systolic blood pressure ({sbp:.0f}/{vitals.diastolic_bp or 60:.0f} mmHg). Orthostatic risk.",
                f"BP {sbp:.0f} mmHg",
                "Assume supine/seated posture, hydrate with isotonic fluids, and activate compression garment.",
                "Cardiovascular",
            )
        if vitals.hrv < 28.0:
            add_alert(
                "WARNING",
                "AUTONOMIC_FATIGUE",
                f"Depressed HRV ({vitals.hrv:.1f} ms) indicating autonomic fatigue or circadian stress.",
                f"HRV {vitals.hrv:.1f} ms",
                "Prioritize protected sleep window and defer non-critical high-load tasks.",
                "Circadian & Autonomic",
            )

        # 6. Radiation & Space Weather Compound Risk
        if vitals.radiation_rate >= settings.RADIATION_CRITICAL_THRESHOLD:
            add_alert(
                "CRITICAL",
                "RADIATION_SPIKE",
                f"Solar Particle Event / High radiation dosage ({vitals.radiation_rate:.1f} uSv/h). Seek storm shelter!",
                f"Rad {vitals.radiation_rate:.1f} uSv/h",
                "Relocate crew to shielded storm shelter rack (water/polyethylene shielding) immediately.",
                "Space Radiation",
            )
        elif vitals.radiation_rate >= settings.RADIATION_WARNING_THRESHOLD:
            add_alert(
                "WARNING",
                "RADIATION_SPIKE",
                f"Elevated ambient radiation ({vitals.radiation_rate:.1f} uSv/h). Limit unshielded EVA duration.",
                f"Rad {vitals.radiation_rate:.1f} uSv/h",
                "Defer external EVA and track 15-minute dosimeter accumulation.",
                "Space Radiation",
            )

        if (vitals.orbital_phase == "saa_transit" and vitals.radiation_rate >= 24.0) or (
            vitals.orbital_phase == "high_latitude" and kp_index >= 5.0
        ):
            add_alert(
                "WARNING",
                "SOLAR_STORM_SHELTER",
                f"Orbital hazard zone ({vitals.orbital_phase.replace('_', ' ').upper()}) with Kp {kp_index:.1f} elevates proton flux.",
                f"Zone {vitals.orbital_phase} · Kp {kp_index:.1f}",
                "Remain inside main pressurized hull until orbital track exits high-flux latitude/SAA.",
                "Space Radiation",
            )

        # 7. Metabolic Glycemia, Hydration & Immune Surveillance (OSD-575)
        glucose = vitals.blood_glucose if vitals.blood_glucose is not None else 92.0
        if glucose < 55.0:
            add_alert(
                "CRITICAL",
                "HYPOGLYCEMIA",
                f"Severe hypoglycemia ({glucose:.0f} mg/dL). Cognitive/motor impairment risk during EVA.",
                f"Glucose {glucose:.0f} mg/dL",
                "Take 15-20 g fast-acting oral glucose gel immediately and halt EVA duties.",
                "Metabolic & Nutrition",
            )
        elif glucose < settings.GLUCOSE_LOW:
            add_alert(
                "WARNING",
                "HYPOGLYCEMIA",
                f"Low blood glucose ({glucose:.0f} mg/dL). Post-exertion fuel deficit developing.",
                f"Glucose {glucose:.0f} mg/dL",
                "Consume carbohydrate ration (15 g) and recheck capillary glucose in 15 minutes.",
                "Metabolic & Nutrition",
            )
        elif glucose > 240.0:
            add_alert(
                "CRITICAL",
                "HYPERGLYCEMIA",
                f"Marked hyperglycemia ({glucose:.0f} mg/dL). Dehydration and metabolic stress risk.",
                f"Glucose {glucose:.0f} mg/dL",
                "Hydrate aggressively, check urine ketones if available, and contact Flight Surgeon.",
                "Metabolic & Nutrition",
            )
        elif glucose > settings.GLUCOSE_HIGH:
            add_alert(
                "WARNING",
                "HYPERGLYCEMIA",
                f"Elevated blood glucose ({glucose:.0f} mg/dL) above nominal flight target.",
                f"Glucose {glucose:.0f} mg/dL",
                "Increase water intake and avoid simple sugar rations until repeat fasting check.",
                "Metabolic & Nutrition",
            )

        hydration = vitals.hydration_pct if vitals.hydration_pct is not None else 96.0
        if hydration < 84.0:
            add_alert(
                "WARNING",
                "DEHYDRATION",
                f"Low hydration estimate ({hydration:.0f}%). Increases orthostatic & renal stone risk.",
                f"Hydration {hydration:.0f}%",
                "Drink 400 mL oral rehydration solution over 30 minutes.",
                "Metabolic & Nutrition",
            )

        wbc = vitals.wbc_k_ul if vitals.wbc_k_ul is not None else 6.1
        if wbc < 3.8:
            add_alert(
                "WARNING",
                "IMMUNE_SUPPRESSION",
                f"Sub-baseline WBC trend ({wbc:.2f} K/uL, OSD-575 flight profile). Elevated opportunistic infection risk.",
                f"WBC {wbc:.2f} K/uL",
                "Enforce closed-cabin surface disinfection, HEPA verification, and protective sleep schedule.",
                "Immune & Dermal",
            )

        if cum_dose >= 150.0 or (day >= 180 and not MISSION_ZONES.get(zone_key, MISSION_ZONES["LEO_ISS"])["magnetosphere_shielded"]):
            add_alert(
                "INFO",
                "DEEP_SPACE_DOSE",
                f"Long-duration cumulative dose ({cum_dose:.1f} mSv, Day {day}) increases SANS, bone, and tissue risks.",
                f"Dose {cum_dose:.1f} mSv · Day {day}",
                "Enforce storm-shelter drills, ARED bone countermeasures, and ocular SANS screening.",
                "Long-Duration Flight",
            )

        return alerts

    def run_comprehensive_diagnostic(
        self,
        astronaut_id: str,
        vitals_history: List[VitalSigns],
        kp_index: float = 0.0,
        mission_zone: str = "LEO_ISS",
        mission_day: int = 14,
    ) -> DiagnosticResult:
        if not vitals_history:
            return DiagnosticResult(
                astronaut_id=astronaut_id,
                overall_health_score=100.0,
                cardiovascular_status="NOMINAL",
                hypoxia_risk="LOW",
                radiation_risk="SAFE",
                recommendations=["Telemetry stream nominal. Maintain regular biometric logging."],
                metrics_summary={"status": "Insufficient historical data for deep trend"},
                environment_risks=compute_space_environment_risks(
                    65.0, 98.5, 36.8, 13.5, 55.0, 118.0, 14.0, "daylight", kp_index, mission_zone, mission_day, 5.0
                ),
            )

        n = len(vitals_history)
        avg_hr = sum(v.heart_rate for v in vitals_history) / n
        avg_spo2 = sum(v.spo2 for v in vitals_history) / n
        avg_temp = sum(v.core_temp for v in vitals_history) / n
        avg_rad = sum(v.radiation_rate for v in vitals_history) / n
        avg_hrv = sum(v.hrv for v in vitals_history) / n
        avg_sbp = sum(v.systolic_bp or 118.0 for v in vitals_history) / n
        avg_resp = sum(v.respiration_rate or 14.0 for v in vitals_history) / n
        avg_glucose = sum(v.blood_glucose if v.blood_glucose is not None else 92.0 for v in vitals_history) / n
        avg_wbc = sum(v.wbc_k_ul if v.wbc_k_ul is not None else 6.1 for v in vitals_history) / n
        avg_hydration = sum(v.hydration_pct if v.hydration_pct is not None else 96.0 for v in vitals_history) / n

        latest = vitals_history[-1]
        orbital_phase = latest.orbital_phase or "daylight"
        zone_key = latest.mission_zone or mission_zone
        day = latest.mission_day or mission_day
        cum_dose = latest.cumulative_dose_msv or round((avg_rad * 24.0 * day) / 1000.0, 2)

        score, _ = compute_health_score(
            heart_rate=avg_hr,
            spo2=avg_spo2,
            core_temp=avg_temp,
            radiation_rate=avg_rad,
            hrv=avg_hrv,
            systolic_bp=avg_sbp,
            respiration_rate=avg_resp,
            orbital_phase=orbital_phase,
            kp_index=kp_index,
            mission_zone=zone_key,
            mission_day=day,
            cumulative_dose_msv=cum_dose,
            blood_glucose=avg_glucose,
            hydration_pct=avg_hydration,
        )

        recommendations: List[str] = []
        if avg_spo2 < 95.0:
            recommendations.append("Increase suit oxygen partial pressure and verify regulator flow.")
        if avg_hr > 100.0:
            recommendations.append("High cardiovascular workload detected. Schedule 15-minute rest period.")
        if avg_temp >= 38.0:
            recommendations.append("Core temperature elevated. Maximize liquid cooling loop and hydrate.")
        if avg_sbp < 94.0:
            recommendations.append("Low systolic pressure trend. Apply orthostatic fluid/compression protocol.")
        if avg_rad > 25.0 or cum_dose >= 150.0:
            recommendations.append("Radiation exposure elevated. Review storm-shelter shielding and EVA scheduling.")
        if avg_hrv < 35.0:
            recommendations.append("Autonomic fatigue detected via low HRV. Protect sleep window.")
        if orbital_phase == "saa_transit":
            recommendations.append("ISS currently crossing South Atlantic Anomaly; limit EVA exposure during peak proton flux.")
        elif orbital_phase == "high_latitude" and kp_index >= 4.0:
            recommendations.append(f"High-latitude orbit combined with Kp {kp_index:.1f}; monitor geomagnetic radiation levels.")
        if day >= 90 and MISSION_ZONES.get(zone_key, MISSION_ZONES["LEO_ISS"])["gravity_g"] < 0.5:
            recommendations.append("Long-duration partial/microgravity load: maintain ARED resistive exercise and SANS ocular checks.")
        if avg_glucose < settings.GLUCOSE_LOW or avg_glucose > settings.GLUCOSE_HIGH:
            recommendations.append(f"Metabolic glucose drift ({avg_glucose:.0f} mg/dL vs OSD-575 70-180 mg/dL band): adjust carb timing and hydration.")
        if avg_hydration < 86.0:
            recommendations.append(f"Hydration deficit detected ({avg_hydration:.0f}%): target 2,400 mL/day electrolyte fluids.")
        if avg_wbc < 4.0:
            recommendations.append(f"Immune leukocyte shift ({avg_wbc:.2f} K/uL): monitor skin/airway symptoms and protect sleep.")

        elevated_orbital = orbital_phase == "saa_transit" or (orbital_phase == "high_latitude" and kp_index >= 5.0)
        rad_risk = (
            "DANGEROUS"
            if avg_rad >= 50 or cum_dose >= 300
            else ("ELEVATED" if avg_rad >= 20 or elevated_orbital or cum_dose >= 120 else "SAFE")
        )
        env_risks = compute_space_environment_risks(
            avg_hr, avg_spo2, avg_temp, avg_rad, avg_hrv, avg_sbp, avg_resp,
            orbital_phase, kp_index, zone_key, day, cum_dose,
        )

        return DiagnosticResult(
            astronaut_id=astronaut_id,
            overall_health_score=score,
            cardiovascular_status="NOMINAL" if score > 80 else ("COMPROMISED" if score > 50 else "CRITICAL"),
            hypoxia_risk="LOW" if avg_spo2 >= 95 else ("MODERATE" if avg_spo2 >= 90 else "SEVERE"),
            radiation_risk=rad_risk,
            recommendations=recommendations or ["All biological telemetry systems within safe operational parameters."],
            metrics_summary={
                "avg_heart_rate": round(avg_hr, 1),
                "avg_spo2": round(avg_spo2, 1),
                "avg_core_temp": round(avg_temp, 2),
                "avg_radiation_rate": round(avg_rad, 1),
                "avg_hrv": round(avg_hrv, 1),
                "avg_systolic_bp": round(avg_sbp, 0),
                "sample_count": n,
                "orbital_phase": orbital_phase,
                "iss_latitude": latest.iss_latitude,
                "iss_longitude": latest.iss_longitude,
                "iss_altitude_km": latest.iss_altitude_km,
                "iss_coord_source": latest.iss_coord_source,
                "active_kp_index": round(kp_index, 1),
                "mission_zone": zone_key,
                "mission_day": day,
                "distance_km": latest.distance_km,
                "comms_latency_sec": latest.comms_latency_sec,
                "cumulative_dose_msv": cum_dose,
                "avg_blood_glucose": round(avg_glucose, 1),
                "avg_wbc_k_ul": round(avg_wbc, 2),
                "avg_hydration_pct": round(avg_hydration, 1),
            },
            environment_risks=env_risks,
        )


analyzer = HealthAnalyzer()
