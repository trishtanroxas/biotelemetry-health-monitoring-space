from fastapi import APIRouter, HTTPException, Response

from backend.app.schemas.assistant import (
    AssistantRequest,
    AssistantResponse,
    AssistantTtsRequest,
    AudioTranscribeRequest,
    AudioTranscribeResponse,
)
from backend.app.services.assistant_service import (
    generate_assistant_response,
    synthesize_speech_audio,
    transcribe_audio_speech,
)

router = APIRouter()


@router.post("/ask", response_model=AssistantResponse)
async def ask_flight_assistant(req: AssistantRequest):
    return await generate_assistant_response(
        req.question,
        req.context,
        history=req.history,
        mode=req.mode,
    )


@router.post("/tts")
async def synthesize_assistant_speech(req: AssistantTtsRequest):
    audio_bytes, media_type, source = await synthesize_speech_audio(req.text, voice_name=req.voice)
    if not audio_bytes:
        raise HTTPException(
            status_code=503,
            detail="Text-to-speech synthesis is unavailable right now.",
        )
    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={
            "Cache-Control": "no-store",
            "X-TTS-Source": source,
        },
    )


@router.post("/transcribe", response_model=AudioTranscribeResponse)
async def transcribe_assistant_audio(req: AudioTranscribeRequest):
    result = await transcribe_audio_speech(req.audio_base64, req.mime_type)
    if not result:
        raise HTTPException(
            status_code=503,
            detail="Speech transcription service is unavailable. Ensure GEMINI_API_KEY is active and speak clearly.",
        )
    return result
