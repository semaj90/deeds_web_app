"""
Minimal CPU-first synthesizer service.

Provides a FastAPI app that can be used as a safety-net when GPU inference
is unavailable. It generates short heuristic summaries and records the
request in Redis for observability.
"""

from __future__ import annotations

import asyncio
import os
import textwrap
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from fastapi import FastAPI
from pydantic import BaseModel, Field

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - redis optional in some environments
    Redis = None  # type: ignore


REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
MAX_TOKENS = int(os.environ.get("CPU_SYNTH_MAX_TOKENS", "256"))
REDIS_STREAM = os.environ.get("CPU_SYNTH_STREAM", "cpu.synthesized")


app = FastAPI(
    title="CPU Synthesizer",
    description="Fallback summarizer when GPU inference is unavailable.",
    version="1.0.0",
)

redis: Optional["Redis[Any]"] = None


class SynthesizeRequest(BaseModel):
    prompt: str = Field(..., description="User prompt or query to summarize")
    context: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional metadata/context for the request"
    )


class SynthesizeResponse(BaseModel):
    summary: str
    tokens: int
    truncated: bool
    generated_at: datetime


def _initialize_redis() -> Optional["Redis[Any]"]:
    if Redis is None:
        return None
    try:
        return Redis.from_url(REDIS_URL, decode_responses=True)
    except Exception:
        return None


@app.on_event("startup")
async def _startup() -> None:
    global redis
    redis = _initialize_redis()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global redis
    if redis:
        await redis.close()
        redis = None


def _heuristic_summary(text: str) -> Tuple[str, bool]:
    """Very small CPU-friendly summariser."""
    stripped = " ".join(text.strip().split())
    if not stripped:
        return "No content provided.", False

    sentences = stripped.split(". ")
    intro = sentences[0][:512]

    if len(sentences) > 1:
        concluding = sentences[-1]
    else:
        concluding = ""

    combined = f"{intro}"
    if concluding and concluding != intro:
        combined = f"{combined}. {concluding}"

    words = combined.split()
    truncated = len(words) > MAX_TOKENS
    if truncated:
        words = words[:MAX_TOKENS]

    summary = textwrap.fill(" ".join(words), width=96)
    return summary, truncated


async def _record_event(payload: Dict[str, Any]) -> None:
    if not redis:
        return
    try:
        await redis.xadd(REDIS_STREAM, payload)
    except Exception:
        # best-effort; ignore Redis connectivity problems
        pass


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(request: SynthesizeRequest) -> SynthesizeResponse:
    summary, truncated = _heuristic_summary(request.prompt)
    tokens = len(summary.split())
    generated_at = datetime.utcnow()

    asyncio.create_task(
        _record_event(
            {
                "prompt_len": str(len(request.prompt)),
                "tokens": str(tokens),
                "truncated": "1" if truncated else "0",
                "generated_at": generated_at.isoformat(),
            }
        )
    )

    return SynthesizeResponse(
        summary=summary,
        tokens=tokens,
        truncated=truncated,
        generated_at=generated_at,
    )
