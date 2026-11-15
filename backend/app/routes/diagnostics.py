from fastapi import APIRouter

from backend.app.core.supabase_client import get_supabase
from backend.app.routes.telemetry import telemetry_history_buffer
from backend.app.schemas.assistant import AssistantContextPayload
from backend.app.schemas.diagnostic import (
    DiagnosticRequest,
    DiagnosticResult,
    ImageAssessmentRequest,
    ImageAssessmentResponse,
)
from backend.app.schemas.telemetry import VitalSigns
from backend.app.services.analyzer import analyzer
from backend.app.services.assistant_service import analyze_medical_image
from backend.app.services.simulator import simulator

router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])

@router.post("/analyze", response_model=DiagnosticResult)
async def run_diagnostic(req: DiagnosticRequest):
    buffer = telemetry_history_buffer.get(req.astronaut_id, [])
    recent_vitals = list(buffer)

    # Hydrate stateless cold-start requests from Supabase or on-demand simulation.
    if not recent_vitals:
        supabase = get_supabase()
        if supabase:
            try:
                res = (
                    supabase.table("telemetry_logs")
                    .select("*")
                    .eq("astronaut_id", req.astronaut_id)
                    .order("timestamp", desc=True)
                    .limit(15)
                    .execute()
                )
                for row in reversed(res.data or []):
                    recent_vitals.append(VitalSigns(**{k: v for k, v in row.items() if k in VitalSigns.model_fields}))
            except Exception:
                pass

    if not recent_vitals or (req.anomaly and req.anomaly != "NONE") or req.eva_active is not None or req.solar_storm != "LIVE_DONKI":
        simulated_sample = simulator.generate_vitals(
            astronaut_id=req.astronaut_id,
            mission_zone=req.mission_zone,
            mission_day=req.mission_day,
            eva_active=bool(req.eva_active) if req.eva_active is not None else False,
            shielding=req.shielding,
            solar_storm=req.solar_storm,
            anomaly_mode=req.anomaly,
        )
        recent_vitals = recent_vitals[-14:] + [simulated_sample]

    effective_kp = simulator.resolve_effective_kp(req.solar_storm)
    return analyzer.run_comprehensive_diagnostic(
        req.astronaut_id,
        recent_vitals,
        kp_index=effective_kp,
        mission_zone=req.mission_zone,
        mission_day=req.mission_day,
    )


@router.post("/analyze-image", response_model=ImageAssessmentResponse)
async def analyze_self_exam_image(req: ImageAssessmentRequest):
    ctx = AssistantContextPayload(
        astronaut_id=req.astronaut_id,
        mission_zone=req.mission_zone,
        mission_day=req.mission_day,
        blood_glucose=req.blood_glucose,
        radiation_rate=req.radiation_rate,
        kp_index=req.kp_index if req.kp_index is not None else simulator.active_kp,
        heart_rate=req.heart_rate,
        spo2=req.spo2,
    )
    return await analyze_medical_image(
        exam_type=req.exam_type,
        image_base64=req.image_base64,
        mime_type=req.mime_type,
        notes=req.notes,
        ctx=ctx,
    )

