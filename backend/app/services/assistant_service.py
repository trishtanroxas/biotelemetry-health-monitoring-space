import asyncio
import base64
import hashlib
import json
import logging
import re
import shutil
import struct
import time
import weakref
from typing import Any, Dict, List, Optional, Tuple
import httpx

try:
    import edge_tts
except ImportError:
    edge_tts = None  # type: ignore[assignment]

from backend.app.core.config import settings
from backend.app.schemas.assistant import (
    AssistantContextPayload,
    AssistantResponse,
    AudioTranscribeResponse,
    SuggestedAction,
)
from backend.app.schemas.diagnostic import ImageAssessmentResponse
from backend.app.services.nasa_baselines import nasa_baselines

logger = logging.getLogger(__name__)

_DEPRECATED_GEMINI_MODELS = {"gemini-2.5-flash", "gemini-2.5-flash-lite"}
_RECOMMENDED_FREE_MODEL = "gemini-3.5-flash-lite"
_RESPONSE_CACHE_MAX_ENTRIES = 64
_TTS_GEMINI_MODELS = (
    "gemini-3.8-flash-lite-tts",
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
)
_TTS_CACHE_MAX_ENTRIES = 32
_TTS_CACHE_TTL_SECONDS = 600.0
_ALLOWED_AUDIO_MIMES = {
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/wav",
    "audio/aac",
    "audio/flac",
}

_ASSISTANT_SYSTEM_INSTRUCTION = (
    "You are an onboard NASA spaceflight clinical decision-support assistant. "
    "Help astronauts assess physiological risks across the five spaceflight hazards "
    "(radiation, isolation/confinement, distance from Earth, altered gravity, hostile closed environment), "
    "and provide practical evidence-based countermeasures and Ground Flight Surgeon escalation criteria."
)

_VISION_SYSTEM_INSTRUCTION = (
    "You are an onboard NASA spaceflight biomedical imaging triage assistant. "
    "Evaluate image quality and observable anatomical or device features aligned with NASA checklists. "
    "Do not claim a definitive autonomous diagnosis; provide practical actions and escalation criteria."
)

_TRANSCRIBE_SYSTEM_INSTRUCTION = (
    "You are an accurate speech-to-text transcriber for an astronaut medical assistant. "
    "Transcribe spoken English audio verbatim without commentary or emojis. "
    "Return an empty transcript string if only silence or noise is present."
)

_ASSISTANT_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "actions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "escalate_when": {"type": "STRING"},
        "nasa_reference": {"type": "STRING"},
        "sbar_text": {"type": "STRING", "nullable": True},
    },
    "required": ["summary", "actions", "escalate_when", "nasa_reference"],
}

_VISION_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "severity": {"type": "STRING", "enum": ["nominal", "warning", "critical"]},
        "findings": {"type": "STRING"},
        "recommended_actions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "ground_consult_required": {"type": "BOOLEAN"},
    },
    "required": ["severity", "findings", "recommended_actions", "ground_consult_required"],
}

_TRANSCRIBE_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "transcript": {"type": "STRING"},
    },
    "required": ["transcript"],
}

_EDGE_VOICE_RE = re.compile(r"^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9_-]+$")
_response_cache: Dict[str, Tuple[float, Dict[str, Any], str]] = {}
_tts_audio_cache: Dict[str, Tuple[float, bytes, str, str]] = {}
_model_cooldown_until: Dict[str, float] = {}
_last_request_ts: float = 0.0
_loop_state: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, Dict[str, Any]]" = (
    weakref.WeakKeyDictionary()
)


EXAM_PROTOCOLS: Dict[str, Dict[str, Any]] = {
    "ocular_ultrasound": {
        "title": "Ocular / Optic Nerve Sheath Ultrasound (SANS Check)",
        "nasa_reference": "NASA OSDR OSD-583 / OSD-680 Spaceflight Associated Neuro-ocular Syndrome (SANS)",
        "normal_actions": [
            "Record bilateral optic nerve sheath diameter (ONSD) 3 mm posterior to the retina.",
            "Continue routine SANS ultrasound cadence per mission flight plan.",
            "Log visual acuity or any transient peripheral blur in your next check-in.",
        ],
        "elevated_actions": [
            "Repeat scan horizontally and vertically to confirm globe flattening or widened sheath (>5.0 mm).",
            "Test near/far visual acuity and complete lower-body negative pressure (LBNP) countermeasures if prescribed.",
            "Queue ultrasound frames for Ground Flight Surgeon review during next telemetry window.",
        ],
        "escalate": "Report immediately if blurry near vision, persistent brow headache, or choroidal folds appear.",
    },
    "dermal_radiation": {
        "title": "Dermal / Radiation Erythema & Wound Check",
        "nasa_reference": "NASA HRP Space Radiation & Closed Habitat Dermal Vulnerability Protocol",
        "normal_actions": [
            "Keep skin hydrated with flight-approved barrier cream in low-humidity cabin air.",
            "Inspect high-friction EVA suit pressure points after suit doffing.",
            "Log any new rash or slow-healing scratch within 24 hours.",
        ],
        "elevated_actions": [
            "Cleanse affected area gently with sterile saline; avoid harsh alcohol wipes in closed habitats.",
            "Check cumulative personal dosimeter and remain in polyethylene-shielded quarters during solar peaks.",
            "Capture follow-up macro photo at 12 hours to verify border stability or spreading.",
        ],
        "escalate": "Contact Flight Surgeon if warmth, pus, rapidly expanding erythema, or fever >38.0 C develops.",
    },
    "glucometer_nutrition": {
        "title": "Glucometer & Nutritional / Hydration Check",
        "nasa_reference": "NASA OSDR OSD-575 Metabolic Glucose & Calcium Flight Shift Reference",
        "normal_actions": [
            "Maintain spaced hydration (2,200-2,500 mL/day) and balanced sodium/potassium ration intake.",
            "Repeat fasting glucose check if initiating heavy EVA or intense ARED session.",
            "Confirm caloric intake meets flight energy expenditure target.",
        ],
        "elevated_actions": [
            "Wash/wipe fingertip thoroughly before repeating capillary glucose reading to rule out strip contamination.",
            "For low glucose (<70 mg/dL): take 15 g fast-acting carbohydrate and retest after 15 minutes.",
            "For high glucose (>180 mg/dL): hydrate with water, pause sugary rations, and repeat measurement in 60 minutes.",
        ],
        "escalate": "Seek immediate crew medical intervention for glucose <55 mg/dL, dizziness, tremor, or sustained >250 mg/dL.",
    },
}


