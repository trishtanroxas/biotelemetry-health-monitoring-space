from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.core.config import settings


class SuggestedAction(BaseModel):
    label: str
    target_page: str
    target_exam: Optional[str] = None
    protocol_id: Optional[str] = None


class AssistantContextPayload(BaseModel):
    astronaut_id: str = "ASTRO-01"
    mission_zone: Optional[str] = None
    mission_day: Optional[int] = None
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    core_temp: Optional[float] = None
    blood_glucose: Optional[float] = None
    radiation_rate: Optional[float] = None
    kp_index: Optional[float] = None
    mood: Optional[int] = None
    energy: Optional[int] = None
    stress: Optional[int] = None
    sleep_hours: Optional[float] = None
    pain_level: Optional[int] = None
    hydration_ml: Optional[int] = None
    nutrition_quality: Optional[str] = None
    focus_organ: Optional[str] = None
    comms_latency_sec: Optional[float] = None
    readiness_score: Optional[int] = None
    compliance_pct: Optional[int] = None
    pending_protocols: List[str] = Field(default_factory=list)
    active_alerts: List[Dict[str, str]] = Field(default_factory=list)
    recent_exams: List[Dict[str, Any]] = Field(default_factory=list)
    seven_day_summary: Optional[Dict[str, Any]] = None


class AssistantRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    context: Optional[AssistantContextPayload] = None
    history: Optional[List[Dict[str, str]]] = None
    mode: str = "chat"


class AssistantResponse(BaseModel):
    summary: str
    actions: List[str]
    escalate_when: str
    nasa_reference: str
    source: str
    model: str
    suggested_actions: List[SuggestedAction] = Field(default_factory=list)
    sbar_text: Optional[str] = None


class AssistantTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1500)
    voice: str = Field(default=settings.EDGE_TTS_VOICE, min_length=1, max_length=64)


class AudioTranscribeRequest(BaseModel):
    audio_base64: str = Field(..., min_length=16, max_length=2_800_000)
    mime_type: str = Field(default="audio/webm", min_length=5, max_length=64)


class AudioTranscribeResponse(BaseModel):
    transcript: str
    source: str
    model: str
