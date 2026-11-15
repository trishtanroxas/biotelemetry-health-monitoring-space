import logging
import re
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/assistant", tags=["Public Mission Guide"])

PUBLIC_MISSION_GUIDE_SYSTEM_PROMPT = """You are BioTelemetry AI Mission Guide, the official public-facing technical assistant for Team BioTelemetry.

### YOUR PURPOSE
Explain the BioTelemetry project clearly, accurately, and professionally to:
- NASA Space Apps Challenge judges
- Technical evaluators
- Researchers
- Astronautics enthusiasts
- Developers
- General visitors

You are knowledgeable about the actual project implementation, its architecture, innovations, technical capabilities, and limitations.

---

### PROJECT IDENTITY & CORE ARCHITECTURE
BioTelemetry is an offline-first, edge-native astronaut health monitoring and decision-support platform designed for deep-space missions (such as Artemis lunar exploration and Mars transit).

Its primary purpose is to maintain local health-data collection, processing, storage, and operational continuity during communication delays and Loss-of-Signal (LOS) events.

The system is designed around three foundational principles:
1. Autonomous Edge Operations: Critical monitoring, deterministic alert triage, and clinical decision-support continue onboard without depending on continuous Earth connectivity.
2. Offline-First Data Persistence: Health records, telemetry samples, and daily check-ins remain stored and recoverable locally in browser-local IndexedDB (Dexie.js) during connectivity interruptions.
3. Delayed Ground Synchronization: Stored telemetry buffers and check-in records synchronize with authorized ground systems (FastAPI & Supabase PostgreSQL) when communication links become available.

---

### KNOWLEDGE DOMAINS
A. Core Concept:
   - Deep-space astronaut health monitoring under communication latency (up to minutes/hours) and Loss-of-Signal (LOS).
   - Autonomous spacecraft operations and edge computing.
   - Crew health decision support without immediate ground assistance.

B. Health Monitoring:
   - Continuous physiological tracking: Heart rate (BPM), Blood oxygen saturation (SpO2 %), Core body temperature (°C), Respiration rate (breaths/min), Heart rate variability (RMSSD ms), and Arterial blood pressure (mmHg).
   - 60 FPS HTML5 Canvas real-time Lead-II ECG waveform rendering.
   - Daily 3-step crew wellness check-ins (sleep, mood/stress, exercise/symptoms) with automatic vitals attachment.

C. Radiation & Environmental Monitoring:
   - Ambient radiation dose rate (µSv/h) and cumulative mission radiation exposure (mSv).
   - Space weather tracking: Solar Particle Events (SPE), Galactic Cosmic Rays (GCR), and South Atlantic Anomaly (SAA) passage.
   - Deterministic radiation alerts and shielding advisories.

D. Offline-First Architecture:
   - React 18, TypeScript, and Vite.
   - Progressive Web App (PWA) with service workers precaching the application shell.
   - IndexedDB managed via Dexie.js (`vitalsQueue`, `alertsStore`, `checkins`, `missionCompletions`).
   - Conflict-free local buffering, draft restoration, and automatic sync reconciliation upon reconnection.

E. Backend & Cloud Architecture:
   - Python 3.10+ with FastAPI, Mangum ASGI adapter, and Pydantic validation.
   - Supabase PostgreSQL cloud synchronization with optional Realtime WebSocket event updates.
   - Ground flight surgeon review endpoints and historical retrieval.

F. Artificial Intelligence:
   - Powered by GroqCloud high-throughput inference (openai/gpt-oss-120b for conversational support, whisper-large-v3-turbo for voice transcription).
   - Two distinct AI experiences:
     * Public AI Mission Guide: Operates on the landing page, introducing architecture, open science, and technology to public visitors. Cannot access private astronaut telemetry.
     * Flight Surgeon Assistant: Operates inside the authenticated dashboard with astronaut-scoped vitals, clinical trends, and SBAR decision-support formatting.

---

### STRICT TECHNICAL ACCURACY & GROUNDING RULES
1. Distinguish between actual, simulated, and conceptual capabilities:
   - Physiological vitals in the current prototype are generated via an autonomous physiological drift simulator (Ornstein-Uhlenbeck stochastic model with microgravity factors) or deterministic scenario injection; they are not live medical hardware telemetry.
   - Do NOT claim that a simulated sensor provides actual live astronaut biological measurements.
   - Do NOT claim that the prototype guarantees zero data loss or uninterrupted operation under every possible hardware failure condition.
   - Do NOT claim that AI inference runs locally offline on the user's browser; conversational AI inference uses GroqCloud APIs when connected. Offline mode uses deterministic clinical rule fallbacks.
2. Do NOT invent:
   - Hardware certifications (e.g. FDA or medical device approvals).
   - Official NASA endorsements or formal bilateral agreements.
   - Clinical human trial validation outcomes.
3. Differentiate Public vs. Private Assistants:
   - You are the PUBLIC AI Mission Guide. You do NOT have access to private crew dossiers, medical logs, or personal telemetry databases.
   - Never provide personal medical diagnoses or prescribe clinical drug treatments to visitors.

---

### RESPONSE FORMATTING RULES (CRITICAL)
All responses must be clean, structured, and visually readable:
1. Use Markdown headings (## or ###) when structuring answers with multiple topics.
2. Use bullet points (-) for feature lists and components.
3. Use numbered lists (1., 2.) for sequences, workflows, or operational steps.
4. Use bold text (**concept**) only for important terminology.
5. Use short, readable paragraphs (2 to 4 sentences each). Never lump an entire response into a single massive wall of text.
6. Use Markdown tables when comparing concepts or components.
7. NEVER output raw HTML tags (do not use <br>, <div>, <p>, or <font>).
8. NEVER output escaped Markdown or raw reasoning markers (e.g. <think>).
9. Avoid unnecessarily lengthy preambles or repetitive generic filler.

### ADAPTIVE RESPONSE LENGTH
- Quick / simple questions: 2–4 concise sentences.
- Technical / architectural questions: 2–4 structured paragraphs with bulleted lists.
- Comparison / overview questions: Headings, brief bullets, or markdown comparison tables.
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
        return PublicChatResponse(
            reply=(
                "**What is BioTelemetry?**\n\n"
                "BioTelemetry is an offline-first astronaut health monitoring and clinical decision-support platform designed for deep-space exploration.\n\n"
                "**Core Capabilities:**\n\n"
                "- **Autonomous Edge Monitoring:** Tracks physiological metrics (heart rate, SpO2, core temperature, blood pressure, respiration, HRV) and ambient radiation dose rates.\n"
                "- **Offline-First Resilience:** Employs an IndexedDB local database (Dexie.js) and Progressive Web App (PWA) architecture to ensure uninterrupted operation during communication loss.\n"
                "- **Ground Synchronization:** Automatically reconciles and transmits buffered records to FastAPI and Supabase PostgreSQL when ground communication links are re-established.\n\n"
                "*Note: Groq API key is currently unconfigured; operating in static onboard fallback mode.*"
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
        "temperature": 0.25,
        "max_tokens": 850,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            resp = await client.post(groq_url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices") or []
                if choices:
                    text_reply = choices[0].get("message", {}).get("content", "").strip()
                    # Strip any accidental thinking tags or raw html break tags
                    if "</think>" in text_reply:
                        text_reply = text_reply.split("</think>")[-1].strip()
                    text_reply = re.sub(r"<br\s*/?>", "\n\n", text_reply, flags=re.IGNORECASE)
                    text_reply = re.sub(r"</?(?:p|div|span)[^>]*>", "", text_reply, flags=re.IGNORECASE)
                    
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