def _extract_image_dimensions(raw_bytes: bytes) -> Tuple[Optional[int], Optional[int], str]:
    if raw_bytes.startswith(b"\x89PNG\r\n\x1a\n") and len(raw_bytes) >= 24:
        w, h = struct.unpack(">II", raw_bytes[16:24])
        return w, h, "PNG"
    if raw_bytes.startswith(b"\xff\xd8"):
        idx = 2
        while idx + 4 < len(raw_bytes):
            if raw_bytes[idx] != 0xFF:
                break
            marker = raw_bytes[idx + 1]
            if marker in (0xC0, 0xC1, 0xC2) and idx + 9 < len(raw_bytes):
                h, w = struct.unpack(">HH", raw_bytes[idx + 5 : idx + 9])
                return w, h, "JPEG"
            seg_len = struct.unpack(">H", raw_bytes[idx + 2 : idx + 4])[0]
            if seg_len < 2:
                break
            idx += 2 + seg_len
        return None, None, "JPEG"
    if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return None, None, "WEBP"
    return None, None, "IMAGE"


def _build_clinical_context_summary(ctx: Optional[AssistantContextPayload]) -> str:
    if not ctx:
        return "No live vitals payload attached."
    parts = [f"Astronaut {ctx.astronaut_id}"]
    if ctx.mission_zone:
        parts.append(f"Zone {ctx.mission_zone} (Mission Day {ctx.mission_day or 1})")
    if ctx.comms_latency_sec is not None and ctx.comms_latency_sec >= 1:
        parts.append(f"One-way Earth lag {ctx.comms_latency_sec:.0f}s")
    if ctx.heart_rate is not None:
        parts.append(f"HR {ctx.heart_rate:.0f} bpm")
    if ctx.spo2 is not None:
        parts.append(f"SpO2 {ctx.spo2:.1f}%")
    if ctx.core_temp is not None:
        parts.append(f"Temp {ctx.core_temp:.1f} C")
    if ctx.blood_glucose is not None:
        parts.append(f"Glucose {ctx.blood_glucose:.0f} mg/dL")
    if ctx.radiation_rate is not None:
        parts.append(f"Rad {ctx.radiation_rate:.1f} uSv/h")
    if ctx.kp_index is not None:
        parts.append(f"Kp {ctx.kp_index:.1f}")
    if ctx.sleep_hours is not None:
        parts.append(f"Sleep {ctx.sleep_hours:.1f} h")
    if ctx.mood is not None and ctx.stress is not None:
        parts.append(f"Mood {ctx.mood}/5, Stress {ctx.stress}/5")
    if ctx.hydration_ml is not None:
        parts.append(f"Hydration {ctx.hydration_ml} mL")
    if ctx.readiness_score is not None:
        parts.append(f"Readiness {ctx.readiness_score}%")
    if ctx.compliance_pct is not None:
        parts.append(f"Protocol compliance {ctx.compliance_pct}%")
    if ctx.focus_organ:
        parts.append(f"Organ Focus: {ctx.focus_organ}")
    if ctx.active_alerts:
        alert_labels = ", ".join(
            f"{a.get('severity', 'INFO')}:{a.get('alert_type', 'ALERT')}" for a in ctx.active_alerts[:4]
        )
        parts.append(f"Active alerts: {alert_labels}")
    if ctx.seven_day_summary:
        s7 = ctx.seven_day_summary
        count = s7.get("checkin_count", 0)
        if count:
            parts.append(
                f"7d summary ({count} check-ins): avg sleep {s7.get('avg_sleep_hours', '--')}h, "
                f"avg stress {s7.get('avg_stress', '--')}/5, exercise {s7.get('total_exercise_min', 0)} min"
            )
    if ctx.recent_exams:
        latest_exam = ctx.recent_exams[0]
        parts.append(
            f"Latest self-exam: {latest_exam.get('exam_type', 'exam')} ({latest_exam.get('severity', 'nominal')})"
        )
    if ctx.pending_protocols:
        parts.append(f"Due countermeasures: {', '.join(ctx.pending_protocols[:3])}")
    return "; ".join(parts)


def _format_history_block(history: Optional[List[Dict[str, str]]]) -> str:
    if not history:
        return ""
    lines = []
    for turn in history[-6:]:
        role = str(turn.get("role", "user")).upper()
        content = str(turn.get("content", "")).strip()
        if content:
            lines.append(f"{role}: {content[:400]}")
    return "\n".join(lines)


def _suggest_actions_for_query(
    question: str,
    ctx: Optional[AssistantContextPayload],
    mode: str,
) -> List[SuggestedAction]:
    q = question.lower()
    actions: List[SuggestedAction] = []
    if any(k in q for k in ("eye", "vision", "sans", "ultrasound", "headache", "intracranial", "neuro")):
        actions.append(SuggestedAction(label="Start Ocular Ultrasound", target_page="dashboard", target_exam="ocular_ultrasound"))
    if any(k in q for k in ("radiation", "storm", "solar", "kp", "skin", "rash", "dermal", "immune")):
        actions.append(SuggestedAction(label="Open Dermal Exam", target_page="dashboard", target_exam="dermal_radiation"))
    if any(k in q for k in ("glucose", "sugar", "metabolic", "nutrition", "hydrat")):
        actions.append(SuggestedAction(label="Verify Glucometer", target_page="dashboard", target_exam="glucometer_nutrition"))
    if ctx and ("daily-checkin" in ctx.pending_protocols or ctx.sleep_hours is None):
        actions.append(SuggestedAction(label="Complete Check-In", target_page="checkin"))
    if mode in ("chat", "pre_eva_brief") or any(k in q for k in ("trend", "week", "history", "sleep", "stress")):
        actions.append(SuggestedAction(label="View Health Trends", target_page="analytics"))
    actions.append(SuggestedAction(label="Open Countermeasures", target_page="missions"))
    deduped: List[SuggestedAction] = []
    seen = set()
    for item in actions:
        key = f"{item.target_page}:{item.target_exam or ''}:{item.label}"
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped[:3]


