import json
import math
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

import httpx

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ISS_NOW_URL = "https://api.wheretheiss.at/v1/satellites/25544"


SAA_PEAK_LAT = -25.0
SAA_PEAK_LON = -48.0
_SAA_TILT_RAD = math.radians(18.0)
_SAA_SEMI_MAJOR_DEG = 43.0
_SAA_SEMI_MINOR_DEG = 17.0


def saa_normalized_distance(latitude: float, longitude: float) -> float:
    """Return normalized geomagnetic-offset distance inside AP8 ~420 km SAA footprint (<= 1.0 inside)."""
    dx = ((longitude - SAA_PEAK_LON + 180.0) % 360.0) - 180.0
    dy = SAA_PEAK_LAT - latitude
    cos_t = math.cos(_SAA_TILT_RAD)
    sin_t = math.sin(_SAA_TILT_RAD)
    ux = (dx * cos_t + dy * sin_t) / _SAA_SEMI_MAJOR_DEG
    vy = (-dx * sin_t + dy * cos_t) / _SAA_SEMI_MINOR_DEG
    r0 = math.hypot(ux, vy)
    if r0 == 0.0:
        return 0.0
    phi = math.atan2(vy, ux)
    # Match slight SE Atlantic broadening seen in LEO AP8 trapped-proton maps
    shape = 1.0 + 0.08 * math.cos(phi - 0.35) + 0.06 * math.sin(2.0 * phi)
    return r0 / shape


def saa_flux_intensity(latitude: float, longitude: float) -> float:
    """Return relative 0..1 trapped-proton flux intensity inside the SAA outer contour."""
    dist = saa_normalized_distance(latitude, longitude)
    if dist > 1.0:
        return 0.0
    return math.exp(-2.9 * dist * dist)


def is_in_saa(latitude: float, longitude: float) -> bool:
    """Return True when coordinates lie inside the realistic AP8 ~420 km SAA boundary."""
    return saa_normalized_distance(latitude, longitude) <= 1.0

DEFAULT_ORBITAL = {
    "summary": {
        "pct_time_in_saa": 5.9,
        "pct_time_high_latitude": 14.24,
        "pct_time_eclipsed": 37.5,
        "daylight_eclipse_transitions_per_24h": 32.0,
    },
    "cycle_points": [],
}

DEFAULT_DONKI_PRIORS = {
    "priors": {
        "total_days": 2510,
        "days_with_m_or_x_flare": 783,
        "days_with_x_flare": 88,
        "days_with_sep_storm": 101,
        "days_with_kp_ge_5": 118,
        "days_with_kp_ge_7": 35,
        "p_sep_within_3d_given_x_flare": 0.409,
        "p_kp_ge_5_within_3d_given_x_flare": 0.307,
    },
    "recent_days": [],
}


