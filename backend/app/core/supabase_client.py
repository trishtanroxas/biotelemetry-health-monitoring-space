import logging
from typing import Optional
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

supabase_client = None
_active_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY

if settings.SUPABASE_URL and _active_key:
    try:
        from supabase import create_client, Client
        supabase_client: Optional[Client] = create_client(settings.SUPABASE_URL, _active_key)
        logger.info("Connected to Supabase PostgreSQL cloud instance.")
    except Exception as e:
        logger.warning("Failed to initialize Supabase client: %s. Falling back to in-memory store.", e)
else:
    logger.info("Supabase credentials not configured. Running in local mock/memory mode.")


def get_supabase():
    return supabase_client