def _build_pre_eva_brief(ctx: Optional[AssistantContextPayload]) -> AssistantResponse:
    spo2 = ctx.spo2 if ctx and ctx.spo2 is not None else 98.5
    hr = ctx.heart_rate if ctx and ctx.heart_rate is not None else 68.0
    rad = ctx.radiation_rate if ctx and ctx.radiation_rate is not None else 14.0
    kp = ctx.kp_index if ctx and ctx.kp_index is not None else 2.0
    glu = ctx.blood_glucose if ctx and ctx.blood_glucose is not None else 92.0
    sleep = ctx.sleep_hours if ctx and ctx.sleep_hours is not None else 7.0
    alerts = ctx.active_alerts if ctx else []

    holds: List[str] = []
    cautions: List[str] = []
    if spo2 < 93:
        holds.append(f"SpO2 {spo2:.1f}% (<93%)")
    if rad >= 45 or kp >= 6.5:
        holds.append(f"Elevated radiation {rad:.1f} uSv/h / Kp {kp:.1f}")
    if glu < 65 or glu > 220:
        holds.append(f"Glucose {glu:.0f} mg/dL outside EVA envelope")
    if any(a.get("severity") == "CRITICAL" for a in alerts):
        holds.append("Unacknowledged critical alert active")

    if not holds:
        if sleep < 6.0:
            cautions.append(f"Recent sleep {sleep:.1f}h (<6h)")
        if hr > 110 or hr < 48:
            cautions.append(f"Resting HR {hr:.0f} bpm")
        if rad >= 25 or kp >= 5.0:
            cautions.append(f"Moderate space weather Kp {kp:.1f}")
        if ctx and ctx.pending_protocols:
            cautions.append(f"{len(ctx.pending_protocols)} countermeasure(s) due")

    gate = "HOLD / DEFER EVA" if holds else "CAUTION — VERIFY" if cautions else "GO (PRELIMINARY)"
    reason = ", ".join(holds or cautions) if (holds or cautions) else "Cardiopulmonary, metabolic, and radiation telemetry sit within nominal pre-EVA envelopes"
    return AssistantResponse(
        summary=f"Pre-EVA Readiness Gate: {gate}. {reason}.",
        actions=[
            "Confirm EMU suit O2 purge, CO2 scrubber pressure, and 300-500 mL pre-EVA isotonic electrolyte hydration.",
            "Verify personal radiation dosimeter zeroing and solar particle shelter fallback window." if (rad >= 25 or kp >= 5.0) else "Complete final capillary glucose (>80 mg/dL) and glove-fit pressure check prior to airlock depress.",
            "Review active countermeasures and ensure today's Check-In is logged for ground telemetry continuity.",
        ],
        escalate_when="Any HOLD condition persists, SpO2 <93%, glucose <70 mg/dL, or acute vestibular/visual symptoms develop.",
        nasa_reference="NASA-STD-3001 EVA Pre-Breathe & Medical Flight Rules",
        source="onboard-clinical",
        model="astro-clinical-rules-v3",
        suggested_actions=_suggest_actions_for_query("pre-eva readiness", ctx, "pre_eva_brief"),
    )


def _build_sbar_downlink(ctx: Optional[AssistantContextPayload], question: str) -> AssistantResponse:
    summary_ctx = _build_clinical_context_summary(ctx)
    alerts = ctx.active_alerts if ctx else []
    alert_line = ", ".join(f"{a.get('severity')}: {a.get('alert_type')}" for a in alerts) if alerts else "None active"
    pending_line = ", ".join(ctx.pending_protocols) if (ctx and ctx.pending_protocols) else "All logged protocols current"
    lag = ctx.comms_latency_sec if ctx and ctx.comms_latency_sec is not None else 0.1
    sbar = (
        f"S (Situation): Crew {ctx.astronaut_id if ctx else 'ASTRO-01'} telemetry & readiness status brief "
        f"(Comms lag {lag:.1f}s).\n"
        f"B (Background): {summary_ctx}.\n"
        f"A (Assessment): Active alerts: {alert_line}. Pending countermeasures: {pending_line}.\n"
        f"R (Recommendation): Continue onboard countermeasures; review flagged metrics at next Flight Surgeon pass. "
        f"Crew note: {question[:140]}"
    )
    return AssistantResponse(
        summary="Structured Ground Flight Surgeon SBAR downlink brief generated from non-private telemetry and protocol history.",
        actions=[
            "Copy the SBAR downlink text below for Mission Control voice/text pass or high-latency packet queue.",
            "Attach any recent Self-Exam ultrasound or dermal image severity flags prior to transmission.",
            "Confirm immediate onboard stabilization steps if Earth one-way latency exceeds 60 seconds.",
        ],
        escalate_when="Immediate high-priority Flight Surgeon loop required for CRITICAL alerts, SpO2 <90%, or persistent neuro-ocular changes.",
        nasa_reference="NASA Exploration Medical Capability Asynchronous SBAR Downlink Protocol",
        source="onboard-clinical",
        model="astro-clinical-rules-v3",
        suggested_actions=_suggest_actions_for_query(question, ctx, "sbar_downlink"),
        sbar_text=sbar,
    )


def _resolve_primary_model() -> str:
    raw = (settings.GEMINI_MODEL or _RECOMMENDED_FREE_MODEL).strip().removeprefix("models/")
    if not raw or raw in _DEPRECATED_GEMINI_MODELS:
        return _RECOMMENDED_FREE_MODEL
    return raw


def _candidate_models() -> List[str]:
    primary = _resolve_primary_model()
    raw_fallbacks = [
        item.strip().removeprefix("models/")
        for item in (settings.GEMINI_FALLBACK_MODELS or "").split(",")
        if item.strip()
    ]
    ordered: List[str] = [primary]
    for candidate in raw_fallbacks:
        if candidate not in _DEPRECATED_GEMINI_MODELS and candidate not in ordered:
            ordered.append(candidate)
    return ordered


def _thinking_config_for_model(model: str) -> Optional[Dict[str, Any]]:
    lower = model.lower()
    if "flash-lite" in lower:
        return {"thinkingLevel": "MINIMAL"}
    if "gemini-4" in lower or "gemini-3" in lower or "flash-latest" in lower:
        return {"thinkingLevel": "LOW"}
    if "gemini-2.5" in lower:
        return {"thinkingBudget": 0}
    return None


def _parse_retry_delay_seconds(resp: httpx.Response, default: float = 60.0) -> float:
    retry_after = resp.headers.get("retry-after")
    if retry_after:
        try:
            return max(5.0, min(300.0, float(retry_after.strip())))
        except ValueError:
            pass
    try:
        details = resp.json().get("error", {}).get("details", [])
        for detail in details:
            delay = str(detail.get("retryDelay", "")).strip()
            match = re.match(r"^(\d+(?:\.\d+)?)s$", delay)
            if match:
                return max(5.0, min(300.0, float(match.group(1))))
    except Exception:
        pass
    return default


def _extract_gemini_json(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or []
    raw_chunks = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and not part.get("thought") and isinstance(part.get("text"), str)
    ]
    raw_text = "".join(raw_chunks).strip()
    if not raw_text:
        return None
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text, flags=re.IGNORECASE).strip()
    parsed = json.loads(raw_text)
    return parsed if isinstance(parsed, dict) else None


