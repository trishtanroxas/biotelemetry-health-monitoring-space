from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.core.supabase_client import get_supabase
from backend.app.schemas.alert import AlertAcknowledge, AlertItem

router = APIRouter(prefix="/alerts", tags=["Alerts"])

in_memory_alerts: Dict[str, AlertItem] = {}


def _dedupe_active_alerts(items: List[AlertItem]) -> List[AlertItem]:
    """Keep at most one active unacknowledged alert per (astronaut_id, alert_type), newest first."""
    ordered = sorted(items, key=lambda a: a.timestamp, reverse=True)
    seen_active = set()
    result: List[AlertItem] = []
    for item in ordered:
        if not item.acknowledged:
            key = (item.astronaut_id, item.alert_type)
            if key in seen_active:
                continue
            seen_active.add(key)
        result.append(item)
    return result


@router.get("", response_model=List[AlertItem])
async def get_alerts():
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("alerts").select("*").order("timestamp", desc=True).limit(40).execute()
            if res.data and len(res.data) > 0:
                return _dedupe_active_alerts([AlertItem(**item) for item in res.data])
        except Exception:
            pass
    return _dedupe_active_alerts(list(in_memory_alerts.values()))


@router.post("/ack-all")
async def acknowledge_all_alerts(astronaut_id: Optional[str] = Query(None)):
    count = 0
    for alert in in_memory_alerts.values():
        if not alert.acknowledged and (astronaut_id is None or alert.astronaut_id == astronaut_id):
            alert.acknowledged = True
            count += 1
    supabase = get_supabase()
    if supabase:
        try:
            q = supabase.table("alerts").update({"acknowledged": True}).eq("acknowledged", False)
            if astronaut_id:
                q = q.eq("astronaut_id", astronaut_id)
            q.execute()
        except Exception:
            pass
    return {"status": "ACKNOWLEDGED", "count": count}


@router.post("/{alert_id}/ack", response_model=AlertItem)
async def acknowledge_alert(alert_id: str, ack: AlertAcknowledge):
    supabase = get_supabase()
    if alert_id in in_memory_alerts:
        target = in_memory_alerts[alert_id]
        target.acknowledged = True
        for other in in_memory_alerts.values():
            if other.astronaut_id == target.astronaut_id and other.alert_type == target.alert_type:
                other.acknowledged = True
        if supabase:
            try:
                supabase.table("alerts").update({"acknowledged": True}).eq("astronaut_id", target.astronaut_id).eq("alert_type", target.alert_type).execute()
            except Exception:
                pass
        return target

    if ack.astronaut_id and ack.alert_type:
        matched: Optional[AlertItem] = None
        for other in in_memory_alerts.values():
            if other.astronaut_id == ack.astronaut_id and other.alert_type == ack.alert_type:
                other.acknowledged = True
                matched = other
        if supabase:
            try:
                supabase.table("alerts").update({"acknowledged": True}).eq("astronaut_id", ack.astronaut_id).eq("alert_type", ack.alert_type).execute()
            except Exception:
                pass
        if matched is not None:
            return matched
        # Stale alert ID from an earlier session or cleared hazard: return idempotent ack.
        return AlertItem(
            id=alert_id,
            astronaut_id=ack.astronaut_id,
            alert_type=ack.alert_type,
            severity="INFO",
            message="Alert already cleared or acknowledged.",
            acknowledged=True,
        )

    if supabase:
        try:
            res = supabase.table("alerts").update({"acknowledged": True}).eq("id", alert_id).execute()
            if res.data:
                return AlertItem(**res.data[0])
        except Exception:
            pass

    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")


@router.delete("/clear")
async def clear_all_alerts():
    in_memory_alerts.clear()
    return {"status": "CLEARED"}
