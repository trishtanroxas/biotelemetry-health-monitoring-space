from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query

from backend.app.core.config import settings
from backend.app.schemas.space_weather import IssLiveFeed, SpaceWeatherSnapshot
from backend.app.services.donki_service import donki_service
from backend.app.services.nasa_baselines import nasa_baselines
from backend.app.services.simulator import simulator

router = APIRouter(prefix="/space-weather", tags=["Space Weather"])


@router.get("/live", response_model=SpaceWeatherSnapshot)
async def get_live_space_weather(refresh: bool = Query(False, description="Bypass 5-minute TTL cache")):
    return await donki_service.get_live(force_refresh=refresh)


@router.get("/iss", response_model=IssLiveFeed)
async def get_live_iss_feed(refresh: bool = Query(False, description="Force live ISS ephemeris refresh")):
    return await nasa_baselines.get_iss_live_feed(force_refresh=refresh, kp_index=simulator.active_kp)


@router.post("/sync", response_model=SpaceWeatherSnapshot)
async def sync_space_weather(
    x_cron_secret: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    if settings.CRON_SECRET:
        bearer = authorization.removeprefix("Bearer ").strip() if authorization else ""
        if x_cron_secret != settings.CRON_SECRET and bearer != settings.CRON_SECRET:
            raise HTTPException(status_code=401, detail="Invalid cron authorization")
    return await donki_service.get_live(force_refresh=True)
