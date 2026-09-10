"""Direct Ornith 1.5 VLM client for the Docling container.

This module intentionally does not know about Ollama. The VLM authority is the
workstation llama.cpp server on :8090 launched with the `ornith-1.5-vlm`
profile and its exact-family mmproj.
"""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

import httpx
import requests

ORNITH_VLM_BASE_URL = os.environ.get(
    "ORNITH_VLM_BASE_URL", "http://host.docker.internal:8090/v1"
).rstrip("/")
ORNITH_VLM_MODEL = os.environ.get("ORNITH_VLM_MODEL", "ornith-1.5-9b")
OCR_NUM_CTX = int(os.environ.get("OCR_NUM_CTX", "8192"))
OCR_TEMPERATURE = float(os.environ.get("OCR_TEMPERATURE", "0.1"))


def _root_url() -> str:
    if ORNITH_VLM_BASE_URL.endswith("/v1"):
        return ORNITH_VLM_BASE_URL[:-3]
    return ORNITH_VLM_BASE_URL


def _content(prompt: str, image_b64: str) -> list[dict]:
    return [
        {"type": "text", "text": prompt},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
        },
    ]


def _payload(prompt: str, image_b64: str, model: str, *, stream: bool) -> dict:
    return {
        "model": model,
        "messages": [{"role": "user", "content": _content(prompt, image_b64)}],
        "stream": stream,
        "temperature": OCR_TEMPERATURE,
        "max_tokens": OCR_NUM_CTX,
    }


def get_ornith_vlm_health(timeout: float = 3.0) -> dict:
    """Require the loaded :8090 runtime to be Ornith 1.5 with vision enabled."""
    root = _root_url().rstrip("/")
    try:
        props_response = requests.get(f"{root}/props", timeout=timeout)
        props_response.raise_for_status()
        props = props_response.json()

        model_alias = str(props.get("model_alias") or "").strip()
        modalities = props.get("modalities") or {}
        vision = modalities.get("vision") is True
        family_ok = model_alias == ORNITH_VLM_MODEL or model_alias.startswith("ornith-1.5")

        return {
            "healthy": bool(vision and family_ok),
            "model": model_alias or None,
            "vision": vision,
            "endpoint": ORNITH_VLM_BASE_URL,
            "provider": "llama.cpp",
        }
    except Exception as exc:  # health is diagnostic; do not throw into /health
        return {
            "healthy": False,
            "model": None,
            "vision": False,
            "endpoint": ORNITH_VLM_BASE_URL,
            "provider": "llama.cpp",
            "error": str(exc),
        }


def call_ornith_vlm_sync(
    prompt: str,
    image_b64: str,
    model: str = ORNITH_VLM_MODEL,
) -> dict:
    """Call llama.cpp's OpenAI-compatible multimodal chat endpoint."""
    health = get_ornith_vlm_health()
    if not health.get("healthy"):
        raise RuntimeError(
            "ORNITH_VLM_NOT_READY: :8090 must serve Ornith 1.5 with modalities.vision=true"
        )

    response = requests.post(
        f"{ORNITH_VLM_BASE_URL}/chat/completions",
        json=_payload(prompt, image_b64, model, stream=False),
        timeout=(30, 180),
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    message = (choices[0].get("message") if choices else {}) or {}
    usage = data.get("usage") or {}
    return {
        "text": str(message.get("content") or ""),
        "model": str(data.get("model") or model),
        "tokens": int(usage.get("completion_tokens") or 0),
    }


async def call_ornith_vlm_stream(
    prompt: str,
    image_b64: str,
    model: str = ORNITH_VLM_MODEL,
) -> AsyncGenerator[str, None]:
    """Yield the existing Docling SSE shape from llama.cpp streaming chunks."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None)) as client:
        async with client.stream(
            "POST",
            f"{ORNITH_VLM_BASE_URL}/chat/completions",
            json=_payload(prompt, image_b64, model, stream=True),
        ) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                delta = (choices[0].get("delta") if choices else {}) or {}
                token = str(delta.get("content") or "")
                done = bool(choices and choices[0].get("finish_reason") is not None)
                yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                if done:
                    break
