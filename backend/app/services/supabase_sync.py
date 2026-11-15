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


def _update_alert_row_with_fallback(supabase: Any, row_id: str, patch: Dict[str, Any]) -> bool:
    try:
        supabase.table("alerts").update(patch).eq("id", row_id).execute()
        return True
    except Exception as exc:
        if _is_missing_column_error(exc):
            trimmed = {k: v for k, v in patch.items() if k in ALERT_BASE_KEYS}
            try:
                supabase.table("alerts").update(trimmed).eq("id", row_id).execute()
                return True
            except Exception:
                return False
        return False


def sync_astronaut_alerts_in_db(
    supabase: Any,
    astronaut_id: str,
    evaluated_alerts: List[Any],
) -> Dict[str, str]:
    """Reconcile open DB alerts with the latest telemetry evaluation and return memory->DB episode IDs."""
    if not supabase:
        return {}

    open_rows: List[Dict[str, Any]] = []
    for cols in (
        "id,alert_type,severity,trigger_metric,message,acknowledged,timestamp",
        "id,alert_type,severity,message,acknowledged,timestamp",
    ):
        try:
            res = (
                supabase.table("alerts")
                .select(cols)
                .eq("astronaut_id", astronaut_id)
                .eq("acknowledged", False)
                .order("timestamp", desc=True)
                .execute()
            )
            open_rows = res.data or []
            break
        except Exception as exc:
            if not _is_missing_column_error(exc):
                return {}

    active_types = {a.alert_type for a in evaluated_alerts}
    stale_ids: List[str] = []
    open_by_type: Dict[str, Dict[str, Any]] = {}
    for row in open_rows:
        row_id = row.get("id")
        row_type = row.get("alert_type")
        if not row_id or row_type not in active_types or row_type in open_by_type:
            if row_id:
                stale_ids.append(row_id)
            continue
        open_by_type[row_type] = row

    adopted_ids: Dict[str, str] = {}
    for alert in evaluated_alerts:
        row_id_existing = open_by_type.get(alert.alert_type, {}).get("id")
        if alert.acknowledged:
            if row_id_existing:
                stale_ids.append(row_id_existing)
            continue

        open_row = open_by_type.get(alert.alert_type)
        if open_row and open_row.get("id"):
            db_id = open_row["id"]
            if db_id != alert.id:
                adopted_ids[alert.id] = db_id
            changed = (
                open_row.get("severity") != alert.severity
                or open_row.get("trigger_metric") != alert.trigger_metric
                or open_row.get("message") != alert.message
            )
            if changed:
                _update_alert_row_with_fallback(
                    supabase,
                    db_id,
                    {
                        "acknowledged": False,
                        "severity": alert.severity,
                        "message": alert.message,
                        "timestamp": alert.timestamp.isoformat(),
                        "trigger_metric": alert.trigger_metric,
                        "recommended_action": alert.recommended_action,
                        "hazard_domain": alert.hazard_domain,
                    },
                )
        else:
            payload = alert.model_dump()
            payload["timestamp"] = alert.timestamp.isoformat()
            insert_with_fallback(
                supabase,
                "alerts",
                payload,
                base_keys=ALERT_BASE_KEYS,
                upsert_conflict="id",
            )

    if stale_ids:
        try:
            supabase.table("alerts").update({"acknowledged": True}).in_("id", stale_ids).execute()
        except Exception:
            pass

    return adopted_ids
