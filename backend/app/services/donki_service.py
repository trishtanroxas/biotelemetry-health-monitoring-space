import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from backend.app.core.config import settings
from backend.app.core.supabase_client import get_supabase
from backend.app.schemas.space_weather import SpaceWeatherEvent, SpaceWeatherSnapshot
from backend.app.services.nasa_baselines import nasa_baselines
from backend.app.services.simulator import simulator

logger = logging.getLogger(__name__)

CCMC_DONKI_BASE = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get"


def _to_int(val: Any) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _to_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _parse_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _storm_level(kp: float) -> str:
    if kp >= 9.0:
        return "G5_EXTREME"
    if kp >= 8.0:
        return "G4_SEVERE"
    if kp >= 7.0:
        return "G3_STRONG"
    if kp >= 6.0:
        return "G2_MODERATE"
    if kp >= 5.0:
        return "G1_MINOR"
    return "G0_QUIET"


def _flare_severity(class_type: str) -> str:
    if not class_type:
        return "QUIET"
    letter = class_type[0].upper()
    if letter == "X":
        return "SEVERE"
    if letter == "M":
        return "MODERATE"
    if letter == "C":
        return "MINOR"
    return "QUIET"


async def _fetch_endpoint(client: httpx.AsyncClient, endpoint: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(f"{CCMC_DONKI_BASE}/{endpoint}", params=params)
        if resp.status_code != 200 or not resp.text.strip():
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("DONKI endpoint %s unavailable: %s", endpoint, exc)
        return []


def _normalize_donki_payloads(
    flr_list: List[Dict[str, Any]],
    sep_list: List[Dict[str, Any]],
    gst_list: List[Dict[str, Any]],
    cme_list: List[Dict[str, Any]],
    enlil_list: List[Dict[str, Any]],
) -> Tuple[List[SpaceWeatherEvent], Dict[str, Any]]:
    events: List[SpaceWeatherEvent] = []
    now = datetime.now(timezone.utc)

    latest_flare: Optional[Tuple[datetime, str, Optional[str]]] = None
    for item in flr_list:
        eid = item.get("flrID")
        dt = _parse_dt(item.get("peakTime") or item.get("beginTime")) or now
        ctype = item.get("classType") or ""
        loc = item.get("sourceLocation")
        if not eid:
            continue
        if latest_flare is None or dt > latest_flare[0]:
            latest_flare = (dt, ctype, loc)
        events.append(
            SpaceWeatherEvent(
                event_id=eid,
                event_type="FLR",
                event_time=dt,
                severity=_flare_severity(ctype),
                summary=f"Solar flare {ctype or 'unclassified'} near {loc or 'unknown solar region'}",
                flare_class=ctype or None,
                source_location=loc or None,
                active_region_num=_to_int(item.get("activeRegionNum")),
                source_url=item.get("link"),
            )
        )

    active_sep = False
    for item in sep_list:
        eid = item.get("sepID")
        dt = _parse_dt(item.get("eventTime")) or now
        if not eid:
            continue
        if (now - dt) <= timedelta(hours=48):
            active_sep = True
        events.append(
            SpaceWeatherEvent(
                event_id=eid,
                event_type="SEP",
                event_time=dt,
                severity="SEVERE" if (now - dt) <= timedelta(hours=48) else "MODERATE",
                summary="Solar Energetic Particle event observed by spacecraft sensors",
                source_url=item.get("link"),
            )
        )

    kp_max_recent = 0.0
    for item in gst_list:
        eid = item.get("gstID")
        if not eid:
            continue
        kp_entries = item.get("allKpIndex") or []
        best_kp = max((float(k.get("kpIndex") or 0.0) for k in kp_entries), default=0.0)
        obs_dt = _parse_dt(kp_entries[-1].get("observedTime") if kp_entries else item.get("startTime")) or now
        if (now - obs_dt) <= timedelta(hours=72):
            kp_max_recent = max(kp_max_recent, best_kp)
        events.append(
            SpaceWeatherEvent(
                event_id=eid,
                event_type="GST",
                event_time=obs_dt,
                severity="SEVERE" if best_kp >= 7 else ("MODERATE" if best_kp >= 6 else ("MINOR" if best_kp >= 5 else "QUIET")),
                summary=f"Geomagnetic storm activity (Kp {best_kp:.1f})",
                kp_index=best_kp,
                source_url=item.get("link"),
            )
        )

    for item in cme_list:
        eid = item.get("activityID")
        dt = _parse_dt(item.get("startTime")) or now
        if not eid:
            continue
        analyses = item.get("cmeAnalyses") or []
        primary = next((a for a in analyses if a.get("isMostAccurate")), analyses[0] if analyses else {})
        speed = _to_float(primary.get("speed"))
        half_angle = _to_float(primary.get("halfAngle"))
        lon = _to_float(primary.get("longitude"))
        lat = _to_float(primary.get("latitude"))
        events.append(
            SpaceWeatherEvent(
                event_id=eid,
                event_type="CME",
                event_time=dt,
                severity="MODERATE" if (speed or 0) >= 800 else "MINOR",
                summary=f"Coronal Mass Ejection ({int(speed)} km/s)" if speed else "Coronal Mass Ejection detected",
                cme_speed_kms=speed,
                cme_half_angle=half_angle,
                cme_longitude=lon,
                cme_latitude=lat,
                source_url=item.get("link"),
            )
        )

    next_earth_eta: Optional[datetime] = None
    for item in enlil_list:
        eid = item.get("simulationID")
        dt = _parse_dt(item.get("modelCompletionTime")) or now
        if not eid:
            continue
        impacts = item.get("impactList") or []
        earth_impacts = [i for i in impacts if str(i.get("location", "")).lower() == "earth"]
        eta_dt = _parse_dt(earth_impacts[0].get("arrivalTime")) if earth_impacts else None
        if eta_dt and eta_dt >= now - timedelta(hours=6):
            if next_earth_eta is None or eta_dt < next_earth_eta:
                next_earth_eta = eta_dt
        events.append(
            SpaceWeatherEvent(
                event_id=eid,
                event_type="WSA_ENLIL",
                event_time=dt,
                severity="MODERATE" if eta_dt else "QUIET",
                summary=(
                    f"WSA-ENLIL forecast: Earth shock ETA {eta_dt.strftime('%Y-%m-%d %H:%MZ')}"
                    if eta_dt
                    else "WSA-ENLIL heliospheric simulation run (no direct Earth shock)"
                ),
                earth_impact_eta=eta_dt,
                source_url=item.get("link"),
            )
        )

    events.sort(key=lambda ev: ev.event_time, reverse=True)
    events = events[:40]

    storm_level = _storm_level(kp_max_recent)
    rad_storm = "S1_ACTIVE" if active_sep else "S0_NONE"
    summary_parts = [f"Geomagnetic {storm_level.replace('_', ' ')} (Kp {kp_max_recent:.1f})"]
    if latest_flare:
        summary_parts.append(f"latest flare {latest_flare[1] or 'C-class'}")
    if active_sep:
        summary_parts.append("active SEP radiation watch")
    if next_earth_eta:
        summary_parts.append(f"WSA-ENLIL Earth ETA {next_earth_eta.strftime('%m-%d %H:%MZ')}")

    meta = {
        "kp_current": kp_max_recent,
        "storm_level": storm_level,
        "radiation_storm": rad_storm,
        "latest_flare_class": latest_flare[1] if latest_flare else None,
        "latest_flare_location": latest_flare[2] if latest_flare else None,
        "latest_flare_time": latest_flare[0] if latest_flare else None,
        "active_sep": active_sep,
        "earth_impact_eta": next_earth_eta,
        "summary": "; ".join(summary_parts),
    }
    return events, meta


class DonkiService:
    def __init__(self) -> None:
        self._cached_snapshot: Optional[SpaceWeatherSnapshot] = None
        self._cached_at_mono: float = 0.0
        self._lock = asyncio.Lock()

    def _fallback_snapshot(self, mode: str = "historical_fallback") -> SpaceWeatherSnapshot:
        recent = nasa_baselines.donki.get("recent_days") or []
        latest_day = recent[-1] if recent else {}
        kp = float(latest_day.get("max_kp_index") or 1.5)
        storm = _storm_level(kp)
        simulator.set_space_weather_kp(kp)
        return SpaceWeatherSnapshot(
            kp_current=kp,
            storm_level=storm,
            radiation_storm="S0_NONE",
            active_sep=False,
            summary=f"Historical DONKI baseline ({latest_day.get('date', '2020-2026')}): {storm.replace('_', ' ')}, Kp {kp:.1f}.",
            source_mode=mode,
            fetched_at=datetime.now(timezone.utc),
            events=[],
            historical_priors=nasa_baselines.donki_priors,
        )

    def _read_supabase_cache(self) -> Optional[SpaceWeatherSnapshot]:
        supabase = get_supabase()
        if not supabase:
            return None
        try:
            status_res = supabase.table("space_weather_status").select("*").eq("id", "current").limit(1).execute()
            events_res = supabase.table("space_weather_events").select("*").order("event_time", desc=True).limit(30).execute()
            if not status_res.data:
                return None
            row = status_res.data[0]
            if row.get("source_mode") == "historical_fallback" and not events_res.data:
                return None
            events = [SpaceWeatherEvent(**{**ev, "payload": ev.get("payload") or {}}) for ev in (events_res.data or [])]
            kp = float(row.get("kp_current") or 0.0)
            simulator.set_space_weather_kp(kp)
            return SpaceWeatherSnapshot(
                kp_current=kp,
                storm_level=row.get("storm_level") or _storm_level(kp),
                radiation_storm=row.get("radiation_storm") or "S0_NONE",
                latest_flare_class=row.get("latest_flare_class"),
                latest_flare_location=row.get("latest_flare_location"),
                latest_flare_time=_parse_dt(row.get("latest_flare_time")),
                active_sep=bool(row.get("active_sep", False)),
                earth_impact_eta=_parse_dt(row.get("earth_impact_eta")),
                summary=row.get("summary") or "Cached NASA DONKI space weather.",
                source_mode="supabase_cache",
                fetched_at=_parse_dt(row.get("fetched_at")) or datetime.now(timezone.utc),
                events=events,
                historical_priors=nasa_baselines.donki_priors,
            )
        except Exception as exc:
            logger.warning("Failed reading Supabase space weather cache: %s", str(exc)[:180])
            return None

    def _persist_to_supabase(self, snapshot: SpaceWeatherSnapshot) -> None:
        supabase = get_supabase()
        if not supabase:
            return
        try:
            if snapshot.events:
                rows = [
                    {
                        "event_id": ev.event_id,
                        "event_type": ev.event_type,
                        "event_time": ev.event_time.isoformat(),
                        "severity": ev.severity,
                        "summary": ev.summary,
                        "kp_index": ev.kp_index,
                        "flare_class": ev.flare_class,
                        "source_location": ev.source_location,
                        "active_region_num": ev.active_region_num,
                        "cme_speed_kms": ev.cme_speed_kms,
                        "cme_half_angle": ev.cme_half_angle,
                        "cme_longitude": ev.cme_longitude,
                        "cme_latitude": ev.cme_latitude,
                        "earth_impact_eta": ev.earth_impact_eta.isoformat() if ev.earth_impact_eta else None,
                        "source_url": ev.source_url,
                        "payload": ev.payload,
                        "updated_at": snapshot.fetched_at.isoformat(),
                    }
                    for ev in snapshot.events
                ]
                supabase.table("space_weather_events").upsert(rows, on_conflict="event_id").execute()

            supabase.table("space_weather_status").upsert(
                {
                    "id": "current",
                    "kp_current": snapshot.kp_current,
                    "storm_level": snapshot.storm_level,
                    "radiation_storm": snapshot.radiation_storm,
                    "latest_flare_class": snapshot.latest_flare_class,
                    "latest_flare_location": snapshot.latest_flare_location,
                    "latest_flare_time": snapshot.latest_flare_time.isoformat() if snapshot.latest_flare_time else None,
                    "active_sep": snapshot.active_sep,
                    "earth_impact_eta": snapshot.earth_impact_eta.isoformat() if snapshot.earth_impact_eta else None,
                    "summary": snapshot.summary,
                    "source_mode": snapshot.source_mode,
                    "fetched_at": snapshot.fetched_at.isoformat(),
                    "payload": {"event_count": len(snapshot.events)},
                },
                on_conflict="id",
            ).execute()
        except Exception as exc:
            logger.warning("Failed persisting space weather to Supabase: %s", str(exc)[:180])

    async def sync_from_nasa(self) -> SpaceWeatherSnapshot:
        now = datetime.now(timezone.utc)
        start_d = (now - timedelta(days=7)).date().isoformat()
        end_d = now.date().isoformat()
        params = {"startDate": start_d, "endDate": end_d}

        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
            flr_list, sep_list, gst_list, cme_list, enlil_list = await asyncio.gather(
                _fetch_endpoint(client, "FLR", params),
                _fetch_endpoint(client, "SEP", params),
                _fetch_endpoint(client, "GST", params),
                _fetch_endpoint(client, "CME", params),
                _fetch_endpoint(client, "WSAEnlilSimulations", params),
            )

        if not any([flr_list, sep_list, gst_list, cme_list, enlil_list]):
            cached = self._read_supabase_cache()
            snapshot = cached or self._fallback_snapshot()
        else:
            events, meta = _normalize_donki_payloads(flr_list, sep_list, gst_list, cme_list, enlil_list)
            simulator.set_space_weather_kp(meta["kp_current"])
            snapshot = SpaceWeatherSnapshot(
                **meta,
                source_mode="live_nasa",
                fetched_at=now,
                events=events,
                historical_priors=nasa_baselines.donki_priors,
            )
            self._persist_to_supabase(snapshot)

        self._cached_snapshot = snapshot
        self._cached_at_mono = time.monotonic()
        return snapshot

    async def get_live(self, force_refresh: bool = False) -> SpaceWeatherSnapshot:
        ttl = max(30, settings.DONKI_CACHE_TTL_SECONDS)
        if not force_refresh and self._cached_snapshot is not None:
            if (time.monotonic() - self._cached_at_mono) < ttl:
                return self._cached_snapshot

        async with self._lock:
            if not force_refresh and self._cached_snapshot is not None:
                if (time.monotonic() - self._cached_at_mono) < ttl:
                    return self._cached_snapshot
            return await self.sync_from_nasa()


donki_service = DonkiService()