def _build_cache_key(*parts: str) -> str:
    joined = "\x1f".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _cache_get(cache_key: Optional[str]) -> Optional[Tuple[Dict[str, Any], str]]:
    ttl = int(settings.GEMINI_CACHE_TTL_SECONDS)
    if not cache_key or ttl <= 0:
        return None
    entry = _response_cache.get(cache_key)
    if not entry:
        return None
    expires_at, payload, model = entry
    if expires_at <= time.monotonic():
        _response_cache.pop(cache_key, None)
        return None
    return payload, model


def _cache_set(cache_key: Optional[str], payload: Dict[str, Any], model: str) -> None:
    ttl = int(settings.GEMINI_CACHE_TTL_SECONDS)
    if not cache_key or ttl <= 0:
        return
    now = time.monotonic()
    expired = [key for key, (exp, _, _) in _response_cache.items() if exp <= now]
    for key in expired:
        _response_cache.pop(key, None)
    while len(_response_cache) >= _RESPONSE_CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_response_cache))
        _response_cache.pop(oldest_key, None)
    _response_cache[cache_key] = (now + ttl, payload, model)


def _get_loop_state() -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    state = _loop_state.get(loop)
    if state is None:
        state = {
            "client": httpx.AsyncClient(
                timeout=httpx.Timeout(connect=2.5, read=5.5, write=3.0, pool=2.0),
                limits=httpx.Limits(max_keepalive_connections=6, max_connections=12),
            ),
            "lock": asyncio.Lock(),
            "in_flight": {},
        }
        _loop_state[loop] = state
    return state


async def _pace_gemini_request(loop_state: Dict[str, Any]) -> None:
    global _last_request_ts
    min_interval = max(0.0, float(settings.GEMINI_MIN_REQUEST_INTERVAL_SEC))
    async with loop_state["lock"]:
        wait = (_last_request_ts + min_interval) - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_ts = time.monotonic()


async def _execute_gemini_request(
    prompt: str,
    *,
    system_instruction: str,
    response_schema: Dict[str, Any],
    max_output_tokens: int,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        return None, None

    parts: List[Dict[str, Any]] = [{"text": prompt}]
    if image_b64 and mime_type:
        parts.append({"inlineData": {"mimeType": mime_type, "data": image_b64}})

    candidates = _candidate_models()
    now = time.monotonic()
    active_models = [model for model in candidates if _model_cooldown_until.get(model, 0.0) <= now]
    if not active_models:
        return None, None

    loop_state = _get_loop_state()
    client: httpx.AsyncClient = loop_state["client"]
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    req_timeout = httpx.Timeout(
        connect=2.5,
        read=8.0 if image_b64 else 5.5,
        write=3.0,
        pool=2.0,
    )
    deadline = now + 10.0

    for model in active_models:
        if time.monotonic() >= deadline:
            break
        generation_config: Dict[str, Any] = {
            "temperature": 0.2,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
            "responseSchema": response_schema,
        }
        thinking_cfg = _thinking_config_for_model(model)
        if thinking_cfg:
            generation_config["thinkingConfig"] = thinking_cfg

        payload: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": generation_config,
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        await _pace_gemini_request(loop_state)
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=req_timeout)
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            logger.warning("Gemini transport error on %s: %s", model, type(exc).__name__)
            _model_cooldown_until[model] = time.monotonic() + 20.0
            continue

        if resp.status_code == 200:
            try:
                parsed = _extract_gemini_json(resp.json())
            except Exception:
                parsed = None
            if parsed is not None:
                _model_cooldown_until.pop(model, None)
                return parsed, model
            _model_cooldown_until[model] = time.monotonic() + 15.0
            continue

        if resp.status_code in (401, 403):
            logger.warning("Gemini authentication rejected request (status=%s)", resp.status_code)
            return None, None
        if resp.status_code == 404:
            logger.info("Gemini model unavailable (%s); cooling down 24h", model)
            _model_cooldown_until[model] = time.monotonic() + 86400.0
            continue
        if resp.status_code == 429:
            delay = _parse_retry_delay_seconds(resp, default=60.0)
            logger.warning("Gemini rate limit on %s; cooling down %.1fs", model, delay)
            _model_cooldown_until[model] = time.monotonic() + delay
            continue
        if resp.status_code == 400:
            logger.warning("Gemini rejected payload on %s (status=400); failing over", model)
            _model_cooldown_until[model] = time.monotonic() + 300.0
            continue

        logger.warning("Gemini transient error on %s (status=%s)", model, resp.status_code)
        _model_cooldown_until[model] = time.monotonic() + 20.0

    return None, None


