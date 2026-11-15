from fastapi import APIRouter

from backend.app.schemas.assistant import AssistantRequest, AssistantResponse
from backend.app.services.assistant_service import generate_assistant_response

router = APIRouter()


@router.post("/ask", response_model=AssistantResponse)
async def ask_flight_assistant(req: AssistantRequest):
    return await generate_assistant_response(req.question, req.context)
