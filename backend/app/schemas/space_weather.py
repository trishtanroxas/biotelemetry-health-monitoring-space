from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SpaceWeatherEvent(BaseModel):
    event_id: str
    event_type: str
    event_time: datetime
    severity: str = "QUIET"
    summary: str
    kp_index: Optional[float] = None
    flare_class: Optional[str] = None
    source_location: Optional[str] = None
    active_region_num: Optional[int] = None
    cme_speed_kms: Optional[float] = None
    cme_half_angle: Optional[float] = None
    cme_longitude: Optional[float] = None
    cme_latitude: Optional[float] = None
    earth_impact_eta: Optional[datetime] = None
    source_url: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class SpaceWeatherSnapshot(BaseModel):
    kp_current: float = 0.0
    storm_level: str = "G0_QUIET"
    radiation_storm: str = "S0_NONE"
    latest_flare_class: Optional[str] = None
    latest_flare_location: Optional[str] = None
    latest_flare_time: Optional[datetime] = None
    active_sep: bool = False
    earth_impact_eta: Optional[datetime] = None
    summary: str
    source_mode: str = "historical_fallback"
    fetched_at: datetime
    events: List[SpaceWeatherEvent] = Field(default_factory=list)
    historical_priors: Dict[str, Any] = Field(default_factory=dict)


class IssTrackPoint(BaseModel):
    latitude: float
    longitude: float
    altitude_km: float
    velocity_kms: float = 7.66
    visibility: str = "daylight"
    orbital_phase: str = "daylight"
    coord_source: str = "nasa_orbital_profile"
    timestamp: datetime


class IssPredictedPoint(BaseModel):
    latitude: float
    longitude: float
    offset_minutes: int


class IssLiveFeed(BaseModel):
    current: IssTrackPoint
    recent_track: List[IssTrackPoint] = Field(default_factory=list)
    predicted_track: List[IssPredictedPoint] = Field(default_factory=list)
