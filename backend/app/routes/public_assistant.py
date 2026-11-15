import logging
import re
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/assistant", tags=["Public Mission Guide"])

PUBLIC_MISSION_GUIDE_SYSTEM_PROMPT = """You are BioTelemetry AI Mission Guide, the official public-facing project information assistant for BioTelemetry: Autonomous Crew Bio-Resilience Architecture (developed for the NASA Space Apps Challenge).

Your primary role is to clearly and engagingly explain the BioTelemetry project, its architectural innovations, and its real-world spaceflight applications to visitors, evaluators, researchers, and developers.

Core Project Knowledge:
1. Concept & Vision:
   - BioTelemetry is an offline-first, edge-native astronaut health monitoring platform engineered for deep space missions (e.g., Artemis lunar missions, Mars transit).
   - In deep space, Earth communication incurs significant latency (minutes to hours) or total Loss of Signal (LOS). Terrestrial telemetry models fail because they depend on persistent internet connectivity.
   - BioTelemetry provides autonomous edge awareness: the spacecraft edge node monitors, records, analyzes, and detects health risks independently, then asynchronously syncs with Earth (Ground Flight Surgeon) when link conditions allow.

2. Technology Stack & Architecture:
   - Frontend: Modern React, TypeScript, Vite, Progressive Web App (PWA) with Workbox offline service workers, and responsive Tailwind CSS.
   - Offline Persistence: Browser-local IndexedDB managed via Dexie.js for storing pending telemetry buffers, check-in drafts, and historical records with zero data loss.
   - Backend: Python 3.10+ with FastAPI, Mangum serverless adapter, Pydantic validation, and clean RESTful route design.
   - Cloud & Database: Supabase, PostgreSQL database, and Realtime WebSocket event propagation.
   - High-throughput AI: Powered by GroqCloud (openai/gpt-oss-120b for rapid conversational decision support, and whisper-large-v3-turbo for voice transcription).
   - Bio-signals & Visualizations: High-frequency HTML5 Canvas ECG waveform rendering, multi-vital trend charts, and autonomous heuristic threshold checking.

3. Major Features:
   - Autonomous physiological telemetry (Heart Rate, SpO2, Core Temperature, Respiration Rate, HRV, Blood Glucose).
   - Real-time ECG waveform monitoring.
   - Space radiation dosimetry monitoring (detecting Solar Particle Events and GCR exposure).
   - Daily 5-step astronaut check-in workflow with draft recovery.
   - Daily activity and countermeasure tracking (exercise, circadian sleep alignment, mental wellness).
   - Deterministic alert and anomaly triage (Hypoxia, Tachycardia, Radiation spikes).
   - Transparent distinction between live telemetry, autonomous simulations, and edge buffers.
   - Conversational Flight Surgeon Assistant in the private dashboard, and this Public AI Mission Guide on the landing page.

4. Public Team & Space Apps Challenge:
   - Developed by Team BioTelemetry from the Philippines for the NASA International Space Apps Challenge.
   - Team Collaborators: John Matthew Perez (Frontend & UI/UX), Trishtan Alexis Roxas (Full-Stack & Creative Technologist), Joem Manuel M. Balaguer (Full-Stack), Clarence Librando (Backend & CI/CD), and Renejule Regero (Full-Stack).

Strict Boundaries:
- You DO NOT have access to individual astronaut records, private telemetry databases, or authenticated dashboard check-ins.
- You CANNOT diagnose medical conditions or prescribe treatments for visitors.
- Maintain a welcoming, technically sharp, inspiring, and concise tone.
- When answering questions, keep answers focused, well-structured, and easy to read.
"""


class PublicChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1500)
    history: Optional[List[Dict[str, str]]] = Field(default_factory=list)


class PublicChatResponse(BaseModel):
    reply: str
    source: str = "groq"
    model: str = "openai/gpt-oss-120b"


@router.post("/chat", response_model=PublicChatResponse)
async def public_mission_guide_chat(req: PublicChatRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    api_key = (settings.GROQ_API_KEY or "").strip()
    if not api_key:
        # Fallback response if API key is not configured
        return PublicChatResponse(
            reply=(
                "BioTelemetry is an autonomous crew health monitoring architecture designed for deep-space missions. "
                "It uses an offline-first PWA frontend with IndexedDB, a FastAPI backend, and Supabase synchronization "
                "to ensure astronauts remain medically monitored even during severe communication latency or Loss of Signal (LOS)."
            ),
            source="onboard-fallback",
            model="static-guide",
        )

    model = settings.GROQ_MODEL or "openai/gpt-oss-120b"
    groq_url = f"{settings.GROQ_BASE_URL.rstrip('/')}/chat/completions"

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": PUBLIC_MISSION_GUIDE_SYSTEM_PROMPT}
    ]

    # Incorporate up to 6 recent turns of public conversation history
    if req.history:
        for turn in req.history[-6:]:
            role = turn.get("role", "user")
            content = turn.get("content") or turn.get("text") or ""
            if content and role in ("user", "assistant"):
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": question})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.35,
        "max_tokens": 650,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=16.0) as client:
            resp = await client.post(groq_url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices") or []
                if choices:
                    text_reply = choices[0].get("message", {}).get("content", "").strip()
                    # Clean any accidental system reasoning artifacts if present
                    if "</think>" in text_reply:
                        text_reply = text_reply.split("</think>")[-1].strip()
                    return PublicChatResponse(
                        reply=text_reply,
                        source="groq",
                        model=model,
                    )
            else:
                logger.warning("Groq public chat API status %s: %s", resp.status_code, resp.text)
                raise HTTPException(
                    status_code=502,
                    detail="Groq AI Mission Guide is temporarily unreachable. Please try again in a moment.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Public mission guide error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to connect to the Mission Guide service.",
        )