async def _call_gemini_json(
    prompt: str,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
    *,
    system_instruction: str = _ASSISTANT_SYSTEM_INSTRUCTION,
    response_schema: Dict[str, Any] = _ASSISTANT_RESPONSE_SCHEMA,
    max_output_tokens: int = 560,
    cache_key: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not (settings.GEMINI_API_KEY or "").strip():
        return None, None

    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    loop_state = _get_loop_state()
    in_flight: Dict[str, asyncio.Task[Tuple[Optional[Dict[str, Any]], Optional[str]]]] = loop_state["in_flight"]
    if cache_key and cache_key in in_flight:
        return await asyncio.shield(in_flight[cache_key])

    async def _run() -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        result = await _execute_gemini_request(
            prompt,
            system_instruction=system_instruction,
            response_schema=response_schema,
            max_output_tokens=max_output_tokens,
            image_b64=image_b64,
            mime_type=mime_type,
        )
        if result[0] is not None and result[1] is not None:
            _cache_set(cache_key, result[0], result[1])
        return result

    if not cache_key:
        return await _run()

    task = asyncio.create_task(_run())
    in_flight[cache_key] = task
    try:
        return await asyncio.shield(task)
    finally:
        if in_flight.get(cache_key) is task and task.done():
            in_flight.pop(cache_key, None)
        elif in_flight.get(cache_key) is task:
            task.add_done_callback(
                lambda done_task: in_flight.pop(cache_key, None) if in_flight.get(cache_key) is done_task else None
            )


def _build_onboard_guidance(
    question: str,
    ctx: Optional[AssistantContextPayload],
    history: Optional[List[Dict[str, str]]] = None,
    mode: str = "chat",
) -> AssistantResponse:
    if mode == "pre_eva_brief":
        return _build_pre_eva_brief(ctx)
    if mode == "sbar_downlink":
        return _build_sbar_downlink(ctx, question)

    q = question.lower()
    if history and len(q.split()) <= 6:
        last_user = " ".join(str(t.get("content", "")) for t in history[-2:]).lower()
        q = f"{q} {last_user}"
    summary_ctx = _build_clinical_context_summary(ctx)
    human = nasa_baselines.clinical.get("human_clinical_baselines", {})
    glu_stats = human.get("glucose_mg_dl", {})
    rad_val = ctx.radiation_rate if ctx and ctx.radiation_rate is not None else 18.0
    kp_val = ctx.kp_index if ctx and ctx.kp_index is not None else 2.0
    hr_val = ctx.heart_rate if ctx and ctx.heart_rate is not None else 68.0
    spo2_val = ctx.spo2 if ctx and ctx.spo2 is not None else 98.0
    glu_val = ctx.blood_glucose if ctx and ctx.blood_glucose is not None else 92.0
    sleep_val = ctx.sleep_hours if ctx and ctx.sleep_hours is not None else 7.0
    stress_val = ctx.stress if ctx and ctx.stress is not None else 2
    suggested = _suggest_actions_for_query(q, ctx, mode)
    lag_note = (
        f" Because Earth comms latency is {ctx.comms_latency_sec:.0f}s, execute onboard countermeasures autonomously before awaiting ground confirmation."
        if ctx and ctx.comms_latency_sec is not None and ctx.comms_latency_sec >= 60
        else ""
    )

    if any(k in q for k in ("glucose", "sugar", "metabolic", "nutrition", "hydrat", "food", "eat")):
        post_mean = glu_stats.get("postflight_mean", 93.3)
        band = "within target flight range (70-140 mg/dL)"
        if glu_val < 70:
            band = "below glycemic target (<70 mg/dL) and warrants rapid carbohydrate intake"
        elif glu_val > 180:
            band = "elevated (>180 mg/dL), indicating potential stress/post-prandial spike"
        return AssistantResponse(
            summary=f"Blood glucose is currently {glu_val:.0f} mg/dL ({band}; postflight ref ~{post_mean} mg/dL). {summary_ctx}.{lag_note}",
            actions=[
                "Compare current reading against pre-flight fasting baseline (~75 mg/dL) and flight mean (~93 mg/dL).",
                "Target 2,200-2,500 mL water/electrolyte intake spread evenly across waking hours.",
                "Pair resistive exercise with adequate protein and complex carbs to prevent post-EVA hypoglycemia.",
            ],
            escalate_when="Glucose drops below 55 mg/dL with tremor/confusion, or remains above 240 mg/dL across two tests.",
            nasa_reference="NASA OSDR OSD-575 Metabolic Biochemistry Reference",
            source="onboard-clinical",
            model="astro-clinical-rules-v3",
            suggested_actions=suggested,
        )

    if any(k in q for k in ("eye", "vision", "sans", "ultrasound", "headache", "intracranial", "brain")):
        mission_day = ctx.mission_day if ctx and ctx.mission_day is not None else 15
        risk = "elevated cumulative cephalad fluid exposure" if mission_day >= 30 else "early orbital adaptation window"
        return AssistantResponse(
            summary=f"Mission Day {mission_day} places neuro-ocular status in {risk}. Monitor optic nerve sheath diameter and near visual acuity closely.{lag_note}",
            actions=[
                "Run a bilateral closed-eyelid Ocular Ultrasound capture (3 mm behind retina) under Self-Exam.",
                "Use sleep posture adjustments and lower-body negative pressure if prescribed by flight surgeons.",
                "Avoid high-sodium rations if experiencing frontal head pressure or facial fullness.",
            ],
            escalate_when="New diplopia, persistent scotoma, visual acuity drop, or pulsatile headache persists past 4 hours.",
            nasa_reference="NASA OSDR OSD-583 & OSD-680 SANS Longitudinal Ultrasound Curve",
            source="onboard-clinical",
            model="astro-clinical-rules-v3",
            suggested_actions=suggested,
        )

    if any(k in q for k in ("radiation", "storm", "solar", "kp", "shield", "skin", "immune", "rash")):
        shelter = "Move to high-density polyethylene storm shelter and defer EVA" if (kp_val >= 5 or rad_val >= settings.RADIATION_WARNING_THRESHOLD) else "Maintain nominal cabin shielding and routine dosimeter checks"
        return AssistantResponse(
            summary=f"Geomagnetic index Kp {kp_val:.1f} with cabin dose rate {rad_val:.1f} uSv/h. Space radiation compounds microgravity T-cell suppression (~31% lymphocyte reduction observed in OSD-575).{lag_note}",
            actions=[
                shelter + ".",
                "Inspect exposed forearm/neck skin via Dermal Self-Exam capture after solar particle alerts.",
                "Prioritize 7+ hours recovery sleep to limit cortisol-mediated immune suppression.",
            ],
            escalate_when="Acute storm dose rate >60 uSv/h, painful spreading erythema, or systemic fever (>38.0 C).",
            nasa_reference="NASA DONKI Space Weather + OSDR OSD-569/575 Immune Baselines",
            source="onboard-clinical",
            model="astro-clinical-rules-v3",
            suggested_actions=suggested,
        )

    if any(k in q for k in ("bone", "muscle", "ared", "pain", "back", "gravity", "rover", "lunar", "mars")):
        return AssistantResponse(
            summary=f"Unloading bone and muscle across orbital/partial-gravity transit requires daily resistive loading. {summary_ctx}.{lag_note}",
            actions=[
                "Complete ARED axial loading (squats, deadlifts, heel raises) to stimulate lumbar and hip mechanoreceptors.",
                "Perform gentle spinal decompression stretches before sleep to ease microgravity paraspinal ache.",
                "Verify vitamin D supplementation and calcium/hydration balance in daily check-in.",
            ],
            escalate_when="Sharp radiating pain, joint swelling, numbness/tingling in limbs, or loss of grip strength.",
            nasa_reference="NASA OSDR OSD-351 & OSD-489 Partial-Gravity Musculoskeletal Protection",
            source="onboard-clinical",
            model="astro-clinical-rules-v3",
            suggested_actions=suggested,
        )

    if any(k in q for k in ("sleep", "stress", "mood", "fatigue", "exhaust", "calm", "isolat", "trend", "week")):
        return AssistantResponse(
            summary=f"Latest sleep sits at {sleep_val:.1f} h and stress at {stress_val}/5. {summary_ctx}.{lag_note}",
            actions=[
                "Use blue-enriched lighting after wake and dim amber cabin light 60 minutes prior to sleep.",
                "Run 5 minutes of slow paced breathing (4 s inhale, 6 s exhale) to elevate parasympathetic HRV.",
                "Schedule a private family or crew recreation block after high-workload EVA or rover ops.",
            ],
            escalate_when="Sleep falls below 5 hours for 3+ consecutive cycles, or persistent disorientation/panic impairs safety.",
            nasa_reference="NASA HRP Behavioral Health & Performance + Circadian Countermeasures",
            source="onboard-clinical",
            model="astro-clinical-rules-v3",
            suggested_actions=suggested,
        )

    cardio_note = "Cardiopulmonary readings appear stable"
    if spo2_val < 93 or hr_val > 115 or hr_val < 45:
        cardio_note = f"Pay close attention to HR {hr_val:.0f} bpm and SpO2 {spo2_val:.1f}%"
    return AssistantResponse(
        summary=f"{cardio_note}. Current context: {summary_ctx}.{lag_note}",
        actions=[
            "Hydrate with 300 mL electrolytes if resting heart rate is above your baseline by >12 bpm.",
            "Confirm cabin O2/CO2 scrubber status and run a 60-second finger oximeter recheck if SpO2 <94%.",
            "Click any region on the Body Health Map or run a camera/ultrasound Self-Exam for targeted guidance.",
        ],
        escalate_when="Chest tightness, resting tachycardia >120 bpm, SpO2 <90%, or acute neurological symptoms.",
        nasa_reference="NASA Integrated Medical Model & HRP Five Hazards Framework",
        source="onboard-clinical",
        model="astro-clinical-rules-v3",
        suggested_actions=suggested,
    )


async def generate_assistant_response(
    question: str,
    ctx: Optional[AssistantContextPayload],
    history: Optional[List[Dict[str, str]]] = None,
    mode: str = "chat",
) -> AssistantResponse:
    summary_ctx = _build_clinical_context_summary(ctx)
    history_block = _format_history_block(history)
    mode_instruction = {
        "pre_eva_brief": "Produce a Pre-EVA Readiness Gate decision-support brief (GO, CAUTION, or HOLD) citing vitals, radiation, glucose/hydration, and sleep.",
        "sbar_downlink": "Also return an 'sbar_text' string formatted with S (Situation), B (Background), A (Assessment), R (Recommendation) for Ground Flight Surgeon downlink.",
        "chat": "Answer the astronaut's clinical/operational question with clear follow-up awareness.",
    }.get(mode, "Answer the astronaut's clinical/operational question.")
    prompt = (
        f"Task mode: {mode_instruction}\n"
        f"Telemetry & trend context: {summary_ctx}\n"
        + (f"Recent turns:\n{history_block}\n" if history_block else "")
        + f"Astronaut request: {question.strip()}\n"
        "Return concise summary, up to 3 practical actions, escalation criteria, "
        "a brief NASA clinical reference, and sbar_text only when sbar_downlink mode is requested."
    )
    cache_key = _build_cache_key(
        "chat",
        _resolve_primary_model(),
        mode,
        question.strip().lower(),
        summary_ctx,
        history_block,
    )
    ai_json, used_model = await _call_gemini_json(
        prompt,
        system_instruction=_ASSISTANT_SYSTEM_INSTRUCTION,
        response_schema=_ASSISTANT_RESPONSE_SCHEMA,
        max_output_tokens=560,
        cache_key=cache_key,
    )
    if ai_json and isinstance(ai_json.get("summary"), str) and isinstance(ai_json.get("actions"), list):
        return AssistantResponse(
            summary=ai_json["summary"].strip(),
            actions=[str(a).strip() for a in ai_json["actions"][:4] if str(a).strip()],
            escalate_when=str(ai_json.get("escalate_when", "Escalate to Ground Flight Surgeon if symptoms worsen.")),
            nasa_reference=str(ai_json.get("nasa_reference", "NASA HRP & OSDR Flight Medical Reference")),
            source="gemini",
            model=used_model or _resolve_primary_model(),
            suggested_actions=_suggest_actions_for_query(question, ctx, mode),
            sbar_text=str(ai_json["sbar_text"]).strip() if ai_json.get("sbar_text") else (
                _build_sbar_downlink(ctx, question).sbar_text if mode == "sbar_downlink" else None
            ),
        )
    return _build_onboard_guidance(question, ctx, history=history, mode=mode)


async def analyze_medical_image(
    exam_type: str,
    image_base64: Optional[str],
    mime_type: Optional[str],
    notes: Optional[str],
    ctx: Optional[AssistantContextPayload],
) -> ImageAssessmentResponse:
    protocol = EXAM_PROTOCOLS.get(exam_type, EXAM_PROTOCOLS["ocular_ultrasound"])
    summary_ctx = _build_clinical_context_summary(ctx)

    clean_b64 = ""
    raw_bytes = b""
    if image_base64:
        clean_b64 = image_base64.split(",", 1)[-1].strip()
        try:
            raw_bytes = base64.b64decode(clean_b64, validate=False)
        except Exception:
            raw_bytes = b""

    width, height, fmt = _extract_image_dimensions(raw_bytes) if raw_bytes else (None, None, "NONE")

    if clean_b64 and (settings.GEMINI_API_KEY or "").strip():
        prompt = (
            f"Protocol: {protocol['title']}\n"
            f"Telemetry context: {summary_ctx}\n"
            f"Astronaut exam notes: {notes or 'None provided'}\n"
            "Inspect image quality and observable anatomical/device features; align with NASA self-care checklists."
        )
        image_digest = hashlib.sha256(clean_b64.encode("ascii", errors="ignore")).hexdigest()[:24]
        cache_key = _build_cache_key(
            "vision",
            _resolve_primary_model(),
            exam_type,
            summary_ctx,
            (notes or "").strip().lower(),
            image_digest,
        )
        ai_json, used_model = await _call_gemini_json(
            prompt,
            image_b64=clean_b64,
            mime_type=mime_type or "image/jpeg",
            system_instruction=_VISION_SYSTEM_INSTRUCTION,
            response_schema=_VISION_RESPONSE_SCHEMA,
            max_output_tokens=420,
            cache_key=cache_key,
        )
        if ai_json and isinstance(ai_json.get("findings"), str):
            sev = str(ai_json.get("severity", "nominal")).lower()
            if sev not in ("nominal", "warning", "critical"):
                sev = "nominal"
            model_tag = used_model or _resolve_primary_model()
            return ImageAssessmentResponse(
                exam_type=exam_type,
                severity=sev,
                findings=ai_json["findings"].strip(),
                recommended_actions=[
                    str(a).strip() for a in (ai_json.get("recommended_actions") or protocol["normal_actions"])[:4]
                ],
                ground_consult_required=bool(ai_json.get("ground_consult_required", sev != "nominal")),
                analysis_source="gemini-vision",
                image_quality=f"{fmt} {width}x{height} ({model_tag})" if width and height else f"{fmt} frame ({model_tag})",
            )

    # Deterministic offline protocol-assisted inspection when offline or Gemini key is absent.
    size_kb = max(1, len(raw_bytes) // 1024) if raw_bytes else 0
    dim_label = f"{fmt} {width}x{height} ({size_kb} KB)" if width and height else f"{fmt} payload ({size_kb} KB)"
    notes_lower = (notes or "").lower()
    triggered_warning = False
    reasons: List[str] = []

    if exam_type == "ocular_ultrasound":
        mission_day = ctx.mission_day if ctx and ctx.mission_day is not None else 15
        if mission_day >= 45 or any(k in notes_lower for k in ("blur", "pressure", "wide", "fold", "flat")):
            triggered_warning = True
            reasons.append(f"Mission Day {mission_day} extended cephalad fluid exposure")
    elif exam_type == "dermal_radiation":
        kp = ctx.kp_index if ctx and ctx.kp_index is not None else 2.0
        rad = ctx.radiation_rate if ctx and ctx.radiation_rate is not None else 18.0
        if kp >= 5.0 or rad >= settings.RADIATION_WARNING_THRESHOLD or any(k in notes_lower for k in ("red", "rash", "burn", "itch", "swollen")):
            triggered_warning = True
            reasons.append("elevated space weather/radiation exposure or symptomatic dermal note")
    elif exam_type == "glucometer_nutrition":
        glu = ctx.blood_glucose if ctx and ctx.blood_glucose is not None else 92.0
        if glu < 70 or glu > 180 or any(k in notes_lower for k in ("low", "high", "dizzy", "fasting")):
            triggered_warning = True
            reasons.append(f"capillary glucose {glu:.0f} mg/dL outside 70-180 mg/dL nominal envelope")

    if raw_bytes and size_kb < 4:
        reasons.append("low frame resolution/detail captured; consider retaking under steady cabin lighting")

    severity = "warning" if triggered_warning else "nominal"
    actions = protocol["elevated_actions"] if triggered_warning else protocol["normal_actions"]
    finding_prefix = (
        f"Offline protocol verification for {protocol['title']} captured ({dim_label}). "
        if raw_bytes
        else f"Offline clinical checklist guidance for {protocol['title']}. "
    )
    correlation = (
        f"Correlation flagged: {', '.join(reasons)}. Follow countermeasures and escalate if persistent."
        if reasons
        else f"Current telemetry ({summary_ctx}) shows no immediate physiological escalation trigger alongside this exam."
    )
    return ImageAssessmentResponse(
        exam_type=exam_type,
        severity=severity,
        findings=finding_prefix + correlation,
        recommended_actions=actions,
        ground_consult_required=triggered_warning,
        analysis_source="protocol-offline",
        image_quality=dim_label if raw_bytes else "No frame attached",
    )


def _fix_wav_sizes(wav_bytes: bytes) -> bytes:
    if len(wav_bytes) < 44 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        return wav_bytes
    buf = bytearray(wav_bytes)
    struct.pack_into("<I", buf, 4, len(buf) - 8)
    data_idx = buf.find(b"data", 12)
    if data_idx != -1 and data_idx + 8 <= len(buf):
        struct.pack_into("<I", buf, data_idx + 4, len(buf) - (data_idx + 8))
    return bytes(buf)


def _wrap_pcm16_as_wav(pcm_bytes: bytes, sample_rate: int = 24000, channels: int = 1) -> bytes:
    byte_rate = sample_rate * channels * 2
    block_align = channels * 2
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm_bytes),
        b"WAVE",
        b"fmt ",
        16,
        1,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        16,
        b"data",
        len(pcm_bytes),
    )
    return header + pcm_bytes


