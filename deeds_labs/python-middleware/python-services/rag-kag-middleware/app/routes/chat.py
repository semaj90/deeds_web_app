from fastapi import APIRouter
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import httpx
import json
from typing import Optional

from app.config import OLLAMA_URL, OLLAMA_CHAT_MODEL

router = APIRouter()

class ChatReq(BaseModel):
    prompt: str
    model: Optional[str] = None

@router.post("/stream")
async def chat_stream(req: ChatReq):
    model = req.model or OLLAMA_CHAT_MODEL

    async def gen():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json={"model": model, "prompt": req.prompt, "stream": True},
            ) as r:
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    token = data.get("response", "")
                    # SSE format
                    yield f"data: {token}\n\n"
                    if data.get("done"):
                        break

    return StreamingResponse(gen(), media_type="text/event-stream")

@router.post("/")
async def chat(req: ChatReq):
    model = req.model or OLLAMA_CHAT_MODEL
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": model, "prompt": req.prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json()
