import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseModel):
    PROJECT_NAME: str = "Space Biotelemetry Health Monitoring API"
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api/v1"

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    NASA_API_KEY: str = os.getenv("NASA_API_KEY", "DEMO_KEY")
    CRON_SECRET: str = os.getenv("CRON_SECRET", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    DONKI_CACHE_TTL_SECONDS: int = int(os.getenv("DONKI_CACHE_TTL_SECONDS", "300"))
    TELEMETRY_LOG_INTERVAL_SECONDS: int = int(os.getenv("TELEMETRY_LOG_INTERVAL_SECONDS", "15"))

    GLUCOSE_LOW: float = 70.0
    GLUCOSE_HIGH: float = 180.0

    NORMAL_HEART_RATE_MIN: float = 50.0
    NORMAL_HEART_RATE_MAX: float = 100.0
    NORMAL_SPO2_MIN: float = 94.0
    NORMAL_CORE_TEMP_MIN: float = 36.1
    NORMAL_CORE_TEMP_MAX: float = 37.8
    RADIATION_WARNING_THRESHOLD: float = 30.0
    RADIATION_CRITICAL_THRESHOLD: float = 60.0


settings = Settings()
