#!/usr/bin/env python3
"""
LangExtract Streaming API — FastAPI Wrapper
-------------------------------------------
Exposes a `/extract` endpoint that LangExtract-integrated tools (Phase 48.1)
can call to enrich diagnostics before pushing them into Redis/Neo4j.
"""

from __future__ import annotations

import json
from typing import Any, List

import langextract
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI(title="LangExtract Streaming API", version="1.0.0")


def _ensure_list(payload: Any) -> List[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return [payload]
    raise ValueError("Payload must be a JSON object or array.")


async def _extract_one(diag: dict) -> dict:
    text = diag.get("message") or diag.get("text") or json.dumps(diag)

    def worker():
        try:
            return langextract.extract(
                text=text,
                system_prompt=(
                    "Extract key information from diagnostics (errors, missing imports, undefined symbols).\n"
                    "Return JSON with extraction_class, extraction_text, and attributes."
                ),
            )
        except Exception as err:
            return [{
                "extraction_class": "error",
                "extraction_text": text,
                "attributes": {"error": str(err)}
            }]

    extractions = await run_in_threadpool(worker)
    return {
        "file": diag.get("file", "unknown"),
        "message": text,
        "language": diag.get("language", "unknown"),
        "extractions": extractions
    }


async def _read_payload(request: Request) -> list[dict]:
    body = await request.body()
    raw = body.decode("utf-8")
    try:
        data = json.loads(raw)
    except Exception as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc

    if isinstance(data, str):
        return [{"message": data}]
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        normalized: list[dict] = []
        for item in data:
            if isinstance(item, str):
                normalized.append({"message": item})
            elif isinstance(item, dict):
                normalized.append(item)
            else:
                normalized.append({"message": str(item)})
        return normalized

    raise ValueError("Payload must be a string, dict, or list of those types.")


@app.post("/extract")
async def extract(request: Request):
    """Batch extraction returning a JSON list."""
    try:
        diagnostics = await _read_payload(request)
    except ValueError as exc:
        return JSONResponse({"error": "Invalid JSON payload."}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    results = []
    for diag in diagnostics:
        results.append(await _extract_one(diag))

    return JSONResponse(results)


@app.post("/extract-stream")
async def extract_stream(request: Request):
    """Server-Sent Events (SSE) streaming endpoint for low-latency extractions."""
    try:
        diagnostics = await _read_payload(request)
    except ValueError as exc:
        return JSONResponse({"error": "Invalid JSON payload."}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    async def event_generator():
        for idx, diag in enumerate(diagnostics):
            result = await _extract_one(diag)
            payload = json.dumps({"index": idx, **result})
            yield f"data: {payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/")
async def root():
    return {"status": "ok", "service": "LangExtract Streaming API"}
