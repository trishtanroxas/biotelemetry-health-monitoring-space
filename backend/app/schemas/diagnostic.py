from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class DiagnosticRequest(BaseModel):
    astronaut_id: str
    duration_seconds: int = Field(60, ge=10, le=3600)
    include_ecg_fft: bool = True
    mission_zone: str = "LEO_ISS"
    mission_day: int = Field(14, ge=1, le=1000)
    eva_active: Optional[bool] = None
    shielding: str = "NOMINAL"
    solar_storm: str = "LIVE_DONKI"
    anomaly: str = "NONE"

class DiagnosticResult(BaseModel):
    astronaut_id: str
    overall_health_score: float = Field(..., ge=0.0, le=100.0) # 0 to 100
    cardiovascular_status: str  # NOMINAL | COMPROMISED | CRITICAL
    hypoxia_risk: str           # LOW | MODERATE | SEVERE
    radiation_risk: str         # SAFE | ELEVATED | DANGEROUS
    recommendations: List[str]
    metrics_summary: Dict[str, Any]
    environment_risks: List[Dict[str, Any]] = Field(default_factory=list)


class ImageAssessmentRequest(BaseModel):
    astronaut_id: str = "ASTRO-01"
    exam_type: str = "ocular_ultrasound"
    image_base64: Optional[str] = None
    mime_type: Optional[str] = "image/jpeg"
    notes: Optional[str] = None
    mission_zone: Optional[str] = None
    mission_day: Optional[int] = None
    blood_glucose: Optional[float] = None
    radiation_rate: Optional[float] = None
    kp_index: Optional[float] = None
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None


class ImageAssessmentResponse(BaseModel):
    exam_type: str
    severity: str
    findings: str
    recommended_actions: List[str]
    ground_consult_required: bool
    analysis_source: str
    image_quality: str