def _tts_cache_get(cache_key: str) -> Optional[Tuple[bytes, str, str]]:
    entry = _tts_audio_cache.get(cache_key)
    if not entry:
        return None
    expires_at, audio_bytes, media_type, source = entry
    if expires_at <= time.monotonic():
        _tts_audio_cache.pop(cache_key, None)
        return None
    return audio_bytes, media_type, source


def _tts_cache_set(cache_key: str, audio_bytes: bytes, media_type: str, source: str) -> None:
    now = time.monotonic()
    expired = [key for key, (exp, _, _, _) in _tts_audio_cache.items() if exp <= now]
    for key in expired:
        _tts_audio_cache.pop(key, None)
    while len(_tts_audio_cache) >= _TTS_CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_tts_audio_cache))
        _tts_audio_cache.pop(oldest_key, None)
    _tts_audio_cache[cache_key] = (now + _TTS_CACHE_TTL_SECONDS, audio_bytes, media_type, source)


async def _synthesize_gemini_wav(text: str, voice_name: str, *, has_local_fallback: bool = False) -> Optional[Tuple[bytes, str]]:
    if not settings.GEMINI_TTS_ENABLED:
        return None
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        return None
    now = time.monotonic()
    candidates = (_TTS_GEMINI_MODELS[0],) if has_local_fallback else _TTS_GEMINI_MODELS
    active_models = [model for model in candidates if _model_cooldown_until.get(model, 0.0) <= now]
    if not active_models:
        return None

    loop_state = _get_loop_state()
    client: httpx.AsyncClient = loop_state["client"]
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    req_timeout = httpx.Timeout(connect=2.0, read=4.5, write=2.5, pool=2.0)
    deadline = now + (5.0 if has_local_fallback else 9.0)
    payload = {
        "contents": [{"role": "user", "parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_name},
                }
            },
        },
    }

    for model in active_models:
        if time.monotonic() >= deadline:
            break
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        await _pace_gemini_request(loop_state)
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=req_timeout)
        except (httpx.TimeoutException, httpx.RequestError):
            _model_cooldown_until[model] = time.monotonic() + 20.0
            continue

        if resp.status_code == 200:
            try:
                candidates = resp.json().get("candidates") or []
                parts = candidates[0].get("content", {}).get("parts") or []
                for part in parts:
                    inline = part.get("inlineData") if isinstance(part, dict) else None
                    if not isinstance(inline, dict) or not inline.get("data"):
                        continue
                    raw_audio = base64.b64decode(inline["data"])
                    mime = str(inline.get("mimeType", "")).lower()
                    if mime.startswith("audio/wav") or raw_audio[:4] == b"RIFF":
                        wav_bytes = _fix_wav_sizes(raw_audio)
                    else:
                        rate_match = re.search(r"rate=(\d+)", mime)
                        sample_rate = int(rate_match.group(1)) if rate_match else 24000
                        wav_bytes = _wrap_pcm16_as_wav(raw_audio, sample_rate=sample_rate)
                    _model_cooldown_until.pop(model, None)
                    return wav_bytes, model
            except Exception:
                pass
            _model_cooldown_until[model] = time.monotonic() + 20.0
            continue

        if resp.status_code in (401, 403):
            return None
        if resp.status_code == 404:
            _model_cooldown_until[model] = time.monotonic() + 86400.0
            continue
        if resp.status_code == 429:
            delay = _parse_retry_delay_seconds(resp, default=60.0)
            _model_cooldown_until[model] = time.monotonic() + delay
            continue
        _model_cooldown_until[model] = time.monotonic() + 20.0

    return None


