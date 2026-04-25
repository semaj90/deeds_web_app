"""
Chat Routes - LLM chat with streaming support
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import json
import sys
sys.path.append('..')

from config import OLLAMA_URL, OLLAMA_CHAT_MODEL

router = APIRouter()


class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2048


class ChatWithContextRequest(BaseModel):
    query: str
    context: list[str] | None = None
    file_content: str | None = None
    model: str | None = None


@router.post("")
async def chat(req: ChatRequest):
    """Non-streaming chat response"""
    model = req.model or OLLAMA_CHAT_MODEL

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": req.prompt,
                "stream": False,
                "options": {
                    "temperature": req.temperature,
                    "num_predict": req.max_tokens
                }
            }
        )
        data = resp.json()

    return {
        "response": data.get("response", ""),
        "model": model,
        "done": True
    }


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """SSE streaming chat response"""
    model = req.model or OLLAMA_CHAT_MODEL

    async def generate():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": req.prompt,
                    "stream": True,
                    "options": {
                        "temperature": req.temperature,
                        "num_predict": req.max_tokens
                    }
                },
            ) as response:
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        yield f"data: {json.dumps({'token': token, 'done': data.get('done', False)})}\n\n"
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/with-context")
async def chat_with_context(req: ChatWithContextRequest):
    """Chat with RAG context automatically injected"""
    model = req.model or OLLAMA_CHAT_MODEL

    # Build prompt with context
    context_block = ""
    if req.context:
        context_block = "## Relevant Knowledge\n" + "\n---\n".join(req.context)

    file_block = ""
    if req.file_content:
        file_block = f"## Current File\n```\n{req.file_content[:2000]}...\n```"

    prompt = f"""You are an expert TypeScript developer.

{context_block}

{file_block}

## Task
{req.query}

Provide a clear, actionable response."""

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False
            }
        )
        data = resp.json()

    return {
        "response": data.get("response", ""),
        "model": model,
        "context_used": len(req.context) if req.context else 0,
        "done": True
    }
