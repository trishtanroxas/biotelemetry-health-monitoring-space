from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

class AlertItem(BaseModel):
    id: str
    astronaut_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    severity: str = Field(..., example="CRITICAL")  # INFO | WARNING | CRITICAL
    alert_type: str = Field(..., example="HYPOXIA")
    message: str
    acknowledged: bool = False
    trigger_metric: Optional[str] = None
    recommended_action: Optional[str] = None
    hazard_domain: Optional[str] = None

class AlertAcknowledge(BaseModel):
    acknowledged_by: Optional[str] = "FLIGHT_SURGEON"
    astronaut_id: Optional[str] = None
    alert_type: Optional[str] = None