async def _synthesize_espeak_wav(text: str) -> Optional[Tuple[bytes, str]]:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        return None
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            exe,
            "-v",
            "en-us",
            "-s",
            "165",
            "--stdout",
            text,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        if proc.returncode == 0 and stdout and stdout[:4] == b"RIFF":
            return _fix_wav_sizes(stdout), "espeak-ng"
    except Exception:
        if proc and proc.returncode is None:
            proc.kill()
    return None


async def _synthesize_edge_tts_mp3(
    text: str,
    voice_name: Optional[str] = None,
) -> Optional[Tuple[bytes, str, str]]:
    if not settings.EDGE_TTS_ENABLED or edge_tts is None:
        return None
    if _model_cooldown_until.get("edge-tts", 0.0) > time.monotonic():
        return None

    default_edge = (settings.EDGE_TTS_VOICE or "en-US-AvaNeural").strip() or "en-US-AvaNeural"
    candidate = (voice_name or "").strip()
    edge_voice = candidate if _EDGE_VOICE_RE.match(candidate) else default_edge

    async def _stream_edge() -> bytes:
        communicate = edge_tts.Communicate(text, edge_voice)
        buf = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                buf.extend(chunk["data"])
        return bytes(buf)

    try:
        audio_bytes = await asyncio.wait_for(_stream_edge(), timeout=15.0)
        if audio_bytes:
            _model_cooldown_until.pop("edge-tts", None)
            return audio_bytes, "audio/mpeg", f"edge-tts:{edge_voice}"
    except Exception as exc:
        cooldown = 30.0 if "403" in str(exc) else 3.0
        _model_cooldown_until["edge-tts"] = time.monotonic() + cooldown
        logger.warning("Edge TTS failed (%s): %s", type(exc).__name__, str(exc) or repr(exc))
    return None