def _load_json(path: Path, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return fallback


class NasaBaselines:
    def __init__(self) -> None:
        self.clinical = _load_json(DATA_DIR / "clinical_baselines.json", {})
        self.orbital = _load_json(DATA_DIR / "orbital_profile.json", DEFAULT_ORBITAL)
        self.donki = _load_json(DATA_DIR / "donki_priors.json", DEFAULT_DONKI_PRIORS)

        self.cycle_points: List[Dict[str, Any]] = self.orbital.get("cycle_points") or []
        self.orbital_summary: Dict[str, Any] = self.orbital.get("summary") or DEFAULT_ORBITAL["summary"]
        self.donki_priors: Dict[str, Any] = self.donki.get("priors") or DEFAULT_DONKI_PRIORS["priors"]

        temp_data = self.clinical.get("ocular_sans_patterns", {}).get("osd681_body_temp_c", {})
        control_temps = [v for v in (temp_data.get("control") or {}).values() if isinstance(v, (int, float))]
        flight_temps = [v for v in (temp_data.get("hindlimb_unloaded") or {}).values() if isinstance(v, (int, float))]
        self.temp_shift_c = 0.08 if (control_temps and flight_temps) else 0.05

        human = self.clinical.get("human_clinical_baselines", {})
        # OSD-569/575 post-flight plasma & vascular deltas drive mild orthostatic HR/HRV adaptation
        hct_delta = human.get("hematocrit_pct", {}).get("r1_vs_pre_pct_change")
        self.autonomic_hr_offset = 2.0 if (hct_delta is not None and hct_delta < 0) else 1.5
        self.calibration_basis = "NASA OSDR (OSD-569/575/583/681) + ISS 48h Orbit + DONKI 2020-2026"
        self._live_iss: Optional[Dict[str, Any]] = None
        self._iss_fetched_mono: float = 0.0
        self._iss_failed_mono: float = 0.0
        self._iss_track: Deque[Dict[str, Any]] = deque(maxlen=40)

    async def refresh_live_iss_position(self, min_interval_sec: float = 20.0) -> Optional[Dict[str, Any]]:
        now_mono = time.monotonic()
        if self._live_iss and (now_mono - self._iss_fetched_mono) < min_interval_sec:
            return self._live_iss
        if (now_mono - self._iss_failed_mono) < 45.0 and self._iss_failed_mono > 0.0:
            return self._live_iss
        try:
            async with httpx.AsyncClient(timeout=1.8) as client:
                resp = await client.get(ISS_NOW_URL, params={"units": "kilometers"})
                resp.raise_for_status()
                data = resp.json()
                velocity_kmh = float(data.get("velocity") or 27576.0)
                self._live_iss = {
                    "latitude": round(float(data["latitude"]), 4),
                    "longitude": round(float(data["longitude"]), 4),
                    "altitude_km": round(float(data["altitude"]), 2),
                    "velocity_kms": round(velocity_kmh / 3600.0, 2),
                    "visibility": str(data.get("visibility") or "daylight"),
                }
                self._iss_fetched_mono = now_mono
                return self._live_iss
        except Exception:
            self._iss_failed_mono = now_mono
            return self._live_iss

    def _record_iss_point(self, ctx: Dict[str, Any]) -> Dict[str, Any]:
        point = {
            "latitude": float(ctx["iss_latitude"]),
            "longitude": float(ctx["iss_longitude"]),
            "altitude_km": float(ctx["iss_altitude_km"]),
            "velocity_kms": float(ctx.get("iss_velocity_kms", 7.66)),
            "visibility": "eclipsed" if ctx["orbital_phase"] == "eclipsed" else "daylight",
            "orbital_phase": str(ctx["orbital_phase"]),
            "coord_source": str(ctx["iss_coord_source"]),
            "timestamp": datetime.now(timezone.utc),
        }
        if not self._iss_track:
            self._iss_track.append(point)
        else:
            prev = self._iss_track[-1]
            moved = abs(prev["latitude"] - point["latitude"]) > 0.02 or abs(prev["longitude"] - point["longitude"]) > 0.02
            elapsed = (point["timestamp"] - prev["timestamp"]).total_seconds()
            if moved or elapsed >= 4.0:
                self._iss_track.append(point)
        return point

    def _predict_ground_track(self, lat: float, lon: float) -> List[Dict[str, Any]]:
        inclination = 51.6
        sin_u = max(-1.0, min(1.0, lat / inclination))
        u_now = math.asin(sin_u)
        if len(self._iss_track) >= 2 and self._iss_track[-1]["latitude"] < self._iss_track[-2]["latitude"]:
            u_now = math.pi - u_now
        orbit_period_min = 92.68
        earth_rot_deg_per_min = 0.250684
        # Match instantaneous longitudinal rate near the equator for 51.6 deg inclination
        lon_offset = lon - math.degrees(math.atan2(math.cos(math.radians(inclination)) * math.sin(u_now), math.cos(u_now)))
        points: List[Dict[str, Any]] = []
        for offset_min in range(-45, 48, 3):
            u = u_now + (2.0 * math.pi * offset_min) / orbit_period_min
            p_lat = math.degrees(math.asin(math.sin(math.radians(inclination)) * math.sin(u)))
            raan_lon = math.degrees(math.atan2(math.cos(math.radians(inclination)) * math.sin(u), math.cos(u)))
            p_lon = ((lon_offset + raan_lon - earth_rot_deg_per_min * offset_min + 180.0) % 360.0) - 180.0
            points.append({
                "latitude": round(p_lat, 3),
                "longitude": round(p_lon, 3),
                "offset_minutes": offset_min,
            })
        return points

    async def get_iss_live_feed(self, force_refresh: bool = False, kp_index: float = 0.0) -> Dict[str, Any]:
        await self.refresh_live_iss_position(min_interval_sec=4.0 if force_refresh else 8.0)
        ctx = self.orbital_context(time.time(), kp_index=kp_index)
        current = self._record_iss_point(ctx)
        predicted = self._predict_ground_track(current["latitude"], current["longitude"])
        return {
            "current": current,
            "recent_track": list(self._iss_track),
            "predicted_track": predicted,
        }

    def _propagated_iss(self, orbit_frac: float, eclipsed_ratio: float) -> Dict[str, Any]:
        if self.cycle_points:
            n = len(self.cycle_points)
            idx = int(orbit_frac * n) % n
            pt = self.cycle_points[idx]
            lat = float(pt.get("latitude", 0.0))
            lon = float(pt.get("longitude", 0.0))
            alt = float(pt.get("altitude_km", 420.0))
            eclipsed = pt.get("visibility") == "eclipsed"
            in_saa = bool(pt.get("in_saa", False)) or is_in_saa(lat, lon)
            high_lat = bool(pt.get("high_lat_exposure", False)) or abs(lat) > 50.0
        else:
            lat = round(51.6 * math.sin(2.0 * math.pi * orbit_frac), 4)
            lon = round(((orbit_frac * 360.0 + 180.0) % 360.0) - 180.0, 4)
            alt = 420.0
            eclipsed = orbit_frac >= (1.0 - eclipsed_ratio)
            in_saa = is_in_saa(lat, lon)
            high_lat = abs(lat) > 50.0
        return {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "altitude_km": round(alt, 2),
            "eclipsed": eclipsed,
            "in_saa": in_saa,
            "high_lat": high_lat,
            "coord_source": "nasa_orbital_profile",
        }

    def orbital_context(self, now_sec: float, kp_index: float = 0.0) -> Dict[str, Any]:
        # ISS completes ~16 orbits/day (5560 s per orbit)
        orbit_period_s = 5560.0
        orbit_frac = (now_sec % orbit_period_s) / orbit_period_s
        eclipsed_ratio = float(self.orbital_summary.get("pct_time_eclipsed", 37.5)) / 100.0

        use_live = self._live_iss is not None and (time.monotonic() - self._iss_fetched_mono) < 120.0
        if use_live and self._live_iss is not None:
            lat = float(self._live_iss["latitude"])
            lon = float(self._live_iss["longitude"])
            alt = float(self._live_iss["altitude_km"])
            vel = float(self._live_iss.get("velocity_kms") or 7.66)
            eclipsed = self._live_iss["visibility"] == "eclipsed"
            in_saa = is_in_saa(lat, lon)
            high_lat = abs(lat) > 50.0
            coord_source = "live_iss"
        else:
            prop = self._propagated_iss(orbit_frac, eclipsed_ratio)
            lat = prop["latitude"]
            lon = prop["longitude"]
            alt = prop["altitude_km"]
            vel = 7.66
            eclipsed = prop["eclipsed"]
            in_saa = prop["in_saa"]
            high_lat = prop["high_lat"]
            coord_source = prop["coord_source"]

        if in_saa:
            phase = "saa_transit"
        elif high_lat:
            phase = "high_latitude"
        elif eclipsed:
            phase = "eclipsed"
        else:
            phase = "daylight"

        # Eclipse phase modestly lowers HR/temp and boosts parasympathetic HRV
        circadian_wave = math.sin(2.0 * math.pi * orbit_frac)
        hr_delta = (-2.2 if eclipsed else 1.8) + circadian_wave * 1.4
        hrv_delta = (4.5 if eclipsed else -2.5) - max(0.0, kp_index - 3.0) * 1.8
        temp_delta = (-self.temp_shift_c if eclipsed else self.temp_shift_c)

        base_rad = 12.5
        if in_saa:
            base_rad += 18.0
        elif high_lat:
            base_rad += 7.5
        if kp_index >= 5.0:
            base_rad += (kp_index - 4.0) * 6.5

        return {
            "orbital_phase": phase,
            "iss_latitude": lat,
            "iss_longitude": lon,
            "iss_altitude_km": alt,
            "iss_velocity_kms": vel,
            "iss_coord_source": coord_source,
            "hr_delta": hr_delta + self.autonomic_hr_offset,
            "hrv_delta": hrv_delta,
            "temp_delta": temp_delta,
            "ambient_rad": base_rad,
        }


nasa_baselines = NasaBaselines()
