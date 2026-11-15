import time
from collections import deque
from typing import Dict, List, Optional
from fastapi import APIRouter, Query

from backend.app.core.config import settings
from backend.app.core.supabase_client import get_supabase
from backend.app.routes.alerts import _synced_active_types_by_astronaut, in_memory_alerts
from backend.app.schemas.telemetry import TelemetryBatchSync, VitalSigns
from backend.app.services.analyzer import analyzer
from backend.app.services.nasa_baselines import nasa_baselines
from backend.app.services.simulator import simulator
from backend.app.services.supabase_sync import (
    TELEMETRY_BASE_KEYS,
    insert_batch_with_fallback,
    insert_with_fallback,
    sync_astronaut_alerts_in_db,
)

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

telemetry_history_buffer = {
    "ASTRO-01": deque(maxlen=200),
    "ASTRO-02": deque(maxlen=200),
    "ASTRO-03": deque(maxlen=200),
}
_last_db_write: Dict[str, float] = {}


def _to_db_row(vitals: VitalSigns) -> dict:
    return {
        "astronaut_id": vitals.astronaut_id,
        "timestamp": vitals.timestamp.isoformat(),
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


@router.get("/latest", response_model=VitalSigns)
async def get_latest_telemetry(
    astronaut_id: str = Query("ASTRO-01", description="Astronaut ID"),
    anomaly: str = Query("NONE", description="Simulation scenario mode"),
    mission_zone: str = Query("LEO_ISS", description="Mission destination / distance zone"),
    mission_day: int = Query(14, ge=1, le=1000, description="Simulated mission elapsed day"),
    eva_active: Optional[bool] = Query(None, description="Override EVA activity state"),
    shielding: str = Query("NOMINAL", description="NOMINAL | STORM_SHELTER | UNSHIELDED_EVA"),
    solar_storm: str = Query("LIVE_DONKI", description="LIVE_DONKI | M_FLARE_CME | X_CLASS_SPE | EXTREME_G5"),
):
    await nasa_baselines.refresh_live_iss_position()
    vitals = simulator.generate_vitals(
        astronaut_id,
        anomaly_mode=anomaly,
        mission_zone=mission_zone,
        mission_day=mission_day,
        eva_active=eva_active,
        shielding=shielding,
        solar_storm=solar_storm,
    )

    if astronaut_id not in telemetry_history_buffer:
        telemetry_history_buffer[astronaut_id] = deque(maxlen=200)
    telemetry_history_buffer[astronaut_id].append(vitals)

    effective_kp = simulator.resolve_effective_kp(solar_storm)
    new_alerts = analyzer.evaluate_vitals(vitals, kp_index=effective_kp)
    active_types = {a.alert_type for a in new_alerts}
    _synced_active_types_by_astronaut[astronaut_id] = active_types

    # Remove alerts whose condition has cleared so returning hazards notify freshly.
    stale_ids = [
        aid
        for aid, existing in in_memory_alerts.items()
        if existing.astronaut_id == astronaut_id and existing.alert_type not in active_types
    ]
    for aid in stale_ids:
        in_memory_alerts.pop(aid, None)

    for alert in new_alerts:
        # Update existing ongoing episode (preserving seen state unless escalated to CRITICAL).
        existing = next(
            (
                a for a in in_memory_alerts.values()
                if a.astronaut_id == alert.astronaut_id and a.alert_type == alert.alert_type
            ),
            None,
        )
        if existing is not None:
            if existing.severity != "CRITICAL" and alert.severity == "CRITICAL":
                existing.acknowledged = False
            existing.severity = alert.severity
            existing.message = alert.message
            existing.timestamp = alert.timestamp
            existing.trigger_metric = alert.trigger_metric
            existing.recommended_action = alert.recommended_action
            existing.hazard_domain = alert.hazard_domain
        else:
            in_memory_alerts[alert.id] = alert

    supabase = get_supabase()
    now_mono = time.monotonic()
    last_write = _last_db_write.get(astronaut_id, 0.0)
    # Throttle persistent telemetry inserts to prevent DB bloat during 1.2s polling
    if supabase and (anomaly != "NONE" or (now_mono - last_write) >= settings.TELEMETRY_LOG_INTERVAL_SECONDS):
        ok, _ = insert_with_fallback(
            supabase,
            "telemetry_logs",
            _to_db_row(vitals),
            base_keys=TELEMETRY_BASE_KEYS,
        )
        if ok:
            _last_db_write[astronaut_id] = now_mono

    if supabase:
        managed_alerts = [a for a in in_memory_alerts.values() if a.astronaut_id == astronaut_id]
        adopted_ids = sync_astronaut_alerts_in_db(supabase, astronaut_id, managed_alerts)
        for mem_id, db_id in adopted_ids.items():
            mem_alert = in_memory_alerts.pop(mem_id, None)
            if mem_alert is not None:
                mem_alert.id = db_id
                in_memory_alerts[db_id] = mem_alert

    return vitals


@router.get("/history", response_model=List[VitalSigns])
async def get_telemetry_history(
    astronaut_id: str = Query("ASTRO-01", description="Astronaut ID"),
    limit: int = Query(50, ge=1, le=200),
):
    supabase = get_supabase()
    if supabase:
        try:
            res = (
                supabase.table("telemetry_logs")
                .select("*")
                .eq("astronaut_id", astronaut_id)
                .order("timestamp", desc=True)
                .limit(limit)
                .execute()
            )
            if res.data and len(res.data) > 0:
                return [
                    VitalSigns(
                        **{
                            **{k: v for k, v in item.items() if k in VitalSigns.model_fields},
                            "ecg_samples": item.get("ecg_samples") or [],
                            "telemetry_source": item.get("telemetry_source") or "simulated",
                        }
                    )
                    for item in reversed(res.data)
                ]
        except Exception:
            pass

    buffer = telemetry_history_buffer.get(astronaut_id, deque())
    return list(buffer)[-limit:]


@router.post("/sync-batch")
async def sync_offline_batch(batch: TelemetryBatchSync):
    """Receives batch of vital sign records recorded offline by the PWA during Loss of Signal (LOS)."""
    count = len(batch.records)
    supabase = get_supabase()

    if batch.astronaut_id not in telemetry_history_buffer:
        telemetry_history_buffer[batch.astronaut_id] = deque(maxlen=200)
    for rec in batch.records:
        telemetry_history_buffer[batch.astronaut_id].append(rec)

    persisted = False
    if supabase and count > 0:
        persisted = insert_batch_with_fallback(
            supabase,
            "telemetry_logs",
            [_to_db_row(rec) for rec in batch.records],
            base_keys=TELEMETRY_BASE_KEYS,
        )

    return {
        "status": "SUCCESS",
        "astronaut_id": batch.astronaut_id,
        "synced_count": count,
        "persisted": persisted,
        "message": f"Successfully synchronized {count} offline records with Mission Control.",
    }