async def synthesize_speech_audio(
    text: str,
    voice_name: Optional[str] = None,
) -> Tuple[Optional[bytes], str, str]:
    clean_text = re.sub(r"\s+", " ", (text or "")).strip()[:1200]
    if not clean_text:
        return None, "application/octet-stream", "empty"

    default_voice = (settings.EDGE_TTS_VOICE or "en-US-AvaNeural").strip() or "en-US-AvaNeural"
    safe_voice = re.sub(r"[^A-Za-z0-9_-]", "", voice_name or default_voice) or default_voice
    edge_voice = default_voice.lower()
    cache_key = _build_cache_key(
        "tts",
        safe_voice.lower(),
        edge_voice,
        str(settings.GEMINI_TTS_ENABLED),
        str(settings.EDGE_TTS_ENABLED),
        str(settings.TTS_PREFER_LOCAL),
        clean_text,
    )
    cached = _tts_cache_get(cache_key)
    if cached is not None:
        return cached

    has_local = bool(shutil.which("espeak-ng") or shutil.which("espeak"))
    has_edge = (
        settings.EDGE_TTS_ENABLED
        and edge_tts is not None
        and _model_cooldown_until.get("edge-tts", 0.0) <= time.monotonic()
    )
    result: Optional[Tuple[bytes, str, str]] = None

    if settings.TTS_PREFER_LOCAL and has_local:
        espeak_res = await _synthesize_espeak_wav(clean_text)
        if espeak_res is not None:
            result = (espeak_res[0], "audio/wav", espeak_res[1])

    if result is None and has_edge:
        result = await _synthesize_edge_tts_mp3(clean_text, voice_name)

    if result is None:
        gemini_res = await _synthesize_gemini_wav(
            clean_text,
            safe_voice,
            has_local_fallback=has_local,
        )
        if gemini_res is not None:
            result = (gemini_res[0], "audio/wav", gemini_res[1])

    if result is None and has_local:
        espeak_res = await _synthesize_espeak_wav(clean_text)
        if espeak_res is not None:
            result = (espeak_res[0], "audio/wav", espeak_res[1])

    if result is not None:
        audio_bytes, media_type, source = result
        _tts_cache_set(cache_key, audio_bytes, media_type, source)
        return audio_bytes, media_type, source

    return None, "application/octet-stream", "unavailable"


async def synthesize_speech_wav(
    text: str,
    voice_name: Optional[str] = None,
) -> Tuple[Optional[bytes], str]:
    audio_bytes, _media_type, source = await synthesize_speech_audio(text, voice_name=voice_name)
    return audio_bytes, source


def _normalize_audio_mime(mime_type: Optional[str]) -> str:
    base_mime = (mime_type or "audio/webm").split(";", 1)[0].strip().lower()
    if base_mime in ("audio/x-wav", "audio/wave"):
        return "audio/wav"
    if base_mime in ("audio/x-m4a", "audio/m4a"):
        return "audio/mp4"
    return base_mime if base_mime in _ALLOWED_AUDIO_MIMES else "audio/webm"


async def transcribe_audio_speech(
    audio_base64: str,
    mime_type: str = "audio/webm",
) -> Optional[AudioTranscribeResponse]:
    clean_b64 = (audio_base64 or "").split(",", 1)[-1].strip()
    if not clean_b64 or not (settings.GEMINI_API_KEY or "").strip():
        return None
    try:
        raw_bytes = base64.b64decode(clean_b64, validate=False)
    except Exception:
        return None
    if len(raw_bytes) < 64 or len(raw_bytes) > 2_000_000:
        return None

    norm_mime = _normalize_audio_mime(mime_type)
    audio_digest = hashlib.sha256(clean_b64.encode("ascii", errors="ignore")).hexdigest()[:24]
    cache_key = _build_cache_key("stt", _resolve_primary_model(), norm_mime, audio_digest)

    ai_json, used_model = await _call_gemini_json(
        "Transcribe the spoken English audio verbatim into the transcript JSON field.",
        image_b64=clean_b64,
        mime_type=norm_mime,
        system_instruction=_TRANSCRIBE_SYSTEM_INSTRUCTION,
        response_schema=_TRANSCRIBE_RESPONSE_SCHEMA,
        max_output_tokens=200,
        cache_key=cache_key,
    )
    if ai_json and isinstance(ai_json.get("transcript"), str):
        return AudioTranscribeResponse(
            transcript=ai_json["transcript"].strip(),
            source="gemini-stt",
            model=used_model or _resolve_primary_model(),
        )
    return None
