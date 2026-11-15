from typing import Any, Dict, Iterable, List, Optional, Tuple


ALERT_BASE_KEYS = {
    "id",
    "astronaut_id",
    "alert_type",
    "severity",
    "message",
    "acknowledged",
    "timestamp",
}

TELEMETRY_BASE_KEYS = {
    "astronaut_id",
    "timestamp",
    "heart_rate",
    "spo2",
    "core_temp",
    "radiation_rate",
    "hrv",
    "systolic_bp",
    "diastolic_bp",
    "respiration_rate",
    "battery_level",
    "telemetry_source",
    "orbital_phase",
    "calibration_basis",
    "is_synced",
}


def _is_missing_column_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "pgrst204" in msg or "column" in msg or "schema cache" in msg or "does not exist" in msg


def insert_with_fallback(
    supabase: Any,
    table_name: str,
    row: Dict[str, Any],
    base_keys: Optional[Iterable[str]] = None,
    upsert_conflict: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    if not supabase:
        return False, "supabase_unconfigured"

    def _exec(payload: Dict[str, Any]) -> None:
        query = supabase.table(table_name)
        if upsert_conflict:
            query.upsert(payload, on_conflict=upsert_conflict).execute()
        else:
            query.insert(payload).execute()

    try:
        _exec(row)
        return True, None
    except Exception as exc:
        if base_keys and _is_missing_column_error(exc):
            # Fall back to base columns when running against an older database schema.
            trimmed = {k: v for k, v in row.items() if k in base_keys}
            try:
                _exec(trimmed)
                return True, "schema_fallback"
            except Exception as inner:
                return False, str(inner)
        return False, str(exc)


def insert_batch_with_fallback(
    supabase: Any,
    table_name: str,
    rows: List[Dict[str, Any]],
    base_keys: Optional[Iterable[str]] = None,
) -> bool:
    if not supabase or not rows:
        return False
    try:
        supabase.table(table_name).insert(rows).execute()
        return True
    except Exception as exc:
        if base_keys and _is_missing_column_error(exc):
            trimmed = [{k: v for k, v in row.items() if k in base_keys} for row in rows]
            try:
                supabase.table(table_name).insert(trimmed).execute()
                return True
            except Exception:
                return False
        return False


def persist_alerts_to_db(supabase: Any, alerts: List[Dict[str, Any]]) -> int:
    if not supabase or not alerts:
        return 0
    existing_types = set()
    astronaut_ids = {a.get("astronaut_id") for a in alerts if a.get("astronaut_id")}
    try:
        res = (
            supabase.table("alerts")
            .select("astronaut_id,alert_type,acknowledged")
            .in_("astronaut_id", list(astronaut_ids))
            .eq("acknowledged", False)
            .execute()
        )
        for row in res.data or []:
            existing_types.add((row.get("astronaut_id"), row.get("alert_type")))
    except Exception:
        pass

    persisted = 0
    for alert in alerts:
        key = (alert.get("astronaut_id"), alert.get("alert_type"))
        if key in existing_types:
            continue
        existing_types.add(key)
        db_row = {
            "id": alert.get("id"),
            "astronaut_id": alert.get("astronaut_id"),
            "alert_type": alert.get("alert_type"),
            "severity": alert.get("severity"),
            "message": alert.get("message"),
            "acknowledged": bool(alert.get("acknowledged", False)),
            "timestamp": alert.get("timestamp"),
            "trigger_metric": alert.get("trigger_metric"),
            "recommended_action": alert.get("recommended_action"),
            "hazard_domain": alert.get("hazard_domain"),
        }
        ok, _ = insert_with_fallback(
            supabase,
            "alerts",
            db_row,
            base_keys=ALERT_BASE_KEYS,
            upsert_conflict="id",
        )
        if ok:
            persisted += 1
    return persisted
