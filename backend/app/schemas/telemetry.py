from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class ECGPoint(BaseModel):
    time_offset_ms: int
    voltage_mv: float


class VitalSigns(BaseModel):
    astronaut_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    heart_rate: float = Field(..., ge=20.0, le=250.0, description="Beats per minute")
    spo2: float = Field(..., ge=50.0, le=100.0, description="Blood oxygen percentage")
    core_temp: float = Field(..., ge=30.0, le=45.0, description="Degrees Celsius")
    radiation_rate: float = Field(..., ge=0.0, description="Micro-Sieverts per hour (uSv/h)")
    hrv: float = Field(..., ge=0.0, description="Heart Rate Variability in ms")
    systolic_bp: Optional[float] = Field(120.0, description="Systolic Blood Pressure (mmHg)")
    diastolic_bp: Optional[float] = Field(80.0, description="Diastolic Blood Pressure (mmHg)")
    respiration_rate: Optional[float] = Field(14.0, description="Breaths per minute")
    battery_level: Optional[float] = Field(98.0, description="Suit telemetry unit battery percentage")
    ecg_samples: Optional[List[float]] = Field(default_factory=list, description="Instantaneous ECG voltage window (mV)")
    telemetry_source: str = Field("simulated", description="measured | simulated | manual")
    ecg_sample_rate_hz: int = Field(100, ge=25, le=500, description="ECG sample frequency in Hz")
    orbital_phase: Optional[str] = Field(None, description="daylight | eclipsed | saa_transit | high_latitude")
    calibration_basis: Optional[str] = Field(None, description="NASA dataset baseline identifier")
    iss_latitude: Optional[float] = Field(None, description="ISS sub-satellite latitude (deg)")
    iss_longitude: Optional[float] = Field(None, description="ISS sub-satellite longitude (deg)")
    iss_altitude_km: Optional[float] = Field(None, description="ISS orbital altitude (km)")
    iss_coord_source: Optional[str] = Field(None, description="live_iss | nasa_orbital_profile")
    iss_velocity_kms: Optional[float] = Field(None, description="ISS orbital speed (km/s)")
    mission_zone: Optional[str] = Field(None, description="Active simulation destination zone")
    mission_day: Optional[int] = Field(None, ge=1, le=1000, description="Simulated mission elapsed day")
    distance_km: Optional[float] = Field(None, ge=0.0, description="Simulated distance from Earth (km)")
    comms_latency_sec: Optional[float] = Field(None, ge=0.0, description="One-way signal latency to Earth (s)")
    gravity_g: Optional[float] = Field(None, ge=0.0, description="Simulated gravity field (g)")
    shielding_mode: Optional[str] = Field(None, description="NOMINAL | STORM_SHELTER | UNSHIELDED_EVA")
    cumulative_dose_msv: Optional[float] = Field(None, ge=0.0, description="Simulated cumulative mission dose (mSv)")
    overall_health_score: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated overall health index")
    health_status: Optional[str] = Field(None, description="NOMINAL | STRAINED | COMPROMISED | CRITICAL")
    blood_glucose: Optional[float] = Field(92.0, ge=20.0, le=600.0, description="Capillary blood glucose (mg/dL)")
    wbc_k_ul: Optional[float] = Field(6.1, ge=0.5, le=50.0, description="Estimated white blood cell reference (K/uL)")
    hydration_pct: Optional[float] = Field(96.0, ge=40.0, le=100.0, description="Estimated hydration balance (%)")


class TelemetryBatchSync(BaseModel):
    astronaut_id: str
    client_synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    records: List[VitalSigns]
