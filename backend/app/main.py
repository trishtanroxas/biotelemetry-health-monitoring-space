from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from backend.app.core.config import settings
from backend.app.routes import alerts, assistant, astronauts, diagnostics, space_weather, telemetry, wellness

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Space Biotelemetry & Astronaut Health Monitoring Serverless API (NASA Space Apps Challenge)",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(astronauts.router, prefix=settings.API_V1_STR)
app.include_router(telemetry.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(diagnostics.router, prefix=settings.API_V1_STR)
app.include_router(space_weather.router, prefix=settings.API_V1_STR)
app.include_router(assistant.router, prefix=f"{settings.API_V1_STR}/assistant", tags=["assistant"])
app.include_router(wellness.router, prefix=f"{settings.API_V1_STR}/wellness", tags=["wellness"])


@app.get("/")
def root():
    return {
        "status": "ONLINE",
        "system": "Biotelemetry Health Monitoring - Space Edge Node",
        "version": settings.VERSION,
        "docs": "/docs",
    }


handler = Mangum(app)
