from fastapi import APIRouter

from backend.app.core.supabase_client import get_supabase
from backend.app.schemas.wellness import CheckInSyncRequest, ImagingAssessmentSyncRequest
from backend.app.services.supabase_sync import insert_with_fallback

router = APIRouter()


@router.post("/checkins")
async def sync_checkin(req: CheckInSyncRequest):
    supabase = get_supabase()
    row = {
        "client_id": req.client_id,
        "astronaut_id": req.astronaut_id,
        "recorded_at": req.recorded_at.isoformat(),
        "mood": req.mood,
        "energy": req.energy,
        "stress": req.stress,
        "sleep_hours": req.sleep_hours,
        "pain_level": req.pain_level,
        "blood_glucose_mg_dl": req.blood_glucose_mg_dl,
        "hydration_ml": req.hydration_ml,
        "nutrition_quality": req.nutrition_quality,
        "immune_symptoms": req.immune_symptoms,
        "metrics": req.metrics,
    }
    ok, reason = insert_with_fallback(supabase, "crew_checkins", row, upsert_conflict="client_id")
    return {"persisted": ok, "reason": reason, "client_id": req.client_id}


@router.get("/checkins/{astronaut_id}")
async def list_checkins(astronaut_id: str, limit: int = 60):
    supabase = get_supabase()
    if not supabase:
        return {"records": []}
    try:
        res = (
            supabase.table("crew_checkins")
            .select("*")
            .eq("astronaut_id", astronaut_id)
            .order("recorded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"records": res.data or []}
    except Exception:
        return {"records": []}


@router.post("/assessments")
async def sync_imaging_assessment(req: ImagingAssessmentSyncRequest):
    supabase = get_supabase()
    row = {
        "client_id": req.client_id,
        "astronaut_id": req.astronaut_id,
        "exam_type": req.exam_type,
        "recorded_at": req.recorded_at.isoformat(),
        "severity": req.severity,
        "findings": req.findings,
        "recommended_actions": req.recommended_actions,
        "ground_consult_required": req.ground_consult_required,
        "analysis_source": req.analysis_source,
        "thumbnail_data_url": req.thumbnail_data_url,
    }
    ok, reason = insert_with_fallback(supabase, "imaging_assessments", row, upsert_conflict="client_id")
    return {"persisted": ok, "reason": reason, "client_id": req.client_id}


@router.get("/assessments/{astronaut_id}")
async def list_imaging_assessments(astronaut_id: str, limit: int = 40):
    supabase = get_supabase()
    if not supabase:
        return {"records": []}
    try:
        res = (
            supabase.table("imaging_assessments")
            .select("*")
            .eq("astronaut_id", astronaut_id)
            .order("recorded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"records": res.data or []}
    except Exception:
        return {"records": []}
