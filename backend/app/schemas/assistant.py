from typing import Dict, List, Optional
from pydantic import BaseModel, Field


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


class AssistantRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    context: Optional[AssistantContextPayload] = None
    history: Optional[List[Dict[str, str]]] = None


class AssistantResponse(BaseModel):
    summary: str
    actions: List[str]
    escalate_when: str
    nasa_reference: str
    source: str
    model: str
