from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CheckInSyncRequest(BaseModel):
    client_id: str
    astronaut_id: str
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    mood: Optional[int] = None
    energy: Optional[int] = None
    stress: Optional[int] = None
    sleep_hours: Optional[float] = None
    pain_level: Optional[int] = None
    blood_glucose_mg_dl: Optional[float] = None
    hydration_ml: Optional[int] = None
    nutrition_quality: Optional[str] = None
    immune_symptoms: List[str] = []
    metrics: Dict[str, Any] = {}


class ImagingAssessmentSyncRequest(BaseModel):
    client_id: str
    astronaut_id: str
    exam_type: str
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    severity: str = "nominal"
    findings: str
    recommended_actions: List[str] = []
    ground_consult_required: bool = False
    analysis_source: str = "protocol-offline"
    thumbnail_data_url: Optional[str] = None
