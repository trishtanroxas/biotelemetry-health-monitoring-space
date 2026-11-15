import base64
import json
import struct
from typing import Any, Dict, List, Optional, Tuple
import httpx

from backend.app.core.config import settings
from backend.app.schemas.assistant import AssistantContextPayload, AssistantResponse
from backend.app.schemas.diagnostic import ImageAssessmentResponse
from backend.app.services.nasa_baselines import nasa_baselines


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
    if ctx.focus_organ:
        parts.append(f"Organ Focus: {ctx.focus_organ}")
    return "; ".join(parts)


async def _call_gemini_json(
    prompt: str,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        return None

    parts: List[Dict[str, Any]] = [{"text": prompt}]
    if image_b64 and mime_type:
        parts.append({"inlineData": {"mimeType": mime_type, "data": image_b64}})

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.25,
            "responseMimeType": "application/json",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=14.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                return None
            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            raw_text = (
                candidates[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            return json.loads(raw_text)
    except Exception:
        return None


def _build_onboard_guidance(
    question: str,
    ctx: Optional[AssistantContextPayload],
) -> AssistantResponse:
    q = question.lower()
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

    if any(k in q for k in ("glucose", "sugar", "metabolic", "nutrition", "hydrat", "food", "eat")):
        post_mean = glu_stats.get("postflight_mean", 93.3)
        band = "within target flight range (70-140 mg/dL)"
        if glu_val < 70:
            band = "below glycemic target (<70 mg/dL) and warrants rapid carbohydrate intake"
        elif glu_val > 180:
            band = "elevated (>180 mg/dL), indicating potential stress/post-prandial spike"
        return AssistantResponse(
            summary=f"Blood glucose is currently {glu_val:.0f} mg/dL ({band}). {summary_ctx}.",
            actions=[
                "Compare current reading against pre-flight fasting baseline (~75 mg/dL) and flight mean (~93 mg/dL).",
                "Target 2,200-2,500 mL water/electrolyte intake spread evenly across waking hours.",
                "Pair resistive exercise with adequate protein and complex carbs to prevent post-EVA hypoglycemia.",
            ],
            escalate_when="Glucose drops below 55 mg/dL with tremor/confusion, or remains above 240 mg/dL across two tests.",
            nasa_reference="NASA OSDR OSD-575 Metabolic Biochemistry Reference",
            source="onboard-clinical",
            model="astro-clinical-rules-v2",
        )

    if any(k in q for k in ("eye", "vision", "sans", "ultrasound", "headache", "intracranial", "brain")):
        mission_day = ctx.mission_day if ctx and ctx.mission_day is not None else 15
        risk = "elevated cumulative cephalad fluid exposure" if mission_day >= 30 else "early orbital adaptation window"
        return AssistantResponse(
            summary=f"Mission Day {mission_day} places neuro-ocular status in {risk}. Monitor optic nerve sheath diameter and near visual acuity closely.",
            actions=[
                "Run a bilateral closed-eyelid Ocular Ultrasound capture (3 mm behind retina) under Self-Exam.",
                "Use sleep posture adjustments and lower-body negative pressure if prescribed by flight surgeons.",
                "Avoid high-sodium rations if experiencing frontal head pressure or facial fullness.",
            ],
            escalate_when="New diplopia, persistent scotoma, visual acuity drop, or pulsatile headache persists past 4 hours.",
            nasa_reference="NASA OSDR OSD-583 & OSD-680 SANS Longitudinal Ultrasound Curve",
            source="onboard-clinical",
            model="astro-clinical-rules-v2",
        )

    if any(k in q for k in ("radiation", "storm", "solar", "kp", "shield", "skin", "immune", "rash")):
        shelter = "Move to high-density polyethylene storm shelter and defer EVA" if (kp_val >= 5 or rad_val >= settings.RADIATION_WARNING_THRESHOLD) else "Maintain nominal cabin shielding and routine dosimeter checks"
        return AssistantResponse(
            summary=f"Geomagnetic index Kp {kp_val:.1f} with cabin dose rate {rad_val:.1f} uSv/h. Space radiation compounds microgravity T-cell suppression (~31% lymphocyte reduction observed in OSD-575).",
            actions=[
                shelter + ".",
                "Inspect exposed forearm/neck skin via Dermal Self-Exam capture after solar particle alerts.",
                "Prioritize 7+ hours recovery sleep to limit cortisol-mediated immune suppression.",
            ],
            escalate_when="Acute storm dose rate >60 uSv/h, painful spreading erythema, or systemic fever (>38.0 C).",
            nasa_reference="NASA DONKI Space Weather + OSDR OSD-569/575 Immune Baselines",
            source="onboard-clinical",
            model="astro-clinical-rules-v2",
        )

    if any(k in q for k in ("bone", "muscle", "ared", "pain", "back", "gravity", "rover", "lunar", "mars")):
        return AssistantResponse(
            summary=f"Unloading bone and muscle across orbital/partial-gravity transit requires daily resistive loading. {summary_ctx}.",
            actions=[
                "Complete ARED axial loading (squats, deadlifts, heel raises) to stimulate lumbar and hip mechanoreceptors.",
                "Perform gentle spinal decompression stretches before sleep to ease microgravity paraspinal ache.",
                "Verify vitamin D supplementation and calcium/hydration balance in daily check-in.",
            ],
            escalate_when="Sharp radiating pain, joint swelling, numbness/tingling in limbs, or loss of grip strength.",
            nasa_reference="NASA OSDR OSD-351 & OSD-489 Partial-Gravity Musculoskeletal Protection",
            source="onboard-clinical",
            model="astro-clinical-rules-v2",
        )

    if any(k in q for k in ("sleep", "stress", "mood", "fatigue", "exhaust", "calm", "isolat")):
        return AssistantResponse(
            summary=f"Sleep sits at {sleep_val:.1f} h and reported stress is {stress_val}/5. Isolation and 90-minute orbital light/dark cycles disrupt melatonin timing.",
            actions=[
                "Use blue-enriched lighting after wake and dim amber cabin light 60 minutes prior to sleep.",
                "Run 5 minutes of slow paced breathing (4 s inhale, 6 s exhale) to elevate parasympathetic HRV.",
                "Schedule a private family or crew recreation block after high-workload EVA or rover ops.",
            ],
            escalate_when="Sleep falls below 5 hours for 3+ consecutive cycles, or persistent disorientation/panic impairs safety.",
            nasa_reference="NASA HRP Behavioral Health & Performance + Circadian Countermeasures",
            source="onboard-clinical",
            model="astro-clinical-rules-v2",
        )

    cardio_note = "Cardiopulmonary readings appear stable"
    if spo2_val < 93 or hr_val > 115 or hr_val < 45:
        cardio_note = f"Pay close attention to HR {hr_val:.0f} bpm and SpO2 {spo2_val:.1f}%"
    return AssistantResponse(
        summary=f"{cardio_note}. Current context: {summary_ctx}.",
        actions=[
            "Hydrate with 300 mL electrolytes if resting heart rate is above your baseline by >12 bpm.",
            "Confirm cabin O2/CO2 scrubber status and run a 60-second finger oximeter recheck if SpO2 <94%.",
            "Click any region on the Body Health Map or run a camera/ultrasound Self-Exam for targeted guidance.",
        ],
        escalate_when="Chest tightness, resting tachycardia >120 bpm, SpO2 <90%, or acute neurological symptoms.",
        nasa_reference="NASA Integrated Medical Model & HRP Five Hazards Framework",
        source="onboard-clinical",
        model="astro-clinical-rules-v2",
    )


async def generate_assistant_response(
    question: str,
    ctx: Optional[AssistantContextPayload],
) -> AssistantResponse:
    summary_ctx = _build_clinical_context_summary(ctx)
    prompt = (
        "You are an onboard NASA spaceflight clinical decision-support assistant. "
        "Help astronauts assess their own health, explain physiological risks across the five spaceflight hazards "
        "(radiation, isolation/confinement, distance from Earth, altered gravity, hostile closed environment), "
        "and give practical prevention and treatment guidance.\n"
        f"Current mission/vital context: {summary_ctx}\n"
        f"Astronaut question: {question}\n"
        "Respond strictly as JSON with keys: "
        '{"summary": str, "actions": [str, str, str], "escalate_when": str, "nasa_reference": str}.'
    )
    ai_json = await _call_gemini_json(prompt)
    if ai_json and isinstance(ai_json.get("summary"), str) and isinstance(ai_json.get("actions"), list):
        return AssistantResponse(
            summary=ai_json["summary"].strip(),
            actions=[str(a).strip() for a in ai_json["actions"][:4] if str(a).strip()],
            escalate_when=str(ai_json.get("escalate_when", "Escalate to Ground Flight Surgeon if symptoms worsen.")),
            nasa_reference=str(ai_json.get("nasa_reference", "NASA HRP & OSDR Flight Medical Reference")),
            source="gemini",
            model=settings.GEMINI_MODEL,
        )
    return _build_onboard_guidance(question, ctx)


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

    if clean_b64 and settings.GEMINI_API_KEY:
        prompt = (
            f"You are analyzing an astronaut self-exam image for protocol: {protocol['title']}.\n"
            f"Telemetry context: {summary_ctx}\n"
            f"Astronaut exam notes: {notes or 'None provided'}\n"
            "Inspect image quality, observable anatomical/device features, and align with NASA spaceflight self-care guidance "
            "(without claiming a definitive autonomous medical diagnosis; note clear flight-surgeon escalation criteria). "
            'Return strict JSON: {"severity": "nominal"|"warning"|"critical", "findings": str, '
            '"recommended_actions": [str, str, str], "ground_consult_required": bool}.'
        )
        ai_json = await _call_gemini_json(prompt, image_b64=clean_b64, mime_type=mime_type or "image/jpeg")
        if ai_json and isinstance(ai_json.get("findings"), str):
            sev = str(ai_json.get("severity", "nominal")).lower()
            if sev not in ("nominal", "warning", "critical"):
                sev = "nominal"
            return ImageAssessmentResponse(
                exam_type=exam_type,
                severity=sev,
                findings=ai_json["findings"].strip(),
                recommended_actions=[
                    str(a).strip() for a in (ai_json.get("recommended_actions") or protocol["normal_actions"])[:4]
                ],
                ground_consult_required=bool(ai_json.get("ground_consult_required", sev != "nominal")),
                analysis_source="gemini-vision",
                image_quality=f"{fmt} {width}x{height}" if width and height else f"{fmt} frame analyzed via Gemini Vision",
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
